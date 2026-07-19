# ADR-0016: Circuit Breaker for External Data Sources

## Status

Accepted

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + KV |
| **Domain** | Core (Data Layer / Reliability) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP02 §ID-9, `web/src/lib/data/circuit-breaker.ts`, ADR-0001 (USE_MOCK), ADR-0002 (R2 Cache) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | 5 consecutive failures trip circuit; tripped source is skipped for 60s; probe request after cooldown succeeds → reset, fails → re-trip; Mock source never trips |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (USE_MOCK dual-mode switch — Mock source exempt from circuit breaker), ADR-0002 (R2 Cache — R2 miss triggers RealProvider with circuit breaker protection) |
| **Enables** | EP02 data reliability (multi-source fallback with automatic source isolation); TR-EP02-009 |
| **Blocks** | EP02 Data Layer Phase 1 stories for fallback chain; ProviderRouter integration |
| **Ordering Note** | Must be Accepted before ProviderRouter implementation stories start. Depends on KV namespace binding in `wrangler.toml`. |

## Context

### Problem Statement

The multi-source fallback chain (Yahoo → Alpha Vantage → Polygon → Mock) provides resilience against individual source outages, but without a circuit breaker:

1. **Wasted latency**: Every request to a down source incurs full timeout latency (5–30s) before falling through to the next source.
2. **Cascading delays**: If Yahoo is down, every request pays the Yahoo timeout cost before reaching Alpha Vantage. With 3 sources down, cumulative timeout exceeds Worker CPU limit (30s).
3. **No auto-recovery**: A source that was temporarily down stays in the fallback chain's rotation, continuing to waste requests even after it recovers.
4. **No source isolation**: Repeated failures from one source can mask failures from another (e.g., Yahoo rate-limit looks same as Yahoo outage).

EP02 §ID-9 specifies: "CircuitBreaker: 5 failures → 60s cooldown". The PRD already stubs a `CircuitBreaker` class, but it uses in-memory `Map` state which violates the Cloudflare Workers stateless constraint (ADR-0001 §Critical Implementation Rule, FP-0001/FP-0002).

### Constraints

- **Cloudflare Workers stateless**: No module-level `Map` or in-process state. Circuit breaker state must survive across Worker invocations and be visible to all instances. KV is the prescribed state store.
- **KV eventual consistency**: KV writes are eventually consistent (~60s propagation). For circuit breaker, this is acceptable because: (a) cooldown is 60s anyway, (b) worst case is a source gets one extra failure before circuit trips — not dangerous.
- **KV TTL auto-expiry**: KV supports per-key TTL, which maps perfectly to cooldown semantics. When a tripped key's TTL expires, it disappears from KV — the source is automatically un-tripped without a cleanup job.
- **KV read latency**: ~5–20ms per read. Circuit breaker check adds this to every data request. Acceptable given it saves 5–30s timeout on a tripped source.
- **ADR-0001 USE_MOCK**: Mock source never fails (reads local JSON), so it must never be tracked by the circuit breaker. A tripped Mock source would break the demo.
- **ADR-0002 R2 Cache**: R2 cache hit bypasses the data provider entirely, so circuit breaker is only consulted on R2 miss. R2 miss → circuit breaker check → source fetch.

### Requirements

- TR-EP02-009: 5 consecutive failures → trip circuit for 60s cooldown
- Per-source tracking: each data source (yahoo, alpha_vantage, polygon) has an independent circuit
- Half-open state: after cooldown expires, one probe request is allowed; success → reset, failure → re-trip
- Mock source exempt: never tracked, never trips
- KV-backed state: no module-level singletons
- Integration point: `ProviderRouter.getKlines()` checks `isTripped(source)` before attempting each source in the fallback chain

## Decision

**Adopt a three-state circuit breaker (Closed → Open → Half-Open) with KV-backed state. KV TTL provides automatic cooldown expiry. Half-open probe allows recovery detection without flooding a recovering source.**

### State Machine

