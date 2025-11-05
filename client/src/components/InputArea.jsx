import React, { useState, useRef, useEffect } from 'react';

const InputArea = ({
  onSendMessage,
  onStopGeneration,
  isGenerating,
  disabled = false
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isGenerating || disabled) return;

    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const estimateTokens = (text) => {
    // Simple approximation: 4 characters ≈ 1 token
    return Math.ceil(text.length / 4);
  };

  const tokenCount = estimateTokens(input);

  return (
    <div className="input-area">
      <div className="input-area-container">
        <textarea
          ref={textareaRef}
          className="input-area-textarea"
          placeholder={disabled ? "Select or create a conversation to start chatting..." : "Type your message... (Shift+Enter for new line)"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isGenerating}
          rows={1}
        />

        <div className="input-area-footer">
          <div className="input-area-stats">
            <span className="input-area-char-count">
              {input.length} chars
            </span>
            <span className="input-area-token-count">
              ~{tokenCount} tokens
            </span>
          </div>

          <div className="input-area-buttons">
            {isGenerating ? (
              <button
                onClick={onStopGeneration}
                className="button-stop"
                title="Stop generation"
              >
                ⏹ Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                className="button-send"
                disabled={!input.trim() || disabled}
                title="Send message (Enter)"
              >
                ➤ Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputArea;
