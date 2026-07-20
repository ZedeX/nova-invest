-- Migration 0002: EP02 Data Layer
-- ADR-0011 §Master Schema - Part 2/9
-- Creates: watchlists, watchlist_items, kline_cache_index, fundamentals

-- Watchlists: user-named groups of tickers
CREATE TABLE IF NOT EXISTS watchlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Watchlist items: ticker entries within a watchlist
CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (watchlist_id, ticker),
  FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE,
  FOREIGN KEY (ticker) REFERENCES symbols(ticker)
);

-- K-line cache index: tracks R2 object keys for cached candlestick data
CREATE TABLE IF NOT EXISTS kline_cache_index (
  ticker TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  PRIMARY KEY (ticker, timeframe),
  FOREIGN KEY (ticker) REFERENCES symbols(ticker)
);

-- Fundamentals: fundamental data by ticker + field + period
CREATE TABLE IF NOT EXISTS fundamentals (
  ticker TEXT NOT NULL,
  field TEXT NOT NULL,
  value REAL,
  period TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ticker, field, period),
  FOREIGN KEY (ticker) REFERENCES symbols(ticker)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_kline_cache_ticker ON kline_cache_index(ticker);
CREATE INDEX IF NOT EXISTS idx_fundamentals_ticker ON fundamentals(ticker);
