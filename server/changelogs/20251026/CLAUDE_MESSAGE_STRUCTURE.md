# Claude Agent Message Structure - Recommendations

## Current Issues

The current implementation sends messages without proper grouping:
- ❌ No `contentBlockIndex` to track which block text belongs to
- ❌ No `messageId` to group related messages
- ❌ No clear indication of when a new content block starts
- ❌ Client can't distinguish between multiple text blocks in one response

## Recommended Message Structure

### 1. Add Message Session Tracking

Each conversation turn should have a unique `messageId`:

```javascript
// At the start of handleStreamingChat
const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

### 2. Enhanced Message Types

#### A. `llm_message_start`
Sent when Claude starts responding (beginning of stream):

```javascript
{
  type: 'llm_message_start',
  messageId: 'msg_1234567890_abc123',
  model: 'claude-sonnet-4-20250514',
  timestamp: '2025-01-24T10:00:00.000Z'
}
```

#### B. `llm_content_block_start`
Sent when a new content block begins:

```javascript
{
  type: 'llm_content_block_start',
  messageId: 'msg_1234567890_abc123',
  contentBlockIndex: 0,
  contentBlockType: 'text', // or 'tool_use'
  timestamp: '2025-01-24T10:00:00.000Z'
}
```

For tool use blocks:
```javascript
{
  type: 'llm_content_block_start',
  messageId: 'msg_1234567890_abc123',
  contentBlockIndex: 1,
  contentBlockType: 'tool_use',
  toolName: 'get_cell',
  toolId: 'toolu_abc123',
  timestamp: '2025-01-24T10:00:00.000Z'
}
```

#### C. `llm_content_block_delta`
Sent for each text/input delta:

```javascript
{
  type: 'llm_content_block_delta',
  messageId: 'msg_1234567890_abc123',
  contentBlockIndex: 0,
  deltaType: 'text_delta', // or 'input_json_delta'
  delta: 'Hello, I can help...',
  timestamp: '2025-01-24T10:00:00.000Z'
}
```

#### D. `llm_content_block_stop`
Sent when a content block completes:

```javascript
{
  type: 'llm_content_block_stop',
  messageId: 'msg_1234567890_abc123',
  contentBlockIndex: 0,
  timestamp: '2025-01-24T10:00:00.000Z'
}
```

#### E. `llm_tool_execution_start`
Sent when tool execution begins:

```javascript
{
  type: 'llm_tool_execution_start',
  messageId: 'msg_1234567890_abc123',
  toolName: 'get_cell',
  toolId: 'toolu_abc123',
  toolInput: { row: 0, col: 0 },
  timestamp: '2025-01-24T10:00:00.000Z'
}
```

#### F. `llm_tool_execution_complete`
Sent when tool execution finishes:

```javascript
{
  type: 'llm_tool_execution_complete',
  messageId: 'msg_1234567890_abc123',
  toolName: 'get_cell',
  toolId: 'toolu_abc123',
  success: true,
  result: { value: 42 },
  // OR
  error: 'Error message',
  timestamp: '2025-01-24T10:00:00.000Z'
}
```

#### G. `llm_message_stop`
Sent when the entire message completes:

```javascript
{
  type: 'llm_message_stop',
  messageId: 'msg_1234567890_abc123',
  stopReason: 'end_turn', // or 'tool_use', 'max_tokens', 'stop_sequence'
  totalContentBlocks: 3,
  timestamp: '2025-01-24T10:00:00.000Z'
}
```

## Example Message Flow

### Scenario: Simple Text Response

```javascript
// 1. Message starts
{ type: 'llm_message_start', messageId: 'msg_001', ... }

// 2. First content block (text) starts
{ type: 'llm_content_block_start', messageId: 'msg_001', contentBlockIndex: 0, contentBlockType: 'text' }

// 3. Text deltas stream in
{ type: 'llm_content_block_delta', messageId: 'msg_001', contentBlockIndex: 0, delta: 'Hello' }
{ type: 'llm_content_block_delta', messageId: 'msg_001', contentBlockIndex: 0, delta: ', I ' }
{ type: 'llm_content_block_delta', messageId: 'msg_001', contentBlockIndex: 0, delta: 'can help' }

// 4. Content block stops
{ type: 'llm_content_block_stop', messageId: 'msg_001', contentBlockIndex: 0 }

