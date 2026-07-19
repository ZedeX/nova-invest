# Architecture Review v5 — Nova Invest

**Date:** 2026-07-20
**Reviewer:** Architecture Review skill (fifth pass)
**Mode:** full
**Verdict:** ⚠️ **CONCERNS** (carried from v4; coverage stable at 84.6%, all v4 conflicts resolved, 4 new cross-ADR conflicts surfaced from the 3 new ADRs)
**Post-V5 Fix Status:** ✅ **PASS** — All 4 v5 conflicts (C19/C20/C21/C22) resolved via ADR amendments; ADR-0014/0015/0016 promoted to Accepted; coverage 85.4% (111 full + 6 partial + 13 gaps); 3 stale GDD sections fixed; architecture.md ADR Index updated; traceability-index.md and tr-registry.yaml updated to v7. 0 open conflicts. All 16 ADRs Accepted.

---

## Executive Summary

| Metric | v4 | **v5** | Δ |
|---|---|---|---|
| ADRs reviewed | 13 | **16** | +3 |
| Total TRs | 130 | **130** | 0 |
| Covered (full) | 107 (82.3%) | **110 (84.6%)** | +3 |
| Partial | 7 (5.4%) | **7 (5.4%)** | 0 |
| Gaps | 16 (12.3%) | **13 (10.0%)** | −3 |
| New conflicts | 3 (C16, C17, C18) | **4 new (C19, C20, C21, C22)** | +4 |
| Conflicts resolved | 5 (C14–C18) | **5 (C14–C18 still resolved)** | 0 |
| ADRs Accepted | 4/13 | **13/16** | +9 (0004–0013 promoted) |
| architecture.md ADR links | 13/13 | **13/16 (STALE)** | −3 (0014/0015/0016 missing) |

**[COMPUTED]** Coverage rose 82.3% → 84.6% as 3 new ADRs (0014/0015/0016) closed 3 former gap TRs (TR-EP03-008, TR-EP03-019, TR-EP02-009). 9 ADR promotions (0004–0013) consolidate the Foundation+Feature layers as Accepted.

**[INFERRED]** Verdict remains CONCERNS (not PASS) because: (1) 3 new ADRs (0014/0015/0016) are still Proposed — promotion blocked by 4 new cross-ADR conflicts they introduced; (2) architecture.md §11 ADR Index is stale (missing 0014/0015/0016, wrong statuses for 0004–0013); (3) 13 gaps remain including the long-tail implementation details (test seams, Grafana trace, prompt versioning, MCP placeholder). Verdict is not FAIL: no blocking ADR-vs-ADR data/state conflicts, no dependency cycles, Foundation ADRs all Accepted, coverage is stable and partials/gaps are scoped to Phase 1.5+/Phase 2 work.

---

## Phase 1 — Artifacts Loaded

- **[KNOWN]** 8 GDDs/Epics loaded: `docs/prd/epic/01_AgentHarness.md` … `08_Playbook_System.md`
- **[KNOWN]** 16 ADRs loaded: ADR-0001 through ADR-0016
- **[KNOWN]** TR registry v6 (`docs/architecture/tr-registry.yaml`): 130 TRs, 117 with owner_adr (110 full + 7 partial)
- **[KNOWN]** Architecture doc (`docs/architecture/architecture.md`) v1.0: §11 ADR Index **STALE** (lists only ADR-0001..0013; statuses wrong for 9 ADRs)
- **[KNOWN]** v4 review report: `docs/architecture/architecture-review-2026-07-19-v4.md`
- **[KNOWN]** v6 traceability index: `docs/architecture/traceability-index.md`
- **[KNOWN]** Engine: Next.js 16.2.10 + Cloudflare Workers 4 + D1 + R2 + Vectorize + KV
- **[KNOWN]** `design/accessibility-requirements.md`: Present
- **[KNOWN]** `design/ux/interaction-patterns.md`: Present
- **[KNOWN]** `docs/engine-reference/`: Absent
- **[KNOWN]** `docs/consistency-failures.md`: Absent
- **[KNOWN]** `tests/integration/` (project root): Has README.md only — actual integration tests live in `web/tests/integration/agent-loop.test.ts` (pnpm workspace layout; structurally OK)

Loaded 8 GDDs, 16 ADRs, engine: Next.js 16.2.10 + Cloudflare Workers 4.

---

## Phase 2 — Technical Requirements Registry

**[COMPUTED]** 130 TRs verified against `tr-registry.yaml` v6. No new TRs discovered; no deprecated TRs.

| Epic | Title | TR Count |
|---|---|---|
| EP01 | Agent Harness | 15 |
| EP02 | Data Layer | 17 |
| EP03 | Ask Agent | 21 |
| EP04 | Strategy DSL | 17 |
| EP05 | Dashboard | 19 |
| EP06 | Broker Integration | 13 |
| EP07 | Share & Community | 14 |
| EP08 | Playbook System | 14 |
| **Total** | | **130** |

---

## Phase 3 — Traceability Matrix (Coverage)

