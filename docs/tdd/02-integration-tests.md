# 02 — Integration Test Specs

> **Owner**: Engineering
> **Last reviewed**: 2026-07-20
> **Parent**: [`README.md`](./README.md)

Integration tests assert that **two or more ADRs compose correctly**. They live in `web/tests/integration/` and run in the same Vitest jsdom environment as unit tests (see [`00-test-strategy.md`](./00-test-strategy.md) §8.1).

The 6 mandatory integration scenarios below are the minimum; additional scenarios may be added as the codebase grows, but every scenario must reference at least 2 ADRs.

---

## 1. Scenario Catalog

| # | Scenario                            | ADRs involved            | File                                                          | Status      |
|---|-------------------------------------|--------------------------|---------------------------------------------------------------|-------------|
| 1 | Agent Loop end-to-end               | ADR-0004 + 0003 + 0007   | `tests/integration/agent-loop.test.ts`                        | 5 TODO stubs|
| 2 | RAG Pipeline + Vectorize            | ADR-0014 + 0010 (none) + 0011 | `tests/integration/rag-pipeline.test.ts` *(planned)*      | Not started |
| 3 | ProviderRouter + CircuitBreaker     | ADR-0006 + 0016          | `tests/integration/router-circuit-breaker.test.ts` *(planned)*| Not started |
| 4 | D1 + Memory Layer (Agent trace)     | ADR-0011 + 0005          | `tests/integration/d1-memory.test.ts` *(planned)*            | Not started |
| 5 | SSE Streaming + Agent Loop          | ADR-0015 + 0004          | `tests/integration/sse-agent-loop.test.ts` *(planned)*       | Not started |
| 6 | Community + Playbook install        | ADR-0012 + 0013          | `tests/integration/community-playbook.test.ts` *(planned)*   | Not started |

---

## 2. Common Setup

All integration tests share these conventions:

```ts
// tests/integration/_shared.ts (planned)
import { vi, beforeEach, afterEach } from "vitest";

export function setupMockEnv() {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("USE_MOCK", "true");
    vi.stubEnv("ENVIRONMENT", "test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("must not call real fetch")));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
}
```

For Real-mode opt-in scenarios, use `vi.stubEnv("USE_MOCK", "false")` inside the specific `it()` block and tag the test name with `@real`.

Fixtures referenced below are defined in [`04-test-fixtures.md`](./04-test-fixtures.md).

---

## 3. Scenario 1 — Agent Loop end-to-end

- **ADRs**: ADR-0004 (Agent Loop FSM), ADR-0003 (LLM Routing), ADR-0007 (Citation Validator), ADR-0005 (Memory Layer).
- **File**: `web/tests/integration/agent-loop.test.ts`
- **Status**: 5 `it.todo` stubs currently with `expect(true).toBe(true)` placeholders. Must be replaced with real assertions.
- **TR-IDs covered**: TR-EP01-002, TR-EP01-003, TR-EP01-004, TR-EP01-005, TR-EP01-006, TR-EP01-009.

### Existing stubs to be activated (Red → Green order)

#### 1. `completes a full loop: init → plan → execute → synthesize → final_answer`
- **Input**: `runAgentLoop("analyze NVDA earnings", ctx)` with mocked LLM returning a valid AskResponse.
- **Expected**:
  - returns `{ status: "complete", answer: AskResponse, trace: TraceStep[] }`.
  - `trace` has length ≥ 5 (one per state transition).
  - `trace[0].state === "init"`, `trace[trace.length-1].state === "final_answer"`.
- **Why**: ADR-0004 §"Validation criteria" #1 — full loop completion.

#### 2. `aborts when aggregate cost exceeds $5 (AGGREGATE_COST_CEILING_USD)`
- **Input**: mocked LLM with `cost.credits_used = 3` per call, MAX_STEPS large enough to exceed $5.
- **Expected**:
  - returns `{ status: "aborted", reason: "cost_exceeded", trace: [...] }`.
  - final trace step has `state: "aborted"`, `reason: "cost_exceeded"`.
- **Why**: ADR-0004 §"Validation criteria" #3 — $5 ceiling.

#### 3. `aborts when step count exceeds MAX_STEPS=20`
- **Input**: mocked LLM that never reaches `synthesize` (infinite tool_call loop).
- **Expected**:
  - returns `{ status: "aborted", reason: "max_steps_exceeded" }`.
  - `trace.length === 20` (one per step).
