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

- [ ] Strategy list page (`/strategy`)
- [ ] Strategy detail page with YAML editor (`/strategy/[id]`)
- [ ] JSON Schema validation
- [ ] Backtest runner page (`/backtest`)
- [ ] Equity curve SVG visualization
- [ ] Trade log table
- [ ] 8 built-in indicators implementation
- [ ] DSL parser (BNF grammar)
- [ ] In-sample / out-of-sample split logic
- [ ] Strategy lifecycle state machine

## Acceptance Criteria

- [ ] YAML DSL validates against JSON Schema
- [ ] Backtest produces Return, Sharpe, Sortino, Max DD, Win Rate, Trades, Avg Hold
- [ ] Equity curve renders in SVG
- [ ] Trade log exports CSV
- [ ] Lifecycle state transitions enforced

## References

- Spec: `docs/spec/strategy_dsl_spec.md` (full DSL field spec, JSON Schema, BNF)
- 3 example strategies in spec