// 5. Message stops
{ type: 'llm_message_stop', messageId: 'msg_001', stopReason: 'end_turn', totalContentBlocks: 1 }
```

### Scenario: Text + Tool Use + Text

```javascript
// 1. Message starts
{ type: 'llm_message_start', messageId: 'msg_002', ... }

// 2. First text block
{ type: 'llm_content_block_start', messageId: 'msg_002', contentBlockIndex: 0, contentBlockType: 'text' }
{ type: 'llm_content_block_delta', messageId: 'msg_002', contentBlockIndex: 0, delta: "I'll check that for you." }
{ type: 'llm_content_block_stop', messageId: 'msg_002', contentBlockIndex: 0 }

// 3. Tool use block
{ type: 'llm_content_block_start', messageId: 'msg_002', contentBlockIndex: 1, contentBlockType: 'tool_use', toolName: 'get_cell', toolId: 'toolu_123' }
{ type: 'llm_content_block_delta', messageId: 'msg_002', contentBlockIndex: 1, deltaType: 'input_json_delta', delta: '{"row":0' }
{ type: 'llm_content_block_delta', messageId: 'msg_002', contentBlockIndex: 1, deltaType: 'input_json_delta', delta: ',"col":0}' }
{ type: 'llm_content_block_stop', messageId: 'msg_002', contentBlockIndex: 1 }

// 4. Tool execution
{ type: 'llm_tool_execution_start', messageId: 'msg_002', toolName: 'get_cell', toolId: 'toolu_123', toolInput: {row: 0, col: 0} }
{ type: 'llm_tool_execution_complete', messageId: 'msg_002', toolId: 'toolu_123', success: true, result: {value: 42} }

// 5. Second text block (after tool result)
{ type: 'llm_content_block_start', messageId: 'msg_002', contentBlockIndex: 0, contentBlockType: 'text' }
{ type: 'llm_content_block_delta', messageId: 'msg_002', contentBlockIndex: 0, delta: 'The value is 42.' }
{ type: 'llm_content_block_stop', messageId: 'msg_002', contentBlockIndex: 0 }