- **Why**: ADR-0004 §"Validation criteria" #2 — MAX_STEPS=20.

#### 4. `records a TraceStep for every state transition`
- **Input**: full happy-path loop.
- **Expected**:
  - each `TraceStep` has `{ step_index, state, event, cost_usd, ts }`.
  - `step_index` is monotonically increasing.
  - `cost_usd` accumulates across steps.
- **Why**: ADR-0004 §"Validation criteria" #5 — trace aggregation.

#### 5. `aborts when citation validation fails in strict mode`
- **Input**: mocked LLM returns response with 2 citations, one with `quote` not in source document; `mode: "strict_reject"`.
- **Expected**:
  - returns `{ status: "aborted", reason: "citation_validation_failed" }`.
  - trace shows transition to `"synthesize"` then `"aborted"`.
- **Why**: ADR-0004 §"Validation criteria" #4 — citation failure aborts.

### Additional integration cases (planned)

#### 6. `persists TraceSteps to MemoryStore (KV)`
- **Input**: run a happy-path loop with a `MemoryStore` mock capturing writes.
- **Expected**: `MemoryStore.put` called with key prefix `agent:{user_id}:{trace_id}:step:*` for each step.
- **Why**: ADR-0004 §"Decision" + ADR-0005 §"Validation criteria" — trace persistence.

#### 7. `uses LLM Router to select model per intent`
- **Input**: query classified as `deep_research`.
- **Expected**: `getLLM("deep_research")` called; LLM config has `cost_cap === 0.05` (cloud) or `0` (local).
- **Why**: ADR-0003 + ADR-0004 integration — router is invoked by the loop.

---

## 4. Scenario 2 — RAG Pipeline + Vectorize

- **ADRs**: ADR-0014 (RAG Pipeline), ADR-0011 (D1 — for `playbooks`/`community_playbooks` tables), ADR-0010 (none, but indicators may filter).
- **File**: `tests/integration/rag-pipeline.test.ts` *(planned)*
- **TR-IDs covered**: TR-EP03-013, TR-EP03-014, TR-EP03-015, TR-EP03-016, TR-EP03-017.

### Test cases (Red → Green order)

#### 1. `ragRetrieve queries all 5 source adapters in parallel`
- **Input**: query "NVDA earnings Q3", mock each adapter to return 2 docs.
- **Expected**: all 5 adapters called (Promise.all); total docs before fusion = 10.
- **Why**: ADR-0014 §"Validation criteria" #1 — 5 adapters in parallel.

#### 2. `Reciprocal Rank Fusion produces stable ordering across runs`
- **Input**: same 10 docs (above), same weights.
- **Expected**: two consecutive `ragRetrieve` calls return identical `results.map(r => r.id)`.
- **Why**: ADR-0014 §"Validation criteria" #2 — RRF determinism.

#### 3. `Playbooks adapter reads from D1 (not Vectorize)`
- **Input**: query that triggers playbooks adapter.
- **Expected**: D1 `prepare("SELECT ... FROM playbooks WHERE ...").bind(...).all()` called; Vectorize NOT called for this adapter.
- **Why**: ADR-0014 §"Decision" — playbooks adapter uses D1 SQL, not vector search.

#### 4. `Community adapter reads from D1 community_playbooks with content_hash dedup`
- **Input**: 2 community playbooks with same `content_hash`.
- **Expected**: only 1 returned (dedup at adapter level).
- **Why**: ADR-0014 + ADR-0012 integration — content_hash is the dedup key.

#### 5. `Vectorize query uses bge-small-en-v1.5 embeddings (384-dim)`
- **Input**: spy on `env.VECTORIZE_INDEX.query(vector)`.
- **Expected**: `vector.length === 384`.
- **Why**: ADR-0014 §"Decision" — embedding dimension.

#### 6. `adapter failure isolates: 4 of 5 adapters succeed`
- **Input**: Yahoo adapter throws.
- **Expected**: 4 other adapters' docs still returned; `errors` array contains Yahoo error.
- **Why**: ADR-0014 §"Validation criteria" #3 — graceful degradation.

---

## 5. Scenario 3 — ProviderRouter + CircuitBreaker

- **ADRs**: ADR-0006 (ProviderRouter), ADR-0016 (CircuitBreaker).
- **File**: `tests/integration/router-circuit-breaker.test.ts` *(planned)*
- **TR-IDs covered**: TR-EP02-006 (multi-source fallback), TR-EP02-009 (CircuitBreaker 5 failures → 60s cooldown). NOTE: TR-EP02-018..021 do not exist in v7 registry (EP02 caps at 017); they were phantom references removed during cross-check.

