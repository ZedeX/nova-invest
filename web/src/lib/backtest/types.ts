/**
 * Backtest Engine — Type definitions (ADR-0009)
 *
 * Defines the contracts consumed by `engine.ts`:
 *   - BacktestConfig   — engine input (strategy + capital + costs)
 *   - Trade            — realized round-trip trade
 *   - BacktestMetrics  — aggregate performance metrics
 *   - BacktestResult   — pipeline output
 *   - Strategy / StrategyContext / SignalType — strategy seam
 *
 * These types are intentionally local to `@/lib/backtest/` and DO NOT modify
 * the legacy `web/src/lib/types.ts` (per task constraints). The legacy
 * `BacktestResult` interface in `types.ts` remains for backward compat with
 * existing UI components; the new interface here is the canonical shape per
 * ADR-0009 §"Key Interfaces" (Phase 1 simplified subset — alpha/beta and
 * sample_split are computed by a later step, not by this engine).
 *
 * See: docs/architecture/adr-0009-backtest-engine.md
 */

import type { Kline } from "@/lib/types";

/** Signal emitted by a Strategy.evaluate() call at a given bar. */
export type SignalType = "BUY" | "SELL" | "HOLD";

/**
 * Point-in-time context handed to `Strategy.evaluate` at bar `index`.
 *
 * CRITICAL (ADR-0009 §"Critical Implementation Rules" #2 — No lookahead bias):
 * `klines` contains ONLY bars `[0..index]` inclusive. The engine must slice
 * the full kline array before constructing the context; the strategy must
 * never see bars `[index+1..]`.
 */
export interface StrategyContext {
  /** Zero-based index of the current bar within the full klines array. */
  index: number;
  /** Bars `[0..index]` inclusive — point-in-time view. */
  klines: Kline[];
  // Convenience accessors for the current bar (=== klines[index]):
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  /** ISO date string of the current bar (=== klines[index].t). */
  date: string;
}

/**
 * Strategy seam — a function from bar context to signal.
 *
 * Phase 1 stub: real strategies are produced by ADR-0008's `validateStrategy`.
 * For unit testing, this interface is satisfied by any object with an
 * `evaluate` method (e.g. `{ evaluate: vi.fn(...) }`).
 */
export interface Strategy {
  evaluate: (ctx: StrategyContext) => SignalType;
}

/** Engine configuration — validated by the BacktestEngine constructor. */
export interface BacktestConfig {
  /** Strategy to evaluate at each bar. */
  strategy: Strategy;
  /** Inclusive start date (ISO "YYYY-MM-DD"). */
  start_date: string;
  /** Inclusive end date (ISO "YYYY-MM-DD"). Must be > start_date. */
  end_date: string;
  /** Starting cash. Must be > 0. */
  initial_capital: number;
  /** Commission per side in basis points (1 bps = 0.01%). Must be >= 0. */
  fee_bps: number;
  /** Slippage per side in basis points. Applied to fill price. */
  slippage_bps: number;
}

/** A realized round-trip trade (entry + exit). */
export interface Trade {
  entry_date: string;
  exit_date: string;
  /** Fill price including slippage on the BUY side. */
  entry_price: number;
  /** Fill price including slippage on the SELL side. */
  exit_price: number;
  /** Number of shares/contracts traded. */
  qty: number;
  /** Realized P&L in cash units, net of fees on both sides. */
  pnl: number;
  /** `pnl / (entry_price * qty)` — fractional return per trade. */
  pnl_pct: number;
}

/** Aggregate performance metrics computed from trades + equity curve. */
export interface BacktestMetrics {
  /** `(final_equity - initial_capital) / initial_capital`. */
  total_return: number;
  /** Annualized Sharpe ratio (daily Sharpe × sqrt(252)). Risk-free = 0. */
  sharpe: number;
  /** Annualized Sortino ratio (uses downside deviation only). */
  sortino: number;
  /** Max peak-to-trough drawdown as a fraction in [0, 1]. */
  max_drawdown: number;
  /** Winning trades / total trades. 0 when no trades. */
  win_rate: number;
  /** gross_profit / gross_loss. 0 when no losses (and no profit). */
  profit_factor: number;
  /** Total number of closed trades. */
  total_trades: number;
  /** Mean trade duration in calendar days. */
  avg_hold_days: number;
}

/** Single point on the equity curve. */
export interface EquityPoint {
  date: string;
  /** Total portfolio value (cash + position mark-to-market) at this bar. */
  equity: number;
}

/** Output of `BacktestEngine.run()`. */
export interface BacktestResult {
  trades: Trade[];
  metrics: BacktestMetrics;
  equity_curve: EquityPoint[];
  config: BacktestConfig;
}
