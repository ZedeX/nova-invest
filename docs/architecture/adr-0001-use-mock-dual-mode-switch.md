# ADR-0001: USE_MOCK Dual-Mode Switch (Mock/Real Data Provider)

## Status

Accepted

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 |
| **Domain** | Core (Data Layer) |
| **Knowledge Risk** | LOW |
| **References Consulted** | `web/src/lib/data/provider.ts`, EP02 §2.2, architecture.md §5 |
| **Post-Cutoff APIs Used** | None |
|- **Verification Required** | USE_MOCK=true must produce zero outbound external HTTP requests to third-party finance/LLM APIs; local `/mock/*` static file fetch is permitted (assertable in tests) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | None |
| **Enables** | ADR-0002 (R2 cache whitelist), ADR-0003 (LLM routing) — both rely on the same env-var-driven switch pattern |
| **Blocks** | EP02 Data Layer Phase 1 stories, EP03 Ask Agent local mode |
| **Ordering Note** | Foundation ADR — must be Accepted before any data-layer or LLM-routing story starts |

## Context

### Problem Statement

The project must support two runtime modes from a single codebase: (a) **Mock mode** for local development and demos (no external API keys, no network calls, deterministic data), and (b) **Real mode** for production (Yahoo Finance API + R2 cache + future paid sources). The switch must be:

- Zero-cost at runtime (no feature-flag service)
- Single source of truth (no scattered booleans)
- Verifiable in tests (`USE_MOCK=true` → zero HTTP requests)
- Compatible with Cloudflare Workers (env vars via `wrangler.toml` / Pages dashboard)

### Constraints

- **Cloudflare Workers stateless**: Global module-level singletons (like `_provider` cache in current `provider.ts`) can leak state across requests when Workers instances are reused. ADR must call this out and prescribe request-scoped instantiation.
- **Next.js 16 + Pages/Workers**: Env vars exposed via `process.env.USE_MOCK` in dev, `getRequestContext().env.USE_MOCK` in Workers runtime. ADR must standardize on `process.env` with a fallback shim.
- **Free-tier demo economics**: Mock mode must work with zero API keys to support the "job-seeking portfolio" (portfolio project) goal — `pnpm dev` should "just work" out of the box.
- **No feature-flag service**: Cloudflare KV could be used but adds complexity; a simple env var is sufficient for a single-tenant demo.

### Requirements

- Single env var `USE_MOCK` (`"true"` | `"false"` | unset → treat as `"true"` for safe default)
- Mock mode reads JSON from `web/public/mock/klines/*.json` (served at `/mock/klines/*.json`)
- Real mode calls Yahoo Finance API, falls back to Mock on failure (Phase 1)
- Switching modes must not require code changes
- Tests must be able to assert "no external HTTP calls in Mock mode"

## Decision

**Adopt a single `USE_MOCK` environment variable driving a Strategy-pattern Provider selection.**

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ App Code (RSC / API routes / Widgets)                       │
│                                                             │
│   const provider = getProvider();  // request-scoped        │
│   const klines = await provider.getKlines("AAPL", "1d");    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ getProvider() — Factory function                            │
│                                                             │
│   const mode = process.env.USE_MOCK === "true"              │
│     ? "mock"                                                │
│     : "real";                                               │
│   return mode === "mock"                                    │
│     ? new MockProvider()                                    │
│     : new RealProvider({ sources: [...], r2: {...} });      │
└─────────────────────────────────────────────────────────────┘
              │                                  │
              ▼                                  ▼