### Test cases (Red → Green order)

#### 1. `router.select opens breaker on 5 Yahoo failures`
- **Input**: `USE_MOCK=false`, Yahoo fetch throws 5 times; `router.select("AAPL", "1d")` called 5 times.
- **Expected**: 6th call does NOT call Yahoo (breaker is Open); falls through to Alpha or Mock.
- **Why**: ADR-0006 §"Decision" + ADR-0016 §"Decision" — router delegates to breaker.

#### 2. `breaker state persists in KV across requests`
- **Input**: open breaker in request A; new `ProviderRouter` instance in request B reads from KV.
- **Expected**: request B observes `state === "Open"`, skips Yahoo immediately.
- **Why**: ADR-0016 §"Decision" — KV-backed state for Workers statelessness.

#### 3. `breaker opens per-key: Yahoo open, Alpha still callable`
- **Input**: 5 Yahoo failures, then `router.select("AAPL", "1d")` should still try Alpha.
- **Expected**: Alpha call is attempted (its breaker is Closed).
- **Why**: ADR-0016 §"Decision" — per-key isolation.

#### 4. `half-open trial after 60s: success closes breaker`
- **Input**: open breaker, advance fake timers 60s, next call returns 200.
- **Expected**: state transitions `Open → Half-Open → Closed`; subsequent calls hit Yahoo directly.
- **Why**: ADR-0016 §"Decision" — 60s cooldown + trial.

#### 5. `Mock mode is exempt: failures do not open breaker`
- **Input**: `USE_MOCK=true`, 5 MockProvider failures.
- **Expected**: breaker remains Closed (Mock failures are not real).
- **Why**: ADR-0016 §"Decision" — Mock exemption.

#### 6. `router writes through to R2 on successful real-provider fetch`
- **Input**: `USE_MOCK=false`, R2 miss, Yahoo 200.
- **Expected**: `r2.put("klines/AAPL_1d.json", body)` called once.
- **Why**: ADR-0006 §"Decision" — write-through cache (ADR-0002 integration).

---

## 6. Scenario 4 — D1 + Memory Layer (Agent Trace persistence)

- **ADRs**: ADR-0011 (D1 Master Schema), ADR-0005 (Memory Layer).
- **File**: `tests/integration/d1-memory.test.ts` *(planned)*
- **TR-IDs covered**: TR-EP01-009, TR-EP03-007, TR-EP03-008, TR-EP03-009.

### Test cases (Red → Green order)

#### 1. `agent trace is persisted to D1 agent_traces table`
- **Input**: run a happy-path Agent Loop with a D1 binding stub.
- **Expected**: `d1.prepare("INSERT INTO agent_traces ...").bind(...).run()` called once with `aggregate_cost_usd` ≤ 5.
- **Why**: ADR-0011 §"Validation criteria" #3 — `agent_traces` schema + ADR-0004 trace persistence.

#### 2. `each TraceStep is persisted to D1 agent_steps table`
- **Input**: happy-path loop with 5 steps.
- **Expected**: `d1.prepare("INSERT INTO agent_steps ...").bind(...).run()` called 5 times, one per step.
- **Why**: ADR-0011 + ADR-0004 — per-step persistence for replay.

#### 3. `MemoryStore writes conversation summary to KV with TTL`
- **Input**: agent loop completes; loop calls `memory.put("conv:123", summary, { ttl: 3600 })`.
- **Expected**: KV `put` called with `expirationTtl: 3600`.
- **Why**: ADR-0005 §"Decision" — TTL on conversation memory.

#### 4. `MemoryStore.list prefixes by user_id`
- **Input**: 3 conversations for user "u1", 2 for "u2"; `memory.list("conv:u1:")`.
- **Expected**: returns exactly 3 keys.
- **Why**: ADR-0005 §"Validation criteria" #3 — prefix listing by user.

#### 5. `D1 transaction rolls back on agent_steps insert failure`
- **Input**: 3rd step insert throws.
- **Expected**: previous 2 inserts rolled back; trace status marked `"failed"`.
- **Why**: ADR-0011 §"Decision" — D1 batch transaction atomicity.