```
                    5 consecutive failures
  ┌──────────┐ ──────────────────────────── ► ┌──────────┐
  │  CLOSED  │                               │   OPEN   │
  │ (normal) │ ◄ ──────────────────────── ── │ (tripped)│
  └──────────┘   probe success (reset)       └──────────┘
       ▲                                        │
       │                                        │ 60s cooldown expires
       │                                        ▼
       │                                  ┌───────────┐
       │   probe success                  │ HALF-OPEN  │
       │ ─────────────────────────────── │  (probing) │
       │                                  └───────────┘
       │                                        │
       └ ── probe failure ──────────────────────┘
                   (re-trip to OPEN)
```

| State | Behavior |
|-------|----------|
| **CLOSED** | Source is healthy. All requests go through. Failures are counted. On 5th consecutive failure → transition to OPEN. |
| **OPEN** | Source is tripped. All requests are rejected immediately (skip in fallback chain). After 60s cooldown (KV TTL expiry) → transition to HALF-OPEN. |
| **HALF-OPEN** | One probe request is allowed. If it succeeds → transition to CLOSED (reset failure count). If it fails → transition to OPEN (re-trip with fresh 60s cooldown). |

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ ProviderRouter.getKlines(symbol, timeframe)                      │
│                                                                  │
│   for source in [yahoo, alpha_vantage, polygon, mock]:           │
│     1. if source === "mock" → always attempt (circuit exempt)    │
│     2. if circuitBreaker.isTripped(source) → skip source         │
│     3. try:                                                      │
│          data = await source.getKlines(symbol, timeframe)        │
│          circuitBreaker.recordSuccess(source)  // reset or probe │
│          return data                                             │
│        catch:                                                    │
│          circuitBreaker.recordFailure(source)  // count or trip  │
│          continue  // try next source                            │
│                                                                  │
│   return MockProvider.getKlines(symbol, timeframe)  // final fallback │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ CircuitBreaker (KV-backed, request-scoped)                       │
│                                                                  │
│   isTripped(source):                                             │
│     if source === "mock" → return false  // never tripped        │
│     state = await kv.get(`circuit:${source}`)                    │
│     if state === null → return false  // no key = CLOSED         │
│     if state.status === "open" → return true                     │
│     if state.status === "half-open" → return false (allow probe)│
│                                                                  │
│   recordFailure(source):                                         │
│     if source === "mock" → return  // exempt                    │
│     state = await kv.get(`circuit:${source}`)                    │
│     if state.status === "half-open" → re-trip (write OPEN + TTL)│
│     else → increment count; if count >= 5 → trip (write OPEN)   │
│                                                                  │
│   recordSuccess(source):                                         │
│     if source === "mock" → return  // exempt                    │
│     state = await kv.get(`circuit:${source}`)                    │
│     if state.status === "half-open" → delete key (→ CLOSED)     │
│     else → delete key (reset count to 0, → CLOSED)              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ Workers KV: CIRCUIT_BREAKER_KV                                   │
│                                                                  │
│   Key format: circuit:{source_name}                              │
│   Value: JSON { "count": 3, "lastFail": "2026-07-19T...",       │
│                  "status": "open", "trippedAt": "2026-07-19T..."}│
│   TTL: 60s (for OPEN state — auto-expiry = cooldown)            │
│         no TTL (for HALF-OPEN — explicit delete on probe result) │
│                                                                  │
│   No key exists → source is CLOSED (healthy)                    │
│   Key exists with status="open" → source is OPEN (tripped)      │
│   Key exists with status="half-open" → source is HALF-OPEN      │
└──────────────────────────────────────────────────────────────────┘
```

### Key Interfaces

```typescript
// web/src/lib/data/circuit-breaker.ts

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerEntry {
  count: number;          // consecutive failure count
  lastFail: string;      // ISO 8601 timestamp of last failure
  status: "open" | "half-open";
  trippedAt: string;     // ISO 8601 timestamp when circuit was tripped
}

