# Epic 06: Broker Integration

**PRD**: [`docs/prd/epic/06_Broker_Integration.md`](../docs/prd/epic/06_Broker_Integration.md)
**Status**: Phase 1 — PMF Validation (Paper Broker only)
**Priority**: P2

## Summary

PaperBroker simulator with 5bps slippage. Real broker integration via MCP server in Phase 2.

- PaperBroker simulator (instant fills at last price + 5bps slippage)
- 4 order types (MARKET, LIMIT, STOP, STOP_LIMIT)
- Order lifecycle state machine (PENDING → FILLED / CANCELLED / REJECTED)
- D1 schema: `broker_accounts`, `orders`, `positions`, `trades`
- Risk manager with 5 hard constraints
- MCP broker server placeholder (Phase 2)

## Sub-tasks

- [x] Broker page (`/broker`) with order form + recent orders table
- [x] Positions table widget (shared with Dashboard) — fetches /api/broker/positions
- [x] PaperBroker engine implementation — Sprint 6
- [x] Order lifecycle state machine — Sprint 6
- [x] D1 migrations for 4 broker tables — Migration 005
- [x] Account value / Cash / Positions Value / Unrealized P&L calculation
- [x] Order validation (insufficient funds, market hours, etc.) — 5 risk rules, Sprint 6
- [~] MCP broker server (Phase 2) — superseded by `AlpacaBrokerAdapter` (live Alpaca Paper Trading, 2026-07-21); MCP server remains optional for AI-agent-driven trading

## Acceptance Criteria

- [x] MARKET orders fill instantly at last price + 5bps slippage
- [x] LIMIT orders fill when market price crosses limit
- [x] STOP orders trigger when price crosses stop level
- [x] STOP_LIMIT orders: stop trigger + limit fillable
- [x] Positions table updates after each fill (dual ledger sync)
- [x] Account value recalculates in real-time
- [x] Risk manager enforces 5 constraints

## Phase 2 Extension

- MCP broker server (Alpaca, Interactive Brokers)
- Real broker integration with PaperBroker as fallback
- Order routing rules
