# Client-Side Integration Example

This document shows how to integrate Claude AI chat in your React client.

## Quick Example - Using Existing WebSocket Hook

```jsx
import { useWebSocket } from './hooks/useWebSocket';
import { useState } from 'react';

function ClaudeChat() {
  const { isConnected, sendMessage } = useWebSocket();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Handle incoming WebSocket messages
  useEffect(() => {
    const handleMessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'llm_assistant_response') {
        if (data.done) {
          setIsStreaming(false);
          // Add newline after complete message
          setMessages(prev => [...prev, { role: 'assistant', content: '\n' }]);
        } else {
          setIsStreaming(true);
          // Append streaming text
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + data.text }
              ];
            } else {
              return [...prev, { role: 'assistant', content: data.text, streaming: true }];
            }
          });
        }
      } else if (data.type === 'llm_tool_use') {
        // Show tool usage
        setMessages(prev => [
          ...prev,
          { role: 'system', content: `🔧 Using tool: ${data.toolName}` }
        ]);
      } else if (data.type === 'llm_error') {
        setMessages(prev => [
          ...prev,
          { role: 'error', content: `❌ Error: ${data.error}` }
        ]);
        setIsStreaming(false);
      }
    };

    // Access WebSocket instance from your hook
    // This depends on how your useWebSocket hook exposes the ws instance
    const ws = window.wsInstance; // Adjust based on your implementation
    if (ws) {
      ws.addEventListener('message', handleMessage);
      return () => ws.removeEventListener('message', handleMessage);
    }
  }, []);

  const sendToclaude = () => {
    if (!input.trim() || !isConnected) return;

    // Add user message to display
    setMessages(prev => [...prev, { role: 'user', content: input }]);

    // Send to Claude via WebSocket
    sendMessage({
      type: 'llm_user_prompt',
      message: input,
      timestamp: new Date().toISOString()
    });

    setInput('');
  };

  return (
    <div className="claude-chat">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendToClaude()}
          placeholder="Ask Claude about the spreadsheet..."
          disabled={isStreaming || !isConnected}
        />
        <button
          onClick={sendToClaude}
          disabled={isStreaming || !isConnected}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

## Alternative: Custom Hook for Claude

Create a dedicated hook for Claude integration:

```jsx
// hooks/useClaude.js
import { useWebSocket } from './useWebSocket';
import { useState, useEffect, useCallback } from 'react';

export function useClaude() {
  const { isConnected, sendMessage } = useWebSocket();
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');

  useEffect(() => {
    const handleMessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'llm_assistant_response':
          if (data.done) {
            setIsStreaming(false);
            if (currentResponse) {
              setMessages(prev => [
                ...prev,
                { role: 'assistant', content: currentResponse }
              ]);
              setCurrentResponse('');
            }
          } else {
            setIsStreaming(true);
            setCurrentResponse(prev => prev + data.text);
          }
          break;

        case 'llm_tool_use':
          setMessages(prev => [
            ...prev,
            {
              role: 'system',
              content: `Using tool: ${data.toolName}`,
              toolInput: data.toolInput
            }
          ]);
          break;

        case 'llm_error':
          setIsStreaming(false);
          setMessages(prev => [
            ...prev,
            { role: 'error', content: data.error }
          ]);
          break;
      }
    };

    const ws = window.wsInstance; // Adjust to your implementation
    if (ws) {
      ws.addEventListener('message', handleMessage);
      return () => ws.removeEventListener('message', handleMessage);
    }
  }, [currentResponse]);

  const sendPrompt = useCallback((message) => {
    if (!message.trim() || !isConnected || isStreaming) return;

    setMessages(prev => [...prev, { role: 'user', content: message }]);

    sendMessage({
      type: 'llm_user_prompt',
      message,
      timestamp: new Date().toISOString()
    });
  }, [isConnected, isStreaming, sendMessage]);

  const clear = useCallback(() => {
    setMessages([]);
    setCurrentResponse('');
  }, []);

  return {
    messages,
    currentResponse,
    isStreaming,
    isConnected,
    sendPrompt,
    clear
  };
}
```

## Using the Hook

```jsx
import { useClaude } from './hooks/useClaude';