#### 6. `citations are persisted to D1 citations table with trace_id FK`
- **Input**: happy-path loop with 2 citations in the response.
- **Expected**: 2 inserts into `citations` table, each with `trace_id` matching the parent trace.
- **Why**: ADR-0011 + ADR-0007 — citation persistence for audit.

---

## 7. Scenario 5 — SSE Streaming + Agent Loop

- **ADRs**: ADR-0015 (SSE Streaming), ADR-0004 (Agent Loop), ADR-0007 (Citation Validator).
- **File**: `tests/integration/sse-agent-loop.test.ts` *(planned)*
- **TR-IDs covered**: TR-EP03-018, TR-EP03-019, TR-EP03-020, TR-EP03-021.

### Test cases (Red → Green order)

#### 1. `streamAnswer wraps runAgentLoop output as SSE events`
- **Input**: `streamAnswer("analyze NVDA", ctx)`, drain stream to end.
- **Expected**: events emitted in order: `delta` × N, `tool_call` × M (if any), `done`.
- **Why**: ADR-0015 §"Validation criteria" #1 + ADR-0004 integration.

#### 2. `adaptive mode: long-running query (>5s) auto-switches to streaming`
- **Input**: mocked LLM with 6s latency; `streamAnswer("...", { adaptive: true })`.
- **Expected**: response is a `ReadableStream` (not buffered JSON).
- **Why**: ADR-0015 §"Decision" — adaptive threshold.

#### 3. `cost_exceeded abort propagates as stream error event`
- **Input**: mocked LLM that exceeds $5 aggregate cost.
- **Expected**: stream emits `{ type: "error", reason: "cost_exceeded" }` then closes.
- **Why**: ADR-0015 + ADR-0004 §"Validation criteria" #3 integration.

#### 4. `post-stream citation validation emits citation_update event`
- **Input**: 2 citations, one with bad `quote` substring.
- **Expected**: after `done`, a `{ type: "citation_update", stripped: [bad_citation] }` event.
- **Why**: ADR-0015 §"Validation criteria" #3 + ADR-0007 integration.

#### 5. `stream cancellation via AbortSignal stops the agent loop`
- **Input**: `streamAnswer(..., { signal: abortController.signal })`, abort after 200ms.
- **Expected**: loop stops within 100ms; no further LLM calls; stream closes cleanly.
- **Why**: ADR-0015 §"Decision" — abort support + ADR-0004 cleanup.

#### 6. `partial_strip mode keeps the stream open; strict_reject aborts`
- **Input (a)**: `mode: "partial_strip"`, 1 bad citation. **Input (b)**: `mode: "strict_reject"`, 1 bad citation.
- **Expected (a)**: stream completes with stripped citation list.
- **Expected (b)**: stream aborts with `citation_validation_failed`.
- **Why**: ADR-0007 §"Decision" — mode flag propagation through stream.

---

## 8. Scenario 6 — Community + Playbook install

- **ADRs**: ADR-0012 (Community Sharing), ADR-0013 (Playbook System).
- **File**: `tests/integration/community-playbook.test.ts` *(planned)*
- **TR-IDs covered**: TR-EP07-001, TR-EP07-002, TR-EP07-003, TR-EP07-004, TR-EP08-001, TR-EP08-002.

### Test cases (Red → Green order)

#### 1. `installSharePackage creates a playbook row + playbook_versions row`
- **Input**: valid SharePackage with signature.
- **Expected**:
  - `d1.prepare("INSERT INTO playbooks ...").bind(...).run()` called once.
  - `d1.prepare("INSERT INTO playbook_versions ...").bind(...).run()` called once.
  - both rows share the same `playbook_id`.
- **Why**: ADR-0012 + ADR-0013 §"Decision" — install creates versioned playbook.

#### 2. `install deduplicates by content_hash: second install is a no-op`
- **Input**: install same package twice.
- **Expected**: second call returns the existing `playbook_id`; no duplicate insert.
- **Why**: ADR-0012 §"Validation criteria" #2 + ADR-0011 `content_hash` column.

#### 3. `install records playbook_dependencies for composite playbooks`
- **Input**: composite playbook with 3 child dependencies.
- **Expected**: 3 inserts into `playbook_dependencies` table.
- **Why**: ADR-0013 §"Decision" — dependency graph persistence.

#### 4. `install triggers cycle detection on dependencies`
- **Input**: package with cyclic dependency (A→B→A).
- **Expected**: install rejected with `cycle_detected` error.
- **Why**: ADR-0013 §"Validation criteria" #6 — topological sort on install.

