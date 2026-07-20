-- Migration 0001: Users + Symbols (lookup tables)
-- ADR-0011 §Master Schema - Part 1/9
-- Creates: users, symbols

-- Users table: stores registered user accounts
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Symbols table: master list of supported tickers
-- is_mockup: 1 = Mock data only, 0 = Real data source
CREATE TABLE IF NOT EXISTS symbols (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  exchange TEXT NOT NULL,
  sector TEXT,
  industry TEXT,
  market_cap REAL,
  is_mockup INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_symbols_exchange ON symbols(exchange);
CREATE INDEX IF NOT EXISTS idx_symbols_sector ON symbols(sector);

-- Seed: 10 Mock symbols (per ADR-0002 R2 Cache Whitelist)
INSERT OR IGNORE INTO symbols (ticker, name, exchange, sector, industry, is_mockup) VALUES
  ('AAPL', 'Apple Inc.', 'NASDAQ', 'Technology', 'Consumer Electronics', 1),
  ('MSFT', 'Microsoft Corporation', 'NASDAQ', 'Technology', 'Software', 1),
  ('NVDA', 'NVIDIA Corporation', 'NASDAQ', 'Technology', 'Semiconductors', 1),
  ('GOOG', 'Alphabet Inc.', 'NASDAQ', 'Communication Services', 'Internet Content', 1),
  ('META', 'Meta Platforms Inc.', 'NASDAQ', 'Communication Services', 'Internet Content', 1),
  ('AMZN', 'Amazon.com Inc.', 'NASDAQ', 'Consumer Cyclical', 'Internet Retail', 1),
  ('TSLA', 'Tesla Inc.', 'NASDAQ', 'Consumer Cyclical', 'Auto Manufacturers', 1),
  ('NFLX', 'Netflix Inc.', 'NASDAQ', 'Communication Services', 'Entertainment', 1),
  ('AMD',  'Advanced Micro Devices', 'NASDAQ', 'Technology', 'Semiconductors', 1),
  ('INTC', 'Intel Corporation', 'NASDAQ', 'Technology', 'Semiconductors', 1);
