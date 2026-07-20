# Epic 02: Data Layer

**PRD**: [`docs/prd/epic/02_DataLayer.md`](../docs/prd/epic/02_DataLayer.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P0 (foundational, blocks 3-8)

## Summary

Build the data layer with Mock/Real Provider abstraction, D1 schema, and R2 caching strategy.

- 10 symbols Mock K-line JSON (AAPL, MSFT, NVDA, GOOG, META, AMZN, TSLA, NFLX, AMD, INTC)
- D1 schema: `symbols`, `watchlists`, `watchlist_items`, `kline_cache_index`, `fundamentals`
- R2 cache only for 10 whitelisted symbols (within free tier)
- Multi-source fallback: Yahoo → Alpha Vantage → Polygon → Mock
- Mock/Real switch via `USE_MOCK` env var

## Sub-tasks

- [x] Implement `MarketDataProvider` interface
- [x] `MockProvider` reads from `/mock/klines/{SYMBOL}_1d.json`
- [x] `RealProvider` calls Yahoo Finance API — 4-tier fallback: R2 → Yahoo → Alpha Vantage → Mock
- [x] `getProvider()` factory based on `isMockMode()` — request-scoped, no module cache
- [x] D1 migrations for 5 core tables — Migrations 001-002
- [x] R2 cache decision function `shouldCacheR2()` — ADR-0002
- [x] Mock data generator script (`scripts/generate_mock_data.py`)
- [x] Fundamentals Mock dataset
- [x] CircuitBreaker for external sources — ADR-0016 (in-memory Phase 1, KV Phase 2)

## Acceptance Criteria

- [x] All 10 Mock symbols return valid K-line data in dev
- [x] Real mode fetches live Yahoo data with graceful fallback to Mock on error
- [x] D1 schema deployed to Cloudflare (10/10 migrations applied — confirmed 2026-07-21)
- [x] R2 cache stores only whitelisted symbols

## References

- Spec: `docs/spec/data_model.md` (Tables: symbols, watchlists, etc.)
- Spec: `docs/spec/api_spec.md` (data endpoints)
