-- Migration: Add summary tracking columns to messages table
-- This allows us to track which messages are summaries and how many messages they cover
-- Messages are never deleted, just marked as "before summary"

-- Add is_summary column (0 = regular message, 1 = summary message)
ALTER TABLE messages ADD COLUMN is_summary BOOLEAN DEFAULT 0;

-- Add summarizes_count column (how many messages this summary covers)
ALTER TABLE messages ADD COLUMN summarizes_count INTEGER DEFAULT 0;

-- Create index for faster summary lookups
CREATE INDEX IF NOT EXISTS idx_messages_is_summary ON messages(conversation_id, is_summary, timestamp DESC);
