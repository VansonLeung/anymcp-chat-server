-- Migration Script: Add Triggers and Update Existing Counts
-- Run this if your database was created before triggers were added
--
-- Usage: sqlite3 conversations.db < migrate-add-triggers.sql

-- Step 1: Create triggers (will be skipped if already exist due to IF NOT EXISTS)

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

-- Step 2: Update existing conversation counts from messages

UPDATE conversations
SET token_count = (SELECT COALESCE(SUM(token_count), 0) FROM messages WHERE conversation_id = conversations.id),
    message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id),
    tool_execution_count = (SELECT COUNT(*) FROM tool_executions WHERE conversation_id = conversations.id),
    input_token_count = (SELECT COALESCE(SUM(token_count), 0) FROM messages WHERE conversation_id = conversations.id AND role = 'user'),
    output_token_count = (SELECT COALESCE(SUM(token_count), 0) FROM messages WHERE conversation_id = conversations.id AND role = 'assistant');

-- Step 3: Update estimated costs

UPDATE conversations
SET estimated_cost = (input_token_count * 3.0 / 1000000.0) + (output_token_count * 15.0 / 1000000.0);

-- Verification: Show updated counts
SELECT 'Migration complete! Updated counts:' AS status;
SELECT id, title, token_count, message_count, tool_execution_count,
       printf('$%.6f', estimated_cost) as cost
FROM conversations;