export interface CircuitBreakerConfig {
  threshold: number;      // consecutive failures to trip (default: 5)
  cooldownMs: number;     // cooldown duration in ms (default: 60000)
  kvNamespace: KVNamespace;  // Cloudflare KV binding
}

/** Sources exempt from circuit breaker — never tracked, never tripped */
export const CIRCUIT_EXEMPT_SOURCES = new Set(["mock"]);

export class CircuitBreaker {
  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Check if a source's circuit is tripped.
   * Returns true if source is in OPEN state (should be skipped).
   * Returns false if CLOSED or HALF-OPEN (request allowed).
   * Mock source always returns false.
   */
  async isTripped(source: string): Promise<boolean>;

  /**
   * Record a failure for the given source.
   * - CLOSED: increment count; if count >= threshold → trip (write OPEN to KV with TTL)
   * - HALF-OPEN: re-trip immediately (write OPEN to KV with fresh TTL)
   * - OPEN: no-op (already tripped)
   * Mock source: no-op.
   */
  async recordFailure(source: string): Promise<void>;

  /**
   * Record a success for the given source.
   * - HALF-OPEN: probe succeeded → delete KV key (→ CLOSED)
   * - CLOSED: reset failure count → delete KV key
   * - OPEN: should not happen (isTripped would have skipped), but delete KV key if it does
   * Mock source: no-op.
   */
  async recordSuccess(source: string): Promise<void>;

  /**
   * Force-reset a source's circuit (admin/monitoring use).
   * Deletes the KV key regardless of state.
   */
  async reset(source: string): Promise<void>;

  /**
   * Get current state of a source's circuit (monitoring/debugging).
   * Returns "closed" if no KV key exists.
   */
  async getState(source: string): Promise<CircuitState>;
}
```

### ProviderRouter Integration

```typescript
// web/src/lib/data/provider-router.ts

export class ProviderRouter implements MarketDataProvider {
  constructor(
    private sources: SourceWithPriority[],
    private circuitBreaker: CircuitBreaker,
    private r2?: R2ObjectStorage,  // from ADR-0002
  ) {}

  async getKlines(symbol: string, timeframe: "1d" | "5m"): Promise<KlineResponse> {
    // 1. Check R2 cache (ADR-0002) — only for whitelisted symbols
    if (shouldCacheR2(symbol) && this.r2) {
      const cached = await this.r2.get(`klines/${symbol}_${timeframe}.json`);
      if (cached && !isExpired(cached, R2_TTL.PRICE)) {
        return JSON.parse(cached);  // cache hit → bypass circuit breaker entirely
      }
    }

    // 2. Try each source in priority order, respecting circuit breaker
    for (const source of this.sources.sort((a, b) => a.priority - b.priority)) {
      if (await this.circuitBreaker.isTripped(source.name)) {
        continue;  // circuit open → skip this source
      }

      try {
        const data = await source.provider.getKlines(symbol, timeframe);
        await this.circuitBreaker.recordSuccess(source.name);
        return data;
      } catch (error) {
        await this.circuitBreaker.recordFailure(source.name);
        continue;  // try next source
      }
    }

    // 3. All sources failed or tripped → fall back to Mock
    return new MockProvider().getKlines(symbol, timeframe);
  }
}
```

### Critical Implementation Rules

1. **No module-level state**: The PRD-stubbed `CircuitBreaker` class uses `private failures = new Map<...>()`. This violates Cloudflare Workers stateless semantics (same anti-pattern as ADR-0001 §TECH_DEBT). All state must live in KV. The `CircuitBreaker` class must be instantiated per-request with a KV namespace binding.

2. **KV key format is canonical**: `circuit:{source_name}` where `source_name` is one of `yahoo`, `alpha_vantage`, `polygon`. No other formats. The prefix `circuit:` prevents collision with other KV usage.

3. **KV TTL = cooldown**: When a circuit trips (→ OPEN), the KV key is written with `expirationTtl: 60`. After 60s, the key auto-expires and disappears. On the next `isTripped()` call, the key is absent → state is CLOSED. However, before treating absence as CLOSED, we must check if the key was recently deleted (success) vs expired (cooldown ended). The `trippedAt` timestamp in the value enables this distinction: if key expired AND `trippedAt + 60s < now`, the cooldown has genuinely elapsed → transition to HALF-OPEN (write key with `status: "half-open"`, no TTL).

4. **Half-open probe is single-flight**: Only one request should be allowed through in HALF-OPEN state. If multiple concurrent requests see HALF-OPEN, the first one wins the probe; subsequent ones should treat the source as tripped (skip). Implementation: `isTripped()` returns `false` for HALF-OPEN, then immediately transitions to a "probing" state by updating the KV key with `status: "half-open-probing"`. If `isTripped()` sees `half-open-probing`, it returns `true` (skip).

5. **Mock source is always exempt**: `CIRCUIT_EXEMPT_SOURCES` contains `"mock"`. All `CircuitBreaker` methods must short-circuit for exempt sources. This ensures ADR-0001's guarantee: Mock mode always works, never blocked by circuit breaker.

6. **Count resets on success**: A single successful request resets the consecutive failure count to 0. This prevents a source with intermittent failures (1 fail, 1 success, 1 fail, …) from ever tripping. Only 5 **consecutive** failures trigger a trip.

### KV Binding Configuration

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "CIRCUIT_BREAKER_KV"
id = "<kv_namespace_id>"
preview_id = "<kv_preview_id>"  # for wrangler dev
```

