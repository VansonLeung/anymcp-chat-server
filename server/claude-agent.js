/**
 * Claude Agent with AbortController and Database Persistence
 *
 * Features:
 * - Per-client stream tracking
 * - Stop generation on user request or client disconnect
 * - Multi-factor limit tracking (Option B)
 * - Conversation persistence to SQLite
 * - Token counting and cost estimation
 */

const Anthropic = require('@anthropic-ai/sdk');
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

// Anthropic client
let anthropicClient;

/**
 * Initialize the Anthropic client
 */
async function initializeClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  anthropicClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Initialize database
  await db.initializeDatabase();
}

/**
 * Set WebSocket server instance from main server
 */
function setWebSocketServer(webSocketServer, clientSet) {
  wss = webSocketServer;
  clients = clientSet;
  console.log('Claude agent connected to WebSocket server');
}

/**
 * Generate unique correlation ID for tool execution
 */
function generateCorrelationId() {
  return `claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
 * Convert Zod schema to Anthropic tool format (JSON Schema draft 2020-12)
 */
function zodToAnthropicSchema(zodSchema) {
  const shape = zodSchema._def.shape();
  const properties = {};
  const required = [];

  for (const [key, value] of Object.entries(shape)) {
    const field = value._def;

    // Handle optional fields first
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
      // Don't add to required array
      continue;
    }

    // Handle regular fields
    let type = 'string';
    const description = field.description || '';

    if (field.typeName === 'ZodNumber') {
      type = 'number';
    } else if (field.typeName === 'ZodBoolean') {
      type = 'boolean';
    } else if (field.typeName === 'ZodArray') {
      // Handle arrays
      const itemType = field.type._def;
      if (itemType.typeName === 'ZodNumber') {
        properties[key] = {
          type: 'array',
          items: { type: 'number' },
          description
        };
      } else if (itemType.typeName === 'ZodString') {
        properties[key] = {
          type: 'array',
          items: { type: 'string' },
          description
        };
      } else {
        properties[key] = {
          type: 'array',
          description
        };
      }
      required.push(key);
      continue;
    } else if (field.typeName === 'ZodString') {
      type = 'string';
    }

    properties[key] = { type, description };
    required.push(key);
  }

  const schema = {
    type: 'object',
    properties
  };

  // Only add required array if it has items
  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Get tool definitions in Anthropic format
 */
function getAnthropicTools() {
  return getToolDefinitions().map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: zodToAnthropicSchema(tool.parameters)
  }));
}


/**
 * Execute a tool call
 */
async function executeTool(toolName, toolInput, conversationId, messageId, toolUseId = null) {
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
        toolCallId: toolUseId,
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
        source: 'claude'
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
        { toolUseId, durationMs, success, error }  // Include Claude's tool use ID
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

  // Option B warning thresholds (80%)
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
  if (!anthropicClient) {
    initializeClient();
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

  // Prepare system prompt with conversation summary if available
  const system = [
    {
      type: "text",
      text: `
You are AnyMCP Assistant, an advanced AI assistant with access to mathematical tools. You can perform calculations and provide accurate responses to user queries. Always ensure your responses are relevant to the user\'s questions and utilize the available tools effectively.

When responding, follow these guidelines:
- Use the provided math tools to perform calculations as needed.
- Always provide clear and concise answers.
- If you encounter an error while using a tool, handle it gracefully and inform the user.
- Available tools include: add, subtract, multiply, divide, power, sqrt, modulo, absolute, round, floor, ceil, min, max, sum, and average.
- When asked to perform calculations, use the appropriate tools to ensure accuracy.
`,
    }
  ];

  // Load conversation history from database
  // Use getMessagesForContext to only get messages after the latest summary
  const dbMessages = await db.getMessagesForContext(conversationId);

  // Convert database messages to Anthropic format
  const messages = [];

  for (let i = 0; i < dbMessages.length; i++) {
    const msg = dbMessages[i];

    if (msg.role === 'system') {
      // System messages (summaries) are treated as user messages with context
      messages.push({
        role: 'user',
        content: msg.content.trim() // Remove trailing whitespace
      });
    } else if (msg.role === 'user') {
      // User messages are simple text (no tool results in this implementation)
      messages.push({
        role: 'user',
        content: msg.content.trim()
      });
    } else if (msg.role === 'assistant') {
      // Assistant messages may include tool_use blocks
      const content = [];

      // Add text content if present
      if (msg.content && msg.content.trim()) {
        content.push({
          type: 'text',
          text: msg.content.trim()
        });
      }

      // Add tool_use blocks if present
      if (msg.tool_executions && msg.tool_executions.length > 0) {
        for (const tool of msg.tool_executions) {
          if (tool.tool_use_id) {
            content.push({
              type: 'tool_use',
              id: tool.tool_use_id,
              name: tool.tool_name,
              input: tool.tool_input || {}
            });
          }
        }
      }

      // If assistant message has tool uses, we need to add corresponding tool_result messages
      if (msg.tool_executions && msg.tool_executions.length > 0) {
        // Add assistant message with tool_use blocks
        messages.push({
          role: 'assistant',
          content: content
        });

        // Add user message with tool_result blocks
        const toolResultContent = [];
        for (const tool of msg.tool_executions) {
          if (tool.tool_use_id) {
            toolResultContent.push({
              type: 'tool_result',
              tool_use_id: tool.tool_use_id,
              content: JSON.stringify(tool.tool_output || {})
            });
          }
        }

        if (toolResultContent.length > 0) {
          messages.push({
            role: 'user',
            content: toolResultContent
          });
        }
      } else {
        // Assistant message without tool use - simple text
        messages.push({
          role: 'assistant',
          content: msg.content.trim()
        });
      }
    }
  }

  const tools = getAnthropicTools();

  // Create abort controller for this stream
  const abortController = new AbortController();
  let currentMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let assistantMessageDbId = null;

  // Track this stream
  activeStreams.set(ws, {
    abortController,
    conversationId,
    messageId: null, // Will be set when we start receiving content
    startTime: Date.now()
  });

  try {
    // Create streaming message (without signal - Anthropic SDK doesn't support it)
    const stream = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages,
      tools,
      stream: true,
      system,
    });

    let currentText = '';
    let toolUseBlocks = [];
    let assistantMessage = { role: 'assistant', content: [] };

    // Process stream
    for await (const event of stream) {
      // Check if aborted
      if (abortController.signal.aborted) {
        break;
      }

      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          // New text block starting
        } else if (event.content_block.type === 'tool_use') {
          // New tool use block
          toolUseBlocks.push({
            id: event.content_block.id,
            name: event.content_block.name,
            input: ''
          });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          // Stream text to client
          currentText += event.delta.text;

          // Send streaming response to client
          ws.send(JSON.stringify({
            type: 'llm_assistant_response',
            conversationId,
            text: event.delta.text,
            done: false,
            timestamp: new Date().toISOString(),
            messageId: currentMessageId,
          }));

          // Update stream tracking with messageId on first text
          if (!activeStreams.get(ws)?.messageId) {
            const streamInfo = activeStreams.get(ws);
            if (streamInfo) {
              streamInfo.messageId = currentMessageId;
            }
          }

        } else if (event.delta.type === 'input_json_delta') {
          // Accumulate tool input
          const lastTool = toolUseBlocks[toolUseBlocks.length - 1];
          if (lastTool) {
            lastTool.input += event.delta.partial_json;
          }
        }
      } else if (event.type === 'message_delta') {
        if (event.delta.stop_reason === 'tool_use') {
          // Claude wants to use tools

          // Save assistant message with tool use to database
          if (currentText) {
            assistantMessage.content.push({
              type: 'text',
              text: currentText,
            });
          }

          for (const toolBlock of toolUseBlocks) {
            const parsedInput = toolBlock.input ? JSON.parse(toolBlock.input) : {};
            assistantMessage.content.push({
              type: 'tool_use',
              id: toolBlock.id,
              name: toolBlock.name,
              input: parsedInput,
            });
          }

          // Save to database
          const assistantMsg = await db.addMessage(
            conversationId,
            'assistant',
            (currentText || '[Tool use only]').trim(),
            { messageId: currentMessageId }
          );
          assistantMessageDbId = assistantMsg.id;

          // Execute tools
          const toolResults = [];
          for (const toolBlock of toolUseBlocks) {
            const toolInput = toolBlock.input ? JSON.parse(toolBlock.input) : {};

            // Notify client that tool is being executed
            ws.send(JSON.stringify({
              type: 'llm_tool_use',
              conversationId,
              toolUseId: toolBlock.id, // Unique tool use ID from Claude
              toolName: toolBlock.name,
              toolInput,
              timestamp: new Date().toISOString(),
              messageId: currentMessageId,
              collapsed: true
            }));

            try {
              const result = await executeTool(
                toolBlock.name,
                toolInput,
                conversationId,
                assistantMessageDbId,
                toolBlock.id  // Pass Claude's tool use ID
              );

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: JSON.stringify(result),
              });

              // Send tool result to client
              ws.send(JSON.stringify({
                type: 'llm_tool_result',
                conversationId,
                toolUseId: toolBlock.id, // Match with tool use ID
                toolName: toolBlock.name,
                toolOutput: result,
                timestamp: new Date().toISOString(),
                messageId: currentMessageId
              }));

            } catch (error) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: `Error: ${error.message}`,
                is_error: true,
              });

              // Send tool error to client
              ws.send(JSON.stringify({
                type: 'llm_tool_result',
                conversationId,
                toolUseId: toolBlock.id,
                toolName: toolBlock.name,
                toolOutput: { error: error.message },
                error: error.message,
                timestamp: new Date().toISOString(),
                messageId: currentMessageId
              }));
            }
          }

          // Check conversation limits
          await checkConversationLimits(conversationId, ws);

          // Remove stream tracking (will be re-added in recursive call)
          activeStreams.delete(ws);

          // Continue conversation with tool results (recursive)
          return handleStreamingChat('', ws, conversationId);
        }
      } else if (event.type === 'message_stop') {
        // Message completed without tool use
        if (currentText) {
          assistantMessage.content.push({
            type: 'text',
            text: currentText,
          });
        }
      }
    }

    // Save final assistant message to database (if not already saved due to tool use)
    if (!assistantMessageDbId && currentText) {
      const assistantMsg = await db.addMessage(
        conversationId,
        'assistant',
        currentText.trim(),
        { messageId: currentMessageId }
      );
      assistantMessageDbId = assistantMsg.id;
    }

    // Send final done message
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'llm_assistant_response',
        conversationId,
        text: '',
        done: true,
        timestamp: new Date().toISOString(),
        messageId: currentMessageId,
      }));

      // Send updated conversation stats
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

      // Check conversation limits
      await checkConversationLimits(conversationId, ws);
    }

    // Clean up stream tracking
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
 * Generate a summary using the Claude API
 * This is called by the summarize_conversation tool
 */
async function generateSummary(prompt, conversationId) {
  if (!anthropicClient) {
    await initializeClient();
  }

  try {
    // Use Claude to generate the summary
    const response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Extract the summary text
    const summaryText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return summaryText;
  } catch (error) {
    console.error('Error generating summary with Claude:', error);
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
