# WebSocket Integration Example with MessageId Grouping

## App.jsx Integration

Here's how to integrate the messageId grouping feature in your main App component:

```javascript
import React, { useRef, useEffect } from 'react';
import WebSocketDebugOverlay from './components/WebSocketDebugOverlay';

function App() {
  const wsDebugRef = useRef(null);
  const ws = useRef(null);

  useEffect(() => {
    // Setup WebSocket connection
    ws.current = new WebSocket('ws://localhost:10052');

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Log to debug overlay with messageId support
      if (wsDebugRef.current) {
        logToDebugOverlay(data);
      }

      // Handle specific message types
      handleWebSocketMessage(data);
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const logToDebugOverlay = (data) => {
    const { type, messageId } = data;

    switch (type) {
      case 'llm_assistant_response':
        // Streaming response - will be grouped by messageId
        wsDebugRef.current(
          'llm_assistant_response',
          data.done ? '[Response completed]' : data.text,
          'in',
          messageId,
          { done: data.done, timestamp: data.timestamp }
        );
        break;

      case 'llm_tool_use':
        // Tool execution - grouped with same conversation turn
        wsDebugRef.current(
          'llm_tool_use',
          JSON.stringify({
            tool: data.toolName,
            input: data.toolInput
          }, null, 2),
          'in',
          messageId,
          { toolName: data.toolName }
        );
        break;

      case 'llm_error':
        // Error - grouped with same conversation turn
        wsDebugRef.current(
          'llm_error',
          data.error,
          'in',
          messageId,
          { error: data.error }
        );
        break;

      case 'response':
        // Regular command responses (no grouping needed)
        wsDebugRef.current(
          'response',
          JSON.stringify(data, null, 2),
          'in'
        );
        break;

      default:
        // Generic logging
        wsDebugRef.current(
          type,
          JSON.stringify(data, null, 2),
          'in',
          messageId
        );
    }
  };

  const handleWebSocketMessage = (data) => {
    // Your existing message handling logic
    switch (data.type) {
      case 'llm_assistant_response':
        // Update UI with Claude's response
        if (!data.done) {
          appendToChat(data.text);
        }
        break;

      case 'llm_tool_use':
        // Show tool execution in UI
        showToolExecution(data.toolName, data.toolInput);
        break;

      // ... other handlers
    }
  };

  const sendCommand = (command) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(command));
    }
  };

  return (
    <div className="app">
      {/* Your main app content */}

      {/* Debug overlay with messageId support */}
      <WebSocketDebugOverlay
        webSocketConnected={ws.current?.readyState === WebSocket.OPEN}
        onSendCommand={sendCommand}
        onRecvCommand={wsDebugRef}
      />
    </div>
  );
}

export default App;
```

## Example: Claude Conversation Flow

### Scenario: User asks Claude to check server status

**1. User sends prompt**
```javascript
// Send via debug overlay or programmatically
sendCommand({
  type: 'llm_user_prompt',
  message: 'Check the server status and tell me what you found.',
  timestamp: new Date().toISOString()
});

// Logged as:
// → OUT [LLM_USER_PROMPT]
// { "type": "llm_user_prompt", "message": "Check...", ... }
```

**2. Claude starts streaming response** (messageId: `msg_123_abc`)
```javascript
// First delta
wsDebugRef.current('llm_assistant_response', 'Let me check', 'in', 'msg_123_abc');

// Second delta - APPENDS to same message
wsDebugRef.current('llm_assistant_response', ' the server', 'in', 'msg_123_abc');

// Third delta - APPENDS to same message
wsDebugRef.current('llm_assistant_response', ' status for you.', 'in', 'msg_123_abc');

// Result in debug overlay (single message):
// 10:30:45 → 10:30:47 ← IN [LLM_ASSISTANT_RESPONSE] ↻ 3 #msg_123
// "Let me check the server status for you."
```

**3. Claude calls tool** (same messageId)
```javascript
wsDebugRef.current(
  'llm_tool_use',
  JSON.stringify({ tool: 'get_spreadsheet_status', input: {} }, null, 2),
  'in',
  'msg_123_abc'
);

// Result in debug overlay (new message, same messageId):
// 10:30:47 ← IN [LLM_TOOL_USE] #msg_123
// { "tool": "get_spreadsheet_status", "input": {} }
```

