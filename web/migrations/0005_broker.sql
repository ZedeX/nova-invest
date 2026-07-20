-- Migration 0005: EP06 Broker Integration
-- ADR-0011 §Master Schema - Part 5/9
-- Creates: broker_accounts, orders, positions, trades

-- Broker accounts: paper + real broker connections
CREATE TABLE IF NOT EXISTS broker_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  broker_name TEXT NOT NULL,  -- 'paper' | 'alpaca' | 'interactive-brokers'
  mode TEXT NOT NULL,         -- 'paper' | 'live'
  balance REAL,
  currency TEXT DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Orders: order lifecycle tracking
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,          -- 'buy' | 'sell'
  type TEXT NOT NULL,          -- 'market' | 'limit' | 'stop'
  quantity REAL NOT NULL,
  limit_price REAL,
  stop_price REAL,
  order_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'filled' | 'cancelled' | 'rejected'
  filled_qty REAL DEFAULT 0,
  filled_price REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  strategy_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES broker_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (ticker) REFERENCES symbols(ticker),
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL
);

-- Positions: current open positions per account
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  quantity REAL NOT NULL,
  avg_price REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES broker_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (ticker) REFERENCES symbols(ticker)
);

-- Trades: executed fills
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  commission REAL DEFAULT 0,
  executed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (ticker) REFERENCES symbols(ticker)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broker_accounts_user ON broker_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_order ON trades(order_id);
