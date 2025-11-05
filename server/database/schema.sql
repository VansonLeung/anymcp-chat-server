-- Chat Conversations Database Schema
-- Multi-factor limit tracking: tokens, messages, tools, age

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Multi-factor tracking (Option B: Balanced)
    token_count INTEGER DEFAULT 0,
    input_token_count INTEGER DEFAULT 0,
    output_token_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    tool_execution_count INTEGER DEFAULT 0,

    -- Summarization tracking
    summary TEXT,
    summarized_at DATETIME,
    times_summarized INTEGER DEFAULT 0,

    -- Optional metadata
    estimated_cost REAL DEFAULT 0.0,  -- In USD
    metadata TEXT  -- JSON: { tags: [], customLimits: {}, etc }
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Token tracking
    token_count INTEGER DEFAULT 0,

    -- Summarization tracking
    is_summary BOOLEAN DEFAULT 0,  -- Is this message a summary?
    summarizes_count INTEGER DEFAULT 0,  -- How many messages does this summary cover?

    -- Message metadata
    message_id TEXT,  -- For streaming grouping
    stopped BOOLEAN DEFAULT 0,  -- Was generation stopped?
    metadata TEXT,  -- JSON: { model: '', stopReason: '', etc }

    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Tool executions table (for expandable view in chat)
CREATE TABLE IF NOT EXISTS tool_executions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,

    -- Tool details
    tool_use_id TEXT,  -- Claude's unique tool use ID (for reconstruction)
    tool_name TEXT NOT NULL,
    tool_input TEXT,   -- JSON
    tool_output TEXT,  -- JSON

    -- Timing
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER,

    -- Status
    success BOOLEAN DEFAULT 1,
    error TEXT,

    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
CREATE INDEX IF NOT EXISTS idx_tools_message ON tool_executions(message_id);
CREATE INDEX IF NOT EXISTS idx_tools_conversation ON tool_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC);

-- View: Conversation summary statistics
CREATE VIEW IF NOT EXISTS conversation_stats AS
SELECT
    c.id,
    c.title,
    c.created_at,
    c.updated_at,
    c.token_count,
    c.message_count,
    c.tool_execution_count,
    c.estimated_cost,

    -- Age in hours
    CAST((julianday('now') - julianday(c.created_at)) * 24 AS INTEGER) as age_hours,

    -- Limit warnings (Option B thresholds)
    CASE
        WHEN c.token_count >= 16384 THEN 1  -- 80% of 20480
        ELSE 0
    END as token_warning,

    CASE
        WHEN c.message_count >= 120 THEN 1  -- 80% of 150
        ELSE 0
    END as message_warning,

    CASE
        WHEN c.tool_execution_count >= 80 THEN 1  -- 80% of 100
        ELSE 0
    END as tool_warning,

    CASE
        WHEN (julianday('now') - julianday(c.created_at)) * 24 >= 24 THEN 1  -- 24 hours
        ELSE 0
    END as age_warning,

    -- Should summarize? (Option B limits)
    CASE
        WHEN c.token_count >= 20480 THEN 1
        WHEN c.message_count >= 150 THEN 1
        WHEN c.tool_execution_count >= 100 THEN 1
        WHEN ((julianday('now') - julianday(c.created_at)) * 24 >= 24 AND c.message_count > 10) THEN 1
        ELSE 0
    END as should_summarize

FROM conversations c;

-- Trigger: Update conversation updated_at on new message
CREATE TRIGGER IF NOT EXISTS update_conversation_timestamp
AFTER INSERT ON messages
BEGIN
    UPDATE conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.conversation_id;
END;

-- Trigger: Update conversation message count
CREATE TRIGGER IF NOT EXISTS increment_message_count
AFTER INSERT ON messages
BEGIN
    UPDATE conversations
    SET message_count = message_count + 1
    WHERE id = NEW.conversation_id;
END;

-- Trigger: Update conversation tool count
CREATE TRIGGER IF NOT EXISTS increment_tool_count
AFTER INSERT ON tool_executions
BEGIN
    UPDATE conversations
    SET tool_execution_count = tool_execution_count + 1
    WHERE id = NEW.conversation_id;
END;

-- Trigger: Update conversation token count
CREATE TRIGGER IF NOT EXISTS update_token_count
AFTER INSERT ON messages
BEGIN
    UPDATE conversations
    SET token_count = token_count + COALESCE(NEW.token_count, 0),
        input_token_count = input_token_count + CASE WHEN NEW.role = 'user' THEN COALESCE(NEW.token_count, 0) ELSE 0 END,
        output_token_count = output_token_count + CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.token_count, 0) ELSE 0 END
    WHERE id = NEW.conversation_id;
END;

-- Trigger: Update estimated cost
CREATE TRIGGER IF NOT EXISTS update_estimated_cost
AFTER UPDATE OF input_token_count, output_token_count ON conversations
BEGIN
    UPDATE conversations
    SET estimated_cost =
        (NEW.input_token_count * 3.0 / 1000000.0) +    -- $3 per million input tokens
        (NEW.output_token_count * 15.0 / 1000000.0)    -- $15 per million output tokens
    WHERE id = NEW.id;
END;

-- Initial data: Create a default conversation (optional)
-- INSERT INTO conversations (id, title) VALUES ('default', 'Default Conversation');
