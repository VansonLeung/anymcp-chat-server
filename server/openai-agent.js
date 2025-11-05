/**
 * OpenAI Agent with Tool Execution and Database Persistence
 *
 * Compatible with OpenAI API and OpenAI-compatible endpoints (e.g., Poe, Together AI, etc.)
 *
 * Features:
 * - Per-client stream tracking
 * - Stop generation on user request or client disconnect
 * - Multi-factor limit tracking
 * - Conversation persistence to SQLite
 * - Token counting and cost estimation
 * - Tool execution support (function calling)
 */

const OpenAI = require('openai');
const { getToolDefinitions, getToolDefinition } = require('./tools');
const WebSocket = require('ws');
const db = require('./database/db');

// Load environment variables
require('dotenv').config();

// WebSocket server and clients
let wss;
let clients = new Set();

// Map to store pending tool requests: correlationId -> { resolve, reject, timeout }
const pendingRequests = new Map();

// Track active streams per WebSocket connection
// Map: WebSocket -> { abortController, conversationId, messageId, startTime }
const activeStreams = new Map();

// OpenAI client
let openaiClient;

/**
 * Convert tool definition to OpenAI function format
 */
function convertToolToOpenAIFunction(toolDef) {
  // Skip conversation summary tool (handled locally)
  if (toolDef.name === 'summarize_conversation') {
    return {
      type: 'function',
      function: {
        name: toolDef.name,
        description: toolDef.description,
        parameters: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'A concise summary of the conversation'
            },
            messagesToKeep: {
              type: 'number',
              description: 'Number of recent messages to keep (default: 5)'
            }
          },
          required: ['summary']
        }
      }
    };
  }

  // Parse Zod schema to OpenAI function format
  const zodSchema = toolDef.parameters;
  const shape = zodSchema._def.shape();
  const properties = {};
  const required = [];

  for (const [key, value] of Object.entries(shape)) {
    const field = value._def;

    // Handle optional fields
    if (field.typeName === 'ZodOptional') {
      const innerField = field.innerType._def;
      let type = 'string';
      const description = innerField.description || '';

      if (innerField.typeName === 'ZodString') {
        type = 'string';
      } else if (innerField.typeName === 'ZodNumber') {
        type = 'number';
      } else if (innerField.typeName === 'ZodBoolean') {
        type = 'boolean';
      }

      properties[key] = { type, description };
    } else {
      // Handle required fields
      let type = 'string';
      const description = field.description || '';

      if (field.typeName === 'ZodNumber') {
        type = 'number';
      } else if (field.typeName === 'ZodBoolean') {
        type = 'boolean';
      } else if (field.typeName === 'ZodArray') {
        type = 'array';
        const itemType = field.type._def;
        if (itemType.typeName === 'ZodNumber') {
          properties[key] = {
            type: 'array',
            items: { type: 'number' },
            description
          };
          required.push(key);
          continue;
        }
      }

      properties[key] = { type, description };
      required.push(key);
    }
  }

  return {
    type: 'function',
    function: {
      name: toolDef.name,
      description: toolDef.description,
      parameters: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      }
    }
  };
}

/**
 * Get all tools in OpenAI format
 */
function getOpenAITools() {
  const toolDefinitions = getToolDefinitions();
  return toolDefinitions.map(convertToolToOpenAIFunction);
}

/**
 * Initialize the OpenAI client
 */
async function initializeClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL; // Optional: for compatible APIs

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const config = { apiKey };
  if (baseURL) {
    config.baseURL = baseURL;
    console.log(`OpenAI client configured with custom base URL: ${baseURL}`);
  }

  openaiClient = new OpenAI(config);

  // Initialize database
  await db.initializeDatabase();
}

/**
 * Set WebSocket server instance from main server
 */
function setWebSocketServer(webSocketServer, clientSet) {
  wss = webSocketServer;
  clients = clientSet;
  console.log('OpenAI agent connected to WebSocket server');
}

/**
 * Generate unique correlation ID for tool execution
 */
function generateCorrelationId() {
  return `openai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Broadcast message to all connected WebSocket clients
 */
function broadcastToWebSocketClients(message) {
  let broadcastCount = 0;
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
      broadcastCount++;
    }
  });
  return broadcastCount;
}

/**
 * Handle responses from WebSocket clients (for tool execution)
 */
function handleWebSocketResponse(data) {
  if (data.type === 'response' && data.correlationId) {
    const pending = pendingRequests.get(data.correlationId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(data.correlationId);
      pending.resolve(data);
    }
  }
}

/**
 * Broadcast and wait for response (for tool execution)
 */
async function broadcastAndWaitForResponse(message, timeoutMs = 10000) {
  const correlationId = generateCorrelationId();
  const messageWithId = { ...message, correlationId };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(correlationId);
      reject(new Error(`Timeout waiting for response to ${message.command} after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingRequests.set(correlationId, { resolve, reject, timeout });

    const broadcastCount = broadcastToWebSocketClients(messageWithId);

    if (broadcastCount === 0) {
      clearTimeout(timeout);
      pendingRequests.delete(correlationId);
      reject(new Error('No clients connected to broadcast to'));
    }
  });
}

