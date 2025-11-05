# Chat Interface Implementation Plan

## Summary of Requirements (Based on User Clarifications)

### 1. Chat UI Layout
- ✅ **Layout:** Two columns (Spreadsheet | Chat Panel)
- ✅ **Chat Panel:** Collapsible AND resizable
- ✅ **Style:** ChatGPT-like UI
- ✅ **Debug Overlay:** Separate (for debugging only)
- ✅ **Buttons:** Only LLM chat-related commands in chat panel

### 2. Conversation Management
- ✅ **Multiple Conversations:** Support creating/switching between chat rooms
- ✅ **Storage:** Server-side SQLite database per conversation
- ✅ **Clear History:** Deletes current conversation/room only
- ✅ **Auto-load:** Load conversation list and latest conversation on connect

### 3. Message History & Tokens
- ✅ **Token Limit:** 10,240 tokens per conversation
- ✅ **Summarization:** Smart retention via new MCP tool
- ✅ **Who Summarizes:** Server (Claude via MCP tool)
- ✅ **Strategy:** LLM decides when to summarize based on token usage

### 4. Stop Generation
- ✅ **Trigger:** Button in UI
- ✅ **Behavior:** Silent stop with acknowledgment message
- ✅ **Implementation:** AbortController (will explain below)

### 5. Client Disconnect
- ✅ **Abort Streams:** Yes
- ✅ **Logging:** Yes (log to server)

### 6. Tool Display
- ✅ **Format:** Expandable with metadata
- ✅ **Chat View:** Collapsed by default, expandable
- ✅ **Debug View:** Full details always shown
- ✅ **Setting:** Show/hide tool details toggle

### 7. Export/Import
- ✅ **Export Format:** JSON + Markdown
- ✅ **Export Trigger:** Button
- ✅ **Export Content:** Full history with tool usage
- ✅ **Filename:** `chat_history_<timestamp>.<ext>`
- ✅ **Import:** Load conversations from API (no interactive import for now)

### 8. Undo/Redo
- ✅ **Scope:** Spreadsheet only
- ✅ **Implementation:** `GC.Spread.Sheets.SpreadActions.undo/redo`
- ✅ **Trigger:** LLM commands (`undo_spreadsheet`, `redo_spreadsheet`)

---

## Architecture Overview

### Database Schema (SQLite)

```sql
-- Conversations table
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    token_count INTEGER DEFAULT 0,
    summary TEXT
);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    message_id TEXT,
    token_count INTEGER DEFAULT 0,
    metadata TEXT, -- JSON: { toolsUsed: [...], stopped: bool, etc }
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Tool executions table (for expandable view)
CREATE TABLE tool_executions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input TEXT, -- JSON
    tool_output TEXT, -- JSON
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp);
CREATE INDEX idx_tools_message ON tool_executions(message_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

### Component Structure

```
client/src/pages/SpreadSheetEditorPageJSONTemplateCreation.jsx
├── SpreadsheetEditor (flex: 1)
└── ChatPanel (collapsible, resizable, default 450px)
    ├── ConversationSidebar (left, 200px, collapsible)
    │   ├── NewConversationButton
    │   ├── ConversationList
    │   │   └── ConversationItem (title, date, active state)
    │   └── ConversationActions
    │       ├── DeleteConversation
    │       └── ExportConversation
    │
    ├── ChatView (flex: 1)
    │   ├── ChatHeader
    │   │   ├── ConversationTitle (editable)
    │   │   ├── TokenCounter (e.g., "2,450 / 10,240 tokens")
    │   │   └── ChatActions
    │   │       ├── ExportButton
    │   │       ├── SettingsButton (toggle tool details)
    │   │       └── DeleteConversationButton
    │   │
    │   ├── MessageList (scrollable, auto-scroll to bottom)
    │   │   ├── UserMessage
    │   │   │   ├── Avatar
    │   │   │   ├── MessageContent
    │   │   │   └── Timestamp
    │   │   │
    │   │   ├── AssistantMessage
    │   │   │   ├── Avatar
    │   │   │   ├── MessageContent (markdown rendered)
    │   │   │   ├── ToolUseSection (expandable)
    │   │   │   │   ├── ToolBadge ("🔧 get_spreadsheet_status")
    │   │   │   │   └── ToolDetails (collapsed, click to expand)
    │   │   │   │       ├── Input (JSON)
    │   │   │   │       ├── Output (JSON)
    │   │   │   │       └── Duration
    │   │   │   └── Timestamp
    │   │   │
    │   │   └── SystemMessage
    │   │       └── Content ("Generation stopped", "Conversation summarized")
    │   │
    │   └── InputArea (bottom, sticky)
    │       ├── TextArea (auto-resize, placeholder: "Ask Claude...")
    │       ├── SendButton (disabled during generation)
    │       ├── StopButton (visible only during generation)
    │       └── CharacterCount (optional)
    │
    └── ResizeHandle (drag to resize panel width)
