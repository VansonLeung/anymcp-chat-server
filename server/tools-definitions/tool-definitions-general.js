const { z } = require('zod');

/**
 * General tool definitions with executable functions
 *
 * These tools have server-side implementations that don't require client execution.
 * Each tool has a `function` property that gets executed on the server.
 */

/**
 * Tool definitions array
 * Each tool has:
 * - name: Tool identifier
 * - description: What the tool does
 * - parameters: Zod schema for validation
 * - function: Async function that executes the tool
 */
const toolDefinitions = [
  {
    name: 'summarize_conversation',
    description: 'Summarize the conversation history to reduce token usage. Use this when the conversation is approaching the token limit (20,480 tokens) or when you receive a warning. This tool will automatically collect past messages, generate a summary using the LLM, and append it to the conversation.',
    parameters: z.object({
      messagesToKeep: z.number().int().min(1).optional().describe('Number of recent messages to keep visible (default: 5). Messages older than this will only be accessible via the summary.')
    }),

    /**
     * Execute summarization
     * @param {Object} context - Execution context
     * @param {string} context.toolName - Name of the tool
     * @param {Object} context.toolInput - Tool input parameters
     * @param {string} context.conversationId - Current conversation ID
     * @param {string} context.messageId - Current message ID
     * @param {string} context.toolCallId - Tool call ID
     * @param {Object} context.agent - The active agent (claudeAgent or openaiAgent)
     * @param {Object} context.db - Database instance
     * @param {WebSocket} context.ws - WebSocket connection
     * @returns {Promise<Object>} - Result object
     */
    function: async ({ toolName, toolInput, conversationId, messageId, toolCallId, agent, db, ws }) => {
      const { messagesToKeep = 5 } = toolInput;

      try {
        // 1. Collect all messages from the conversation
        const allMessages = await db.getMessages(conversationId, 10000);

        // Check if there are enough messages to summarize
        if (allMessages.length <= messagesToKeep) {
          return {
            success: false,
            error: 'Not enough messages to summarize',
            messageCount: allMessages.length,
            messagesToKeep
          };
        }

        // 2. Filter out any existing summary messages to avoid summarizing summaries
        const nonSummaryMessages = allMessages.filter(m => m.role !== 'system' || !m.is_summary);

        // 3. Determine which messages to summarize (all except the last messagesToKeep)
        const messagesToSummarize = nonSummaryMessages.slice(0, -messagesToKeep);

        if (messagesToSummarize.length === 0) {
          return {
            success: false,
            error: 'No messages to summarize after filtering',
            messageCount: allMessages.length
          };
        }

        // 4. Build a prompt for the LLM to generate the summary
        const summaryPrompt = buildSummaryPrompt(messagesToSummarize, conversationId);

        // 5. Call the active agent's LLM to generate the summary
        const summary = await agent.generateSummary(summaryPrompt, conversationId);

        // 6. Save the summary to the database
        const result = await db.addConversationSummary(
          conversationId,
          summary,
          messagesToSummarize.length,
          messagesToKeep
        );

        // 7. Notify client of successful summarization
        if (ws && ws.readyState === 1) { // WebSocket.OPEN
          ws.send(JSON.stringify({
            type: 'llm_summarization_complete',
            conversationId,
            messagesSummarized: messagesToSummarize.length,
            messagesKept: messagesToKeep,
            summaryLength: summary.length,
            timestamp: new Date().toISOString()
          }));
        }

        return {
          success: true,
          messagesSummarized: messagesToSummarize.length,
          messagesKept: messagesToKeep,
          summaryLength: summary.length,
          summary: summary.substring(0, 200) + '...' // Truncated preview
        };

      } catch (error) {
        console.error('Error in summarize_conversation tool:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }
  }
];

/**
 * Build a prompt for the LLM to generate a conversation summary
 */
function buildSummaryPrompt(messages, conversationId) {
  let prompt = `Please provide a concise summary of the following conversation. Focus on:
- Key topics discussed
- Important decisions or conclusions
- User goals and intentions
- Any unresolved questions or ongoing tasks
- Technical details or data that should be preserved

Conversation to summarize (${messages.length} messages):

---
`;

  for (const msg of messages) {
    const role = msg.role.toUpperCase();
    const content = msg.content.trim();

    // Include tool executions if present
    let toolInfo = '';
    if (msg.tool_executions && msg.tool_executions.length > 0) {
      const toolNames = msg.tool_executions.map(t => t.tool_name).join(', ');
      toolInfo = `\n[Tools used: ${toolNames}]`;
    }

    prompt += `\n[${role}]: ${content}${toolInfo}\n`;
  }

  prompt += `\n---

Please provide a comprehensive summary that preserves the essential context of this conversation.`;

  return prompt;
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
      } else if (field.typeName === 'ZodString') {
        type = 'string';
      }

      properties[key] = { type, description };
      required.push(key);
    }
  }

  const schema = {
    type: 'object',
    properties
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Get tool definitions in Anthropic format
 */
function getAnthropicTools() {
  return toolDefinitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: zodToAnthropicSchema(tool.parameters)
  }));
}

/**
 * Get tool definition by name
 */
function getToolDefinition(name) {
  return toolDefinitions.find(tool => tool.name === name);
}

module.exports = {
  toolDefinitions,
  getAnthropicTools,
  getToolDefinition,
  zodToAnthropicSchema
};
