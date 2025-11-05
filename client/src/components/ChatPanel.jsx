import React, { useState, useEffect, useRef } from 'react';
import ConversationSidebar from './ConversationSidebar';
import ConversationHeader from './ConversationHeader';
import MessageList from './MessageList';
import InputArea from './InputArea';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:10051';

const ChatPanel = ({ wsManager, workspace, onGenerateTemplate }) => {
  // Layout state - Three column layout: Conversations | Workspace | Chat
  const [conversationSidebarWidth, setConversationSidebarWidth] = useState(250);
  const [chatPanelWidth, setChatPanelWidth] = useState(400);
  const [isResizingConversations, setIsResizingConversations] = useState(false);
  const [isResizingChat, setIsResizingChat] = useState(false);

  // Conversation state
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);

  // Chat state
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversationStats, setConversationStats] = useState({
    tokenCount: 0,
    messageCount: 0,
    toolCount: 0,
    estimatedCost: 0
  });
  const [warnings, setWarnings] = useState([]);

  // Refs
  const messageMapRef = useRef(new Map()); // messageId -> accumulated text

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Set up WebSocket message handlers
  useEffect(() => {
    if (!wsManager) return;

    const handleMessage = (data) => {
      switch (data.type) {
        case 'llm_assistant_response':
          handleAssistantResponse(data);
          break;
        case 'llm_tool_use':
          handleToolUse(data);
          break;
        case 'llm_tool_result':
          handleToolResult(data);
          break;
        case 'llm_stopped':
          handleStopped(data);
          break;
        case 'llm_error':
          handleError(data);
          break;
        case 'llm_conversation_created':
          handleConversationCreated(data);
          break;
        case 'llm_conversation_warning':
          handleWarning(data);
          break;
        case 'llm_should_summarize':
          handleShouldSummarize(data);
          break;
        case 'llm_token_count':
          handleTokenCount(data);
          break;
        default:
          // Ignore other message types
          break;
      }
    };

    wsManager.addMessageListener(handleMessage);

    return () => {
      wsManager.removeMessageListener(handleMessage);
    };
  }, [wsManager, currentConversationId]);

  // Load conversations from REST API
  const loadConversations = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations`);
      const data = await response.json();
      setConversations(data.conversations || []);

      // Auto-load latest conversation
      if (data.conversations && data.conversations.length > 0) {
        const latest = data.conversations[0]; // Already sorted by updated_at DESC
        await loadConversation(latest.id);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  // Load a specific conversation
  const loadConversation = async (conversationId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`);
      const data = await response.json();

      if (data.conversation) {
        setCurrentConversationId(conversationId);
        setMessages(data.messages || []);
        setConversationStats({
          tokenCount: data.conversation.token_count || 0,
          messageCount: data.conversation.message_count || 0,
          toolCount: data.conversation.tool_execution_count || 0,
          estimatedCost: data.conversation.estimated_cost || 0
        });
        setWarnings([]);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  // Create new conversation
  const createConversation = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Conversation' })
      });
      const data = await response.json();

      if (data.conversation) {
        await loadConversations(); // Refresh list
        await loadConversation(data.conversation.id);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  // Delete conversation
  const deleteConversation = async (conversationId) => {
    try {
      await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
        method: 'DELETE'
      });

      await loadConversations(); // Refresh list

      // If deleted current conversation, clear it
      if (conversationId === currentConversationId) {
        setCurrentConversationId(null);
        setMessages([]);
        setConversationStats({ tokenCount: 0, messageCount: 0, toolCount: 0, estimatedCost: 0 });
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  // Update conversation title
  const updateConversationTitle = async (conversationId, title) => {
    try {
      await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });

      await loadConversations(); // Refresh list
    } catch (error) {
      console.error('Failed to update conversation title:', error);
    }
  };

  // Export conversation
  const exportConversation = async (conversationId, format) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/${conversationId}/export?format=${format}`
      );
      const blob = await response.blob();

      // Download file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation_${conversationId}.${format === 'json' ? 'json' : 'md'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export conversation:', error);
    }
  };

  // Send message to LLM
  const sendMessage = (text) => {
    if (!wsManager || !text.trim()) return;

    // Add user message to UI immediately
    const userMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Send to server
    wsManager.sendMessage({
      type: 'llm_user_prompt',
      message: text,
      conversationId: currentConversationId || undefined
    });

    setIsGenerating(true);
  };

  // Stop generation
  const stopGeneration = () => {
    if (!wsManager) return;

    wsManager.sendMessage({
      type: 'llm_stop'
    });
  };

  // WebSocket message handlers
  const handleAssistantResponse = (data) => {
    if (data.conversationId !== currentConversationId) return;

    const { messageId, text, done } = data;

    // Group by messageId to accumulate streaming text
    if (!messageMapRef.current.has(messageId)) {
      messageMapRef.current.set(messageId, '');
    }

    if (done) {
      // Message complete
      const finalText = messageMapRef.current.get(messageId);
      setMessages(prev => {
        const existing = prev.find(m => m.id === messageId);
        if (existing) {
          return prev.map(m => m.id === messageId ? { ...m, content: finalText, done: true } : m);
        } else {
          return [...prev, {
            id: messageId,
            role: 'assistant',
            content: finalText,
            timestamp: data.timestamp,
            done: true
          }];
        }
      });
      messageMapRef.current.delete(messageId);
      setIsGenerating(false);
    } else {
      // Accumulate text
      const current = messageMapRef.current.get(messageId);
      const newText = current + text;
      messageMapRef.current.set(messageId, newText);

      setMessages(prev => {
        const existing = prev.find(m => m.id === messageId);
        if (existing) {
          return prev.map(m => m.id === messageId ? { ...m, content: newText } : m);
        } else {
          return [...prev, {
            id: messageId,
            role: 'assistant',
            content: newText,
            timestamp: data.timestamp,
            done: false
          }];
        }
      });
    }
  };

  const handleToolUse = (data) => {
    if (data.conversationId !== currentConversationId) return;

    setMessages(prev => [...prev, {
      id: `tool_${data.toolUseId}`, // Use Claude's unique tool use ID
      role: 'tool',
      toolUseId: data.toolUseId,
      toolName: data.toolName,
      toolInput: data.toolInput,
      timestamp: data.timestamp,
      collapsed: data.collapsed !== false
    }]);
  };

  const handleToolResult = (data) => {
    if (data.conversationId !== currentConversationId) return;

    setMessages(prev => prev.map(msg => {
      // Match by toolUseId instead of toolName to avoid duplicates
      if (msg.role === 'tool' && msg.toolUseId === data.toolUseId && !msg.toolOutput) {
        return { ...msg, toolOutput: data.toolOutput };
      }
      return msg;
    }));
  };

  const handleStopped = (data) => {
    if (data.conversationId !== currentConversationId) return;

    setIsGenerating(false);
    setMessages(prev => [...prev, {
      id: `stopped_${Date.now()}`,
      role: 'system',
      content: data.message || 'Generation stopped',
      timestamp: data.timestamp
    }]);
  };

  const handleError = (data) => {
    if (data.conversationId !== currentConversationId) return;

    setIsGenerating(false);
    setMessages(prev => [...prev, {
      id: `error_${Date.now()}`,
      role: 'system',
      content: `Error: ${data.error}`,
      timestamp: data.timestamp,
      error: true
    }]);
  };

  const handleConversationCreated = (data) => {
    setCurrentConversationId(data.conversation.id);
    setMessages([]);
    setConversationStats({ tokenCount: 0, messageCount: 0, toolCount: 0, estimatedCost: 0 });
    loadConversations(); // Refresh list
  };

  const handleWarning = (data) => {
    if (data.conversationId !== currentConversationId) return;
    setWarnings(data.warnings || []);
  };

  const handleShouldSummarize = (data) => {
    if (data.conversationId !== currentConversationId) return;

    setMessages(prev => [...prev, {
      id: `summarize_hint_${Date.now()}`,
      role: 'system',
      content: `💡 Conversation is reaching limits (${data.reason}). Consider summarizing or starting a new conversation.`,
      timestamp: data.timestamp,
      hint: true
    }]);
  };

  const handleTokenCount = (data) => {
    if (data.conversationId !== currentConversationId) return;

    setConversationStats({
      tokenCount: data.tokenCount || 0,
      messageCount: data.messageCount || 0,
      toolCount: data.toolCount || 0,
      estimatedCost: data.estimatedCost || 0
    });
  };

  // Resize handling for conversation sidebar
  const startResizeConversations = (e) => {
    e.preventDefault();
    setIsResizingConversations(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingConversations) {
        const newWidth = Math.max(200, Math.min(500, e.clientX));
        setConversationSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingConversations(false);
    };

    if (isResizingConversations) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingConversations]);

  // Resize handling for chat panel
  const startResizeChat = (e) => {
    e.preventDefault();
    setIsResizingChat(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingChat) {
        const newWidth = Math.max(300, Math.min(800, window.innerWidth - e.clientX));
        setChatPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingChat(false);
    };

    if (isResizingChat) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingChat]);

  return (
    <div className="main-layout">
      {/* Left: Conversation Sidebar */}
      <div
        className="conversation-sidebar-container"
        style={{ width: `${conversationSidebarWidth}px` }}
      >
        <ConversationSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={loadConversation}
          onCreateConversation={createConversation}
          onDeleteConversation={deleteConversation}
        />
      </div>

      {/* Resize Handle for Conversation Sidebar */}
      <div
        className="resize-handle"
        onMouseDown={startResizeConversations}
        style={{ cursor: 'col-resize' }}
      />

      {/* Middle: Workspace */}
      <div className="workspace-container" style={{ flex: 1, position: 'relative' }}>
        {workspace}
      </div>

      {/* Resize Handle for Chat Panel */}
      <div
        className="resize-handle"
        onMouseDown={startResizeChat}
        style={{ cursor: 'col-resize' }}
      />

      {/* Right: Chat Panel */}
      <div
        className="chat-panel-container"
        style={{ width: `${chatPanelWidth}px` }}
      >
        {currentConversationId ? (
          <div className="chat-panel-content">
            <ConversationHeader
              conversationId={currentConversationId}
              stats={conversationStats}
              warnings={warnings}
              onUpdateTitle={updateConversationTitle}
              onExport={exportConversation}
              onGenerateTemplate={onGenerateTemplate}
            />

            <MessageList
              messages={messages}
              isGenerating={isGenerating}
            />

            <InputArea
              onSendMessage={sendMessage}
              onStopGeneration={stopGeneration}
              isGenerating={isGenerating}
              disabled={!currentConversationId}
            />
          </div>
        ) : (
          <div className="chat-panel-empty">
            <p>Select a conversation or create a new one to start chatting.</p>
            <button onClick={createConversation} className="button-primary">
              New Conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
