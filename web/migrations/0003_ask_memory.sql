-- Migration 0003: EP03 Ask Agent Memory
-- ADR-0011 §Master Schema - Part 3/9
-- Creates: user_profiles, conversation_history

-- User profiles: per-user Ask Agent personalization data
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  risk_tolerance TEXT,  -- 'low' | 'medium' | 'high'
  sectors_json TEXT,    -- JSON array of preferred sectors
  preferred_sources TEXT,  -- comma-separated list
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Conversation history: per-session message log
CREATE TABLE IF NOT EXISTS conversation_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,  -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  metadata_json TEXT,  -- citations, trace_id, etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_user ON conversation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_session ON conversation_history(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_created ON conversation_history(created_at);
