-- Migration 0004: EP04 Strategy DSL + Backtest
-- ADR-0011 §Master Schema - Part 4/9
-- Creates: strategies, backtest_results

-- Strategies: user-defined trading strategies (YAML DSL)
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  dsl_yaml TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'active' | 'archived'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Backtest results: JSON-serialized BacktestResult per ADR-0009
CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  result_json TEXT NOT NULL,  -- BacktestResult serialized as JSON
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy_id);
CREATE INDEX IF NOT EXISTS idx_backtest_run_at ON backtest_results(run_at);
