-- Migration 0010: Credit Billing System (Sprint 9, Appendix A)
-- Per billing_credit_system.md §4 D1 Schema

-- Credit balance per user per month
CREATE TABLE IF NOT EXISTS credit_balances (
  user_id       TEXT NOT NULL,
  period        TEXT NOT NULL,  -- "YYYY-MM" monthly period
  plan          TEXT NOT NULL,  -- free / pro / team / enterprise
  granted       INTEGER NOT NULL,  -- monthly quota
  used          INTEGER DEFAULT 0,
  topped_up     INTEGER DEFAULT 0,  -- extra top-ups this period
  carried_over  INTEGER DEFAULT 0,  -- from previous period (Team+ only)
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, period)
);

-- Credit transaction ledger
CREATE TABLE IF NOT EXISTS credit_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  action        TEXT NOT NULL,  -- ask_simple / ask_deep / backtest_1y / ...
  amount        INTEGER NOT NULL,  -- positive=debit, negative=refund
  balance_after INTEGER NOT NULL,
  metadata      TEXT,  -- JSON: {strategy_id, session_id, ...}
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user_time
  ON credit_transactions(user_id, created_at);

-- Top-up orders (Phase 2: Stripe integration)
CREATE TABLE IF NOT EXISTS credit_orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  amount_usd    REAL NOT NULL,
  credits       INTEGER NOT NULL,
  order_status  TEXT NOT NULL,  -- pending / paid / failed (renamed from 'status' per ADR-0011 Rule #6)
  stripe_id     TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_orders_user
  ON credit_orders(user_id, created_at);
