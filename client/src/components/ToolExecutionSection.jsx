import React, { useState } from 'react';

const ToolExecutionSection = ({
  toolName,
  toolInput,
  toolOutput,
  collapsed = true,
  timestamp
}) => {
  const [isExpanded, setIsExpanded] = useState(!collapsed);

  const formatJson = (obj) => {
    if (!obj) return 'null';
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(obj);
    }
  };

  const getToolIcon = (name) => {
    if (name.includes('cell')) return '📊';
    if (name.includes('row') || name.includes('column')) return '📏';
    if (name.includes('sheet')) return '📄';
    if (name.includes('style') || name.includes('format')) return '🎨';
    if (name.includes('chart') || name.includes('graph')) return '📈';
    if (name.includes('data') || name.includes('get')) return '🔍';
    if (name.includes('summarize')) return '📝';
    if (name.includes('undo')) return '↶';
    if (name.includes('redo')) return '↷';
    return '🔧';
  };

  const getToolDisplayName = (name) => {
    // Convert snake_case to Title Case
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const hasOutput = toolOutput !== null && toolOutput !== undefined;
  const isExecuting = !hasOutput;
  const hasError = hasOutput && toolOutput && (toolOutput.error || (typeof toolOutput === 'object' && 'error' in toolOutput));

  return (
    <div className={`tool-execution ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div
        className="tool-execution-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="tool-execution-header-left">
          <span className="tool-execution-icon">{getToolIcon(toolName)}</span>
          <span className="tool-execution-name">{getToolDisplayName(toolName)}</span>
          {isExecuting && (
            <span className="tool-execution-status executing">
              <span className="spinner"></span> Executing...
            </span>
          )}
          {hasOutput && !hasError && (
            <span className="tool-execution-status success">
              ✓ Done
            </span>
          )}
          {hasError && (
            <span className="tool-execution-status error">
              ✗ Error
            </span>
          )}
        </div>
        <div className="tool-execution-header-right">
          <button className="tool-execution-toggle">
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="tool-execution-body">
          {toolInput && Object.keys(toolInput).length > 0 && (
            <div className="tool-execution-section">
              <div className="tool-execution-section-title">Input:</div>
              <pre className="tool-execution-code">
                {formatJson(toolInput)}
              </pre>
            </div>
          )}

          {hasOutput && (
            <div className="tool-execution-section">
              <div className="tool-execution-section-title">
                {hasError ? 'Error:' : 'Output:'}
              </div>
              <pre className={`tool-execution-code ${hasError ? 'error' : ''}`}>
                {formatJson(toolOutput)}
              </pre>
            </div>
          )}

          {!hasOutput && (
            <div className="tool-execution-section">
              <div className="tool-execution-loading">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span style={{ marginLeft: '10px', fontSize: '12px', color: '#888' }}>
                  Waiting for result...
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolExecutionSection;
