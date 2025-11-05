/**
 * SQLite Database Wrapper for Chat Conversations
 * Multi-factor limit tracking (Option B: Balanced)
 *
 * Limits:
 * - Tokens: 20,480
 * - Messages: 150
 * - Tool Executions: 100
 * - Age: 24 hours
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

// Database file path
const DB_PATH = path.join(__dirname, 'conversations.db');

// Initialize database
let db;

/**
 * Promisify database methods
 */
function promisifyDatabase(database) {
  return {
    run: promisify(database.run.bind(database)),
    get: promisify(database.get.bind(database)),
    all: promisify(database.all.bind(database)),
    exec: promisify(database.exec.bind(database)),
    close: promisify(database.close.bind(database))
  };
}

/**
 * Initialize database and create tables
 */
async function initializeDatabase() {
  if (db) {
    return db;
  }

  // Create database directory if it doesn't exist
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Open database
  const rawDb = new sqlite3.Database(DB_PATH);
  db = promisifyDatabase(rawDb);
  db.raw = rawDb; // Keep reference to raw database

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Execute entire schema at once (sqlite3's exec can handle multiple statements)
  try {
    await db.exec(schema);
  } catch (error) {
    // Ignore errors for CREATE IF NOT EXISTS statements
    if (!error.message.includes('already exists')) {
      console.error('Error executing schema:', error.message);
    }
  }

  console.log('Database initialized at:', DB_PATH);

  return db;
}

/**
 * Close database connection
 */
async function closeDatabase() {
  if (db) {
    await db.close();
    db = null;
  }
}

/**
 * Token estimation helper (rough: 4 chars ≈ 1 token)
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// =============================================
// CONVERSATION OPERATIONS
// =============================================

/**
 * Create a new conversation
 */
async function createConversation(title = 'New Conversation', metadata = {}) {
  const database = await initializeDatabase();

  const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await database.run(
    `INSERT INTO conversations (id, title, metadata) VALUES (?, ?, ?)`,
    [id, title, JSON.stringify(metadata)]
  );

  return await getConversation(id);
}

/**
 * Get conversation by ID
 */
async function getConversation(conversationId) {
  const database = await initializeDatabase();

  const conversation = await database.get(
    `SELECT * FROM conversation_stats WHERE id = ?`,
    [conversationId]
  );

  if (conversation && conversation.metadata) {
    try {
      conversation.metadata = JSON.parse(conversation.metadata);
    } catch (e) {
      conversation.metadata = {};
    }
  }

  return conversation || null;
}

/**
 * Get all conversations (sorted by updated_at desc)
 */
async function getAllConversations(limit = 100) {
  const database = await initializeDatabase();

  const conversations = await database.all(
    `SELECT * FROM conversation_stats ORDER BY updated_at DESC LIMIT ?`,
    [limit]
  );

  return conversations.map(conv => {
    if (conv.metadata) {
      try {
        conv.metadata = JSON.parse(conv.metadata);
      } catch (e) {
        conv.metadata = {};
      }
    }
    return conv;
  });
}

/**
 * Update conversation title
 */
async function updateConversationTitle(conversationId, title) {
  const database = await initializeDatabase();

  await database.run(
    `UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [title, conversationId]
  );

  return await getConversation(conversationId);
}

/**
 * Delete conversation (cascades to messages and tool_executions)
 */
async function deleteConversation(conversationId) {
  const database = await initializeDatabase();

  const result = await database.run(
    `DELETE FROM conversations WHERE id = ?`,
    [conversationId]
  );

  return result.changes > 0;
}

/**
 * Check if conversation should be summarized (Option B limits)
 */
async function shouldSummarizeConversation(conversationId) {
  const conversation = await getConversation(conversationId);

  if (!conversation) return false;

  // Option B limits
  const TOKEN_LIMIT = 20480;
  const MESSAGE_LIMIT = 150;
  const TOOL_LIMIT = 100;
  const AGE_LIMIT_HOURS = 24;

  return (
    conversation.token_count >= TOKEN_LIMIT ||
    conversation.message_count >= MESSAGE_LIMIT ||
    conversation.tool_execution_count >= TOOL_LIMIT ||
    (conversation.age_hours >= AGE_LIMIT_HOURS && conversation.message_count > 10)
  );
}

// =============================================
// MESSAGE OPERATIONS
// =============================================

/**
 * Add message to conversation
 */
async function addMessage(conversationId, role, content, options = {}) {
  const database = await initializeDatabase();

  const {
    messageId = null,
    stopped = false,
    metadata = {}
  } = options;

  const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const tokenCount = estimateTokens(content);

  await database.run(
    `INSERT INTO messages (id, conversation_id, role, content, message_id, token_count, stopped, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, conversationId, role, content, messageId, tokenCount, stopped ? 1 : 0, JSON.stringify(metadata)]
  );

  return await getMessage(id);
}

/**
 * Get message by ID
 */
async function getMessage(messageId) {
  const database = await initializeDatabase();

  const message = await database.get(
    `SELECT * FROM messages WHERE id = ?`,
    [messageId]
  );

  if (message && message.metadata) {
    try {
      message.metadata = JSON.parse(message.metadata);
    } catch (e) {
      message.metadata = {};
    }
  }

  return message || null;
}

/**
 * Get all messages for a conversation
 */
async function getMessages(conversationId, limit = 1000) {
  const database = await initializeDatabase();

  const messages = await database.all(
    `SELECT m.*,
            (SELECT json_group_array(json_object(
               'id', te.id,
               'tool_use_id', te.tool_use_id,
               'tool_name', te.tool_name,
               'tool_input', te.tool_input,
               'tool_output', te.tool_output,
               'duration_ms', te.duration_ms,
               'success', te.success,
               'error', te.error,
               'timestamp', te.timestamp
            ))
            FROM tool_executions te
            WHERE te.message_id = m.id) as tool_executions
     FROM messages m
     WHERE m.conversation_id = ?
     ORDER BY m.timestamp ASC
     LIMIT ?`,
    [conversationId, limit]
  );

  return messages.map(msg => {
    if (msg.metadata) {
      try {
        msg.metadata = JSON.parse(msg.metadata);
      } catch (e) {
        msg.metadata = {};
      }
    }

    if (msg.tool_executions) {
      try {
        const parsed = JSON.parse(msg.tool_executions);
        msg.tool_executions = parsed
          .filter(t => t.id !== null)
          .map(tool => {
            // Parse tool_input and tool_output from JSON strings to objects
            if (tool.tool_input) {
              try {
                tool.tool_input = JSON.parse(tool.tool_input);
              } catch (e) {
                tool.tool_input = {};
              }
            }
            if (tool.tool_output) {
              try {
                tool.tool_output = JSON.parse(tool.tool_output);
              } catch (e) {
                tool.tool_output = {};
              }
            }
            return tool;
          });
      } catch (e) {
        msg.tool_executions = [];
      }
    } else {
      msg.tool_executions = [];
    }

    return msg;
  });
}

/**
 * Update message (for stopping generation)
 */
async function updateMessage(messageId, updates = {}) {
  const database = await initializeDatabase();

  const { stopped, metadata } = updates;

  if (stopped !== undefined) {
    await database.run(
      `UPDATE messages SET stopped = ? WHERE id = ?`,
      [stopped ? 1 : 0, messageId]
    );
  }

  if (metadata !== undefined) {
    await database.run(
      `UPDATE messages SET metadata = ? WHERE id = ?`,
      [JSON.stringify(metadata), messageId]
    );
  }

  return await getMessage(messageId);
}

// =============================================
// TOOL EXECUTION OPERATIONS
// =============================================

/**
 * Add tool execution record
 */
async function addToolExecution(messageId, conversationId, toolName, toolInput, toolOutput, options = {}) {
  const database = await initializeDatabase();

  const {
    toolUseId = null,  // Claude's unique tool use ID
    durationMs = null,
    success = true,
    error = null
  } = options;

  const id = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await database.run(
    `INSERT INTO tool_executions (id, message_id, conversation_id, tool_use_id, tool_name, tool_input, tool_output, duration_ms, success, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, messageId, conversationId, toolUseId, toolName, JSON.stringify(toolInput), JSON.stringify(toolOutput), durationMs, success ? 1 : 0, error]
  );

  return await getToolExecution(id);
}

/**
 * Get tool execution by ID
 */
async function getToolExecution(toolExecutionId) {
  const database = await initializeDatabase();

  const tool = await database.get(
    `SELECT * FROM tool_executions WHERE id = ?`,
    [toolExecutionId]
  );

  if (tool) {
    if (tool.tool_input) {
      try {
        tool.tool_input = JSON.parse(tool.tool_input);
      } catch (e) {
        tool.tool_input = {};
      }
    }

    if (tool.tool_output) {
      try {
        tool.tool_output = JSON.parse(tool.tool_output);
      } catch (e) {
        tool.tool_output = {};
      }
    }
  }

  return tool || null;
}

/**
 * Get tool executions for a message
 */
async function getToolExecutionsForMessage(messageId) {
  const database = await initializeDatabase();

  const tools = await database.all(
    `SELECT * FROM tool_executions WHERE message_id = ? ORDER BY timestamp ASC`,
    [messageId]
  );

  return tools.map(tool => {
    if (tool.tool_input) {
      try {
        tool.tool_input = JSON.parse(tool.tool_input);
      } catch (e) {
        tool.tool_input = {};
      }
    }

    if (tool.tool_output) {
      try {
        tool.tool_output = JSON.parse(tool.tool_output);
      } catch (e) {
        tool.tool_output = {};
      }
    }

    return tool;
  });
}

// =============================================
// SUMMARIZATION OPERATIONS
// =============================================

/**
 * Summarize conversation (DEPRECATED - kept for backward compatibility)
 * Use addConversationSummary instead
 */
async function summarizeConversation(conversationId, summary, messagesToKeep = 5) {
  const database = await initializeDatabase();

  // Get all messages
  const allMessages = await getMessages(conversationId, 10000);

  if (allMessages.length <= messagesToKeep) {
    return {
      success: false,
      error: 'Not enough messages to summarize',
      messagesSummarized: 0,
      messagesKept: allMessages.length
    };
  }

  // Keep last N messages
  const messagesToDelete = allMessages.slice(0, -messagesToKeep);
  const idsToDelete = messagesToDelete.map(m => m.id);

  // Delete old messages (cascades to tool_executions)
  for (const id of idsToDelete) {
    await database.run(`DELETE FROM messages WHERE id = ?`, [id]);
  }

  // Insert summary as system message
  const summaryId = await addMessage(conversationId, 'system', `[Conversation Summary]\n\n${summary}`, {
    metadata: { type: 'summary', messagesSummarized: messagesToDelete.length }
  });

  // Update conversation summary field
  await database.run(
    `UPDATE conversations
     SET summary = ?,
         summarized_at = CURRENT_TIMESTAMP,
         times_summarized = times_summarized + 1
     WHERE id = ?`,
    [summary, conversationId]
  );

  // Recalculate token count
  await database.run(
    `UPDATE conversations
     SET token_count = (SELECT COALESCE(SUM(token_count), 0) FROM messages WHERE conversation_id = ?),
         message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?)
     WHERE id = ?`,
    [conversationId, conversationId, conversationId]
  );

  const updatedConversation = await getConversation(conversationId);

  return {
    success: true,
    messagesSummarized: messagesToDelete.length,
    messagesKept: messagesToKeep,
    newTokenCount: updatedConversation.token_count,
    newMessageCount: updatedConversation.message_count
  };
}

/**
 * Add a conversation summary (NEW - keeps all messages, just marks them as summarized)
 * @param {string} conversationId - Conversation ID
 * @param {string} summary - Summary text generated by LLM
 * @param {number} messagesSummarized - How many messages were summarized
 * @param {number} messagesToKeep - How many recent messages to keep visible
 * @returns {Promise<Object>} - Summary message info
 */
async function addConversationSummary(conversationId, summary, messagesSummarized, messagesToKeep) {
  const database = await initializeDatabase();

  // Insert summary as system message with special flags
  const summaryMessage = await addMessage(
    conversationId,
    'system',
    `[Conversation Summary - ${messagesSummarized} messages]\n\n${summary}`,
    {
      metadata: {
        type: 'summary',
        messagesSummarized,
        messagesToKeep,
        summarizedAt: new Date().toISOString()
      }
    }
  );

  // Mark the summary message
  await database.run(
    `UPDATE messages
     SET is_summary = 1,
         summarizes_count = ?
     WHERE id = ?`,
    [messagesSummarized, summaryMessage.id]
  );

  // Update conversation summary field
  await database.run(
    `UPDATE conversations
     SET summary = ?,
         summarized_at = CURRENT_TIMESTAMP,
         times_summarized = times_summarized + 1
     WHERE id = ?`,
    [summary, conversationId]
  );

  return {
    success: true,
    summaryMessageId: summaryMessage.id,
    messagesSummarized,
    messagesToKeep
  };
}

/**
 * Get messages for LLM context (only messages after latest summary)
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Maximum messages to return
 * @returns {Promise<Array>} - Messages after latest summary
 */
async function getMessagesForContext(conversationId, limit = 100) {
  const database = await initializeDatabase();

  // Find the latest summary message
  const latestSummary = await database.get(
    `SELECT id, timestamp, summarizes_count
     FROM messages
     WHERE conversation_id = ? AND is_summary = 1
     ORDER BY timestamp DESC
     LIMIT 1`,
    [conversationId]
  );

  let messages;

  if (latestSummary) {
    // Get summary message + all messages after it
    messages = await database.all(
      `SELECT m.*, GROUP_CONCAT(te.id) as has_tool_executions
       FROM messages m
       LEFT JOIN tool_executions te ON te.message_id = m.id
       WHERE m.conversation_id = ?
         AND m.timestamp >= ?
       GROUP BY m.id
       ORDER BY m.timestamp ASC
       LIMIT ?`,
      [conversationId, latestSummary.timestamp, limit]
    );
  } else {
    // No summary yet, get all messages
    messages = await getMessages(conversationId, limit);
  }

  return messages;
}

// =============================================
// EXPORT OPERATIONS
// =============================================

/**
 * Export conversation as JSON
 */
async function exportConversationJSON(conversationId) {
  const conversation = await getConversation(conversationId);
  const messages = await getMessages(conversationId);

  if (!conversation) {
    return null;
  }

  return {
    conversationId: conversation.id,
    title: conversation.title,
    exportedAt: new Date().toISOString(),
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    statistics: {
      tokenCount: conversation.token_count,
      messageCount: conversation.message_count,
      toolExecutionCount: conversation.tool_execution_count,
      estimatedCost: conversation.estimated_cost,
      ageHours: conversation.age_hours
    },
    messages: messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      tokenCount: msg.token_count,
      stopped: msg.stopped === 1,
      toolExecutions: msg.tool_executions || []
    }))
  };
}

/**
 * Export conversation as Markdown
 */
async function exportConversationMarkdown(conversationId) {
  const conversation = await getConversation(conversationId);
  const messages = await getMessages(conversationId);

  if (!conversation) {
    return null;
  }

  let markdown = `# ${conversation.title}\n\n`;
  markdown += `**Exported:** ${new Date().toISOString()}\n`;
  markdown += `**Created:** ${conversation.created_at}\n`;
  markdown += `**Total Tokens:** ${conversation.token_count.toLocaleString()} / 20,480\n`;
  markdown += `**Messages:** ${conversation.message_count}\n`;
  markdown += `**Tool Executions:** ${conversation.tool_execution_count}\n`;
  markdown += `**Estimated Cost:** $${conversation.estimated_cost.toFixed(4)}\n\n`;
  markdown += `---\n\n`;

  messages.forEach((msg, index) => {
    markdown += `## Message ${index + 1}\n`;
    markdown += `**${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}** · *${msg.timestamp}*\n\n`;
    markdown += `${msg.content}\n\n`;

    if (msg.tool_executions && msg.tool_executions.length > 0) {
      markdown += `**Tools Used:**\n`;
      msg.tool_executions.forEach(tool => {
        markdown += `- 🔧 \`${tool.tool_name}\``;
        if (tool.duration_ms) {
          markdown += ` (${tool.duration_ms}ms)`;
        }
        markdown += `\n`;
        if (tool.tool_input && Object.keys(tool.tool_input).length > 0) {
          markdown += `  - **Input:** \`${JSON.stringify(tool.tool_input)}\`\n`;
        }
        if (tool.tool_output && Object.keys(tool.tool_output).length > 0) {
          markdown += `  - **Output:** \`${JSON.stringify(tool.tool_output)}\`\n`;
        }
      });
      markdown += `\n`;
    }

    markdown += `---\n\n`;
  });

  return markdown;
}

// =============================================
// EXPORTS
// =============================================

module.exports = {
  // Database lifecycle
  initializeDatabase,
  closeDatabase,

  // Utilities
  estimateTokens,

  // Conversations
  createConversation,
  getConversation,
  getAllConversations,
  updateConversationTitle,
  deleteConversation,
  shouldSummarizeConversation,

  // Messages
  addMessage,
  getMessage,
  getMessages,
  updateMessage,

  // Tool executions
  addToolExecution,
  getToolExecution,
  getToolExecutionsForMessage,

  // Summarization
  summarizeConversation,
  addConversationSummary,
  getMessagesForContext,

  // Export
  exportConversationJSON,
  exportConversationMarkdown
};
