# Epic 04: Strategy DSL

**PRD**: [`docs/prd/epic/04_Strategy_DSL.md`](../docs/prd/epic/04_Strategy_DSL.md)
**Spec**: [`docs/spec/strategy_dsl_spec.md`](../docs/spec/strategy_dsl_spec.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P1

## Summary

YAML-based strategy definition language with JSON Schema validation, backtest engine, and lifecycle management.

- DSL v1.0 with full JSON Schema (draft-07)
- 8+ built-in indicators (SMA, EMA, RSI, MACD, Bollinger, ATR, OBV, VWAP)
- 3 example strategies (MA Cross, RSI Oversold, Bollinger Breakout)
- Backtest engine with 70/30 in/out-of-sample split
- Strategy lifecycle: Draft → Validated → Backtested → Paper → Live
- BNF grammar for expression parser

## Sub-tasks

- [x] Strategy list page (`/strategy`) — StrategyList widget + /api/strategy
- [x] Strategy detail page with YAML editor (`/strategy/[id]`) — /api/strategy/[id]
- [x] JSON Schema validation — ADR-0008
- [x] Backtest runner page (`/backtest`) — BacktestPage + /api/backtest
- [x] Equity curve SVG visualization — BacktestPage equity chart
- [x] Trade log table — BacktestPage trade log
- [x] 8 built-in indicators implementation — SMA, EMA, RSI (Phase 1); MACD/Bollinger/ATR/OBV/VWAP Phase 2
- [x] DSL parser (BNF grammar) — `src/lib/dsl/parser.ts` (tokenizer + recursive descent + compiler, Phase 2 2026-07-21)
- [x] In-sample / out-of-sample split logic (70/30) — `src/lib/backtest/walk-forward.ts` `splitSample()` (Phase 1.5, 2026-07-21)
- [x] Strategy lifecycle state machine — lifecycle_status in strategies table

## Acceptance Criteria

- [x] YAML DSL validates against JSON Schema
- [x] Backtest produces Return, Sharpe, Sortino, Max DD, Win Rate, Trades, Avg Hold — ADR-0009
- [x] Equity curve renders in SVG
- [x] Trade log exports CSV — `src/lib/backtest/csv-export.ts` (RFC 4180 compliant, Phase 2 2026-07-21)
- [x] Lifecycle state transitions enforced

## References

- Spec: `docs/spec/strategy_dsl_spec.md` (full DSL field spec, JSON Schema, BNF)
- 3 example strategies in spec