```

### Server Architecture

```
server/
├── database/
│   ├── db.js (SQLite connection & queries)
│   └── schema.sql (database schema)
│
├── claude-agent.js (enhanced)
│   ├── Active streams tracking: Map<ws, AbortController>
│   ├── Conversation loading
│   ├── Token counting
│   ├── Stop generation
│   └── Message persistence
│
├── tool-definitions.js (enhanced)
│   └── New tools:
│       ├── summarize_conversation
│       ├── undo_spreadsheet
│       └── redo_spreadsheet
│
└── server.js (enhanced)
    └── New endpoints:
        ├── GET /api/conversations (list all)
        ├── GET /api/conversations/:id (get messages)
        ├── POST /api/conversations (create new)
        ├── DELETE /api/conversations/:id (delete)
        ├── PUT /api/conversations/:id (update title)
        └── GET /api/conversations/:id/export (export as JSON/MD)
```

### WebSocket Message Protocol

```javascript
// Client -> Server

// Create new conversation
{
  type: 'llm_create_conversation',
  title?: 'New Chat'
}

// Switch conversation
{
  type: 'llm_switch_conversation',
  conversationId: 'uuid'
}

// Send message
{
  type: 'llm_user_prompt',
  message: 'Your prompt here',
  conversationId: 'uuid'
}

// Stop generation
{
  type: 'llm_stop',
  conversationId: 'uuid'
}

// Delete conversation
{
  type: 'llm_delete_conversation',
  conversationId: 'uuid'
}

// Update conversation title
{
  type: 'llm_update_conversation',
  conversationId: 'uuid',
  title: 'New Title'
}

// Server -> Client

// Conversation list
{
  type: 'llm_conversations_list',
  conversations: [
    {
      id: 'uuid',
      title: 'Chat about spreadsheets',
      createdAt: '2025-01-15T10:30:00Z',
      updatedAt: '2025-01-15T11:45:00Z',
      tokenCount: 2450,
      messageCount: 12
    }
  ]
}

// Conversation created
{
  type: 'llm_conversation_created',
  conversation: { id: 'uuid', title: '...', ... }
}

// Messages loaded
{
  type: 'llm_messages_loaded',
  conversationId: 'uuid',
  messages: [
    {
      id: 'msg_uuid',
      role: 'user',
      content: '...',
      timestamp: '...',
      tokenCount: 45
    },
    {
      id: 'msg_uuid_2',
      role: 'assistant',
      content: '...',
      timestamp: '...',
      tokenCount: 120,
      toolExecutions: [
        {
          id: 'tool_uuid',
          toolName: 'get_spreadsheet_status',
          toolInput: {},
          toolOutput: { status: 'ok' },
          durationMs: 45
        }
      ]
    }
  ],
  totalTokens: 2450
}

// Streaming response (unchanged)
{
  type: 'llm_assistant_response',
  conversationId: 'uuid',
  messageId: 'msg_uuid',
  text: 'Hello...',
  done: false,
  timestamp: '...'
}

// Tool execution
{
  type: 'llm_tool_use',
  conversationId: 'uuid',
  messageId: 'msg_uuid',
  toolId: 'tool_uuid',
  toolName: 'get_spreadsheet_status',
  toolInput: {},
  collapsed: true // hint to UI
}

