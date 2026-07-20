-- Migration 0009: ADR-0014 RAG Metadata
-- ADR-0011 §Master Schema - Part 9/9
-- Creates: rag_chunks, news_articles

-- RAG chunks: indexed document chunks for retrieval
CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,    -- 'sec_filing' | 'news' | 'playbook' | 'fundamentals'
  source_id TEXT NOT NULL,
  ticker TEXT,
  title TEXT NOT NULL,
  snippet TEXT NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  r2_key TEXT,                  -- R2 object key for full document
  url TEXT,
  date TEXT,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticker) REFERENCES symbols(ticker)
);

-- News articles: cached news metadata for RAG
CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,         -- 'reuters' | 'bloomberg' | 'yahoo' | 'sec'
  title TEXT NOT NULL,
  snippet TEXT NOT NULL,
  ticker TEXT,
  url TEXT NOT NULL,
  r2_key TEXT,
  published_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticker) REFERENCES symbols(ticker)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_ticker ON rag_chunks(ticker);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_date ON rag_chunks(date);
CREATE INDEX IF NOT EXISTS idx_news_ticker ON news_articles(ticker);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_source ON news_articles(source);
