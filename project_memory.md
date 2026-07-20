# Nova-Invest Project Memory

This file preserves cross-session context for AI agents working on the
nova-invest project. Each entry is timestamped and separated by a horizontal
rule. **Never overwrite historical entries** — append new ones at the bottom.

---

## 2026-07-20 02:35 (Asia/Shanghai) — ADR-0009 Backtest Engine (TDD Implementation)

### Task
Implement ADR-0009 Backtest Engine using strict TDD (Red → Green → Refactor).
Source files in `web/src/lib/backtest/`, tests in `web/tests/unit/`.
Iron Law: no production code without a failing test first.

### Files Read First (per task plan)
- `docs/architecture/adr-0009-backtest-engine.md` — 8-step pipeline spec, 12 metrics, TradeSimulator + PaperBroker
- `docs/tdd/01-unit-tests.md` — ADR-0009 section (10 planned tests, Red→Green order)
- `web/src/lib/types.ts` — existing `BacktestResult` interface (left untouched per constraints)
- `web/tests/setup.ts` — vitest global setup (env reset, fetch stub)

### Files Created
1. `web/src/lib/backtest/types.ts` — local type definitions:
   - `SignalType = "BUY" | "SELL" | "HOLD"`
   - `StrategyContext` (point-in-time: `klines` only contains `[0..index]`)
   - `Strategy` seam (`evaluate(ctx) => SignalType`)
   - `BacktestConfig` (`strategy, start_date, end_date, initial_capital, fee_bps, slippage_bps`)
   - `Trade` (`entry_date, exit_date, entry_price, exit_price, qty, pnl, pnl_pct`)
   - `BacktestMetrics` (`total_return, sharpe, sortino, max_drawdown, win_rate, profit_factor, total_trades, avg_hold_days`)
   - `EquityPoint`, `BacktestResult`
   - **Note**: intentionally distinct from the legacy `BacktestResult` in `web/src/lib/types.ts` (which remains for UI compat). The new interface here is the canonical ADR-0009 shape (Phase 1 simplified — alpha/beta + sample_split deferred to a later task).

2. `web/src/lib/backtest/engine.ts` — implementation:
   - `class TradeSimulator` — `computeFillPrice(side, lastPrice)` + `computeFee(notional)`. Stateless, shared with future PaperBroker per ADR-0009 §"Trade Simulation Core".
   - `class BacktestEngine` — constructor validates config (initial_capital > 0, start_date < end_date, fee_bps >= 0, slippage_bps >= 0); `async run(klines)` executes the 8-step pipeline.
   - `function computeMetrics(trades, equityCurve)` — pure function, returns `BacktestMetrics`. Handles empty trades / single-point equity curve without NaN.
   - Internal helpers: `computeAnnualizedSharpe`, `computeAnnualizedSortino` (both population std, × sqrt(252)).

3. `web/tests/unit/backtest-engine.test.ts` — 17 test cases covering:
   - Constructor validation (4 tests: valid config + 3 rejection cases)
   - `run(klines)` pipeline (5 tests: happy path, point-in-time, fee model, slippage model, look-ahead bias)
   - `computeMetrics` pure function (6 tests: total_return, max_drawdown, win_rate, profit_factor, annualized sharpe, empty-trades edge case)
   - Equity curve invariants (2 tests: starts at initial_capital, ends at initial_capital + sum(pnl))

### Pipeline Design Decisions
- **Step ordering**: look-ahead bias check (Step 8 in ADR) is performed EARLY in `run()` (right after sort) to fail fast before wasted computation. Step numbering in code comments follows ADR order, but execution order optimizes for early failure.
- **Equity curve recording**: equity[i] is recorded BEFORE the trade at bar i executes. This guarantees `equity_curve[0].equity === initial_capital` regardless of whether the strategy BUYs at bar 0 (test 15).
- **Position sizing**: Phase 1 simplification — single long position, all-in sizing (`qty = cash / entry_price`). No short selling, no multi-position, no Kelly/fixed-fractional. ADR-0009 §"Performance Budget" + §"Trade Simulation Core" contemplate richer sizing but defer to Phase 2.
- **Fee model**: fee is computed on notional (`fee_bps * notional / 10000`) and deducted from cash on both BUY and SELL. Realized `pnl = (exit - entry) * qty - entry_fee - exit_fee`. This bakes fees into pnl (Trade interface has no fee field, matching the task plan).
- **Slippage**: BUY fill = `close * (1 + slippage_bps/10000)`; SELL fill = `close * (1 - slippage_bps/10000)`. Matches ADR-0009 §"Trade Simulation Core" exactly.
- **Mark-to-market**: at each bar, open positions are revalued at the bar's close. `equity = cash + qty * close`. This is why equity[1] (with position) differs from cash alone.
- **Sharpe annualization**: `daily_sharpe * sqrt(252)` where daily_sharpe uses population std (divide by N, not N-1). Risk-free rate = 0 (Phase 1 simplification).
- **Sortino**: same as Sharpe but denominator is downside deviation (sqrt of mean of squared negative returns only).

### Errors Encountered and Corrections
1. **Initial Red phase (expected)**: tests failed because `@/lib/backtest/engine` module didn't exist. This is the TDD Red phase — confirmed tests fail before any implementation.
2. **Slippage arithmetic error in test (test 8)**: I initially wrote `expect(trade.entry_price).toBeCloseTo(100.5, 6)` for `slippage_bps=5, close=100`. The correct value per ADR formula `close * (1 + slippage_bps/10000)` is `100 * (1 + 5/10000) = 100.05`, not `100.5`. The implementation was correct; the test had an arithmetic error. Fixed the test expected value to `100.05`. **Lesson**: when writing tests with hand-computed expected values, double-check the basis-points arithmetic — `bps/10000` produces small factors (5bps = 0.0005), not `bps/1000` (which would be 50bps).

### Verification
- `pnpm exec vitest run tests/unit/backtest-engine.test.ts --no-coverage` → 17/17 pass (869ms)
- Full suite: `pnpm exec vitest run --no-coverage` → 20 test files, 248 tests pass + 9 todo (no regressions)

### Constraints Honored
- ✅ Did NOT modify `web/src/lib/types.ts` (legacy `BacktestResult` left intact)
- ✅ Did NOT modify `web/package.json` (no new deps installed)
- ✅ Did NOT modify `web/vitest.config.ts`
- ✅ All new files in `web/src/lib/backtest/` (types.ts, engine.ts) + test file in `web/tests/unit/`
- ✅ Used `@/` alias throughout
- ✅ No commits made (per "NEVER commit changes unless explicitly instructed")

### Open Items / Future Work
- ADR-0009 contemplates richer features not yet implemented in Phase 1:
  - In/out-of-sample 70/30 split (`sample_split` field in legacy `BacktestResult` — not yet computed)
  - Benchmark load + alpha/beta (Step 8 of ADR pipeline — not yet implemented)
  - CAGR, Calmar ratio (in legacy `BacktestMetrics` but not in the new local interface — deferred)
  - Deterministic seed for position sizing noise (rule #1 — not needed since Phase 1 has no randomness)
  - PaperBroker (EP06) sharing TradeSimulator — not yet implemented
- These are scope-appropriate deferrals; the task plan explicitly specified only the 8 metrics in the local `BacktestMetrics` interface.

---