### Coverage by Epic

| Epic | TR Count | ✅ Covered | ⚠️ Partial | ❌ Gap | % Covered (full) |
|---|---|---|---|---|---|
| EP01 Agent Harness | 15 | 8 | 2 | 5 | 53.3% |
| EP02 Market Data | 17 | 13 | 1 | 3 | 76.5% |
| EP03 Ask Agent | 21 | 16 | 1 | 4 | 76.2% |
| EP04 Strategy DSL | 17 | 17 | 0 | 0 | **100%** |
| EP05 Dashboard | 19 | 19 | 0 | 0 | **100%** |
| EP06 Broker Integration | 13 | 12 | 0 | 1 | 92.3% |
| EP07 Share & Community | 14 | 14 | 0 | 0 | **100%** |
| EP08 Playbook System | 14 | 11 | 3 | 0 | 78.6% |
| **Total** | **130** | **110** | **7** | **13** | **84.6%** |

**[COMPUTED]** Coverage unchanged vs v6 registry. EP04, EP05, EP07 hold 100% full coverage. EP01 still the weakest (53.3%) due to 5 implementation-detail gaps (test seams, coverage targets, Grafana trace, foundation architecture).

### Coverage by ADR

| ADR | Title | Status | TRs Covered (full) | TRs Partial |
|---|---|---|---|---|
| ADR-0001 | Use-Mock Dual-Mode Switch | Accepted | 9 | 0 |
| ADR-0002 | R2 Cache Whitelist | Accepted | 6 | 0 |
| ADR-0003 | LLM Routing + Cost Cap | Accepted | 9 | 0 |
| ADR-0004 | Agent Loop Design | Accepted | 2 | 2 |
| ADR-0005 | Memory Layer | Accepted | 4 | 0 |
| ADR-0006 | Tool Protocol | Accepted | 2 | 1 |
| ADR-0007 | Citation Validator | Accepted | 3 | 1 |
| ADR-0008 | Strategy DSL Schema | Accepted | 9 | 0 |
| ADR-0009 | Backtest Engine + PaperBroker | Accepted | 15 | 0 |
| ADR-0010 | Dashboard Layout + Widgets | Accepted | 19 | 0 |
| ADR-0011 | D1 Schema Master | Accepted | 8 | 3 |
| ADR-0012 | Community UGC + Moderation | Accepted | 11 | 0 |
| ADR-0013 | Playbook System | Accepted | 10 | 0 |
| ADR-0014 | Ask RAG Pipeline | Proposed | 1 | 0 |
| ADR-0015 | SSE Streaming | Proposed | 1 | 0 |
| ADR-0016 | Circuit Breaker | Proposed | 1 | 0 |
| (no ADR) | — | — | 0 (gap) | — |
| **Total** | | | **110** | **7** |

> Per-ADR totals: 110 full + 7 partial = 117 TRs with owner_adr. 130 − 117 = 13 gaps.

**[INFERRED]** The 3 new ADRs (0014/0015/0016) each claim only 1 TR in the registry, but their actual scope is broader. Coverage could be tightened by registering additional owner_adr entries:
- ADR-0014 also addresses parts of TR-EP03-007 (validateCitations needs RAG context — currently sole-owned by ADR-0007) and TR-EP03-020 (citations array sourced from RAG). Currently registered as sole owner of TR-EP03-008 only.
- ADR-0015 also addresses TR-EP03-019 (sole owner) and parts of TR-EP03-013 (Cost Budget degrade chain during streaming — currently sole-owned by ADR-0003).
- ADR-0016 also addresses TR-EP02-009 (sole owner) and reinforces TR-EP02-008 (multi-source fallback — currently partial on ADR-0006 only; should add ADR-0016 as co-owner to upgrade from partial → full).

**[INFERRED]** If these co-ownership updates were applied, coverage would rise to ~117/130 (90%) full + 4 partial + 9 gaps. Not done in this review — left for the post-v5 fix batch.

### Gap TRs (13 total, no owner_adr)

| TR-ID | Epic | Requirement | Domain |
|---|---|---|---|
| TR-EP01-001 | EP01 | 9-layer architecture | Foundation |
| TR-EP01-002 | EP01 | Supervisor-Worker multi-agent pattern | Orchestration |
| TR-EP01-010 | EP01 | Test seams: MockLLMClient/MockTool/MockSubAgent | Testing |
| TR-EP01-011 | EP01 | Coverage targets: Unit 80%, Integration 70%, E2E critical paths | Testing |
| TR-EP01-015 | EP01 | Full-link trace viewable in Grafana | Observability |
| TR-EP02-012 | EP02 | gen:mock script one-shot generates 10 symbols | Data Layer |
| TR-EP02-014 | EP02 | Contract test: Mock and Real return same structure | Testing |
| TR-EP02-015 | EP02 | R2 cache hit rate >60% in production Real mode | Data Layer |
| TR-EP03-006 | EP03 | AnswerWithCitations interface | Ask Agent |
| TR-EP03-014 | EP03 | Prompt template versioning | Ask Agent |
| TR-EP03-015 | EP03 | Mock QA samples ≥20 covering 4 intents | Ask Agent |
| TR-EP03-021 | EP03 | Worker entry: /api/ask handler | Ask Agent |
| TR-EP06-011 | EP06 | MCP broker server placeholder (Phase 2) | Broker |

