# ADR-0002: R2 Cache Whitelist (10 Mockup Symbols)

## Status

Accepted

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + R2 |
| **Domain** | Core (Data Layer / Caching) |
| **Knowledge Risk** | LOW |
| **References Consulted** | `web/src/lib/env.ts`, `web/src/lib/data/provider.ts`, EP02 §2.3 ID-3, architecture.md §5 |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `shouldCacheR2("AAPL")` returns `true`; `shouldCacheR2("RKLB")` returns `false` |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (USE_MOCK dual-mode switch) — R2 is only active when `USE_MOCK=false` |
| **Enables** | EP04 BacktestEngine (relies on cached K-lines for performance) |
| **Blocks** | EP02 Data Layer Phase 1 stories TS-3, TS-4 (R2 cache hit/miss tests) |
| **Ordering Note** | Must be Accepted before BacktestEngine stories (EP04) start |

## Context

### Problem Statement

Cloudflare R2 free tier is 10GB. The project needs to cache K-line data to avoid repeated Yahoo Finance API calls (rate-limited at 100 req/min, easily IP-banned). But caching every symbol users query would:

- Exhaust R2 free tier (cold symbols like RKLB, GME, etc. pile up)
- Cause cache churn (cold symbols cached once, never hit again)
- Defeat the purpose of caching (popular symbols get evicted)

The decision: **only cache K-lines for the 10 symbols that appear in the Mock dataset**. This guarantees:

- Cache hit rate is high (these 10 symbols cover the demo flow)
- Cache size is bounded (10 symbols × 2 years × 6 fields × 8 bytes ≈ 5MB)
- Cold symbols (user queries RKLB) bypass R2, hit Yahoo directly, no cache write

### Constraints

- **R2 free tier**: 10GB storage, 1M Class A operations/month, 10M Class B operations/month
- **Yahoo rate limit**: 100 req/min per IP — caching is essential to avoid throttling
- **Workers cold start**: R2 reads add ~5-20ms latency; cache hit must be < 50ms total
- **Mock mode bypass**: R2 is NOT used in Mock mode (Mock reads JSON directly from `web/public/mock/`)
- **Whitelist stability**: The 10 symbols must match the Mock dataset symbols exactly — otherwise Mock and Real modes show different "visible" symbols

### Requirements

- Cache only the 10 whitelisted symbols (the same 10 in `R2_CACHE_SYMBOLS` set)
- TTL: 3600s (1 hour) for price data, 604800s (7 days) for fundamental data
- Max cache size: 5GB (50% of free tier, leaves room for other uses)
- `shouldCacheR2(symbol)` is the canonical predicate; all R2 writes must go through it
- Whitelist must be in sync with Mock dataset symbols (single source of truth)

## Decision