```typescript
// web/src/lib/data/circuit-breaker.ts — constructor receives KV
const circuitBreaker = new CircuitBreaker({
  threshold: 5,
  cooldownMs: 60_000,
  kvNamespace: env.CIRCUIT_BREAKER_KV,  // from getRequestContext().env
});
```

## Alternatives Considered

### Alternative 1: In-memory Map (PRD stub)

- **Description**: The PRD-stubbed `CircuitBreaker` with `Map<string, { count, lastFail }>` in process memory.
- **Pros**: Zero latency (no KV read), simple implementation.
- **Cons**: Violates Workers stateless constraint; state lost on Worker restart; not shared across Worker instances; same anti-pattern as ADR-0001 §TECH_DEBT.
- **Rejection Reason**: Directly violates FP-0001/FP-0002 (no module-level state on Workers). Would require the same TECH_DEBT migration as ADR-0001.

### Alternative 2: Durable Objects

- **Description**: Use a Durable Object per source to maintain circuit breaker state with strong consistency.
- **Pros**: Strong consistency (no eventual-consistency window); single-flight probe is trivial (DO handles concurrency); atomic counter increments.
- **Cons**: Durable Objects have per-request-cost ($0.15/million requests); adds deployment complexity; overkill for a simple counter + timestamp; requires `wrangler.toml` DO migration.
- **Rejection Reason**: Premature complexity and cost for Phase 1. KV eventual consistency is acceptable (worst case: one extra failure before trip). Revisit if strict consistency becomes necessary.

### Alternative 3: Fixed cooldown without half-open

- **Description**: After 5 failures, trip for 60s. After 60s, automatically reset to CLOSED (no probe).
- **Pros**: Simpler — no HALF-OPEN state, fewer KV operations.
- **Cons**: If source is still down after cooldown, all requests hammer it again, then wait for 5 more failures to re-trip. Creates a periodic thundering herd every 60s.
- **Rejection Reason**: Half-open probe is essential to avoid flooding a still-down source. Without it, the circuit oscillates between OPEN and CLOSED every 60s, wasting requests and adding latency.

### Alternative 4: D1-backed state