┌──────────────────────────────┐  ┌────────────────────────────┐
│ MockProvider                 │  │ RealProvider               │
│                              │  │                            │
│ Reads: web/public/mock/      │  │ Calls: Yahoo Finance API   │
│        klines/*.json         │  │ Falls back to: MockProvider│
│                              │  │ Caches in: R2 (when enabled)│
│ Zero HTTP calls              │  │                            │
└──────────────────────────────┘  └────────────────────────────┘
```

### Key Interfaces

```typescript
// web/src/lib/data/provider.ts (existing, canonical interface)

export type DataSourceMode = "mock" | "real";

export interface MarketDataProvider {
  getKlines(symbol: string, timeframe: "1d" | "5m", from?: string, to?: string): Promise<KlineResponse>;
  getQuote(symbol: string): Promise<QuoteResponse>;
  getEarnings(symbol: string): Promise<EarningsResponse>;
}

export interface ProviderConfig {
  mode: DataSourceMode;
  mockDataPath: string;           // "web/public/mock"
  realSources: SourcePriority[];  // Phase 1: [{ name: "yahoo", priority: 1 }, { name: "mock", priority: 99, fallback: true }]
  r2Cache: { enabled: boolean; ttl: number; maxSize: number };
}

// Factory — request-scoped, NOT cached at module level
export function getProvider(env?: { USE_MOCK?: string }): MarketDataProvider {
  const mode = (env?.USE_MOCK ?? process.env.USE_MOCK ?? "true") === "true"
    ? "mock"
    : "real";
  return mode === "mock"
    ? new MockProvider()
    : new RealProvider({
        sources: [
          { name: "yahoo",   priority: 1,  rateLimit: { req: 100, per: "minute" } },
          // Phase 1.5: { name: "alpha",   priority: 2, rateLimit: { req: 25, per: "day" } },
          // Phase 1.5: { name: "polygon", priority: 3, rateLimit: { req: 5,  per: "minute" } },
          { name: "mock",    priority: 99, fallback: true },
        ],
        r2: { enabled: true, ttl: 3600, maxSize: 5 * 1024 * 1024 * 1024 },
      });
}
```

### Critical Implementation Rule (Cloudflare Workers)

**Do NOT cache the provider at module level.** The current `provider.ts` has:

```typescript
// ❌ ANTI-PATTERN (current code, must refactor before Phase 1 ship)
let _provider: MarketDataProvider | null = null;
export function getProvider(): MarketDataProvider {
  if (!_provider) {
    _provider = createProvider(process.env.USE_MOCK);
  }
  return _provider;
}
```

This is broken on Cloudflare Workers because a single Worker instance handles many requests, and `process.env.USE_MOCK` can change between deploys (not between requests, but the cached provider outlives its env var reading). Worse, in Next.js dev mode with hot reload, stale providers persist.

**Required pattern** (request-scoped):

```typescript
// ✅ REQUIRED — pass env explicitly, no module-level cache
export function getProvider(env: { USE_MOCK?: string } = process.env): MarketDataProvider {
  return createProvider(env);
}
```

If a request needs to call `getProvider()` multiple times, the request handler should call it once and pass the instance down.

## Alternatives Considered

### Alternative 1: Per-route mock toggle (`?mock=true` query param)

- **Description**: Each API route reads `req.nextUrl.searchParams.get("mock")` and switches on that.
- **Pros**: No env var, easy to flip per-request during dev.
- **Cons**: Breaks server components (no query params in RSC fetches), leaks into production URLs, untestable without HTTP context.
- **Rejection Reason**: Doesn't work for RSC; security risk if shipped to production.

### Alternative 2: Cloudflare KV feature flag

- **Description**: Store `mock_mode: true|false` in KV, read on every request.
- **Pros**: Switchable at runtime without redeploy; supports per-user flags.
- **Cons**: Adds KV read latency to every request; overkill for single-tenant demo; Phase 2+ feature.
- **Rejection Reason**: Premature complexity for Phase 1. Revisit in Phase 2 if per-user toggles become needed.

### Alternative 3: Build-time flag (`NEXT_PUBLIC_MOCK` baked at build)

- **Description**: `next build --env NEXT_PUBLIC_MOCK=true` produces a mock-only build.
- **Pros**: No runtime overhead; can ship separate demo and prod builds.
- **Cons**: Can't toggle without rebuild; doesn't work for Workers backend (separate build).
- **Rejection Reason**: Incompatible with single-deploy Workers model.

## Consequences

### Positive

- Single source of truth (`USE_MOCK` env var)
- Zero-cost at runtime (env var read is O(1))
- Tests can deterministically assert mock behavior by setting `process.env.USE_MOCK = "true"`
- Phase 1 demo works out of the box with zero API keys
- Clear path to Phase 1.5/2 (just add more sources to `RealProvider`)

### Negative

- Mode is global per-deploy, not per-user — all users in a deployment share the same mode
- Switching modes requires a redeploy (or Workers config update)
- Module-level singleton pattern in current code must be refactored before Phase 1 ship (see Critical Implementation Rule)

### Risks

- **Risk**: Developer forgets to set `USE_MOCK=false` in production deploy, ships mock data to real users.
  - **Mitigation**: Default is `"true"` (safe for demo); production deploy script asserts `USE_MOCK=false` before `wrangler deploy`. Add to `wrangler.toml`:
    ```toml
    [vars]
    USE_MOCK = "false"  # Production
    ```
  - **Mitigation**: Dashboard widget "Mode Badge" shows current mode visually (red "MOCK" badge vs green "LIVE").
- **Risk**: Module-level `_provider` cache leaks state in Workers.
  - **Mitigation**: Refactor to request-scoped factory before Phase 1 ship. Add unit test that asserts `getProvider()` returns fresh instance when env changes.
- **Risk**: Mock data drift — Mock files get stale relative to real API schema changes.
  - **Mitigation**: `pnpm run gen:mock` regenerates from Yahoo API; CI runs schema validation on Mock JSON files.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP02 DataLayer §2.2 | "Single switch USE_MOCK environment variable" | Defines `USE_MOCK` as the canonical switch; codifies the factory pattern |
| EP02 DataLayer §3 BDD | "Mock mode reads K-lines / no external HTTP requests / response time < 100ms" | Establishes testable contract: MockProvider must not make outbound HTTP requests to third-party APIs; local `/mock/*` static file fetch is permitted |
| EP02 DataLayer ID-2 | "Mock/Real switch design - key decision" | Formalizes the design decision as an ADR |
| EP01 AgentHarness §acceptance | "No external API calls when USE_MOCK=true" | Same contract, asserted at agent layer |
| EP01 AgentHarness ID-5 | "Provider switch (local vs cloud)" | LLM provider uses same env-var pattern (see ADR-0003) |
| architecture.md §5.3 | "Mock dataset manifest" | Mock path `web/public/mock/klines/*.json` is the canonical location |

## Performance Implications

- **CPU**: Negligible — one env var read per request
- **Memory**: Mock mode: ~5MB JSON loaded per K-line file (cached in browser); Real mode: zero JSON load
- **Load Time**: Mock mode: < 100ms (local file read); Real mode: 200-500ms (Yahoo API call) + R2 cache hit < 50ms
- **Network**: Mock mode: zero outbound external HTTP to third-party APIs (enforced by test; local `/mock/*` static file fetch is permitted); Real mode: 1 Yahoo call per request, mitigated by R2 cache (ADR-0002)

## Migration Plan

The current `web/src/lib/data/provider.ts` already implements this ADR's intent but with the anti-pattern module-level cache. Migration steps:

1. Remove `_provider` module-level cache
2. Make `getProvider()` accept `env` parameter explicitly
3. Update all call sites to pass `process.env` (or `getRequestContext().env` in Workers)
4. Add unit test asserting `getProvider({ USE_MOCK: "true" })` returns `MockProvider` instance, `getProvider({ USE_MOCK: "false" })` returns `RealProvider`
5. Add unit test asserting `MockProvider.getKlines()` makes zero outbound HTTP requests to third-party APIs (local `/mock/*` static file fetch is permitted; use `vi.spyOn(globalThis, "fetch")`)
6. Update `wrangler.toml` to set `USE_MOCK = "false"` in `[vars]` for production

## Validation Criteria

- [ ] `process.env.USE_MOCK = "true"` → `getProvider()` returns `MockProvider` instance
- [ ] `process.env.USE_MOCK = "false"` → `getProvider()` returns `RealProvider` instance
- [ ] `process.env.USE_MOCK` unset → defaults to `"true"` (safe demo default)
- [ ] `MockProvider.getKlines()` makes zero outbound external HTTP requests to third-party finance/LLM APIs; local `/mock/*` static file fetch is permitted (verified by `vi.spyOn`)
- [ ] `MockProvider.getKlines("AAPL", "1d")` returns data from `web/public/mock/klines/AAPL_1d.json`
- [ ] `RealProvider.getKlines()` falls back to Mock when Yahoo fails (Phase 1)
- [ ] No module-level provider cache (request-scoped only)
- [ ] Dashboard shows "MOCK" / "LIVE" badge reflecting current mode
- [ ] Production deploy script asserts `USE_MOCK=false` before `wrangler deploy`

## Related Decisions

- **ADR-0002** (R2 cache whitelist) — depends on this ADR for the `mode` field in `ProviderConfig`
- **ADR-0003** (LLM routing + cost_cap) — uses the same env-var-driven switch pattern for LLM provider selection
- EP02 §2.2 Mock/Real switch design — originating design doc
- architecture.md §5 — data flow context

## TECH_DEBT — Module-Level Provider Cache Anti-Pattern

**Status**: P1 refactor item — not resolved in current iteration; deferred to a future sprint.

**Problem**: `web/src/lib/data/provider.ts` lines 176-188 use a module-level `_provider` cache:

```typescript
let _provider: MarketDataProvider | null = null;
export function getProvider(): MarketDataProvider {
  if (_provider) return _provider;  // ← stale on env change / cross-request leak
  ...
}
```

This violates Cloudflare Workers stateless semantics: a single Worker instance handles many requests, and the cached provider outlives its env-var reading. In Next.js dev mode with hot reload, stale providers persist across HMR cycles.

**Impact**:
- Mock/Real mode switch requires process restart (env change not picked up at runtime)
- Cross-request state pollution in Workers (one user's Real provider reused for another's Mock request)
- Unit tests must `vi.resetModules()` to avoid leaking state between test cases

**Pending test cases** (3 `it.todo` in `web/tests/unit/use-mock-switch.test.ts`):

| # | Test Case | Line |
|---|-----------|------|
| TD-1 | `getProvider(env)` accepts env parameter (request-scoped factory) | `it.todo` block |
| TD-2 | `getProvider()` does NOT cache at module level (returns fresh instance when env changes) | `it.todo` block |
| TD-3 | `getProvider({USE_MOCK:'true'})` returns MockProvider regardless of process.env | `it.todo` block |

**Refactor trigger**: When a future iteration needs to promote these `it.todo` cases to `it()`, the module-level cache must be removed and `getProvider(env)` must accept an explicit env parameter (per §Critical Implementation Rule). Promoting the todos IS the refactor acceptance signal.

**Related**: ADR-0003 TECH_DEBT (same pattern in `_llm` cache at `router.ts`).
