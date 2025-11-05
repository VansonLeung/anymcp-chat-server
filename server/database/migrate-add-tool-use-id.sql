-- Migration: Add tool_use_id column to tool_executions table
-- This is needed to properly reconstruct tool_use and tool_result blocks
-- for multi-turn conversations with Claude AI

-- Add the tool_use_id column if it doesn't exist
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- So we check if the column exists first

-- Check if column exists (will error if it doesn't, which is expected)
-- Run this first to test:
-- SELECT tool_use_id FROM tool_executions LIMIT 1;

-- If you get "no such column: tool_use_id", run this:
ALTER TABLE tool_executions ADD COLUMN tool_use_id TEXT;

-- Note: Existing tool_executions will have NULL tool_use_id
-- This is okay - they won't be used for reconstruction
-- New tool executions will have proper tool_use_id values