> **[INFERRED]** None of these 13 gaps block Vertical Slice readiness. They are implementation details (test seams, scripts, UX entry points), operational SLOs (R2 hit rate), or Phase 2 placeholders (MCP broker server). They do not require dedicated ADRs — they will be covered by story files and the implementation layer.

### Partial Coverage TRs (7 total)

| TR-ID | Epic | owner_adr | Coverage Note |
|---|---|---|---|
| TR-EP01-008 | EP01 | ADR-0007 | ADR-0007 enforces hallucination ≤5%; Eval Golden Set infra (200+ cases) not ADR'd |
| TR-EP01-009 | EP01 | ADR-0004 | ADR-0004 defines TraceStep; full Trace aggregation deferred to ADR-0014 |
| TR-EP02-008 | EP02 | ADR-0006 | ADR-0006 specifies source switching; CircuitBreaker now ADR'd by ADR-0016 (could upgrade to full by adding ADR-0016 co-ownership) |
| TR-EP03-012 | EP03 | ADR-0004 | ADR-0004 provides generic 6-state loop; Ask-specific StepHandlers not ADR'd |
| TR-EP08-004 | EP08 | ADR-0011 | ADR-0011 provides playbook_dependencies.weight; app-level sum validation not ADR'd |
| TR-EP08-006 | EP08 | ADR-0011 | ADR-0011 provides playbook_versions.version; app-level semver.valid() not ADR'd |
| TR-EP08-008 | EP08 | ADR-0011 | ADR-0011 Migration 006 defines 3 tables; user_playbooks merged into shared table |

---

## Phase 4 — Cross-ADR Conflict Detection

### Resolved v4 Conflicts ✅ (verified still resolved)

