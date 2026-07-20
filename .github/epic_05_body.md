# Epic 05: Dashboard

**PRD**: [`docs/prd/epic/05_Dashboard.md`](../docs/prd/epic/05_Dashboard.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P0

## Summary

Default landing page with 7 widgets + sidebar. Mobile responsive. Mock Badge indicator.

- 7 widgets: KLine, Positions, Strategy, Watchlist, Ask Agent, Credit, Community
- Sidebar with Watchlist + Strategies + Mockup Pool
- Header with nav + MockBadge + ThemeToggle
- TradingView lightweight-charts integration
- Mock Badge shown when `USE_MOCK=true`
- Dark/Light theme toggle

## Sub-tasks

- [x] Dashboard page (`/`) with react-grid-layout drag-and-drop grid
- [x] Header component with nav + MockBadge + ThemeToggle
- [x] Sidebar component with Watchlist + Strategies + Mockup Pool
- [x] KlineChart widget (TradingView lightweight-charts) — Sprint 5
- [x] PositionsTable widget — fetches /api/broker/positions
- [x] Watchlist widget
- [x] AskAgentPanel widget
- [x] CreditBalance widget — live API fetch from /api/credits/balance, Sprint 9
- [x] StrategyList widget — fetches /api/strategy
- [x] CommunityFeed widget — Sprint 8
- [x] Mobile responsive layout (5 breakpoints) — Sprint 5
- [x] TradingView lightweight-charts integration — Sprint 5
- [x] Dark/Light theme toggle — Sprint 5

## Acceptance Criteria

- [x] Dashboard renders all 7 widgets + sidebar
- [x] Mock Badge visible when USE_MOCK=true
- [x] All widgets load Mock data without errors
- [x] Navigation works between all pages
- [x] Theme toggle works (dark/light)
- [x] Layout persists to localStorage + Reset button

## Status

**Sprint 5 + Sprint 8 + Sprint 9 completed** — All widgets implemented and verified.
