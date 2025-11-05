import React, { useState, useEffect } from 'react';

const ConversationHeader = ({
  conversationId,
  stats,
  warnings,
  onUpdateTitle,
  onExport,
  onGenerateTemplate
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState('Conversation');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [version, setVersion] = useState(null);

  // Load version info
  useEffect(() => {
    fetch('/version.json')
      .then(res => res.json())
      .then(data => setVersion(data))
      .catch(err => console.warn('Could not load version info:', err));
  }, []);

  const getProgressColor = (current, limit) => {
    const percentage = (current / limit) * 100;
    if (percentage >= 100) return '#ef4444'; // red
    if (percentage >= 80) return '#f59e0b'; // orange
    return '#10b981'; // green
  };

  const getProgressPercentage = (current, limit) => {
    return Math.min(100, (current / limit) * 100);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (title.trim() && title !== 'Conversation') {
      onUpdateTitle(conversationId, title.trim());
    }
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setTitle('Conversation');
    }
  };

  const handleExport = (format) => {
    onExport(conversationId, format);
    setShowExportMenu(false);
  };

  const tokenPercentage = getProgressPercentage(stats.tokenCount, 20480);
  const messagePercentage = getProgressPercentage(stats.messageCount, 150);
  const toolPercentage = getProgressPercentage(stats.toolCount, 100);

  const tokenColor = getProgressColor(stats.tokenCount, 20480);
  const messageColor = getProgressColor(stats.messageCount, 150);
  const toolColor = getProgressColor(stats.toolCount, 100);

  const hasWarnings = warnings && warnings.length > 0;

  return (
    <div className="conversation-header">
      {/* Logo Section */}
      <div className="conversation-header-logo">
        <div className="logo-icon-wrapper">
          <svg className="logo-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" fill="currentColor" opacity="0.2"/>
            <path d="M4 4h5v5H4V4zm11 0h5v5h-5V4zM4 15h5v5H4v-5zm11 0h5v5h-5v-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="logo-text-wrapper">
          <div className="logo-main-text">AnyMCP</div>
          <div className="logo-sub-text">by VANPORT</div>
        </div>
        {version && (
          <div className="logo-version-text" title={`Build: ${version.buildDate}\nBranch: ${version.branch}\nCommit: ${version.message}`}>
            v{version.version}
          </div>
        )}
      </div>

      <div className="conversation-header-top">
        <div className="conversation-header-title-section">
          {isEditingTitle ? (
            <input
              type="text"
              className="conversation-header-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              autoFocus
            />
          ) : (
            <h3
              className="conversation-header-title"
              onClick={() => setIsEditingTitle(true)}
              title="Click to edit title"
            >
              {title}
            </h3>
          )}
        </div>

        <div className="conversation-header-actions">
          {onGenerateTemplate && (
            <button
              onClick={onGenerateTemplate}
              className="button-primary"
              title="Generate template sheets"
              style={{ marginRight: '8px' }}
            >
              📋 Templates
            </button>
          )}
          <div className="export-menu-container">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="button-secondary"
              title="Export conversation"
            >
              ⬇ Export
            </button>
            {showExportMenu && (
              <div className="export-menu">
                <button onClick={() => handleExport('json')}>
                  📄 Export as JSON
                </button>
                <button onClick={() => handleExport('markdown')}>
                  📝 Export as Markdown
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {hasWarnings && (
        <div className="conversation-header-warnings">
          {warnings.map((warning, index) => (
            <div key={index} className="conversation-warning">
              ⚠️ {warning.type.charAt(0).toUpperCase() + warning.type.slice(1)}: {warning.current} / {warning.limit} ({warning.percentage}%)
            </div>
          ))}
        </div>
      )}

      <div className="conversation-header-stats">
        <div className="stat-item">
          <div className="stat-label">Tokens</div>
          <div className="stat-value">
            {stats.tokenCount.toLocaleString()} / 20,480
          </div>
          <div className="stat-progress-bar">
            <div
              className="stat-progress-fill"
              style={{
                width: `${tokenPercentage}%`,
                backgroundColor: tokenColor
              }}
            />
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-label">Messages</div>
          <div className="stat-value">
            {stats.messageCount} / 150
          </div>
          <div className="stat-progress-bar">
            <div
              className="stat-progress-fill"
              style={{
                width: `${messagePercentage}%`,
                backgroundColor: messageColor
              }}
            />
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-label">Tools</div>
          <div className="stat-value">
            {stats.toolCount} / 100
          </div>
          <div className="stat-progress-bar">
            <div
              className="stat-progress-fill"
              style={{
                width: `${toolPercentage}%`,
                backgroundColor: toolColor
              }}
            />
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-label">Est. Cost</div>
          <div className="stat-value">
            ${stats.estimatedCost.toFixed(3)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationHeader;