{
  type: 'llm_tool_result',
  conversationId: 'uuid',
  messageId: 'msg_uuid',
  toolId: 'tool_uuid',
  toolName: 'get_spreadsheet_status',
  toolOutput: { status: 'ok', clients: 2 },
  durationMs: 45
}

// Generation stopped
{
  type: 'llm_stopped',
  conversationId: 'uuid',
  messageId: 'msg_uuid',
  reason: 'user_requested' | 'client_disconnect' | 'error',
  message: 'Generation stopped by user'
}

// Conversation summarized
{
  type: 'llm_conversation_summarized',
  conversationId: 'uuid',
  summary: 'User asked about spreadsheet features...',
  tokensSaved: 3450,
  newTokenCount: 1200
}

// Token count update
{
  type: 'llm_token_count',
  conversationId: 'uuid',
  tokenCount: 2450,
  limit: 10240
}
```

---

## Implementation Details

### 1. Stop Generation (AbortController Explanation)

**What is AbortController?**
- A JavaScript API for cancelling async operations
- Anthropic SDK supports it natively

**Implementation:**

```javascript
// server/claude-agent.js

// Track active streams per WebSocket
const activeStreams = new Map();

async function handleStreamingChat(userMessage, ws, conversationId) {
  // Create abort controller
  const abortController = new AbortController();

  // Track this stream
  activeStreams.set(ws, {
    abortController,
    conversationId,
    messageId: null,
    startTime: Date.now()
  });

  try {
    const stream = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages,
      tools,
      stream: true,
      signal: abortController.signal  // <-- Pass abort signal
    });

    for await (const event of stream) {
      // Stream processing...
      // If abortController.abort() is called, this loop exits
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      // Generation was stopped
      ws.send(JSON.stringify({
        type: 'llm_stopped',
        conversationId,
        messageId: currentMessageId,
        reason: 'user_requested',
        message: 'Generation stopped'
      }));
    }
  } finally {
    activeStreams.delete(ws);
  }
}

// Stop generation (called when user clicks stop button)
function stopGeneration(ws) {
  const stream = activeStreams.get(ws);
  if (stream) {
    stream.abortController.abort();

    // Log to database
    logAbortedMessage(stream.conversationId, stream.messageId);
  }
}

// WebSocket close handler
ws.on('close', () => {
  stopGeneration(ws);
});

// WebSocket message handler
ws.on('message', (message) => {
  const data = JSON.parse(message);

  if (data.type === 'llm_stop') {
    stopGeneration(ws);
  }
});
```

### 2. Token Counting

```javascript
// server/claude-agent.js

