# WebSocket Debug Overlay - MessageId Grouping

## Overview

The WebSocketDebugOverlay component now supports **messageId-based grouping** to prevent message spam when receiving streaming WebSocket messages (e.g., from Claude AI responses).

## Problem Solved

Previously, when receiving streaming messages from Claude AI, each text delta would create a new message entry in the debug log, causing:
- **Message spam**: Hundreds of tiny message entries
- **Poor readability**: Hard to see the full conversation
- **Performance issues**: Too many DOM updates

## Solution: MessageId Grouping

Messages with the same `messageId` are now **grouped and updated** instead of creating new entries.

### How It Works

1. **First message with messageId**: Creates a new message entry
2. **Subsequent messages with same messageId**: Updates the existing entry by appending content
3. **Visual indicators**: Shows update count and messageId for grouped messages

## API Changes

### Updated `addMessage` Function

```javascript
addMessage(type, content, direction = 'out', messageId = null, metadata = {})
```

#### Parameters:
- `type` (string): Message type (e.g., 'llm_assistant_response', 'command', 'error')
- `content` (string): Message content (will be appended if messageId matches existing)
- `direction` (string): 'in' or 'out'
- `messageId` (string|null): **NEW** - Optional message ID for grouping
- `metadata` (object): **NEW** - Optional metadata object

#### Example Usage:

```javascript
// Without messageId (creates new message every time)
addMessage('llm_assistant_response', 'Hello', 'in');
addMessage('llm_assistant_response', ' world', 'in'); // Creates 2nd message

// With messageId (groups messages)
addMessage('llm_assistant_response', 'Hello', 'in', 'msg_123');
addMessage('llm_assistant_response', ' world', 'in', 'msg_123'); // Updates 1st message to "Hello world"
```

## Message Object Structure

Each message in the debug log now has:

```javascript
{
  id: number,              // Unique ID (timestamp + random)
  timestamp: string,       // Creation time (HH:MM:SS)
  lastUpdate: string,      // Last update time (if updated)
  type: string,            // Message type
  content: string,         // Message content (accumulated for grouped messages)
  direction: string,       // 'in' or 'out'
  messageId: string|null,  // Message ID for grouping
  metadata: object,        // Additional metadata
  updateCount: number      // Number of updates (0 for first message)
}
```

## Visual Indicators

The debug overlay now shows:

1. **Timestamp Range**: `10:30:45 → 10:30:47` (creation → last update)
2. **Update Counter**: `↻ 42` (number of times message was updated)
3. **MessageId Badge**: `#abc12345` (last 8 chars of messageId)
4. **Color-coded Types**:
   - `llm_assistant_response`: Indigo
   - `llm_tool_use`: Orange
   - `llm_error`: Red
   - `command`: Purple
   - `ping`: Yellow

## Integration Example

### Handling Claude Streaming Responses

```javascript
import { useRef } from 'react';

function MyComponent() {
  const wsDebugRef = useRef(null);

  useEffect(() => {
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (wsDebugRef.current) {
        // Extract messageId if present
        const messageId = data.messageId || null;

        switch (data.type) {
          case 'llm_assistant_response':
            // Streaming text - will be grouped by messageId
            wsDebugRef.current(
              'llm_assistant_response',
              data.text || '[done]',
              'in',
              messageId,  // Messages with same ID will be grouped
              { done: data.done }
            );
            break;

          case 'llm_tool_use':
            wsDebugRef.current(
              'llm_tool_use',
              JSON.stringify({ tool: data.toolName, input: data.toolInput }, null, 2),
              'in',
              messageId
            );
            break;

          case 'llm_error':
            wsDebugRef.current(
              'llm_error',
              data.error,
              'in',
              messageId
            );
            break;

          default:
            wsDebugRef.current(data.type, JSON.stringify(data, null, 2), 'in');
        }
      }
    };
  }, []);

  return (
    <WebSocketDebugOverlay
      webSocketConnected={connected}
      onSendCommand={sendCommand}
      onRecvCommand={wsDebugRef}
    />
  );
}
```

## Grouping Logic

The `addMessage` function implements smart grouping:

```javascript
// If messageId provided and exists
if (messageId && existingMessage) {
  // For streaming types (llm_assistant_response, llm_tool_use)
  if (type === existingMessage.type && isStreamingType(type)) {
    // Append content
    updatedContent = existingContent + newContent;
  } else {
    // Replace content
    updatedContent = newContent;
  }
}
```

### Streaming Types (Content Appended):
- `llm_assistant_response`
- `llm_tool_use`

### Non-Streaming Types (Content Replaced):
- All other types

## Benefits

### Before (No Grouping):
```
10:30:45 ← IN [LLM_ASSISTANT_RESPONSE] "Hello"
10:30:45 ← IN [LLM_ASSISTANT_RESPONSE] " there"
10:30:45 ← IN [LLM_ASSISTANT_RESPONSE] "!"
10:30:45 ← IN [LLM_ASSISTANT_RESPONSE] " How"
10:30:45 ← IN [LLM_ASSISTANT_RESPONSE] " can"
10:30:46 ← IN [LLM_ASSISTANT_RESPONSE] " I"
10:30:46 ← IN [LLM_ASSISTANT_RESPONSE] " help"
10:30:46 ← IN [LLM_ASSISTANT_RESPONSE] "?"
... (50+ more entries)
```

### After (With Grouping):
```
10:30:45 → 10:30:46 ← IN [LLM_ASSISTANT_RESPONSE] ↻ 58 #msg_abc1
"Hello there! How can I help you today? I have access to various..."
```

## Quick Commands Updated

The "Send Prompt (LLM)" button now correctly sends:

```javascript
{
  type: 'llm_user_prompt',
  message: 'Your prompt here',  // Uses 'message' field (not 'command')
  timestamp: '2025-01-15T10:30:45.000Z'
}
```

## Testing

### Test Scenario 1: Streaming Response
1. Open debug overlay (Ctrl+Shift+D)
2. Click "Send Prompt (LLM)" button
3. Enter prompt: "Tell me a long story"
4. Observe: Single message entry that grows, with update counter increasing

### Test Scenario 2: Multiple Conversation Turns
1. Send first prompt → See messageId `#abc12345` with updates
2. Send second prompt → See new messageId `#xyz67890` with updates
3. Both messages remain separate in the log

### Test Scenario 3: Tool Use
1. Send prompt: "Check the server status"
2. Observe:
   - Tool use message with messageId
   - Response message with same messageId
   - Both grouped under same conversation turn

## Backward Compatibility

✅ **Fully backward compatible**

- `messageId` and `metadata` are optional parameters
- Old code `addMessage(type, content, direction)` still works
- Messages without messageId behave as before (create new entries)

## Performance

### Before:
- 100 streaming messages = 100 DOM updates + 100 array operations

### After:
- 100 streaming messages with same messageId = 1 DOM update + 100 array lookups (much faster)

## Notes

- Messages are still limited to last 50 entries
- Grouped messages count as 1 entry toward the 50-message limit
- MessageId should follow format: `msg_${timestamp}_${random}` (as implemented in claude-agent.js)
- Update counter helps identify how many deltas were received
