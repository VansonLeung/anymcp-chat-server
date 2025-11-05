import React, { useEffect, useRef, useMemo } from 'react';
import { marked } from 'marked';
import ToolExecutionSection from './ToolExecutionSection';

const MessageList = ({ messages, isGenerating }) => {
  const messagesEndRef = useRef(null);

  // Configure marked options
  useMemo(() => {
    marked.setOptions({
      breaks: true, // Convert \n to <br>
      gfm: true, // GitHub Flavored Markdown
      headerIds: false, // Don't add IDs to headers
      mangle: false, // Don't escape autolinked email addresses
    });
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderMarkdown = (content) => {
    try {
      const html = marked.parse(content || '');
      return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />;
    } catch (error) {
      // Fallback to plain text if markdown parsing fails
      return <div className="markdown-content">{content}</div>;
    }
  };

  const renderMessage = (message) => {
    switch (message.role) {
      case 'user':
        return (
          <div key={message.id} className="message message-user">
            <div className="message-content">
              <div className="message-text">
                {renderMarkdown(message.content)}
              </div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
            <div className="message-avatar">👤</div>
          </div>
        );

      case 'assistant':
        return (
          <div key={message.id} className="message message-assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="message-text">
                {renderMarkdown(message.content)}
                {!message.done && <span className="message-cursor">▊</span>}
              </div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );

      case 'tool':
        return (
          <div key={message.id} className="message message-tool">
            <div className="message-avatar">🔧</div>
            <div className="message-content">
              <ToolExecutionSection
                toolName={message.toolName}
                toolInput={message.toolInput}
                toolOutput={message.toolOutput}
                collapsed={message.collapsed}
                timestamp={message.timestamp}
              />
            </div>
          </div>
        );

      case 'system':
        return (
          <div key={message.id} className={`message message-system ${message.error ? 'error' : ''} ${message.hint ? 'hint' : ''}`}>
            <div className="message-content">
              <div className="message-text">{message.content}</div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="message-list">
      <div className="message-list-inner">
        {messages.length === 0 ? (
          <div className="message-list-empty">
            <p>No messages yet.</p>
            <p style={{ fontSize: '12px', color: '#888' }}>
              Start a conversation by typing a message below.
            </p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}

        {isGenerating && messages.length > 0 && (
          <div className="message-generating">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="message-text">
                <span className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default MessageList;
