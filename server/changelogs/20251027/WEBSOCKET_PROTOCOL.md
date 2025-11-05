# WebSocket Protocol Reference

This document describes the WebSocket message protocol for the chat interface.

---

## Connection

**WebSocket Server:** `ws://localhost:10052`

**On Connect:**
```json
{
  "type": "welcome",
  "message": "Connected to Spreadsheet WebSocket Server",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

## Client → Server Messages

### 1. Send User Message to LLM

```json
{
  "type": "llm_user_prompt",
  "message": "What is the current value of cell A1?",
  "conversationId": "conv_1234567890_abc123"  // Optional: omit to create new conversation
}
```

**Response:** Stream of `llm_assistant_response` messages

---

### 2. Stop Generation

```json
{
  "type": "llm_stop"
}
```

**Response:**
```json
{
  "type": "llm_stopped",
  "conversationId": "conv_1234567890_abc123",
  "messageId": "msg_1234567890_xyz789",
  "reason": "user_requested",
  "message": "Generation stopped",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### 3. Ping

```json
{
  "type": "ping"
}
```

**Response:**
```json
{
  "type": "pong",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### 4. Spreadsheet Command (Legacy)

```json
{
  "type": "command",
  "command": "setSheetCell",
  "params": {
    "row": 0,
    "col": 0,
    "value": "Hello"
  }
}
```

**Response:**
```json
{
  "type": "command_ack",
  "command": "setSheetCell",
  "status": "sent",
  "broadcastCount": 2,
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### 5. Tool Response (from Client)

```json
{
  "type": "response",
  "correlationId": "claude_1234567890_abc123",
  "result": {
    "value": "Hello",
    "formula": null,
    "style": {}
  },
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

## Server → Client Messages

### 1. LLM Streaming Response

**Text Chunk (while streaming):**
```json
{
  "type": "llm_assistant_response",
  "conversationId": "conv_1234567890_abc123",
  "messageId": "msg_1234567890_xyz789",
  "text": "The current value of cell A1 is ",
  "done": false,
  "timestamp": "2025-01-15T12:00:00Z"
}
```

**Final Message (streaming complete):**
```json
{
  "type": "llm_assistant_response",
  "conversationId": "conv_1234567890_abc123",
  "messageId": "msg_1234567890_xyz789",
  "text": "",
  "done": true,
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### 2. Tool Execution

**Tool Started:**
```json
{
  "type": "llm_tool_use",
  "conversationId": "conv_1234567890_abc123",
  "messageId": "msg_1234567890_xyz789",
  "toolName": "get_sheet_cell",
  "toolInput": {
    "row": 0,
    "col": 0
  },
  "collapsed": true,
  "timestamp": "2025-01-15T12:00:00Z"
}
```

**Tool Result:**
```json
{
  "type": "llm_tool_result",
  "conversationId": "conv_1234567890_abc123",
  "messageId": "msg_1234567890_xyz789",
  "toolName": "get_sheet_cell",
  "toolOutput": {
    "value": "Hello",
    "formula": null,
    "style": {}
  },
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### 3. Conversation Created

```json
{
  "type": "llm_conversation_created",
  "conversation": {
    "id": "conv_1234567890_abc123",
    "title": "New Conversation",
    "createdAt": "2025-01-15T12:00:00Z",
    "updatedAt": "2025-01-15T12:00:00Z"
  },
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### 4. Token Count Update

```json
{
  "type": "llm_token_count",
  "conversationId": "conv_1234567890_abc123",
  "tokenCount": 15234,
  "messageCount": 87,
  "toolCount": 45,
  "estimatedCost": 0.105,
  "limit": 20480,
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### 5. Conversation Warning (80% Threshold)

```json
{
  "type": "llm_conversation_warning",
  "conversationId": "conv_1234567890_abc123",
  "warnings": [
    {
      "type": "token",
      "current": 16500,
      "limit": 20480,
      "percentage": 81
    },
    {
      "type": "message",
      "current": 125,
      "limit": 150,
      "percentage": 83
    }
  ],
  "timestamp": "2025-01-15T12:00:00Z"
}
```

**Warning Types:**
- `token` - Token count warning
- `message` - Message count warning
- `tool` - Tool execution count warning
- `age` - Age warning (24 hours)

---

### 6. Should Summarize

```json
{
  "type": "llm_should_summarize",
  "conversationId": "conv_1234567890_abc123",
  "reason": "token_limit",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

**Reasons:**
- `token_limit` - 20,480 tokens reached
- `message_limit` - 150 messages reached
- `tool_limit` - 100 tool executions reached
- `age_limit` - 24 hours reached

**Client Action:** Show UI hint suggesting user to summarize or clear history

---

### 7. Error

```json
{
  "type": "llm_error",
  "conversationId": "conv_1234567890_abc123",
  "messageId": "msg_1234567890_xyz789",
  "error": "Failed to execute tool: timeout",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### 8. Generation Stopped

```json
{
  "type": "llm_stopped",
  "conversationId": "conv_1234567890_abc123",
  "messageId": "msg_1234567890_xyz789",
  "reason": "user_requested",
  "message": "Generation stopped",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

**Reasons:**
- `user_requested` - User clicked stop button
- `client_disconnect` - Client disconnected

---

## Message Grouping by messageId

**Problem:** Streaming responses generate many messages, spamming the message list.

**Solution:** Group messages by `messageId` field.

**Example:**

Message 1:
```json
{ "type": "llm_assistant_response", "messageId": "msg_123", "text": "The ", "done": false }
```

Message 2:
```json
{ "type": "llm_assistant_response", "messageId": "msg_123", "text": "value ", "done": false }
```

Message 3:
```json
{ "type": "llm_assistant_response", "messageId": "msg_123", "text": "is 42", "done": false }
```

Message 4:
```json
{ "type": "llm_assistant_response", "messageId": "msg_123", "text": "", "done": true }
```

**Client Implementation:**
```javascript
const messageMap = new Map(); // messageId -> accumulated text

function handleMessage(msg) {
  if (msg.type === 'llm_assistant_response') {
    if (!messageMap.has(msg.messageId)) {
      messageMap.set(msg.messageId, '');
    }

    if (msg.done) {
      // Message complete, display final version
      const finalText = messageMap.get(msg.messageId);
      displayMessage(msg.messageId, finalText, true);
      messageMap.delete(msg.messageId);
    } else {
      // Accumulate text
      const current = messageMap.get(msg.messageId);
      messageMap.set(msg.messageId, current + msg.text);
      displayMessage(msg.messageId, current + msg.text, false);
    }
  }
}
```

---

## Typical Flow

### User Sends Message

```
Client                          Server                        Claude API
  │                               │                               │
  ├─ llm_user_prompt ────────────>│                               │
  │                               ├─ Save user message to DB      │
  │                               ├─ Load conversation history    │
  │                               ├─ Create AbortController       │
  │                               ├─ Track in activeStreams       │
  │                               │                               │
  │                               ├─ Create stream ──────────────>│
  │                               │                               │
  │<── llm_assistant_response ────┤<── Text delta ────────────────┤
  │    (text: "The ", done: false)│                               │
  │                               │                               │
  │<── llm_assistant_response ────┤<── Text delta ────────────────┤
  │    (text: "value ", done: false)                              │
  │                               │                               │
  │<── llm_tool_use ──────────────┤<── Tool use ──────────────────┤
  │    (toolName: "get_sheet_cell")                               │
  │                               ├─ Execute tool                 │
  │                               ├─ Save to DB                   │
  │                               │                               │
  │<── llm_tool_result ───────────┤                               │
  │    (toolOutput: {...})        │                               │
  │                               │                               │
  │<── llm_assistant_response ────┤<── Text delta ────────────────┤
  │    (text: "is 42", done: false)                               │
  │                               │                               │
  │<── llm_assistant_response ────┤<── Stream end ────────────────┤
  │    (text: "", done: true)     │                               │
  │                               ├─ Save assistant message to DB │
  │                               ├─ Clean up activeStreams       │
  │                               │                               │
  │<── llm_token_count ───────────┤                               │
  │    (tokenCount: 1234, ...)    │                               │
```

---

### User Stops Generation

```
Client                          Server                        Claude API
  │                               │                               │
  │ (Generation in progress)      │<══ Streaming ═════════════════┤
  │                               │                               │
  ├─ llm_stop ───────────────────>│                               │
  │                               ├─ Find in activeStreams        │
  │                               ├─ abortController.abort() ────>│
  │                               ├─ Mark message as stopped      │
  │                               ├─ Clean up activeStreams       │
  │                               │                               │
  │<── llm_stopped ───────────────┤                               │
  │    (reason: "user_requested") │                               │
```

---

### Client Disconnects During Generation

```
Client                          Server                        Claude API
  │                               │                               │
  │ (Generation in progress)      │<══ Streaming ═════════════════┤
  │                               │                               │
  X (disconnects)                 │                               │
  │                               │                               │
  │                               ├─ ws.on('close') triggered     │
  │                               ├─ handleClientDisconnect(ws)   │
  │                               ├─ Find in activeStreams        │
  │                               ├─ abortController.abort() ────>│
  │                               ├─ Mark message as stopped      │
  │                               ├─ Clean up activeStreams       │
  │                               ├─ Log abort                    │
```

---

## Error Handling

### Connection Lost
- Automatic reconnection (implement in client)
- Show "Reconnecting..." message
- Queue messages until reconnected

### Tool Timeout
- Default timeout: 10 seconds
- Error message sent to client
- LLM receives error and can retry

### Generation Error
- `llm_error` message sent to client
- Error logged in database
- Client shows error message

---

## Best Practices

### Client Implementation

1. **Group messages by messageId:**
   - Accumulate streaming text
   - Update UI in real-time
   - Finalize when `done: true`

2. **Handle stop gracefully:**
   - Disable stop button when not generating
   - Enable when streaming starts
   - Show visual feedback

3. **Monitor limits:**
   - Display token/message/tool counts
   - Show warnings at 80%
   - Suggest actions when limit reached

4. **Handle errors:**
   - Show user-friendly error messages
   - Allow retry
   - Log errors for debugging

---

## Security Considerations

1. **Input Validation:**
   - Validate all incoming messages
   - Sanitize user input
   - Limit message size

2. **Rate Limiting:**
   - Limit messages per client
   - Limit concurrent generations
   - Prevent spam

3. **Authentication:**
   - Currently no authentication (local development)
   - Add authentication for production

---

## Performance Notes

- **Streaming:** Reduces perceived latency
- **AbortController:** Immediate stop, saves API costs
- **Database:** All queries are synchronous (better-sqlite3)
- **Message Grouping:** Reduces UI updates

---

**Version:** 1.0
**Last Updated:** January 2025
**Phase:** 1 Complete
