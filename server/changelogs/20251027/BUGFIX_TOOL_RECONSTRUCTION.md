# Bug Fix: Tool Use/Tool Result Records Not Properly Reconstructed

**Date:** January 2025
**Issue:** Multi-turn conversations with tool use failing due to missing context
**Status:** ✅ Fixed

---

## Problem

When loading conversation history from the database, tool use and tool result records were not being properly reconstructed in the Anthropic message format. This caused multi-turn conversations with tool executions to fail because Claude didn't have the complete tool execution history.

**Symptoms:**
- First message with tool use works correctly
- Second message in same conversation fails or loses context
- Claude doesn't "remember" previous tool executions
- Tool results not available for multi-turn reasoning

---

## Root Cause

### 1. Missing tool_use_id in Database

The `tool_executions` table didn't store Claude's unique `tool_use_id`, only our internal ID:

```sql
-- OLD SCHEMA (missing tool_use_id)
CREATE TABLE tool_executions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input TEXT,
    tool_output TEXT,
    -- ... other fields
);
```

### 2. Simple Text Message Reconstruction

The message reconstruction code only pushed simple text content, ignoring tool executions:

```javascript
// OLD CODE (lines 364-383 in claude-agent.js)
for (const msg of dbMessages) {
  if (msg.role === 'user' || msg.role === 'assistant') {
    messages.push({
      role: msg.role,
      content: msg.content.trim() // ❌ ONLY TEXT - tool_executions ignored!
    });
  }
}
```

### 3. Anthropic Format Requirements

Anthropic's API requires assistant messages with tool use to include structured `tool_use` blocks, followed by user messages with `tool_result` blocks:

```javascript
// REQUIRED FORMAT
[
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me check that...' },
      {
        type: 'tool_use',
        id: 'toolu_abc123',  // ← Claude's unique ID
        name: 'get_cell',
        input: { row: 0, col: 0 }
      }
    ]
  },
  {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_abc123',  // ← Must match tool_use id
        content: '{"value": "Hello"}'
      }
    ]
  }
]
```

---

## Solution

### 1. Added tool_use_id Column to Database

Updated schema to store Claude's unique tool use ID:

```sql
-- NEW SCHEMA
CREATE TABLE tool_executions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    tool_use_id TEXT,  -- ✅ Claude's unique tool use ID (for reconstruction)
    tool_name TEXT NOT NULL,
    tool_input TEXT,
    tool_output TEXT,
    -- ... other fields
);
```

### 2. Updated Database Functions

**db.addToolExecution()** - Now accepts and stores tool_use_id:

```javascript
function addToolExecution(messageId, conversationId, toolName, toolInput, toolOutput, options = {}) {
  const {
    toolUseId = null,  // ✅ New parameter
    durationMs = null,
    success = true,
    error = null
  } = options;

  const stmt = db.prepare(`
    INSERT INTO tool_executions (id, message_id, conversation_id, tool_use_id, tool_name, tool_input, tool_output, duration_ms, success, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    messageId,
    conversationId,
    toolUseId,  // ✅ Store Claude's tool use ID
    toolName,
    JSON.stringify(toolInput),
    JSON.stringify(toolOutput),
    durationMs,
    success ? 1 : 0,
    error
  );
}
```

**db.getMessages()** - Now returns tool_use_id:

```javascript
SELECT m.*,
       (SELECT json_group_array(json_object(
          'id', te.id,
          'tool_use_id', te.tool_use_id,  // ✅ Include tool_use_id
          'tool_name', te.tool_name,
          'tool_input', te.tool_input,
          'tool_output', te.tool_output,
          -- ... other fields
       ))
       FROM tool_executions te
       WHERE te.message_id = m.id) as tool_executions
FROM messages m
WHERE m.conversation_id = ?
ORDER BY m.timestamp ASC
```

### 3. Updated executeTool() to Store tool_use_id

```javascript
// claude-agent.js line 121
async function executeTool(toolName, toolInput, conversationId, messageId, toolUseId = null) {
  // ... execute tool ...

  db.addToolExecution(
    messageId,
    conversationId,
    toolName,
    toolInput,
    result,
    { toolUseId, durationMs, success, error }  // ✅ Include Claude's tool use ID
  );
}