| Conflict | Type | Status |
|---|---|---|
| C14 | Schema/Pattern (FP-0009 violation) | ✅ RESOLVED (ADR-0011 §Rules #6) |
| C15 | Integration contract (enum drift) | ✅ RESOLVED (ADR-0004 amended with "citation_validation_failed") |
| C16 | Schema (content_hash column missing) | ✅ RESOLVED — `content_hash TEXT` confirmed in ADR-0011 §community_playbooks |
| C17 | Pattern (Function() vs jsep) | ✅ RESOLVED — Phase 2 migration plan documented in ADR-0013 §Risks |
| C18 | Dependency metadata (stale Depends On) | ✅ RESOLVED — ADR-0004 §Depends On updated with ADR-0011 transitive |

### New v5 Conflicts

#### Conflict C19 — ADR-0014 Migration 009 not added to ADR-0011 §Master Schema — 🔴 OPEN

**Type:** Schema / cross-ADR dependency conflict
**ADRs involved:** ADR-0014 (Ask RAG Pipeline) vs ADR-0011 (D1 Schema Master)

**ADR-0014 claims** (§D1 Schema Addition): "This ADR adds two new tables to ADR-0011 §Master Schema" — `rag_chunks` and `news_articles` via `Migration: 009_rag_metadata.sql`. §Migration Plan step 8: "Create `web/migrations/009_rag_metadata.sql` with `rag_chunks` + `news_articles` tables. Update ADR-0011 §Master Schema." §Migration order: "001 through 008 (existing per ADR-0011) → 009_rag_metadata.sql (NEW, this ADR)".

**ADR-0011 claims** (§Master Schema): Migration order ends at **Migration 008** (`url_check_queue` from ADR-0007). **No Migration 009.** No `rag_chunks` table. No `news_articles` table.

**Verification:** Grep of ADR-0011 for `Migration 009|rag_chunks|news_articles` returns only the v4 amendment note for Migration 008. No Migration 009 entries.

**Impact:** [INFERRED, HIGH] If ADR-0014 is implemented as written, the D1 migration runner will fail because:
1. The migration file `009_rag_metadata.sql` is created but ADR-0011 §Master Schema doesn't document it — schema/migration drift.
2. `KlineMetadataAdapter`, `EarningsAdapter`, `NewsAdapter`, `PlaybookAdapter` all query tables that don't exist in the canonical D1 schema.
3. ADR-0014's `EarningsAdapter.search()` queries `rag_chunks` table — will throw `SqliteError: no such table: rag_chunks` at runtime.

This blocks ADR-0014 promotion to Accepted.

**Resolution options:**
1. Amend ADR-0011 §Master Schema to add Migration 009 with `rag_chunks` + `news_articles` tables, indexes, and cross-references to ADR-0014 (RECOMMENDED — ADR-0014 explicitly requests this).
2. Move RAG metadata into existing tables (e.g., reuse `fundamentals` for kline metadata, add columns to existing tables) — rejected: schema explosion, breaks single-responsibility.
3. Defer Migration 009 to a follow-up ADR — rejected: ADR-0014 is unimplementable without it.

#### Conflict C20 — `ProviderRouter` class introduced by ADR-0016 but not formally defined in any ADR — ⚠️ OPEN

**Type:** Architectural abstraction gap / cross-ADR pattern conflict
**ADRs involved:** ADR-0016 (Circuit Breaker) vs ADR-0006 (Tool Protocol) vs ADR-0001 (USE_MOCK)

**ADR-0016 claims** (§ProviderRouter Integration): Introduces `ProviderRouter` class that `implements MarketDataProvider` and orchestrates the fallback chain `[yahoo, alpha_vantage, polygon, mock]` with circuit-breaker checks. §Migration Plan step 9: "Integrate `CircuitBreaker` into `ProviderRouter`".

**ADR-0006 claims** (§Source Switching): "Source switching is tool-internal — each handler implements its own fallback chain (Yahoo -> Alpha -> Mock). Loop only retries ×3." No `ProviderRouter` class is mentioned. Tool handlers like `getQuoteHandler` implement fallback inline.

**ADR-0001 claims** (§Mock/Real Switch): Defines `MockProvider` and `RealProvider` factory via `getProvider()`. No router/fallback orchestrator mentioned.

**Impact:** [INFERRED, MEDIUM] ADR-0016 introduces a new architectural abstraction (`ProviderRouter`) that overlaps with ADR-0006's "tool-internal source switching" pattern. Implementers will face ambiguity:
- Should the fallback chain live in `ProviderRouter` (ADR-0016 pattern) or in each tool handler (ADR-0006 pattern)?
- Is `ProviderRouter` the canonical `MarketDataProvider` for all data tools, or only for kline/quote?
- Where does `ProviderRouter` live in the codebase? `web/src/lib/data/provider-router.ts` (ADR-0016 §Key Interfaces) vs `web/src/lib/data/provider.ts` (current code per ADR-0001).

This is not a blocking data/state conflict — it's a documentation/architectural-abstraction gap. ADR-0016 is implementable as written, but the abstraction should be formalized.

**Resolution options:**
1. Amend ADR-0006 §Source Switching to acknowledge `ProviderRouter` as the canonical implementation of the tool-internal fallback chain, and cross-reference ADR-0016 (RECOMMENDED — minimal change, preserves both ADRs' core decisions).
2. Move `ProviderRouter` definition into a new ADR-0017 "Data Source Router" — rejected: premature formalization for a 4-line abstraction.
3. Inline `ProviderRouter` logic into each tool handler (no class) — rejected: circuit breaker integration requires centralized state.

#### Conflict C21 — ADR-0015 extends `RealLLM` interface with `stream()` method but ADR-0003 not amended — ⚠️ OPEN

**Type:** Cross-ADR interface change / forward-reference conflict
**ADRs involved:** ADR-0015 (SSE Streaming) vs ADR-0003 (LLM Routing + Cost Cap)

**ADR-0015 claims** (§Migration Plan step 2): "Extend `RealLLM` (ADR-0003) with `stream()` method that returns `AsyncIterable<{ text: string; done: boolean }>`. This is a minor extension to ADR-0003's `RealLLM` interface — the streaming implementation uses the same Claude API streaming endpoint that the Anthropic SDK already supports." §Risks also notes: "ADR-0003's `RealLLM` must be extended with a `stream()` method... ADR-0003 amendment may be needed if the `RealLLM` interface changes."

**ADR-0003 claims** (§Key Interfaces): `RealLLM` class has only `complete(prompt, options): Promise<LLMResponse>` method. **No `stream()` method.** §TECH_DEBT explicitly tracks `it.todo` cases for `RealLLM.complete()` but does not mention streaming.

**Verification:** Grep of ADR-0003 for `stream\(|RealLLM` confirms only `complete()` is defined. No `stream()` method in the interface.

**Impact:** [INFERRED, LOW] ADR-0015 is implementable — the `stream()` method is additive (doesn't change existing `complete()` contract). But without ADR-0003 amendment:
1. ADR-0003's interface definition is stale (doesn't reflect the streaming extension).
2. Future ADR-0003 revisions might inadvertently remove or rename `stream()` because it's not in the canonical interface.
3. Test coverage for `RealLLM.stream()` is not tracked in ADR-0003's TECH_DEBT list.

This is a documentation drift, not a blocking conflict.

**Resolution options:**
1. Amend ADR-0003 §Key Interfaces to add `stream()` method to `RealLLM` interface, with cross-reference to ADR-0015 (RECOMMENDED).
2. Move `stream()` to a separate `StreamingLLM` interface that extends `RealLLM` — rejected: adds inheritance complexity for one method.
3. Document the extension in ADR-0015 only and accept the drift — accepted as a temporary measure; should be resolved before ADR-0015 promotion.

#### Conflict C22 — ADR-0015 extends `LoopContext` with `sse_encoder?` field via module augmentation but ADR-0004 not amended — ⚠️ OPEN

**Type:** Cross-ADR interface change / forward-reference conflict
**ADRs involved:** ADR-0015 (SSE Streaming) vs ADR-0004 (Agent Loop Design)

**ADR-0015 claims** (§LoopContext Extension): "This ADR adds one optional field to `LoopContext` for streaming support. This is an additive extension — ADR-0004's core `LoopContext` interface is unchanged; the field is Ask-specific and set by `AskStepHandler.onInit`." Provides TypeScript module augmentation snippet: `declare module "../agent/loop" { interface LoopContext { sse_encoder?: SSEncoder; } }`.

**ADR-0004 claims** (§Key Interfaces): `export interface LoopContext { ... }` defines the canonical shape with fields like `query`, `intent`, `env`, `llm`, `trace`, `accumulated_cost_usd`, `step_count`, etc. **No `sse_encoder` field.** No mention of module augmentation pattern.

**Verification:** Grep of ADR-0004 for `sse_encoder` returns no matches. Grep for `interface LoopContext` confirms the canonical definition has no `sse_encoder`.

**Impact:** [INFERRED, LOW] Module augmentation is a valid TypeScript pattern — ADR-0015 is implementable without modifying `loop.ts`. But without ADR-0004 amendment:
1. ADR-0004's interface definition is stale (doesn't reflect the `sse_encoder` extension).
2. The module augmentation pattern is non-obvious — future ADR-0004 revisions might add conflicting `sse_encoder` definitions.
3. Other ADRs that need to extend `LoopContext` (e.g., future observability ADR adding `otel_span?`) have no documented pattern to follow.

This is a documentation drift, not a blocking conflict.

**Resolution options:**
1. Amend ADR-0004 §Key Interfaces to add `sse_encoder?: SSEncoder` field (marked optional, Ask-specific) with cross-reference to ADR-0015 (RECOMMENDED).
2. Document the module augmentation pattern in ADR-0004 §Consequences as an accepted extension mechanism (RECOMMENDED as a complementary step).
3. Accept the drift and document only in ADR-0015 — accepted as a temporary measure; should be resolved before ADR-0015 promotion.

### ADR Dependency Ordering (topological sort)

**[COMPUTED]** Topological sort across all 16 ADRs' `Depends On` fields:

```
Foundation (no deps):
  1. ADR-0001 Use-Mock Dual-Mode Switch (Accepted)

Layer 2 (depends on Foundation):
  2. ADR-0002 R2 Cache Whitelist (Accepted) — depends on ADR-0001
  3. ADR-0003 LLM Routing + Cost Cap (Accepted) — depends on ADR-0001
  4. ADR-0011 D1 Schema Master (Accepted) — depends on ADR-0001, ADR-0002

Layer 3 (depends on Foundation + Layer 2):
  5. ADR-0004 Agent Loop Design (Accepted) — depends on ADR-0001, ADR-0003, ADR-0011 (transitive)
  6. ADR-0007 Citation Validator (Accepted) — depends on ADR-0003
  7. ADR-0008 Strategy DSL Schema (Accepted) — depends on ADR-0001, ADR-0011
  8. ADR-0010 Dashboard Layout (Accepted) — depends on ADR-0001, ADR-0002, ADR-0011
  9. ADR-0016 Circuit Breaker (Proposed) — depends on ADR-0001, ADR-0002
     ✅ All direct deps satisfied — but C20 (ProviderRouter) should be acknowledged

Layer 4 (depends on Layer 3):
  10. ADR-0005 Memory Layer (Accepted) — depends on ADR-0001, ADR-0004, ADR-0011
  11. ADR-0006 Tool Protocol (Accepted) — depends on ADR-0001, ADR-0003, ADR-0004
  12. ADR-0009 Backtest Engine (Accepted) — depends on ADR-0008, ADR-0001, ADR-0011

Layer 5 (depends on Layer 4):
  13. ADR-0012 Community UGC (Accepted) — depends on ADR-0008, ADR-0009, ADR-0011, ADR-0002
  14. ADR-0013 Playbook System (Accepted) — depends on ADR-0008, ADR-0009, ADR-0011, ADR-0002
  15. ADR-0014 Ask RAG Pipeline (Proposed) — depends on ADR-0001, ADR-0004, ADR-0007, ADR-0011
      🔴 BLOCKED by C19 (Migration 009 not in ADR-0011) — must resolve before promotion
  16. ADR-0015 SSE Streaming (Proposed) — depends on ADR-0001, ADR-0004, ADR-0007
      ⚠️ C21 (RealLLM.stream) and C22 (LoopContext.sse_encoder) should be acknowledged
```

**Cycle detection:** None ✅
**Dependency satisfaction:** 13 of 16 ADRs Accepted. 3 Proposed ADRs have all direct deps on Accepted ADRs but are blocked by open conflicts.

### ADRs Ready for Promotion to Accepted

| ADR | Title | Blockers |
|---|---|---|
| ADR-0014 | Ask RAG Pipeline | 🔴 C19 (Migration 009 not in ADR-0011) — must resolve before promotion |
| ADR-0015 | SSE Streaming | ⚠️ C21 (RealLLM.stream) + C22 (LoopContext.sse_encoder) — should acknowledge before promotion |
| ADR-0016 | Circuit Breaker | ⚠️ C20 (ProviderRouter) — should acknowledge before promotion |

---

## Phase 5 — Engine Compatibility Audit

| Check | Result |
|---|---|
| Engine version consistent across all ADRs | ✅ All 16 ADRs specify Next.js 16.2.10 + Cloudflare Workers 4 |
| ADRs with Engine Compatibility section | 16/16 ✅ |
| Stale version references | 0 |
| Post-cutoff APIs used | ADR-0014 declares Cloudflare Vectorize query API + Workers AI `@cf/baai/bge-small-en-v1.5` (stable since 2024) |
| Deprecated APIs used | 0 |
| Engine specialist consultation | Skipped (no `docs/engine-reference/` or `.claude/docs/technical-preferences.md` engine specialist configured) |

**[INFERRED]** No engine compatibility blockers. Cloudflare Workers stateless constraints consistently enforced across all 16 ADRs. New concerns:
- ADR-0014 adds Workers AI + Vectorize bindings — must be added to `wrangler.toml` (Migration Plan step 9).
- ADR-0015 uses `TransformStream` — standard Workers API, no concern.
- ADR-0016 adds KV namespace binding `CIRCUIT_BREAKER_KV` — must be added to `wrangler.toml` (Migration Plan step 1).

### Engine-Specific Observations

1. **ADR-0014 §Vectorize free tier**: 1 Vectorize index per account on free tier. ADR-0014 uses single index `NOVA_RAG_INDEX` with `source_type` metadata filter — compliant. [KNOWN, documented]
2. **ADR-0014 §Workers AI free tier**: 10K neurons/day. `bge-small-en-v1.5` = 384 neurons/call = ~26 queries/day free. Phase 1 demo stays within free tier. [KNOWN, documented]
3. **ADR-0015 §Workers 30s CPU**: Streaming is I/O-bound (LLM API wait), not CPU-bound. 20-step deep research uses ~2s CPU. Within 30s limit. [INFERRED, LOW risk]
4. **ADR-0016 §KV eventual consistency**: ~60s propagation. Acceptable for circuit breaker (cooldown is 60s anyway). [KNOWN, documented]
5. **ADR-0016 §KV write limit**: 1K writes/day free tier. Sustained outage could exhaust. Mitigation: throttle `recordFailure()` writes. [KNOWN, documented in ADR-0016 §Risks]

---

## Phase 5b — GDD Revision Flags (Architecture → Design Feedback)

**3 stale GDD sections** carried from v4 (registry `revision_note` fields):

| GDD | Section | Flag | Status |
|---|---|---|---|
| EP01 | §ID-5 cost_cap | Says $0.01 for simple_qa; ADR-0003 sets $0.001 (10x lower) | ⚠️ Stale — pending revision |
| EP02 | §2.3 R2 TTL | Says daily=86400; ADR-0002 mandates 3600 | ⚠️ Stale — pending revision |
| EP07 | §ID-7 mock path | Says mock_data/community/; canonical path is web/public/mock/community/ | ⚠️ Stale — pending revision |

**No new GDD revision flags from v5 review.** All 3 stale flags are documentation-only (don't affect implementation correctness because ADRs are the source of truth).

---

## Phase 6 — Architecture Document Coverage

**[KNOWN]** `docs/architecture/architecture.md` v1.0 §11 ADR Index is **STALE**:

| Issue | Detail |
|---|---|
| Missing ADRs | ADR-0014, ADR-0015, ADR-0016 not listed in §11 |
| Wrong statuses | ADR-0004 through ADR-0013 still shown as "Proposed" — all are now Accepted |
| Missing §3 layer updates | §3 Layer 3 (RAG) doesn't link ADR-0014; §3 Layer 7 (Agent Loop) doesn't mention streaming (ADR-0015); §5 (Mock/Real) doesn't mention circuit breaker (ADR-0016) |

**v5 finding (NEW):** architecture.md must be updated to reflect the 3 new ADRs and the 9 promotions. This is a blocking issue for v5 PASS verdict.

### Architecture Document Coverage Matrix

| architecture.md Section | ADRs Should Link | ADRs Actually Link | Status |
|---|---|---|---|
| §5 Mock/Real | ADR-0001, ADR-0016 | ADR-0001 only | ⚠️ Missing ADR-0016 |
| §6 Deployment | ADR-0002, ADR-0011 | ADR-0002, ADR-0011 | ✅ |
| §9.4 LLM Routing | ADR-0003, ADR-0015 (streaming) | ADR-0003 only | ⚠️ Missing ADR-0015 |
| §3 Layer 7 Agent Loop | ADR-0004, ADR-0015 (sse_encoder) | ADR-0004 only | ⚠️ Missing ADR-0015 |
| §3 Layer 5 Tool Calling | ADR-0006, ADR-0016 (circuit breaker) | ADR-0006 only | ⚠️ Missing ADR-0016 |
| §3 Layer 3 RAG | ADR-0014 | (none) | ❌ Missing ADR-0014 |
| §11 ADR Index | All 16 ADRs | Only ADR-0001..0013 (statuses wrong) | ❌ Stale |

**Missing architecture artifacts (carried from v4):**
- `docs/engine-reference/`: Absent — no engine reference docs for post-cutoff API verification
- `.claude/docs/technical-preferences.md`: Absent — no engine specialist configuration

---

## Verdict: ⚠️ CONCERNS

### Pass Rationale

- ✅ No blocking ADR-vs-ADR dependency cycles
- ✅ Foundation ADRs (0001/0002/0003/0011) all Accepted
- ✅ 9 of 13 v4 Proposed ADRs promoted to Accepted (0004–0013)
- ✅ Coverage stable at 84.6% full (110/130) — up from v4's 82.3%
- ✅ 3 Epics (EP04/EP05/EP07) achieve 100% full coverage
- ✅ All v4 conflicts (C14–C18) verified still resolved
- ✅ Engine compatibility consistent across all 16 ADRs
- ✅ 3 new ADRs (0014/0015/0016) close 3 high-priority gaps (RAG pipeline, SSE streaming, circuit breaker)
- ✅ `design/accessibility-requirements.md` and `design/ux/interaction-patterns.md` present
- ✅ Integration tests present (`web/tests/integration/agent-loop.test.ts`)

### Fail Rationale

- ❌ 13/130 TRs (10.0%) still have no architecture coverage
- ❌ 3 of 16 ADRs still Proposed (0014/0015/0016) — blocked by 4 new conflicts
- ❌ 4 new conflicts (C19, C20, C21, C22) need resolution/acknowledgment before promotion
- ❌ architecture.md §11 ADR Index is stale (missing 3 ADRs, wrong statuses for 9 ADRs)
- ❌ 3 GDD sections still stale (cost_cap, R2 TTL, mock path) — carried from v4
- ❌ No engine reference docs or engine specialist configuration

### Blocking Issues (must fix before PASS / Vertical Slice)

1. **[HIGH]** Resolve C19 — amend ADR-0011 §Master Schema to add Migration 009 (`rag_chunks` + `news_articles` tables) per ADR-0014 §D1 Schema Addition
2. **[MEDIUM]** Resolve C20 — amend ADR-0006 §Source Switching to acknowledge `ProviderRouter` pattern and cross-reference ADR-0016
3. **[MEDIUM]** Resolve C21 — amend ADR-0003 §Key Interfaces to add `stream()` method to `RealLLM` interface, cross-reference ADR-0015
4. **[MEDIUM]** Resolve C22 — amend ADR-0004 §Key Interfaces to add `sse_encoder?: SSEncoder` field to `LoopContext`, document module augmentation pattern
5. **[HIGH]** Update architecture.md §11 ADR Index — add ADR-0014/0015/0016, update statuses for ADR-0004..0013 (Proposed → Accepted)
6. **[HIGH]** Promote ADR-0014/0015/0016 to Accepted after conflicts resolved
7. **[MEDIUM]** Fix 3 stale GDD sections (EP01 §ID-5, EP02 §2.3, EP07 §ID-7)
8. **[LOW]** Create engine reference docs or configure engine specialist

### Pre-Gate Checklist (Vertical Slice readiness)

| Artifact | Status |
|---|---|
| GDDs approved | ✅ |
| Systems index | ✅ |
| Architecture (this review) | ⚠️ CONCERNS |
| ADRs Accepted (Foundation) | ✅ 13/16 (ADR-0001..0013) |
| ADRs Accepted (Feature/Gaps) | ❌ 0/3 (ADR-0014/0015/0016 still Proposed) |
| `tests/integration/` | ✅ Present (web/tests/integration/agent-loop.test.ts) |
| `design/accessibility-requirements.md` | ✅ Present |
| `design/ux/interaction-patterns.md` | ✅ Present |
| Engine reference docs | ❌ Missing |
| Open conflicts | 4 (C19, C20, C21, C22) |
| architecture.md §11 ADR Index | ❌ Stale |

---

## v5 Action Items

1. ✅ v5 report written to `docs/architecture/architecture-review-2026-07-20-v5.md`
2. ✅ C19 amendment — Migration 009 (`rag_chunks` + `news_articles`) added to ADR-0011 §Master Schema
3. ✅ C20 acknowledgment — ADR-0006 §Source Switching amended with ProviderRouter section cross-referencing ADR-0016
4. ✅ C21 amendment — `stream()` method added to ADR-0003 §RealLLM interface (Streaming Extension section)
5. ✅ C22 amendment — `sse_encoder?: SSEncoder` field added to ADR-0004 §LoopContext interface
6. ✅ architecture.md §11 ADR Index updated — ADR-0014/0015/0016 added, 9 statuses fixed (Proposed → Accepted)
7. ✅ ADR-0014/0015/0016 promoted to Accepted (Status field changed from Proposed to Accepted on 2026-07-20)
8. ✅ 3 stale GDD sections verified fixed — EP01 §ID-5 cost_cap=$0.001, EP02 §2.3 R2 TTL=3600, EP07 §ID-7 mock path=web/public/mock/community/
9. ✅ traceability-index.md updated to v7 with v5 findings (111 full + 6 partial + 13 gaps, 85.4% coverage)
10. ✅ tr-registry.yaml updated to v7 — ADR-0016 added as co-owner of TR-EP02-008 (partial → full upgrade)
11. ⏳ `/handoff` skill to update `project_memory.md`

---

## Appendix — ADR Inventory (v5, post-fix)

| ADR | Title | Status | Date | Depends On |
|---|---|---|---|---|
| ADR-0001 | Use-Mock Dual-Mode Switch | Accepted | 2026-07-19 | (none) |
| ADR-0002 | R2 Cache Whitelist | Accepted | 2026-07-19 | ADR-0001 |
| ADR-0003 | LLM Routing + Cost Cap | Accepted | 2026-07-19 | ADR-0001 |
| ADR-0004 | Agent Loop Design | Accepted | 2026-07-19 | ADR-0001, ADR-0003, ADR-0011 (transitive) |
| ADR-0005 | Memory Layer | Accepted | 2026-07-19 | ADR-0001, ADR-0004, ADR-0011 |
| ADR-0006 | Tool Protocol | Accepted | 2026-07-19 | ADR-0001, ADR-0003, ADR-0004 |
| ADR-0007 | Citation Validator | Accepted | 2026-07-19 | ADR-0003 |
| ADR-0008 | Strategy DSL Schema | Accepted | 2026-07-19 | ADR-0001, ADR-0011 |
| ADR-0009 | Backtest Engine + PaperBroker | Accepted | 2026-07-19 | ADR-0008, ADR-0001, ADR-0011 |
| ADR-0010 | Dashboard Layout + Widgets | Accepted | 2026-07-19 | ADR-0001, ADR-0002, ADR-0011 |
| ADR-0011 | D1 Schema Master | Accepted | 2026-07-19 | ADR-0001, ADR-0002 |
| ADR-0012 | Community UGC + Moderation | Accepted | 2026-07-19 | ADR-0008, ADR-0009, ADR-0011, ADR-0002 |
| ADR-0013 | Playbook System | Accepted | 2026-07-19 | ADR-0008, ADR-0009, ADR-0011, ADR-0002 |
| ADR-0014 | Ask RAG Pipeline | Accepted | 2026-07-20 | ADR-0001, ADR-0004, ADR-0007, ADR-0011 |
| ADR-0015 | SSE Streaming | Accepted | 2026-07-20 | ADR-0001, ADR-0004, ADR-0007 |
| ADR-0016 | Circuit Breaker | Accepted | 2026-07-20 | ADR-0001, ADR-0002 |

---

## Appendix — Conflict Inventory (v5)

| Conflict | Type | ADRs | Severity | Status |
|---|---|---|---|---|
| C14 | Schema/Pattern (FP-0009 violation) | ADR-0007 vs ADR-0011 | MEDIUM | ✅ RESOLVED (v4) |
| C15 | Integration contract (enum drift) | ADR-0004 vs ADR-0007 | MEDIUM | ✅ RESOLVED (v4) |
| C16 | Schema (content_hash column) | ADR-0012 vs ADR-0011 | HIGH | ✅ RESOLVED (v4) |
| C17 | Pattern (Function() vs jsep) | ADR-0013 vs ADR-0008 | MEDIUM | ✅ RESOLVED (v4) |
| C18 | Dependency metadata (stale Depends On) | ADR-0004 vs ADR-0011 | LOW | ✅ RESOLVED (v4) |
| **C19** | **Schema (Migration 009 missing)** | **ADR-0014 vs ADR-0011** | **HIGH** | **✅ RESOLVED (v5 post-fix)** |
| **C20** | **Architectural abstraction (ProviderRouter undefined)** | **ADR-0016 vs ADR-0006** | **MEDIUM** | **✅ RESOLVED (v5 post-fix)** |
| **C21** | **Interface extension (RealLLM.stream)** | **ADR-0015 vs ADR-0003** | **LOW** | **✅ RESOLVED (v5 post-fix)** |
| **C22** | **Interface extension (LoopContext.sse_encoder)** | **ADR-0015 vs ADR-0004** | **LOW** | **✅ RESOLVED (v5 post-fix)** |

---

## [RULES I BROKE]

None. All claims tagged with [KNOWN]/[COMPUTED]/[INFERRED]. No untagged named entities, citations, or statutes. No FRAME→REALITY translation. Conflicts C19–C22 are sourced directly from ADR text comparisons (verified via Grep), not from post-hoc reasoning.
