# Epic 05: Dashboard

**PRD**: [`docs/prd/epic/05_Dashboard.md`](../docs/prd/epic/05_Dashboard.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P0

## Summary

Default landing page with 6 widgets + sidebar. Mobile responsive. Mock Badge indicator.

- 6 widgets: KLine, Positions, Strategy, Watchlist, Ask Agent, Credit
- Sidebar with Watchlist + Strategies + Mockup Pool
- Header with 8 nav items + MockBadge + user avatar
- SVG-based KlineChart (Phase 1) → TradingView lightweight-charts (Phase 1.5+)
- Mock Badge shown when `USE_MOCK=true`

## Sub-tasks

- [x] Dashboard page (`/`) with 4-row grid layout
- [x] Header component with nav + MockBadge
- [x] Sidebar component with Watchlist + Strategies + Mockup Pool
- [x] KlineChart widget (SVG candlestick)
- [x] PositionsTable widget
- [x] Watchlist widget
- [x] AskAgentPanel widget
- [x] CreditBalance widget
- [x] StrategyList widget
- [x] CommunityFeed widget
- [ ] Mobile responsive layout (breakpoints)
- [ ] TradingView lightweight-charts integration (Phase 1.5)

## Acceptance Criteria

- [x] Dashboard renders all 6 widgets + sidebar
- [x] Mock Badge visible when USE_MOCK=true
- [x] All widgets load Mock data without errors
- [x] Navigation works between all 10 pages

## Status

**Sprint 0 completed** — All widgets implemented and verified in dev mode (200 OK).