// claude-agent.js line 512
const result = await executeTool(
  toolBlock.name,
  toolInput,
  conversationId,
  assistantMessageDbId,
  toolBlock.id  // ✅ Pass Claude's tool use ID
);
```

### 4. Fixed Message Reconstruction Logic

Complete rewrite of message reconstruction to properly rebuild Anthropic format:

```javascript
// claude-agent.js lines 364-445
for (let i = 0; i < dbMessages.length; i++) {
  const msg = dbMessages[i];

  if (msg.role === 'system') {
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
    // ✅ Assistant messages may include tool_use blocks
    const content = [];

    // Add text content if present
    if (msg.content && msg.content.trim()) {
      content.push({
        type: 'text',
        text: msg.content.trim()
      });
    }

    // ✅ Add tool_use blocks if present
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

    // If assistant message has tool uses, add tool_result messages
    if (msg.tool_executions && msg.tool_executions.length > 0) {
      // ✅ Add assistant message with tool_use blocks
      messages.push({
        role: 'assistant',
        content: content
      });

      // ✅ Add user message with tool_result blocks
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
```

---

## Files Modified

### 1. server/database/schema.sql
- Added `tool_use_id TEXT` column to `tool_executions` table (line 54)

### 2. server/database/db.js
- Updated `addToolExecution()` to accept and store `toolUseId` parameter (lines 344-375)
- Updated `getMessages()` query to include `tool_use_id` in result (line 274)

### 3. server/claude-agent.js
- Updated `executeTool()` signature to accept `toolUseId` parameter (line 121)
- Updated `executeTool()` call to pass `toolBlock.id` (line 517)
- Updated `db.addToolExecution()` call to include `toolUseId` (line 169)
- **Complete rewrite** of message reconstruction logic (lines 364-445)

### 4. server/database/migrate-add-tool-use-id.sql (NEW)
- Migration script for existing databases
- Adds `tool_use_id` column to `tool_executions` table

---

## Database Migration

For existing databases, run this command:

```bash
sqlite3 server/database/conversations.db "ALTER TABLE tool_executions ADD COLUMN tool_use_id TEXT;"
```

Or use the migration script:

```bash
sqlite3 server/database/conversations.db < server/database/migrate-add-tool-use-id.sql
```

**Note:** Existing tool_executions will have `NULL` tool_use_id values. This is okay - they won't be used for reconstruction. New tool executions will have proper tool_use_id values.

---

## Testing

### Test Case 1: Single Tool Use
```
User: "What is the value of cell A1?"
Assistant: [Uses get_sheet_cell tool]
Result: ✅ Works correctly
```

### Test Case 2: Multi-Turn Conversation
```
User: "What is the value of cell A1?"
Assistant: [Uses get_sheet_cell tool] "Cell A1 contains 'Hello'"

User: "Now set A1 to 'World'"
Assistant: [Uses set_sheet_cell tool] "I've updated cell A1"

User: "What is it now?"
Assistant: [Uses get_sheet_cell tool] "Cell A1 now contains 'World'"

Result: ✅ All tool executions have proper context
```

### Test Case 3: Multiple Tools in One Message
```
User: "Get cell A1 and B1, then tell me their sum"
Assistant: [Uses get_sheet_cell twice, then responds with sum]
Result: ✅ Both tool uses reconstructed correctly
```

---

## Impact

**Before Fix:**
- ❌ Multi-turn conversations with tool use failed
- ❌ Claude had no memory of previous tool executions
- ❌ Tool results not available for reasoning
- ❌ Context lost between messages

**After Fix:**
- ✅ Multi-turn conversations work correctly
- ✅ Claude has full tool execution history
- ✅ Tool results available for multi-turn reasoning
- ✅ Complete context preservation
- ✅ Proper Anthropic message format

---

## Technical Details

### Message Format Examples

**Before Fix (Broken):**
```javascript
[
  { role: 'user', content: 'What is cell A1?' },
  { role: 'assistant', content: '[Tool use only]' },  // ❌ No tool_use blocks!
  { role: 'user', content: 'Now set it to World' },
  // ❌ Claude doesn't know what tool was used or what the result was
]
```

**After Fix (Correct):**
```javascript
[
  { role: 'user', content: 'What is cell A1?' },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me check cell A1...' },
      {
        type: 'tool_use',
        id: 'toolu_abc123',
        name: 'get_sheet_cell',
        input: { row: 0, col: 0, sheetName: 'Sheet1' }
      }
    ]
  },
  {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_abc123',
        content: '{"value":"Hello"}'
      }
    ]
  },
  { role: 'user', content: 'Now set it to World' },
  // ✅ Claude has full context of previous tool execution
]
```

---

## Related Documentation

- [ANTHROPIC_MESSAGE_FORMAT.md](ANTHROPIC_MESSAGE_FORMAT.md) - Anthropic message format details
- [PHASE1_COMPLETE_SUMMARY.md](PHASE1_COMPLETE_SUMMARY.md) - Backend architecture
- [WEBSOCKET_PROTOCOL.md](WEBSOCKET_PROTOCOL.md) - WebSocket message types

---

## Prevention

To prevent similar issues in the future:

1. **Always store external IDs** - When working with external APIs (Claude, etc.), store their unique IDs, not just internal IDs
2. **Test multi-turn scenarios** - Don't just test the first use, test follow-up messages
3. **Validate message format** - Ensure reconstructed messages match API requirements exactly
4. **Check database schema** - Verify all necessary data is stored for reconstruction

---

**Status:** ✅ Fixed and Tested
**Ready for Production:** Yes
**Breaking Changes:** None (backward compatible with NULL tool_use_id)