**Define `R2_CACHE_SYMBOLS` as a constant Set in `web/src/lib/env.ts`, expose `shouldCacheR2(symbol)` predicate, and require all R2 write paths to call it before writing.**

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ RealProvider.getKlines(symbol)                               │
│                                                              │
│   1. shouldCacheR2(symbol)?                                  │
│      ├─ YES → check R2 first                                 │
│      │         ├─ HIT  → return cached (TTL valid)           │
│      │         └─ MISS → fetch Yahoo → write R2 → return     │
│      └─ NO  → fetch Yahoo directly (no R2 write)             │
│                                                              │
│   2. On Yahoo failure → fallback to MockProvider             │
│      (per ADR-0001)                                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ R2_CACHE_SYMBOLS (in env.ts)                                 │
│                                                              │
│   AAPL, MSFT, NVDA, GOOG, META,                             │
│   AMZN, TSLA, NFLX, AMD, INTC                                │
│                                                              │
│   ⚠️ Must stay in sync with Mock dataset symbols             │
│      (web/public/mock/klines/*.json filenames)               │
└──────────────────────────────────────────────────────────────┘
```

### Key Interfaces

```typescript
// web/src/lib/env.ts (canonical source of truth)

/**
 * Symbols whitelisted for R2 caching.
 * MUST stay in sync with Mock dataset symbols (web/public/mock/klines/*.json filenames).
 * Adding/removing symbols here requires regenerating Mock data via `pnpm run gen:mock`.
 */
export const R2_CACHE_SYMBOLS = new Set([
  "AAPL", "MSFT", "NVDA", "GOOG", "META",
  "AMZN", "TSLA", "NFLX", "AMD", "INTC",
]);

/**
 * Returns true if the symbol should be cached in R2.
 * All R2 write paths MUST call this before writing.
 */
export function shouldCacheR2(symbol: string): boolean {
  return R2_CACHE_SYMBOLS.has(symbol.toUpperCase());
}

// R2 TTLs (in seconds)
export const R2_TTL = {
  PRICE: 3600,        // 1 hour — K-lines, quotes
  FUNDAMENTAL: 604800, // 7 days — earnings, financials
} as const;

// R2 max size (bytes)
export const R2_MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
```

```typescript
// web/src/lib/data/provider.ts — R2 write pattern

class RealProvider implements MarketDataProvider {
  async getKlines(symbol: string, timeframe: "1d" | "5m") {
    // 1. Check R2 cache (only for whitelisted symbols)
    if (shouldCacheR2(symbol)) {
      const cached = await this.r2.get(`klines/${symbol}_${timeframe}.json`);
      if (cached && !isExpired(cached, R2_TTL.PRICE)) {
        return JSON.parse(cached);
      }
    }

    // 2. Fetch from Yahoo
    const data = await this.yahoo.getHistorical(symbol, timeframe);

    // 3. Write to R2 (only for whitelisted symbols)
    if (shouldCacheR2(symbol)) {
      await this.r2.put(
        `klines/${symbol}_${timeframe}.json`,
        JSON.stringify({ ticker: symbol, timeframe, data, cached_at: Date.now() })
      );
    }

    return data;
  }
}
```

### Critical Implementation Rule

**`R2_CACHE_SYMBOLS` must stay in sync with Mock dataset filenames.** If you add "PLTR" to the whitelist, you must also:

1. Generate `web/public/mock/klines/PLTR_1d.json` via `pnpm run gen:mock -- --symbols PLTR`
2. Update `MOCK_SYMBOLS` array in `scripts/gen-mock-data.ts`
3. Add a unit test asserting `R2_CACHE_SYMBOLS` ⊆ `getMockSymbols()`

Failure to keep these in sync means Mock and Real modes show different "visible" symbols, breaking the demo consistency guarantee.

## Alternatives Considered

### Alternative 1: Cache every symbol users query (LRU eviction)

- **Description**: Cache all symbols; LRU-evict when R2 reaches 5GB.
- **Pros**: Better hit rate for cold symbols over time.
- **Cons**: Cache churn for one-off queries; LRU implementation adds complexity; unpredictable eviction of popular symbols.
- **Rejection Reason**: Demo consistency (Mock vs Real same symbols) is more important than cold-symbol performance. Revisit in Phase 2 if real users query diverse symbols.

### Alternative 2: Cache top-N symbols by query count

- **Description**: Track query counts in D1; cache top 100 most-queried symbols.
- **Pros**: Adaptive to real usage.
- **Cons**: Cold start (nothing cached initially); D1 writes on every query; complex.
- **Rejection Reason**: Premature complexity for Phase 1 demo.

### Alternative 3: Cache nothing, always hit Yahoo

- **Description**: No R2 cache. Yahoo API only.
- **Pros**: Simplest implementation.
- **Cons**: Will hit Yahoo rate limit (100 req/min) during demo with multiple users; IP ban risk.
- **Rejection Reason**: Demo reliability requires caching.

## Consequences

### Positive

- Bounded R2 usage (~5MB, well within 10GB free tier)
- High cache hit rate for the 10 demo symbols (the only ones users see in Mock mode)
- Demo consistency: Mock and Real modes show the same 10 symbols
- Simple predicate (`shouldCacheR2`) is easy to test and audit

### Negative

- Cold symbols (user queries RKLB) hit Yahoo directly, no cache benefit
- Whitelist must be manually kept in sync with Mock dataset
- Adding a new symbol requires regenerating Mock data (multi-step process)

### Risks

- **Risk**: Whitelist drifts from Mock dataset (someone adds "PLTR" to whitelist but forgets Mock).
  - **Mitigation**: Unit test asserts `R2_CACHE_SYMBOLS` ⊆ `getMockSymbols()`; CI fails if mismatch.
- **Risk**: R2 write fails silently (Workers exception swallowed).
  - **Mitigation**: Log R2 write failures to `console.error` + OpenTelemetry span; degrade gracefully to Yahoo-only.
- **Risk**: TTL too short (1 hour) causes excessive Yahoo calls for popular symbols.
  - **Mitigation**: Monitor R2 hit rate in Grafana; if < 80%, increase `R2_TTL.PRICE` to 6 hours.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP02 §2.3 ID-3 | "R2 仅存储部分 Mockup 用到的真实 K 线" | Defines the whitelist as the canonical "Mockup 用到" set |
| EP02 §2.3 ID-3 | "10 标的 × 2 年 × 252 交易日 × 6 字段 ≈ 30K 条记录 → JSON ≈ 5MB" | Confirms cache size bound |
| EP02 §2.3 | "Mock 模式下 R2 不参与" | Reaffirmed: R2 is only active when `USE_MOCK=false` (per ADR-0001) |
| EP02 §2.3 | "仅在生产模式且标的在 cachedSymbols 列表内时才写 R2" | Codifies `shouldCacheR2(symbol)` as the gate |
| EP02 §3 User Story 5 | "R2 缓存自动启用且不超 10GB" | Bounded by whitelist size (5MB) |
| EP02 §3 User Story 6 | "重复查询 AAPL，第二次查询命中 R2 缓存（<50ms）" | Whitelist ensures AAPL is cached |
| EP02 ID-7 | "CircuitBreaker: Yahoo 失败 3 次 → 切换 Mock" | R2 cache reduces Yahoo calls, lowering circuit-breaker trigger frequency |

## Performance Implications

- **CPU**: Negligible — `Set.has()` is O(1)
- **Memory**: R2_CACHE_SYMBOLS Set: ~500 bytes (10 strings)
- **Load Time**: Cache hit: < 50ms (R2 read); Cache miss: 200-500ms (Yahoo API + R2 write)
- **Network**: R2 read: ~5-20ms (Cloudflare internal); Yahoo API: 200-500ms
- **R2 Storage**: ~5MB (10 symbols × ~500KB each), 0.05% of 10GB free tier

## Migration Plan

The current `provider.ts` and `env.ts` already implement this ADR. Migration steps:

1. Verify `R2_CACHE_SYMBOLS` in `env.ts` matches Mock dataset filenames (10 symbols)
2. Add `R2_TTL` and `R2_MAX_SIZE` constants to `env.ts` (currently implicit in `ProviderConfig`)
3. Add unit test asserting `R2_CACHE_SYMBOLS` ⊆ `getMockSymbols()`
4. Add unit test asserting `shouldCacheR2("AAPL") === true` and `shouldCacheR2("RKLB") === false`
5. Add integration test: RealProvider writes to R2 only for whitelisted symbols (use MSW to mock Yahoo, mock R2)
6. Add CI check: `pnpm run check:mock-symbols` script that asserts whitelist ↔ Mock dataset sync

## Validation Criteria

- [ ] `shouldCacheR2("AAPL")` returns `true`
- [ ] `shouldCacheR2("aapl")` returns `true` (case-insensitive)
- [ ] `shouldCacheR2("RKLB")` returns `false` (cold symbol)
- [ ] `shouldCacheR2("")` returns `false` (empty string)
- [ ] `R2_CACHE_SYMBOLS.size === 10`
- [ ] `R2_CACHE_SYMBOLS` matches Mock dataset filenames exactly
- [ ] RealProvider does NOT call `r2.put()` for non-whitelisted symbols
- [ ] RealProvider DOES call `r2.put()` for whitelisted symbols on cache miss
- [ ] R2 cache hit returns data in < 50ms
- [ ] R2 storage usage stays < 100MB (10MB safety margin above expected 5MB)

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) — R2 is only active when `USE_MOCK=false`
- EP02 §2.3 R2 缓存策略 — originating design doc
- EP02 ID-3 — user decision this ADR formalizes
- architecture.md §5 — data flow context