/**
 * Execute a tool call
 */
async function executeTool(toolName, toolInput, conversationId, messageId, toolCallId = null) {
  const startTime = Date.now();
  const toolDef = getToolDefinition(toolName);

  if (!toolDef) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  let result;
  let success = true;
  let error = null;

  try {
    // Check if tool has a server-side executable function
    if (typeof toolDef.function === 'function') {
      // Execute server-side function with context
      result = await toolDef.function({
        toolName,
        toolInput,
        conversationId,
        messageId,
        toolCallId,
        agent: module.exports, // Pass the agent module itself
        db,
        ws: null // Will be set by caller if needed
      });

      if (result.success === false) {
        throw new Error(result.error || 'Tool execution failed');
      }
    } else if (toolName === 'summarize_conversation') {
      // DEPRECATED: Backward compatibility for old summarize implementation
      const { summary, messagesToKeep = 5 } = toolInput;
      result = await db.summarizeConversation(conversationId, summary, messagesToKeep);
    } else {
      // Handle WebSocket-based tools (client-side execution)
      const message = {
        type: toolDef.messageType,
        command: toolDef.command,
        params: toolInput,
        timestamp: new Date().toISOString(),
        source: 'openai'
      };

      const response = await broadcastAndWaitForResponse(message);
      result = response.result;
      error = response.error;

      if (response.success === false) {
        throw new Error(`Error executing ${toolName}: ${error}`);
      } else {
        result = result || "Success";
      }
    }
  } catch (err) {
    success = false;
    error = err.message;
    result = { error: err.message };
  }

  const durationMs = Date.now() - startTime;

  // Store tool execution in database
  if (conversationId && messageId) {
    try {
      await db.addToolExecution(
        messageId,
        conversationId,
        toolName,
        toolInput,
        result,
        { toolUseId: toolCallId, durationMs, success, error }
      );
    } catch (dbError) {
      console.error('Error saving tool execution to database:', dbError);
    }
  }

  if (!success) {
    throw new Error(`Error executing ${toolName}: ${error}`);
  }

  return result;
}

/**
 * Stop generation for a specific WebSocket connection
 */
async function stopGeneration(ws, reason = 'user_requested') {
  const stream = activeStreams.get(ws);

  if (stream) {
    console.log(`Stopping generation for conversation ${stream.conversationId}, reason: ${reason}`);

    // Abort the stream
    stream.abortController.abort();

    // Mark message as stopped in database
    if (stream.messageId) {
      try {
        await db.updateMessage(stream.messageId, {
          stopped: true,
          metadata: { stopReason: reason, stoppedAt: new Date().toISOString() }
        });
      } catch (error) {
        console.error('Error updating stopped message in database:', error);
      }
    }

    // Send stopped notification to client
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'llm_stopped',
        conversationId: stream.conversationId,
        messageId: stream.messageId,
        reason,
        message: reason === 'user_requested' ? 'Generation stopped' : 'Client disconnected',
        timestamp: new Date().toISOString()
      }));
    }

    // Clean up
    activeStreams.delete(ws);

    return true;
  }

  return false;
}

/**
 * Handle client disconnect - stop any active generation
 */
async function handleClientDisconnect(ws) {
  const stopped = await stopGeneration(ws, 'client_disconnect');

  if (stopped) {
    console.log('Stopped active generation due to client disconnect');
  }
}

/**
 * Check conversation limits and send warnings
 */
async function checkConversationLimits(conversationId, ws) {
  const conversation = await db.getConversation(conversationId);

  if (!conversation) return;

  const warnings = [];

  if (conversation.token_warning === 1) {
    warnings.push({
      type: 'token',
      current: conversation.token_count,
      limit: 20480,
      percentage: Math.round((conversation.token_count / 20480) * 100)
    });
  }

  if (conversation.message_warning === 1) {
    warnings.push({
      type: 'message',
      current: conversation.message_count,
      limit: 150,
      percentage: Math.round((conversation.message_count / 150) * 100)
    });
  }

  if (conversation.tool_warning === 1) {
    warnings.push({
      type: 'tool',
      current: conversation.tool_execution_count,
      limit: 100,
      percentage: Math.round((conversation.tool_execution_count / 100) * 100)
    });
  }

  if (conversation.age_warning === 1) {
    warnings.push({
      type: 'age',
      current: conversation.age_hours,
      limit: 24,
      unit: 'hours'
    });
  }

  // Send warnings to client
  if (warnings.length > 0 && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'llm_conversation_warning',
      conversationId,
      warnings,
      timestamp: new Date().toISOString()
    }));
  }

  // Check if should summarize
  if (conversation.should_summarize === 1) {
    ws.send(JSON.stringify({
      type: 'llm_should_summarize',
      conversationId,
      reason: conversation.token_count >= 20480 ? 'token_limit' :
              conversation.message_count >= 150 ? 'message_limit' :
              conversation.tool_execution_count >= 100 ? 'tool_limit' : 'age_limit',
      timestamp: new Date().toISOString()
    }));
  }
}

