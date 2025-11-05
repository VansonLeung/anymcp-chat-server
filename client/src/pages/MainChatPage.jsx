import { MessageSquare, Loader2 } from 'lucide-react';
import WebSocketDebugOverlay from '../components/WebSocketDebugOverlay';
import ChatPanel from '../components/ChatPanel';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useMathCommands } from '@/hooks/useMathCommands';
import { useEffect, useRef } from 'react';
import '../styles/ChatPanel.css';

const MainChatPage = () => {
  // Enable WebSocket support - you can configure the URL here
  const webSocketUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:10052';

  const { executeCommand } = useMathCommands();

  const {
    isConnected: webSocketConnected,
    sendMessage: sendWebSocketMessage,
    error: webSocketError,
    connect: connectWebSocket,
    disconnect: disconnectWebSocket,
    onRecvMessageRef,
  } = useWebSocket(webSocketUrl, (message) => {
    // Handle math commands
    if (message.type === 'command' && message.command) {
      const result = executeCommand(message.command, message.params);
      const resp = {
        type: 'response',
        correlationId: message.correlationId,
        result: result.result,
        success: result.success,
        timestamp: new Date().toISOString()
      };
      onRecvMessageDebugRef.current && onRecvMessageDebugRef.current("Command result", JSON.stringify(resp, null, 2), 'out');
      sendWebSocketMessage(resp);
    } else if (message.type === 'query' && message.command) {
      const result = executeCommand(message.command, message.params);
      const resp = {
        type: 'response',
        correlationId: message.correlationId,
        result: result.result,
        success: result.success,
        timestamp: new Date().toISOString()
      };
      onRecvMessageDebugRef.current && onRecvMessageDebugRef.current("Query result", JSON.stringify(resp, null, 2), 'out');
      sendWebSocketMessage(resp);
    }

    // Pass ALL messages (including LLM messages) to onRecvMessageRef
    // This allows ChatPanel to receive llm_assistant_response, llm_tool_use, etc.
    if (onRecvMessageRef.current) {
      onRecvMessageRef.current(message.type, JSON.stringify(message), 'in', message.messageId);
    }
  }, true);


  const onRecvMessageDebugRef = useRef(null);


  useEffect(() => {
    // Automatically connect to WebSocket on mount
    connectWebSocket();

    onRecvMessageRef.current = (type, content, direction, messageId) => {
      onRecvMessageDebugRef.current && onRecvMessageDebugRef.current(type, content, direction, messageId);
    };

    return () => {
      // Disconnect from WebSocket on unmount
      disconnectWebSocket();
    };
  }, []);


  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Main Content: Conversation Sidebar | Workspace | Chat */}
      <ChatPanel
        wsManager={{
          sendMessage: sendWebSocketMessage,
          addMessageListener: (callback) => {
            onRecvMessageRef.current = (type, content, direction, messageId) => {
              try {
                const data = typeof content === 'string' ? JSON.parse(content) : content;
                callback(data);
              } catch (e) {
                // Ignore parse errors
              }
              // Still call debug overlay
              onRecvMessageDebugRef.current && onRecvMessageDebugRef.current(type, content, direction, messageId);
            };
          },
          removeMessageListener: (callback) => {
            // Reset to default
            onRecvMessageRef.current = (type, content, direction, messageId) => {
              onRecvMessageDebugRef.current && onRecvMessageDebugRef.current(type, content, direction, messageId);
            };
          }
        }}
        workspace={
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white'
          }}>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <MessageSquare size={80} strokeWidth={1.5} style={{ margin: '0 auto 20px' }} />
              <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '10px' }}>
                AnyMCP Server
              </h1>
              <p style={{ fontSize: '18px', opacity: 0.9 }}>
                Proof of Concept - Math Operations Demo
              </p>
              <p style={{ fontSize: '14px', opacity: 0.7, marginTop: '20px' }}>
                Try asking the AI to perform calculations like:
                <br />
                "What is 42 + 58?"
                <br />
                "Calculate the square root of 144"
                <br />
                "Find the average of 10, 20, 30, 40, 50"
              </p>
            </div>
          </div>
        }
      />

      {/* WebSocket Debug Overlay */}
      <WebSocketDebugOverlay
        webSocketConnected={webSocketConnected}
        onSendCommand={sendWebSocketMessage}
        onRecvCommand={onRecvMessageDebugRef}
      />
    </div>
  )

};

export default MainChatPage;