function ClaudePanel() {
  const {
    messages,
    currentResponse,
    isStreaming,
    isConnected,
    sendPrompt,
    clear
  } = useClaude();

  const [input, setInput] = useState('');

  const handleSend = () => {
    sendPrompt(input);
    setInput('');
  };

  return (
    <div className="claude-panel">
      <div className="header">
        <h3>Claude AI Assistant</h3>
        <span className={isConnected ? 'connected' : 'disconnected'}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
        <button onClick={clear}>Clear</button>
      </div>

      <div className="chat-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            <div className="role">{msg.role}</div>
            <div className="content">{msg.content}</div>
          </div>
        ))}

        {currentResponse && (
          <div className="message message-assistant streaming">
            <div className="role">assistant</div>
            <div className="content">
              {currentResponse}
              <span className="cursor">▊</span>
            </div>
          </div>
        )}
      </div>

      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask Claude about your spreadsheet..."
          disabled={isStreaming || !isConnected}
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !isConnected || !input.trim()}
        >
          {isStreaming ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
```

## Styling Example

```css
.claude-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid #ccc;
  border-radius: 8px;
}

.header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: #f9f9f9;
}

.message {
  margin-bottom: 1rem;
  padding: 0.5rem;
  border-radius: 4px;
}

.message-user {
  background: #e3f2fd;
  margin-left: 20%;
}

.message-assistant {
  background: #f5f5f5;
  margin-right: 20%;
}

.message-assistant.streaming .cursor {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.message-system {
  background: #fff3e0;
  font-style: italic;
  text-align: center;
}

.message-error {
  background: #ffebee;
  color: #c62828;
}

.input-container {
  padding: 1rem;
  border-top: 1px solid #eee;
  display: flex;
  gap: 0.5rem;
}

.input-container input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.input-container button {
  padding: 0.5rem 1rem;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.input-container button:disabled {
  background: #ccc;
  cursor: not-allowed;
}
```

## Example Prompts

Try these prompts to test Claude's spreadsheet capabilities:

1. **Query**: "What sheets are in the spreadsheet?"
2. **Query**: "What's the value in cell A1?"
3. **Modify**: "Set cell B2 to the value 100"
4. **Calculate**: "Create a SUM formula in C3 that adds A1:A10"
5. **Structure**: "Add a new sheet called 'Summary'"
6. **Complex**: "Clear all values in the range A1:B10 and then set A1 to 'Hello'"

## Message Types Reference

### Outgoing (Client → Server)

```javascript
{
  type: 'llm_user_prompt',
  message: string,
  conversationHistory?: Array,  // Optional
  timestamp: string
}
```

### Incoming (Server → Client)

#### Text Response
```javascript
{
  type: 'llm_assistant_response',
  text: string,
  done: boolean,
  timestamp: string
}
```

#### Tool Use
```javascript
{
  type: 'llm_tool_use',
  toolName: string,
  toolInput: object,
  timestamp: string
}
```

#### Error
```javascript
{
  type: 'llm_error',
  error: string,
  timestamp: string
}
```

## Integration with Existing useWebSocket Hook

If your existing `useWebSocket` hook doesn't expose the WebSocket instance, you can modify it:

```jsx
// hooks/useWebSocket.js
export const useWebSocket = () => {
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    setWs(socket);
    window.wsInstance = socket; // Expose globally

    // ... rest of your hook

    return () => {
      delete window.wsInstance;
      socket.close();
    };
  }, []);

  return {
    ws, // Expose ws instance
    isConnected,
    sendMessage,
    // ... other exports
  };
};
```

## Advanced: Multi-turn Conversations

To maintain context across multiple messages:

```jsx
const [conversationHistory, setConversationHistory] = useState([]);

const sendWithHistory = (message) => {
  sendMessage({
    type: 'llm_user_prompt',
    message,
    conversationHistory, // Include history
    timestamp: new Date().toISOString()
  });

  // Update history
  setConversationHistory(prev => [
    ...prev,
    { role: 'user', content: message }
  ]);
};

// When receiving assistant response
useEffect(() => {
  // ... handle message
  if (data.type === 'llm_assistant_response' && data.done) {
    setConversationHistory(prev => [
      ...prev,
      { role: 'assistant', content: accumulatedResponse }
    ]);
  }
}, []);
```

## Next Steps

1. Add conversation history UI
2. Implement message persistence
3. Add typing indicators
4. Support markdown rendering in responses
5. Add conversation export/import
6. Implement conversation branching