// 6. Message stops
{ type: 'llm_message_stop', messageId: 'msg_002', stopReason: 'end_turn', totalContentBlocks: 3 }
```

## Implementation Example

Here's how to modify the `handleStreamingChat` function:

```javascript
async function handleStreamingChat(userMessage, ws, conversationHistory = []) {
  if (!anthropicClient) {
    initializeClient();
  }

  // Generate message ID for this turn
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Build messages array
  const messages = [...conversationHistory];

  if (userMessage && userMessage.trim()) {
    messages.push({
      role: 'user',
      content: userMessage
    });
  }

  const tools = getAnthropicTools();

  try {
    const stream = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages,
      tools,
      stream: true
    });

    // Send message start
    ws.send(JSON.stringify({
      type: 'llm_message_start',
      messageId,
      model: 'claude-sonnet-4-20250514',
      timestamp: new Date().toISOString()
    }));

    let currentText = '';
    let toolUseBlocks = [];
    let assistantMessage = { role: 'assistant', content: [] };
    let contentBlockIndex = 0;
    let currentBlockIndex = -1;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        currentBlockIndex = event.index;

        if (event.content_block.type === 'text') {
          // Send content block start for text
          ws.send(JSON.stringify({
            type: 'llm_content_block_start',
            messageId,
            contentBlockIndex: currentBlockIndex,
            contentBlockType: 'text',
            timestamp: new Date().toISOString()
          }));

        } else if (event.content_block.type === 'tool_use') {
          // Send content block start for tool use
          ws.send(JSON.stringify({
            type: 'llm_content_block_start',
            messageId,
            contentBlockIndex: currentBlockIndex,
            contentBlockType: 'tool_use',
            toolName: event.content_block.name,
            toolId: event.content_block.id,
            timestamp: new Date().toISOString()
          }));

          toolUseBlocks.push({
            id: event.content_block.id,
            name: event.content_block.name,
            input: '',
            blockIndex: currentBlockIndex
          });
        }

      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          currentText += event.delta.text;

          // Send delta
          ws.send(JSON.stringify({
            type: 'llm_content_block_delta',
            messageId,
            contentBlockIndex: event.index,
            deltaType: 'text_delta',
            delta: event.delta.text,
            timestamp: new Date().toISOString()
          }));

        } else if (event.delta.type === 'input_json_delta') {
          const lastTool = toolUseBlocks[toolUseBlocks.length - 1];
          if (lastTool) {
            lastTool.input += event.delta.partial_json;

            // Send delta (optional - can skip for cleaner UX)
            ws.send(JSON.stringify({
              type: 'llm_content_block_delta',
              messageId,
              contentBlockIndex: event.index,
              deltaType: 'input_json_delta',
              delta: event.delta.partial_json,
              timestamp: new Date().toISOString()
            }));
          }
        }

      } else if (event.type === 'content_block_stop') {
        // Send content block stop
        ws.send(JSON.stringify({
          type: 'llm_content_block_stop',
          messageId,
          contentBlockIndex: event.index,
          timestamp: new Date().toISOString()
        }));

      } else if (event.type === 'message_delta') {
        if (event.delta.stop_reason === 'tool_use') {
          // Add content to assistant message
          if (currentText) {
            assistantMessage.content.push({
              type: 'text',
              text: currentText
            });
          }

          for (const toolBlock of toolUseBlocks) {
            const parsedInput = toolBlock.input ? JSON.parse(toolBlock.input) : {};
            assistantMessage.content.push({
              type: 'tool_use',
              id: toolBlock.id,
              name: toolBlock.name,
              input: parsedInput
            });
          }

          // Execute tools
          const toolResults = [];
          for (const toolBlock of toolUseBlocks) {
            const toolInput = toolBlock.input ? JSON.parse(toolBlock.input) : {};

            // Send tool execution start
            ws.send(JSON.stringify({
              type: 'llm_tool_execution_start',
              messageId,
              toolName: toolBlock.name,
              toolId: toolBlock.id,
              toolInput,
              timestamp: new Date().toISOString()
            }));

            try {
              const result = await executeTool(toolBlock.name, toolInput);

              // Send tool execution complete
              ws.send(JSON.stringify({
                type: 'llm_tool_execution_complete',
                messageId,
                toolName: toolBlock.name,
                toolId: toolBlock.id,
                success: true,
                result,
                timestamp: new Date().toISOString()
              }));

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: JSON.stringify(result)
              });
            } catch (error) {
              // Send tool execution error
              ws.send(JSON.stringify({
                type: 'llm_tool_execution_complete',
                messageId,
                toolName: toolBlock.name,
                toolId: toolBlock.id,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
              }));

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: `Error: ${error.message}`,
                is_error: true
              });
            }
          }

          messages.push(assistantMessage);
          messages.push({
            role: 'user',
            content: toolResults
          });

          // Recursively call to continue conversation
          return handleStreamingChat('', ws, messages);
        }

      } else if (event.type === 'message_stop') {
        if (currentText) {
          assistantMessage.content.push({
            type: 'text',
            text: currentText
          });
        }
      }
    }

    // Send message stop
    ws.send(JSON.stringify({
      type: 'llm_message_stop',
      messageId,
      stopReason: 'end_turn',
      totalContentBlocks: contentBlockIndex + 1,
      timestamp: new Date().toISOString()
    }));

    return {
      success: true,
      conversationHistory: [...messages, assistantMessage]
    };

  } catch (error) {
    ws.send(JSON.stringify({
      type: 'llm_error',
      messageId,
      error: error.message,
      timestamp: new Date().toISOString()
    }));

    throw error;
  }
}
```

## Client-Side Handling

### React Example

```jsx
const [messages, setMessages] = useState([]);
const [currentMessage, setCurrentMessage] = useState(null);

