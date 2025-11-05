import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Wifi, WifiOff, MessageSquare, Settings } from 'lucide-react';

const WebSocketDebugOverlay = ({ webSocketConnected, onSendCommand, onRecvCommand }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [commandInput, setCommandInput] = useState('');
  const [paramsInput, setParamsInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Add message to debug log
  const addMessage = (type, content, direction = 'out', messageId = null, metadata = {}) => {
    const timestamp = new Date().toLocaleTimeString();

    setMessages(prev => {
      // If messageId is provided, try to find and update existing message
      if (messageId) {
        const existingIndex = prev.findIndex(msg => msg.messageId === messageId);

        if (existingIndex !== -1) {
          // Update existing message
          const updated = [...prev];
          const existing = updated[existingIndex];

          // Append content for streaming messages
          const shouldAppend = type === existing.type &&
                               (type === 'llm_assistant_response' || type === 'llm_tool_use');

          updated[existingIndex] = {
            ...existing,
            content: shouldAppend ? existing.content + content : content,
            lastUpdate: timestamp,
            updateCount: (existing.updateCount || 0) + 1,
            metadata: { ...existing.metadata, ...metadata },
            // Force React to detect change by updating the id
            id: existing.id + 0.0001
          };

          return updated;
        }
      }

      // Create new message
      const newMessage = {
        id: Date.now() + Math.random(),
        timestamp,
        type,
        content,
        direction,
        messageId: messageId || null,
        metadata: metadata || {},
        updateCount: 0
      };

      // Keep last 50 messages
      return [...prev.slice(-49), newMessage];
    });
  };

  // Handle sending test command
  const handleSendCommand = (type = 'command') => {
    if (!commandInput.trim()) return;

    let params = {};
    try {
      params = paramsInput.trim() ? JSON.parse(`${paramsInput}`) : {};
    } catch (error) {
      addMessage('error', `Invalid params JSON: ${error.message}`, 'out');
      return;
    }

    // Build command based on type
    let command;
    if (type === 'llm_user_prompt') {
      // For LLM prompts, use 'command' field!
      command = {
        type: type,
        command: commandInput.trim(),
        timestamp: new Date().toISOString()
      };
    } else {
      // For regular commands, use 'command' and 'params'
      command = {
        type: type,
        command: commandInput.trim(),
        params: params
      };
    }

    addMessage(type, JSON.stringify(command, null, 2), 'out');

    if (onSendCommand) {
      onSendCommand(command);
    }

    // setCommandInput('');
    // setParamsInput('');
  };

  // Handle ping test
  const handlePing = () => {
    const pingCommand = { type: 'ping' };
    addMessage('ping', JSON.stringify(pingCommand, null, 2), 'out');

    if (onSendCommand) {
      onSendCommand(pingCommand);
    }
  };

  // Clear messages
  const clearMessages = () => {
    setMessages([]);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event) => {
      // Ctrl+Shift+D to toggle debug overlay
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Expose addMessage function globally for other components to use
  useEffect(() => {
    onRecvCommand && (onRecvCommand.current = addMessage);
    return () => {
      onRecvCommand && (onRecvCommand.current = null);
    };
  }, []);

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        {(
          <button
            onClick={() => setIsVisible(true)}
            className={`p-3 rounded-full shadow-lg transition-colors ${
              webSocketConnected
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title="WebSocket Debug (Ctrl+Shift+D)"
          >
            {webSocketConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <Settings className="text-blue-600" size={24} />
            <h2 className="text-lg font-semibold text-gray-800">WebSocket Debug Console</h2>
            <div className={`flex items-center space-x-2 px-2 py-1 rounded-full text-sm ${
              webSocketConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {webSocketConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{webSocketConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={clearMessages}
              className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="p-2 hover:bg-gray-200 rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Messages Panel */}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 flex flex-col w-0">
            <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Messages ({messages.length})</span>
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded"
                />
                <span>Auto-scroll</span>
              </label>
            </div>
            <div className="flex-1 overflow-scroll p-3 space-y-2 bg-gray-900 text-green-400 font-mono text-sm">
              {messages.length === 0 ? (
                <div className="text-gray-500 italic">No messages yet...</div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="border-l-2 border-gray-600 pl-3">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-gray-400 text-xs">{msg.timestamp}</span>
                      {msg.lastUpdate && (
                        <span className="text-gray-400 text-xs">→ {msg.lastUpdate}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        msg.direction === 'in' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                      }`}>
                        {msg.direction === 'in' ? '← IN' : '→ OUT'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        msg.type === 'error' ? 'bg-red-600 text-white' :
                        msg.type === 'llm_assistant_response' ? 'bg-indigo-600 text-white' :
                        msg.type === 'llm_tool_use' ? 'bg-orange-600 text-white' :
                        msg.type === 'llm_error' ? 'bg-red-700 text-white' :
                        msg.type === 'command' ? 'bg-purple-600 text-white' :
                        msg.type === 'ping' ? 'bg-yellow-600 text-white' :
                        'bg-gray-600 text-white'
                      }`}>
                        {msg.type.toUpperCase()}
                      </span>
                      {msg.updateCount > 0 && (
                        <span className="px-2 py-0.5 rounded text-xs bg-cyan-600 text-white" title="Message updated via streaming">
                          ↻ {msg.updateCount}
                        </span>
                      )}
                      {msg.messageId && (
                        <span className="text-gray-500 text-xs font-mono" title="Message ID for grouping">
                          #{msg.messageId.slice(-8)}
                        </span>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap break-words">{msg.content}</pre>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Command Panel */}
          <div className="w-80 border-l bg-gray-50 flex flex-col overflow-scroll h-full">
            <div className="p-3 border-b bg-gray-100">
              <h3 className="text-sm font-medium text-gray-700 flex items-center">
                <Send className="mr-2" size={16} />
                Send Command
              </h3>
            </div>
            <div className="p-3 space-y-3 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Command</label>
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="e.g., setProcessedData"
                  className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleSendCommand()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Parameters (JSON array)</label>
                <textarea
                  value={paramsInput}
                  onChange={(e) => setParamsInput(e.target.value)}
                  placeholder='e.g., [0, 0, [["Hello", "World"]]]'
                  rows={4}
                  className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleSendCommand}
                  disabled={!webSocketConnected}
                  className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Send Command
                </button>
                <button
                  onClick={() => { handleSendCommand('command_echo'); }}
                  disabled={!webSocketConnected}
                  className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Send Command (Echo)
                </button>
                <button
                  onClick={() => { handleSendCommand('llm_user_prompt'); }}
                  disabled={!webSocketConnected}
                  className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Send Prompt (LLM)
                </button>
                <button
                  onClick={handlePing}
                  disabled={!webSocketConnected}
                  className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Send Ping
                </button>
              </div>
              <div className="pt-3 border-t">
                <h4 className="text-xs font-medium text-gray-600 mb-2">Quick Commands</h4>
                <div className="space-y-1 text-xs">
                  <button
                    onClick={() => {
                      setCommandInput('setProcessedData');
                      setParamsInput('{"startRow": 0, "startCol": 0, "values": [["Test", "Data"]], "sheetName": "Sheet1"}');
                    }}
                    className="block w-full text-left px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                  >
                    Set Cell Data
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('getSheetNames');
                      setParamsInput('{}');
                    }}
                    className="block w-full text-left px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                  >
                    Get Sheet Names
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('addSheet');
                      setParamsInput('{"sheetName": "New Sheet"}');
                    }}
                    className="block w-full text-left px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                  >
                    Add Sheet
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('getProcessedDataOfWholeSheet');
                      setParamsInput('{"sheetName": "Sheet1"}');
                    }}
                    className="block w-full text-left px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                  >
                    Get Processed Data
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('getRawDataOfWholeSheet');
                      setParamsInput('{"sheetName": "Sheet1"}');
                    }}
                    className="block w-full text-left px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                  >
                    Get Raw Data
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('getSheetCSV');
                      setParamsInput('{"sheetName": "Sheet1"}');
                    }}
                    className="block w-full text-left px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                  >
                    Get CSV
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('getSheetJSON');
                      setParamsInput('{"sheetName": "Sheet1"}');
                    }}
                    className="block w-full text-left px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                  >
                    Get JSON
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 rounded-b-lg text-xs text-gray-500">
          Press Ctrl+Shift+D to toggle • {messages.length} messages logged
        </div>
      </div>
    </div>
  );
};

export default WebSocketDebugOverlay;