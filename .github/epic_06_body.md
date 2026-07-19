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
- MCP broker server placeholder (Phase 2)

## Sub-tasks

- [x] Broker page (`/broker`) with order form + recent orders table
- [x] Positions table widget (shared with Dashboard)
- [ ] PaperBroker engine implementation (Worker side)
- [ ] Order lifecycle state machine
- [ ] D1 migrations for 4 broker tables
- [ ] Account value / Cash / Positions Value / Unrealized P&L calculation
- [ ] Order validation (insufficient funds, market hours, etc.)
- [ ] MCP broker server (Phase 2)

## Acceptance Criteria

- [ ] MARKET orders fill instantly at last price + 5bps slippage
- [ ] LIMIT orders fill when market price crosses limit
- [ ] STOP orders trigger when price crosses stop level
- [ ] Positions table updates after each fill
- [ ] Account value recalculates in real-time

## Phase 2 Extension

- MCP broker server (Alpaca, Interactive Brokers)
- Real broker integration with PaperBroker as fallback
- Order routing rules