#### 5. `installed playbook appears in user_playbooks table`
- **Input**: install for user "u1".
- **Expected**: row in `user_playbooks` with `(user_id, playbook_id)`.
- **Why**: ADR-0011 §"Validation criteria" #4 + ADR-0013 — ownership tracking.

#### 6. `AntiAbuseFilter runs before install`
- **Input**: package metadata contains forbidden word.
- **Expected**: install rejected with `forbidden_word` reason; no D1 inserts.
- **Why**: ADR-0012 §"Validation criteria" #3 — pre-install filter.

#### 7. `rating submission after install updates rating_avg in community_playbooks`
- **Input**: install package, submit rating=4; submit rating=5 from another user.
- **Expected**: `community_playbooks.rating_avg === 4.5`, `rating_count === 2`.
- **Why**: ADR-0012 §"Decision" — rating dedup + aggregate maintenance.

---

## 9. Test Conventions

### 9.1 File naming
- `tests/integration/{scenario-kebab-case}.test.ts`
- One `describe` block per scenario, named after the ADRs involved (e.g., `describe("ADR-0006 + ADR-0016: ProviderRouter + CircuitBreaker", ...)`).

### 9.2 ADR/TR mapping comment
Every `describe` block starts with:
```ts
/**
 * Covers: ADR-0006 (ProviderRouter), ADR-0016 (CircuitBreaker)
 * TR-IDs: TR-EP02-006 (multi-source fallback), TR-EP02-009 (CircuitBreaker cooldown)
 */
```

### 9.3 Stub boundaries
- Mock external boundaries: `fetch`, `globalThis.env`, D1 binding, KV binding, R2 binding, Vectorize binding.
- Do NOT mock the modules under test. `ProviderRouter` and `CircuitBreaker` must run their real code.
- For D1/KV/R2/Vectorize bindings, use the test doubles defined in [`04-test-fixtures.md`](./04-test-fixtures.md) §5–8.

### 9.4 Timing
- Use `vi.useFakeTimers()` for cooldown tests (Scenario 3 #4, Scenario 1 #3).
- Always `vi.useRealTimers()` in `afterEach`.

### 9.5 Cleanup
- `vi.resetModules()` in `beforeEach` to clear module-level caches (especially `_provider`, `_llm`, breaker state).
- `vi.unstubAllEnvs()` + `vi.unstubAllGlobals()` in `afterEach`.

---

## 10. CI Integration

All integration tests run as part of the `lint-and-test` job in `.github/workflows/tests.yml` (line 60–64):

```yaml
- name: Unit + Integration tests
  run: pnpm test:coverage
  env:
    USE_MOCK: "true"
    ENVIRONMENT: "test"
```

Vitest config (`web/vitest.config.ts` lines 21–24) includes both `tests/unit/**` and `tests/integration/**` in the test run. Real-mode (`@real`) tests are skipped automatically because they require explicit env setup.

---

## 11. Coverage of Integration Scenarios vs. ADRs

| ADR      | Scenario(s) covering it           |
|----------|-----------------------------------|
| ADR-0001 | (covered by unit tests only)      |
| ADR-0002 | Scenario 3 #6 (R2 write-through)  |
| ADR-0003 | Scenario 1 #7 (router invocation) |
| ADR-0004 | Scenario 1, Scenario 5            |
| ADR-0005 | Scenario 4, Scenario 1 #6         |
| ADR-0006 | Scenario 3                        |
| ADR-0007 | Scenario 1 #5, Scenario 5 #4–#6   |
| ADR-0008 | (covered by unit tests only)      |
| ADR-0009 | (covered by unit tests only; E2E in EP04) |
| ADR-0010 | (covered by unit tests only)      |
| ADR-0011 | Scenario 4, Scenario 6            |
| ADR-0012 | Scenario 6                        |
| ADR-0013 | Scenario 6                        |
| ADR-0014 | Scenario 2                        |
| ADR-0015 | Scenario 5                        |
| ADR-0016 | Scenario 3                        |

Every ADR that involves multi-module behavior is covered by at least one integration scenario. ADRs that are pure single-module logic (0001, 0008, 0009, 0010) are covered by unit tests only.

---

## 12. Change Log

| Date       | Change                                                                    | Author      |
|------------|---------------------------------------------------------------------------|-------------|
| 2026-07-20 | Initial 6 integration scenarios defined across 16 ADRs.                   | Engineering |