**4. Claude continues with result** (new messageId: `msg_124_xyz`)
```javascript
// New conversation turn, new messageId
wsDebugRef.current('llm_assistant_response', 'The server', 'in', 'msg_124_xyz');
wsDebugRef.current('llm_assistant_response', ' is running', 'in', 'msg_124_xyz');
wsDebugRef.current('llm_assistant_response', ' with 2 clients.', 'in', 'msg_124_xyz');
wsDebugRef.current('llm_assistant_response', '[done]', 'in', 'msg_124_xyz', { done: true });

// Result in debug overlay (single message, different from first):
// 10:30:48 → 10:30:49 ← IN [LLM_ASSISTANT_RESPONSE] ↻ 4 #msg_124
// "The server is running with 2 clients.[done]"
```

## Expected Debug Overlay Display

```
Messages (4)

────────────────────────────────────────────────────────────

10:30:45 → OUT [LLM_USER_PROMPT]
{
  "type": "llm_user_prompt",
  "message": "Check the server status and tell me what you found.",
  "timestamp": "2025-01-15T10:30:45.000Z"
}

────────────────────────────────────────────────────────────

10:30:45 → 10:30:47 ← IN [LLM_ASSISTANT_RESPONSE] ↻ 3 #msg_123
Let me check the server status for you.

────────────────────────────────────────────────────────────

10:30:47 ← IN [LLM_TOOL_USE] #msg_123
{
  "tool": "get_spreadsheet_status",
  "input": {}
}

────────────────────────────────────────────────────────────

10:30:48 → 10:30:49 ← IN [LLM_ASSISTANT_RESPONSE] ↻ 4 #msg_124
The server is running with 2 clients.[done]

────────────────────────────────────────────────────────────
```

## Benefits in Real Usage

### Without MessageId Grouping:
- **58 messages** for a single Claude response (one per text delta)
- Hard to read the conversation flow
- Cluttered debug log

### With MessageId Grouping:
- **2 messages** for the same response (one for initial response, one for continuation)
- Clear conversation flow
- Easy to see what Claude said in each turn

## Advanced: Handling Multiple Concurrent Conversations

If you have multiple concurrent conversations (e.g., multiple Claude instances), each will have different messageIds:

```javascript
// Conversation 1
wsDebugRef.current('llm_assistant_response', 'Hello', 'in', 'msg_conv1_abc');
wsDebugRef.current('llm_assistant_response', ' there', 'in', 'msg_conv1_abc');

// Conversation 2 (different messageId)
wsDebugRef.current('llm_assistant_response', 'Greetings', 'in', 'msg_conv2_xyz');
wsDebugRef.current('llm_assistant_response', ' friend', 'in', 'msg_conv2_xyz');

// Result: 2 separate grouped messages
// Message 1: "Hello there" #msg_conv1
// Message 2: "Greetings friend" #msg_conv2
```

## Testing the Integration

1. **Open the debug overlay**: Press `Ctrl+Shift+D`

2. **Send a test prompt**:
   - Command: `Tell me a long story about spreadsheets`
   - Click "Send Prompt (LLM)"

3. **Observe**:
   - Single message entry that grows
   - Update counter incrementing: `↻ 1`, `↻ 2`, `↻ 3`, ...
   - MessageId badge showing last 8 chars
   - Timestamp range showing duration

4. **Send another prompt**:
   - Notice new messageId for the new conversation turn
   - Previous message remains unchanged

## Troubleshooting

### Messages not grouping?
- Check that `data.messageId` exists in server response
- Verify messageId is the same across related messages
- Ensure you're passing messageId as 4th parameter to `addMessage`

### Messages replacing instead of appending?
- Only `llm_assistant_response` and `llm_tool_use` types append
- Other types replace content on update
- Check the message type is correct

### Update counter not showing?
- Counter only shows when `updateCount > 0`
- First message has `updateCount: 0` (not displayed)
- Subsequent updates increment the counter

## See Also

- [WEBSOCKET_DEBUG_MESSAGEID.md](./WEBSOCKET_DEBUG_MESSAGEID.md) - Complete messageId feature documentation
- [CLAUDE_MESSAGE_STRUCTURE.md](../server/CLAUDE_MESSAGE_STRUCTURE.md) - Server-side message structure
- [CLAUDE_INTEGRATION.md](../server/CLAUDE_INTEGRATION.md) - Claude agent integration guide