- **Description**: Store circuit breaker state in D1 (SQL database) instead of KV.
- **Pros**: Strong consistency; familiar SQL interface; can query all circuit states with one SQL statement.
- **Cons**: D1 read latency is higher than KV (~10-30ms vs ~5-20ms); D1 has lower free-tier limits (5M reads/day vs KV's effectively unlimited); circuit breaker doesn't need SQL features (no joins, no complex queries).
- **Rejection Reason**: KV is the better fit: simpler, faster, TTL auto-expiry eliminates cleanup logic, and circuit breaker doesn't need relational features.

## Consequences

### Positive

- **Automatic source isolation**: A failing source is removed from the fallback chain within 5 failures, eliminating timeout latency waste.
- **Auto-recovery via half-open probe**: Source recovery is detected within one probe request after cooldown, restoring it to the fallback chain without manual intervention.
- **KV TTL auto-expiry**: No cron job or cleanup logic needed. Tripped keys disappear automatically after cooldown.
- **Per-source independence**: Yahoo outage doesn't affect Alpha Vantage or Polygon. Each source has its own circuit.
- **Observable**: KV keys can be listed for monitoring. Dashboard can show circuit states for all sources.
- **Consistent with project constraints**: KV-backed state complies with Workers stateless semantics (FP-0001/FP-0002).

### Negative

- **KV read latency on every request**: ~5-20ms added to each data request for the `isTripped()` check. Mitigated by: (a) this latency is negligible compared to API call latency (200-500ms), (b) R2 cache hit bypasses circuit breaker entirely (ADR-0002).
- **KV eventual consistency**: A recently tripped source might not be visible to all Worker instances for ~60s. Worst case: 1-2 extra failing requests before all instances see the trip. Acceptable for this use case.
- **Half-open single-flight complexity**: Ensuring only one probe request in HALF-OPEN state requires an extra KV write (status transition to `half-open-probing`). Adds ~10ms latency on the probe path.
- **KV write on every failure**: Each `recordFailure()` call writes to KV. In a sustained outage, this is one KV write per request per failing source. KV free tier (1K writes/day) could be exhausted under heavy load. Mitigation: batch writes or throttle `recordFailure()` calls.

### Risks

- **Risk**: KV write limit exhaustion during sustained multi-source outage.
  - **Mitigation**: Throttle `recordFailure()` — only write if `now - lastWrite > 10s` (at most 1 write per 10s per source). Use a local in-request debounce (not module-level state — pass a per-request `Map` through the call chain).
- **Risk**: KV namespace not bound in `wrangler.toml` — `CIRCUIT_BREAKER_KV` is undefined → circuit breaker throws on construction.
  - **Mitigation**: Constructor validates `kvNamespace` is truthy; if falsy, log warning and operate in pass-through mode (never trip, always return `isTripped() = false`). This degrades gracefully: no circuit breaker protection, but no crashes.
- **Risk**: Half-open probe fails repeatedly, causing circuit to oscillate between OPEN and HALF-OPEN every 60s.
  - **Mitigation**: On re-trip from HALF-OPEN, double the cooldown (exponential backoff: 60s → 120s → 240s, cap at 600s). This reduces probe frequency for persistently down sources. Reset backoff on successful probe.
- **Risk**: Source name mismatch — KV key `circuit:yahoo` vs `circuit:Yahoo` vs `circuit:yfinance`.
  - **Mitigation**: `SourceName` is a string literal union type: `"yahoo" | "alpha_vantage" | "polygon" | "mock"`. All source names are defined in a single `const SOURCE_NAMES` array. No free-form strings.

## GDD Requirements Addressed

| TR-ID | Requirement | How This ADR Addresses It |
|-------|-------------|---------------------------|
| TR-EP02-009 | "CircuitBreaker: 5 failures → 60s cooldown" | Threshold: 5 consecutive failures; Cooldown: 60s via KV TTL |
| EP02 §2.2 | Multi-source fallback chain (Yahoo → Alpha → Polygon → Mock) | Circuit breaker protects each source independently; tripped sources are skipped in fallback order |
| EP02 §2.2 | "Mock 模式下读 K 线 / 不发起任何外部 HTTP 请求" | Mock source is circuit-breaker-exempt; never tracked, never tripped |
| EP02 §3 User Story 5 | "R2 缓存自动启用" | R2 cache hit bypasses circuit breaker (ADR-0002 integration) |
| ADR-0001 §Critical | "Do NOT cache the provider at module level" | CircuitBreaker is request-scoped (KV-backed, no module-level Map) |
| ADR-0002 §Decision | "R2 miss → fetch Yahoo → write R2" | R2 miss path now includes circuit breaker check before source fetch |

## Performance Implications

| Operation | Latency | Notes |
|-----------|---------|-------|
| `isTripped()` — key absent (CLOSED) | ~5-10ms | KV read, key not found |
| `isTripped()` — key present (OPEN) | ~5-10ms | KV read, key found |
| `recordFailure()` — count < 5 | ~10-15ms | KV read + KV write (increment count) |
| `recordFailure()` — count = 5 (trip) | ~10-15ms | KV write with TTL=60s |
| `recordSuccess()` — reset | ~10-15ms | KV delete |
| Source fetch bypass (tripped) | 0ms | No HTTP request to failing source |
| Source timeout (no circuit breaker) | 5-30s | The latency this ADR eliminates |

**Net impact**: +5-15ms per request (circuit breaker check), but saves 5-30s per request when a source is tripped. Break-even after 1 avoided timeout.

## Migration Plan

The PRD-stubbed `CircuitBreaker` class uses in-memory `Map`. Migration steps:

1. Add `CIRCUIT_BREAKER_KV` namespace binding to `wrangler.toml`
2. Refactor `CircuitBreaker` to accept `KVNamespace` in constructor (replace `Map` with KV reads/writes)
3. Add `CIRCUIT_EXEMPT_SOURCES` constant with `"mock"`
4. Implement `isTripped()` with KV read + HALF-OPEN transition logic
5. Implement `recordFailure()` with KV read-modify-write + threshold check + TTL write
6. Implement `recordSuccess()` with KV delete (reset)
7. Implement half-open single-flight guard (`half-open-probing` status)
8. Implement exponential backoff on re-trip (optional, Phase 1.5)
9. Integrate `CircuitBreaker` into `ProviderRouter` (check before each source attempt)
10. Add unit tests (mock KV with `Map`-based stub)
11. Add integration test with real KV (wrangler dev)

## Validation Criteria

- [ ] 5 consecutive `recordFailure("yahoo")` calls → `isTripped("yahoo")` returns `true`
- [ ] After 60s cooldown (KV TTL expiry) → `isTripped("yahoo")` returns `false` (HALF-OPEN)
- [ ] `recordSuccess("yahoo")` in HALF-OPEN → circuit resets to CLOSED
- [ ] `recordFailure("yahoo")` in HALF-OPEN → circuit re-trips to OPEN with fresh 60s TTL
- [ ] `isTripped("mock")` always returns `false` regardless of failure count
- [ ] `recordFailure("mock")` is a no-op
- [ ] `recordSuccess("yahoo")` in CLOSED resets failure count to 0
- [ ] 4 failures + 1 success + 5 failures → circuit does NOT trip after 4+5 (count reset on success)
- [ ] Each source is independent: Yahoo tripped does not affect Alpha Vantage
- [ ] KV key format: `circuit:{source_name}` → JSON `{ count, lastFail, status, trippedAt }`
- [ ] No module-level state (request-scoped instantiation only)
- [ ] CircuitBreaker degrades gracefully if KV namespace is not bound (pass-through mode)
- [ ] ProviderRouter skips tripped sources in fallback chain
- [ ] R2 cache hit bypasses circuit breaker check entirely

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) — Mock source is circuit-breaker-exempt
- **ADR-0002** (R2 Cache whitelist) — R2 cache hit bypasses circuit breaker; R2 miss triggers circuit-breaker-protected fetch
- EP02 §ID-9 — originating requirement (CircuitBreaker: 5 failures → 60s cooldown)
- EP02 §2.2 — multi-source fallback chain design
- architecture.md §5 — data flow context

---

> **Last Updated**: 2026-07-19
