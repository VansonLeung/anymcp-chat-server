import { useEffect, useRef, useState, useCallback } from 'react';

export const useWebSocket = (url, onMessage) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;
  const onRecvMessageRef = useRef(null);

  // // Debug logging function
  const debugLog = useCallback((type, content, direction = 'out', messageId) => {
    if (onRecvMessageRef.current) {
      onRecvMessageRef.current(type, content, direction, messageId);
    }

    // Simple console logging for now
    console.log(`[WebSocket ${direction}] ${type}:`, content);
  }, []);

  const connect = useCallback(() => {
    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        debugLog('system', 'WebSocket connection established', 'system');
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);

          // Extract relevant content based on message type for debug overlay
          let debugContent;
          if (message.type === 'llm_assistant_response') {
            // For streaming responses, only show the text (or [done] marker)
            debugContent = message.done ? '[done]' : (message.text || '');
          } else if (message.type === 'llm_tool_use') {
            // For tool use, show tool name and input
            debugContent = JSON.stringify({
              tool: message.toolName,
              input: message.toolInput
            }, null, 2);
          } else if (message.type === 'llm_error') {
            // For errors, show the error message
            debugContent = message.error || JSON.stringify(message, null, 2);
          } else {
            // For other messages, show full JSON
            debugContent = JSON.stringify(message, null, 2);
          }

          debugLog(message.type || 'message', debugContent, 'in', message.messageId);

          if (onMessage) {
            onMessage(message);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
          debugLog('error', `Failed to parse message: ${err.message}\nRaw: ${event.data}`, 'in');
          setError(err);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        debugLog('system', `WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`, 'system');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const reconnectMsg = `Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`;
          console.log(reconnectMsg);
          debugLog('system', reconnectMsg, 'system');
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        debugLog('error', `WebSocket error: ${error}`, 'system');
        setError(error);
      };

    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      debugLog('error', `Failed to create connection: ${err.message}`, 'system');
      setError(err);
    }
  }, [url, onMessage, debugLog]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnecting');
      wsRef.current = null;
    }

    setIsConnected(false);
    reconnectAttempts.current = 0;
  }, []);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const messageString = typeof message === 'string' ? message : JSON.stringify(message);
        wsRef.current.send(messageString);
        debugLog(message.type || 'message', messageString, 'out', message.messageId);
        return true;
      } catch (err) {
        console.error('Failed to send WebSocket message:', err);
        debugLog('error', `Failed to send message: ${err.message}`, 'out');
        setError(err);
        return false;
      }
    } else {
      const errorMsg = 'WebSocket is not connected. Message not sent.';
      console.warn(errorMsg, message);
      debugLog('error', `${errorMsg}\n${JSON.stringify(message, null, 2)}`, 'out');
      return false;
    }
  }, [debugLog]);

  return {
    isConnected,
    lastMessage,
    error,
    sendMessage,
    connect,
    disconnect,
    onRecvMessageRef,
  };
};