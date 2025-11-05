import React from 'react';

const ConversationSidebar = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation
}) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatTokenCount = (count) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  const getWarningColor = (current, limit) => {
    const percentage = (current / limit) * 100;
    if (percentage >= 100) return '#ef4444'; // red
    if (percentage >= 80) return '#f59e0b'; // orange
    return '#10b981'; // green
  };

  const handleDelete = (e, conversationId) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this conversation?')) {
      onDeleteConversation(conversationId);
    }
  };

  return (
    <div className="conversation-sidebar">
      <div className="conversation-sidebar-header">
        <button
          onClick={onCreateConversation}
          className="button-primary"
          style={{ width: '100%' }}
        >
          + New Conversation
        </button>
      </div>

      <div className="conversation-list">
        {!conversations || conversations.length === 0 ? (
          <div className="conversation-list-empty">
            <p>No conversations yet.</p>
            <p style={{ fontSize: '12px', color: '#888' }}>
              Create a new conversation to get started.
            </p>
          </div>
        ) : (
          conversations.map(conv => {
            const isActive = conv.id === currentConversationId;
            const tokenWarning = getWarningColor(conv.token_count, 20480);
            const messageWarning = getWarningColor(conv.message_count, 150);
            const toolWarning = getWarningColor(conv.tool_execution_count, 100);

            return (
              <div
                key={conv.id}
                className={`conversation-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="conversation-item-header">
                  <div className="conversation-item-title">
                    {conv.title || 'Untitled Conversation'}
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="conversation-item-delete"
                    title="Delete conversation"
                  >
                    🗑
                  </button>
                </div>

                <div className="conversation-item-meta">
                  <span className="conversation-item-date">
                    {formatDate(conv.updated_at)}
                  </span>
                </div>

                <div className="conversation-item-stats">
                  <span
                    className="conversation-item-stat"
                    title={`${conv.token_count} / 20,480 tokens`}
                    style={{ color: tokenWarning }}
                  >
                    💬 {formatTokenCount(conv.token_count)}
                  </span>
                  <span
                    className="conversation-item-stat"
                    title={`${conv.message_count} / 150 messages`}
                    style={{ color: messageWarning }}
                  >
                    📝 {conv.message_count}
                  </span>
                  <span
                    className="conversation-item-stat"
                    title={`${conv.tool_execution_count} / 100 tool executions`}
                    style={{ color: toolWarning }}
                  >
                    🔧 {conv.tool_execution_count}
                  </span>
                </div>

                {(conv.token_warning || conv.message_warning || conv.tool_warning || conv.age_warning) && (
                  <div className="conversation-item-warning">
                    ⚠️ Approaching limits
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ConversationSidebar;