useEffect(() => {
  const handleMessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'llm_message_start':
        // Initialize new message structure
        setCurrentMessage({
          messageId: data.messageId,
          role: 'assistant',
          contentBlocks: [],
          timestamp: data.timestamp,
          isComplete: false
        });
        break;

      case 'llm_content_block_start':
        // Add new content block
        setCurrentMessage(prev => ({
          ...prev,
          contentBlocks: [
            ...prev.contentBlocks,
            {
              index: data.contentBlockIndex,
              type: data.contentBlockType,
              content: '',
              toolName: data.toolName,
              toolId: data.toolId,
              isComplete: false
            }
          ]
        }));
        break;

      case 'llm_content_block_delta':
        // Update content block with delta
        setCurrentMessage(prev => ({
          ...prev,
          contentBlocks: prev.contentBlocks.map((block, idx) =>
            block.index === data.contentBlockIndex
              ? { ...block, content: block.content + data.delta }
              : block
          )
        }));
        break;

      case 'llm_content_block_stop':
        // Mark content block as complete
        setCurrentMessage(prev => ({
          ...prev,
          contentBlocks: prev.contentBlocks.map((block, idx) =>
            block.index === data.contentBlockIndex
              ? { ...block, isComplete: true }
              : block
          )
        }));
        break;

      case 'llm_tool_execution_start':
        // Show tool execution indicator
        setCurrentMessage(prev => ({
          ...prev,
          toolExecutions: [
            ...(prev.toolExecutions || []),
            {
              toolId: data.toolId,
              toolName: data.toolName,
              status: 'executing',
              input: data.toolInput
            }
          ]
        }));
        break;

      case 'llm_tool_execution_complete':
        // Update tool execution status
        setCurrentMessage(prev => ({
          ...prev,
          toolExecutions: prev.toolExecutions.map(exec =>
            exec.toolId === data.toolId
              ? { ...exec, status: data.success ? 'success' : 'error', result: data.result, error: data.error }
              : exec
          )
        }));
        break;

      case 'llm_message_stop':
        // Finalize message and add to messages array
        setCurrentMessage(prev => ({ ...prev, isComplete: true }));
        setMessages(prev => [...prev, currentMessage]);
        setCurrentMessage(null);
        break;
    }
  };

  ws.addEventListener('message', handleMessage);
  return () => ws.removeEventListener('message', handleMessage);
}, [ws]);

// Render
return (
  <div>
    {messages.map(msg => (
      <Message key={msg.messageId} message={msg} />
    ))}
    {currentMessage && <Message message={currentMessage} streaming />}
  </div>
);
```

### Message Component

```jsx
function Message({ message, streaming }) {
  return (
    <div className={`message ${message.role}`}>
      {message.contentBlocks.map((block, idx) => (
        <div key={idx} className={`content-block content-block-${block.type}`}>
          {block.type === 'text' && (
            <div className="text-content">
              {block.content}
              {streaming && !block.isComplete && <span className="cursor">▊</span>}
            </div>
          )}

          {block.type === 'tool_use' && (
            <div className="tool-use-content">
              <div className="tool-header">
                🔧 Using tool: <strong>{block.toolName}</strong>
              </div>
              {/* Show tool execution status */}
              {message.toolExecutions?.find(e => e.toolId === block.toolId)?.status === 'executing' && (
                <div className="tool-executing">⏳ Executing...</div>
              )}
              {message.toolExecutions?.find(e => e.toolId === block.toolId)?.status === 'success' && (
                <div className="tool-success">✅ Complete</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Benefits

### ✅ Clear Structure
- Each message has unique ID
- Content blocks are indexed
- Client knows exactly what to display where

### ✅ Progress Tracking
- Know when blocks start/stop
- Show loading indicators appropriately
- Handle tool executions distinctly

### ✅ Multi-Block Support
- Can handle text + tool + text patterns
- Multiple tool calls in sequence
- Proper rendering of complex responses

### ✅ Better UX
- Smooth streaming animations
- Tool execution feedback
- Error handling per block

## Backward Compatibility

To maintain backward compatibility, you can:

1. Keep sending old message format alongside new format
2. Add a `version` field to identify message format
3. Provide a compatibility mode flag

```javascript
const USE_ENHANCED_MESSAGES = process.env.ENHANCED_LLM_MESSAGES === 'true';

if (USE_ENHANCED_MESSAGES) {
  // Send new format
} else {
  // Send old format (current implementation)
}
```

## Summary

The enhanced message structure provides:

1. **Message-level tracking** - `messageId` groups related events
2. **Block-level tracking** - `contentBlockIndex` separates different content
3. **Delta tracking** - Know which block each delta belongs to
4. **Tool execution tracking** - Separate events for tool start/complete
5. **Lifecycle events** - Clear start/stop for messages and blocks

This allows the client to build a proper conversation UI with accurate streaming display, tool execution indicators, and error handling.