function estimateTokens(text) {
  // Simple estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

async function getConversationTokenCount(conversationId) {
  // Get from database
  const result = await db.get(
    'SELECT SUM(token_count) as total FROM messages WHERE conversation_id = ?',
    [conversationId]
  );
  return result.total || 0;
}

async function checkTokenLimit(conversationId) {
  const tokenCount = await getConversationTokenCount(conversationId);
  const limit = 10240;

  if (tokenCount > limit * 0.8) {
    // Approaching limit (80%), suggest summarization
    return { shouldSummarize: true, tokenCount, limit };
  }

  return { shouldSummarize: false, tokenCount, limit };
}
```

### 3. Summarization MCP Tool

```javascript
// server/tool-definitions.js

const toolDefinitions = [
  // ... existing tools

  {
    name: 'summarize_conversation',
    description: 'Summarize the conversation history to reduce token usage. Use this when the conversation is approaching the token limit (10,240 tokens). You will receive the current conversation history and should return a concise summary that preserves important context.',
    parameters: z.object({
      summary: z.string().describe('A concise summary of the conversation so far, preserving important context like user goals, decisions made, and current state'),
      tokensToKeep: z.number().optional().describe('Number of recent messages to keep unsummarized (default: 5)')
    }),
    command: null,
    messageType: null,
    handler: async ({ summary, tokensToKeep = 5 }, conversationId) => {
      // Get all messages
      const messages = await db.all(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
        [conversationId]
      );

      // Keep last N messages
      const messagesToKeep = messages.slice(-tokensToKeep);
      const messagesToSummarize = messages.slice(0, -tokensToKeep);

      // Delete old messages
      const idsToDelete = messagesToSummarize.map(m => m.id);
      await db.run(
        `DELETE FROM messages WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
        idsToDelete
      );

      // Insert summary as system message
      const summaryId = `summary_${Date.now()}`;
      await db.run(
        'INSERT INTO messages (id, conversation_id, role, content, token_count) VALUES (?, ?, ?, ?, ?)',
        [summaryId, conversationId, 'system', `[Conversation Summary]\n${summary}`, estimateTokens(summary)]
      );

      // Update conversation
      await db.run(
        'UPDATE conversations SET summary = ?, token_count = ? WHERE id = ?',
        [summary, await getConversationTokenCount(conversationId), conversationId]
      );

      return {
        success: true,
        messagesSummarized: messagesToSummarize.length,
        messagesKept: messagesToKeep.length,
        newTokenCount: await getConversationTokenCount(conversationId)
      };
    }
  }
];
```

### 4. Undo/Redo Tools

```javascript
// server/tool-definitions.js

const toolDefinitions = [
  // ... existing tools

  {
    name: 'undo_spreadsheet',
    description: 'Undo the last spreadsheet operation (like set cell, add row, etc.)',
    parameters: z.object({}),
    command: 'undoSpreadsheet',
    messageType: 'command'
  },

  {
    name: 'redo_spreadsheet',
    description: 'Redo the last undone spreadsheet operation',
    parameters: z.object({}),
    command: 'redoSpreadsheet',
    messageType: 'command'
  }
];
```

```javascript
// client/src/hooks/useSpreadSheet.js

const undoSpreadsheet = () => {
  if (designerRef.current) {
    const spread = designerRef.current.getWorkbook();
    const sheet = spread.getActiveSheet();
    GC.Spread.Sheets.SpreadActions.undo.apply(sheet);
    return { success: true };
  }
  return { success: false, error: 'No active spreadsheet' };
};

const redoSpreadsheet = () => {
  if (designerRef.current) {
    const spread = designerRef.current.getWorkbook();
    const sheet = spread.getActiveSheet();
    GC.Spread.Sheets.SpreadActions.redo.apply(sheet);
    return { success: true };
  }
  return { success: false, error: 'No active spreadsheet' };
};

// Export these functions
return {
  // ... existing exports
  undoSpreadsheet,
  redoSpreadsheet
};
```

### 5. Export Conversation

**JSON Export:**
```json
{
  "conversationId": "uuid",
  "title": "Spreadsheet Analysis",
  "exportedAt": "2025-01-15T12:30:00Z",
  "tokenCount": 2450,
  "messageCount": 12,
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "Check the server status",
      "timestamp": "2025-01-15T10:30:00Z",
      "tokenCount": 15
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "The server is running with 2 clients connected.",
      "timestamp": "2025-01-15T10:30:05Z",
      "tokenCount": 45,
      "toolExecutions": [
        {
          "id": "tool_1",
          "toolName": "get_spreadsheet_status",
          "toolInput": {},
          "toolOutput": { "status": "ok", "clients": 2 },
          "durationMs": 45,
          "timestamp": "2025-01-15T10:30:04Z"
        }
      ]
    }
  ]
}
```

**Markdown Export:**
```markdown
# Conversation Export: Spreadsheet Analysis

**Exported:** 2025-01-15 12:30:00
**Total Tokens:** 2,450 / 10,240
**Messages:** 12

---

## Message 1
**User** · *10:30:00*

Check the server status

---

## Message 2
**Assistant** · *10:30:05*

The server is running with 2 clients connected.

**Tools Used:**
- 🔧 `get_spreadsheet_status` (45ms)
  - **Input:** `{}`
  - **Output:** `{ "status": "ok", "clients": 2 }`

---
```

---

## Implementation Phases

### Phase 1: Database & Backend Foundation (Days 1-2)
- ✅ Create SQLite schema
- ✅ Implement database.js (CRUD operations)
- ✅ Add conversation management endpoints
- ✅ Enhance claude-agent.js with:
  - AbortController integration
  - Conversation loading
  - Message persistence
  - Token counting

### Phase 2: Chat UI Components (Days 3-4)
- ✅ Create ChatPanel component
- ✅ Create ConversationSidebar
- ✅ Create MessageList with UserMessage/AssistantMessage
- ✅ Create InputArea with Send/Stop buttons
- ✅ Add resizable & collapsible behavior
- ✅ Style ChatGPT-like UI

### Phase 3: Stop Functionality (Day 5)
- ✅ Implement stop button in UI
- ✅ Handle llm_stop WebSocket message
- ✅ Add AbortController to streaming
- ✅ Test client disconnect handling
- ✅ Add logging for aborted messages

### Phase 4: Tool Display & Settings (Day 6)
- ✅ Implement expandable tool sections
- ✅ Add tool details toggle setting
- ✅ Different views for chat vs debug overlay
- ✅ Tool execution metadata display

### Phase 5: Conversation Management (Day 7)
- ✅ Load conversations on connect
- ✅ Create/switch/delete conversations
- ✅ Update conversation titles
- ✅ Token counter display
- ✅ Auto-load latest conversation

### Phase 6: Summarization & New Tools (Day 8)
- ✅ Add summarize_conversation MCP tool
- ✅ Implement smart retention logic
- ✅ Add undo_spreadsheet tool
- ✅ Add redo_spreadsheet tool
- ✅ Test summarization triggers

### Phase 7: Export/Import (Day 9)
- ✅ Implement JSON export
- ✅ Implement Markdown export
- ✅ Add export button to UI
- ✅ Test export with tool executions

### Phase 8: Testing & Polish (Day 10)
- ✅ Integration testing
- ✅ UI/UX polish
- ✅ Error handling
- ✅ Documentation

---

## File Structure (New/Modified Files)

```
server/
├── database/
│   ├── db.js ............................ NEW - SQLite wrapper
│   ├── schema.sql ....................... NEW - Database schema
│   └── migrations/ ...................... NEW - Future migrations
│
├── claude-agent.js ...................... MODIFIED - Add abort, persistence
├── tool-definitions.js .................. MODIFIED - Add 3 new tools
├── server.js ............................ MODIFIED - Add conversation endpoints
└── package.json ......................... MODIFIED - Add 'better-sqlite3'

client/src/
├── components/
│   ├── chat/
│   │   ├── ChatPanel.jsx ................ NEW - Main chat container
│   │   ├── ConversationSidebar.jsx ...... NEW - Conversation list
│   │   ├── ConversationItem.jsx ......... NEW - Single conversation
│   │   ├── MessageList.jsx .............. NEW - Message container
│   │   ├── UserMessage.jsx .............. NEW - User message bubble
│   │   ├── AssistantMessage.jsx ......... NEW - Assistant message bubble
│   │   ├── ToolExecutionSection.jsx ..... NEW - Expandable tool details
│   │   ├── InputArea.jsx ................ NEW - Input + buttons
│   │   └── ResizeHandle.jsx ............. NEW - Panel resize
│   │
│   └── WebSocketDebugOverlay.jsx ........ UNCHANGED - Separate debug
│
├── hooks/
│   ├── useChat.js ....................... NEW - Chat state management
│   ├── useConversations.js .............. NEW - Conversation CRUD
│   └── useSpreadSheet.js ................ MODIFIED - Add undo/redo
│
├── pages/
│   └── SpreadSheetEditorPageJSONTemplateCreation.jsx ... MODIFIED - Add ChatPanel
│
└── utils/
    ├── tokenCounter.js .................. NEW - Token estimation
    └── exportChat.js .................... NEW - Export JSON/MD
```

---

## Next Steps

Ready to start implementation!

**Would you like me to:**
1. Start with Phase 1 (Database & Backend)?
2. Create the database schema and db.js first?
3. Or would you prefer a different starting point?

Please confirm and I'll begin! 🚀