/**
 * Handle streaming chat with tool use and database persistence
 */
async function handleStreamingChat(userMessage, ws, conversationId) {
  if (!openaiClient) {
    await initializeClient();
  }

  // Get or create conversation
  let conversation = await db.getConversation(conversationId);
  if (!conversation) {
    conversation = await db.createConversation('New Conversation');
    conversationId = conversation.id;

    // Send conversation created event
    ws.send(JSON.stringify({
      type: 'llm_conversation_created',
      conversation: {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at
      },
      timestamp: new Date().toISOString()
    }));
  }

  // Add user message to database
  let userMessageId = null;
  if (userMessage && userMessage.trim()) {
    const userMsg = await db.addMessage(conversationId, 'user', userMessage);
    userMessageId = userMsg.id;
  }

  // Load conversation history from database
  // Use getMessagesForContext to only get messages after the latest summary
  const dbMessages = await db.getMessagesForContext(conversationId);

  // Convert database messages to OpenAI format
  const messages = [
    {
      role: 'system',
      content: `You are AnyMCP Assistant, an advanced AI assistant with access to mathematical tools. You can perform calculations and provide accurate responses to user queries. Always ensure your responses are relevant to the user's questions and utilize the available tools effectively.

When responding, follow these guidelines:
- Use the provided math tools to perform calculations as needed.
- Always provide clear and concise answers.
- If you encounter an error while using a tool, handle it gracefully and inform the user.
- Available tools include: add, subtract, multiply, divide, power, sqrt, modulo, absolute, round, floor, ceil, min, max, sum, and average.
- When asked to perform calculations, use the appropriate tools to ensure accuracy.`
    }
  ];

  for (const msg of dbMessages) {
    if (msg.role === 'system') {
      // System messages (summaries) as user messages
      messages.push({
        role: 'user',
        content: msg.content.trim()
      });
    } else if (msg.role === 'user') {
      messages.push({
        role: 'user',
        content: msg.content.trim()
      });
    } else if (msg.role === 'assistant') {
      // Assistant message
      const assistantMsg = {
        role: 'assistant',
        content: msg.content.trim()
      };

      // Add tool calls if present
      if (msg.tool_executions && msg.tool_executions.length > 0) {
        assistantMsg.tool_calls = msg.tool_executions.map(tool => ({
          id: tool.tool_use_id || `call_${Date.now()}`,
          type: 'function',
          function: {
            name: tool.tool_name,
            arguments: JSON.stringify(tool.tool_input || {})
          }
        }));
      }

      messages.push(assistantMsg);

      // Add tool results
      if (msg.tool_executions && msg.tool_executions.length > 0) {
        for (const tool of msg.tool_executions) {
          messages.push({
            role: 'tool',
            tool_call_id: tool.tool_use_id || `call_${Date.now()}`,
            content: JSON.stringify(tool.tool_output || {})
          });
        }
      }
    }
  }

  const tools = getOpenAITools();

  // Create abort controller for this stream
  const abortController = new AbortController();
  let currentMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let assistantMessageDbId = null;

  // Track this stream
  activeStreams.set(ws, {
    abortController,
    conversationId,
    messageId: null,
    startTime: Date.now()
  });

  try {
    // Use model from environment or default
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // Create streaming message
    const stream = await openaiClient.chat.completions.create({
      model,
      messages,
      tools,
      stream: true,
    }, {
      signal: abortController.signal
    });

    let currentText = '';
    let toolCalls = [];
    let currentToolCall = null;

    // Process stream
    for await (const chunk of stream) {
      // Check if aborted
      if (abortController.signal.aborted) {
        break;
      }

      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        // Stream text to client
        currentText += delta.content;

        ws.send(JSON.stringify({
          type: 'llm_assistant_response',
          conversationId,
          text: delta.content,
          done: false,
          timestamp: new Date().toISOString(),
          messageId: currentMessageId,
        }));

        // Update stream tracking
        if (!activeStreams.get(ws)?.messageId) {
          const streamInfo = activeStreams.get(ws);
          if (streamInfo) {
            streamInfo.messageId = currentMessageId;
          }
        }
      }

      // Handle tool calls
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;

          // Initialize tool call at this index if needed
          if (!toolCalls[index]) {
            toolCalls[index] = {
              id: toolCallDelta.id || '',
              type: 'function',
              function: {
                name: toolCallDelta.function?.name || '',
                arguments: ''
              }
            };
          }

          // Accumulate function arguments
          if (toolCallDelta.function?.arguments) {
            toolCalls[index].function.arguments += toolCallDelta.function.arguments;
          }

          // Update name if provided
          if (toolCallDelta.function?.name) {
            toolCalls[index].function.name = toolCallDelta.function.name;
          }

          // Update ID if provided
          if (toolCallDelta.id) {
            toolCalls[index].id = toolCallDelta.id;
          }
        }
      }

      // Check for finish reason
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === 'tool_calls') {
        // Save assistant message with tool calls
        const assistantMsg = await db.addMessage(
          conversationId,
          'assistant',
          (currentText || '[Tool use only]').trim(),
          { messageId: currentMessageId }
        );
        assistantMessageDbId = assistantMsg.id;

        // Execute tools
        const toolResults = [];
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolInput = JSON.parse(toolCall.function.arguments || '{}');

          // Notify client
          ws.send(JSON.stringify({
            type: 'llm_tool_use',
            conversationId,
            toolUseId: toolCall.id,
            toolName,
            toolInput,
            timestamp: new Date().toISOString(),
            messageId: currentMessageId,
            collapsed: true
          }));

          try {
            const result = await executeTool(
              toolName,
              toolInput,
              conversationId,
              assistantMessageDbId,
              toolCall.id
            );

            // Send tool result to client
            ws.send(JSON.stringify({
              type: 'llm_tool_result',
              conversationId,
              toolUseId: toolCall.id,
              toolName,
              toolOutput: result,
              timestamp: new Date().toISOString(),
              messageId: currentMessageId
            }));
          } catch (error) {
            // Send tool error
            ws.send(JSON.stringify({
              type: 'llm_tool_result',
              conversationId,
              toolUseId: toolCall.id,
              toolName,
              toolOutput: { error: error.message },
              error: error.message,
              timestamp: new Date().toISOString(),
              messageId: currentMessageId
            }));
          }
        }

        // Check limits
        await checkConversationLimits(conversationId, ws);

        // Remove stream tracking
        activeStreams.delete(ws);

        // Continue conversation with tool results (recursive)
        return handleStreamingChat('', ws, conversationId);
      }
    }

    // Save final assistant message
    if (!assistantMessageDbId && currentText) {
      const assistantMsg = await db.addMessage(
        conversationId,
        'assistant',
        currentText.trim(),
        { messageId: currentMessageId }
      );
      assistantMessageDbId = assistantMsg.id;
    }

    // Send done message
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'llm_assistant_response',
        conversationId,
        text: '',
        done: true,
        timestamp: new Date().toISOString(),
        messageId: currentMessageId,
      }));

      // Send stats
      const updatedConversation = await db.getConversation(conversationId);
      ws.send(JSON.stringify({
        type: 'llm_token_count',
        conversationId,
        tokenCount: updatedConversation.token_count,
        messageCount: updatedConversation.message_count,
        toolCount: updatedConversation.tool_execution_count,
        estimatedCost: updatedConversation.estimated_cost,
        limit: 20480,
        timestamp: new Date().toISOString()
      }));

      await checkConversationLimits(conversationId, ws);
    }

    // Clean up
    activeStreams.delete(ws);

    return {
      success: true,
      conversationId,
      messageId: assistantMessageDbId
    };

  } catch (error) {
    // Handle abort
    if (error.name === 'AbortError' || abortController.signal.aborted) {
      console.log(`Generation aborted for conversation ${conversationId}`);
      activeStreams.delete(ws);
      return {
        success: false,
        aborted: true,
        conversationId
      };
    }

    // Send error to client
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'llm_error',
        conversationId,
        error: error.message,
        timestamp: new Date().toISOString(),
        messageId: currentMessageId,
      }));
    }

    // Clean up
    activeStreams.delete(ws);

    throw error;
  }
}

/**
 * Generate a summary using the OpenAI API
 * This is called by the summarize_conversation tool
 */
async function generateSummary(prompt, conversationId) {
  if (!openaiClient) {
    await initializeClient();
  }

  try {
    // Use the configured model (or default)
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // Call OpenAI to generate the summary
    const response = await openaiClient.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Extract the summary text
    const summaryText = response.choices[0]?.message?.content || '';

    return summaryText;
  } catch (error) {
    console.error('Error generating summary with OpenAI:', error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

module.exports = {
  initializeClient,
  setWebSocketServer,
  handleStreamingChat,
  handleWebSocketResponse,
  stopGeneration,
  handleClientDisconnect,
  generateSummary
};
