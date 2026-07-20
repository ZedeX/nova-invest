-- Migration 0008: ADR-0007 Citation URL Check Queue
-- ADR-0011 §Master Schema - Part 8/9
-- Creates: url_check_queue

-- URL check queue: async URL reachability checks for citations
CREATE TABLE IF NOT EXISTS url_check_queue (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  citation_url TEXT NOT NULL,
  citation_source TEXT NOT NULL,
  fact_value TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'verified' | 'failed' | 'skipped'
  checked_at TEXT,
  http_status INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_url_check_status ON url_check_queue(status);
CREATE INDEX IF NOT EXISTS idx_url_check_trace ON url_check_queue(trace_id);
CREATE INDEX IF NOT EXISTS idx_url_check_created ON url_check_queue(created_at);
