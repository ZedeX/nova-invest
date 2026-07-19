# Traceability Index

**Last Updated:** 2026-07-20 (v7, post-v5 fixes)
**Source of Truth:** `docs/architecture/tr-registry.yaml` v7 (130 TRs)
**Review Report:** `docs/architecture/architecture-review-2026-07-20-v5.md`

This index maps every Technical Requirement (TR) to its owning ADR. Requirements without an `owner_adr` field are gaps — no ADR addresses them yet.

## Coverage Summary

| Status | Count | % | Notes |
|---|---|---|---|
| ✅ Covered (full) | 111 | 85.4% | Has `owner_adr`, no `coverage: partial` |
| ⚠️ Partial | 6 | 4.6% | Has `owner_adr` + `coverage: partial` |
| ❌ Gap | 13 | 10.0% | No `owner_adr` |
| **Total** | **130** | 100% | |

> v6→v7 delta: +1 full covered (110→111), −1 partial (7→6), 0 gap change (13→13). Driven by C20 resolution: TR-EP02-008 upgraded from partial → full after ADR-0006 amended to acknowledge ProviderRouter pattern (ADR-0016 co-ownership). All 4 v5 conflicts (C19/C20/C21/C22) resolved via ADR amendments. ADR-0014/0015/0016 promoted to Accepted.

## Coverage by ADR

| ADR | Title | Status | TRs Covered (full) | TRs Partial |
|---|---|---|---|---|
| ADR-0001 | Use-Mock Dual-Mode Switch | Accepted | 9 | 0 |
| ADR-0002 | R2 Cache Whitelist | Accepted | 6 | 0 |
| ADR-0003 | LLM Routing + Cost Cap | Accepted | 9 | 0 |
| ADR-0004 | Agent Loop Design | Accepted | 2 | 2 |
| ADR-0005 | Memory Layer | Accepted | 4 | 0 |
| ADR-0006 | Tool Protocol | Accepted | 2 | 0 |
| ADR-0007 | Citation Validator | Accepted | 3 | 1 |
| ADR-0008 | Strategy DSL Schema | Accepted | 9 | 0 |
| ADR-0009 | Backtest Engine + PaperBroker | Accepted | 15 | 0 |
| ADR-0010 | Dashboard Layout + Widgets | Accepted | 19 | 0 |
| ADR-0011 | D1 Schema Master | Accepted | 8 | 3 |
| ADR-0012 | Community UGC + Moderation | Accepted | 11 | 0 |
| ADR-0013 | Playbook System | Accepted | 10 | 0 |
| ADR-0014 | Ask RAG Pipeline | Accepted | 1 | 0 |
| ADR-0015 | SSE Streaming | Accepted | 1 | 0 |
| ADR-0016 | Circuit Breaker | Accepted | 2 | 0 |
| (no ADR) | — | — | 0 (gap) | — |
| **Total** | | | **111** | **6** |

> Per-ADR totals: 111 full + 6 partial = 117 TRs with owner_adr. 130 − 117 = 13 gaps. ADR-0006 full count unchanged (TR-EP02-008 remains under ADR-0006, now co-owned with ADR-0016); ADR-0016 full count rose 1→2.

## Coverage by Epic

| Epic | TRs | Full Covered | Partial | Gaps | % Covered (full) |
|---|---|---|---|---|---|
| EP01 Agent Harness | 15 | 8 | 2 | 5 | 53.3% |
| EP02 Market Data | 17 | 14 | 0 | 3 | 82.4% |
| EP03 Ask Agent | 21 | 16 | 1 | 4 | 76.2% |
| EP04 Strategy DSL | 17 | 17 | 0 | 0 | **100%** |
| EP05 Dashboard | 19 | 19 | 0 | 0 | **100%** |
| EP06 Broker Integration | 13 | 12 | 0 | 1 | 92.3% |
| EP07 Share & Community | 14 | 14 | 0 | 0 | **100%** |
| EP08 Playbook System | 14 | 11 | 3 | 0 | 78.6% |
| **Total** | **130** | **111** | **6** | **13** | **85.4%** |

> EP02 rose 76.5% → 82.4% (TR-EP02-008 upgraded partial → full). EP04, EP05, EP07 hold 100% full coverage. EP06 has only 1 gap (MCP broker server, Phase 2). EP08 has 0 gaps but 3 partials (app-level validations not ADR'd).

## Full Traceability Matrix

For the complete per-TR matrix, see `docs/architecture/tr-registry.yaml` — every entry with an `owner_adr` field is a covered TR. The YAML is the canonical source; this Markdown index is a derived summary.

## Gap TRs (13 total, no owner_adr)

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

## Partial Coverage TRs (6 total)

| TR-ID | Epic | owner_adr | Coverage Note |
|---|---|---|---|
| TR-EP01-008 | EP01 | ADR-0007 | ADR-0007 enforces hallucination ≤5%; Eval Golden Set infra (200+ cases) not ADR'd |
| TR-EP01-009 | EP01 | ADR-0004 | ADR-0004 defines TraceStep; full Trace aggregation deferred to ADR-0014 |
| TR-EP03-012 | EP03 | ADR-0004 | ADR-0004 provides generic 6-state loop; Ask-specific StepHandlers not ADR'd |
| TR-EP08-004 | EP08 | ADR-0011 | ADR-0011 provides playbook_dependencies.weight; app-level sum validation not ADR'd |
| TR-EP08-006 | EP08 | ADR-0011 | ADR-0011 provides playbook_versions.version; app-level semver.valid() not ADR'd |
| TR-EP08-008 | EP08 | ADR-0011 | ADR-0011 Migration 006 defines 3 tables; user_playbooks merged into shared table |

> v6→v7: TR-EP02-008 removed from this list (upgraded to full coverage after C20 resolution).

## Open Conflicts

| Conflict | Type | ADRs | Status |
|---|---|---|---|
| C14 | Schema/Pattern (FP-0009 violation) | ADR-0007 vs ADR-0011 | ✅ RESOLVED (v4) |
| C15 | Integration contract (enum drift) | ADR-0004 vs ADR-0007 | ✅ RESOLVED (v4) |
| C16 | Schema (content_hash column missing) | ADR-0012 vs ADR-0011 | ✅ RESOLVED (v4) |
| C17 | Pattern (Function() vs jsep) | ADR-0013 vs ADR-0008 | ✅ RESOLVED (v4) |
| C18 | Dependency metadata (stale Depends On) | ADR-0004 vs ADR-0011 | ✅ RESOLVED (v4) |
| C19 | Schema (Migration 009 missing) | ADR-0014 vs ADR-0011 | ✅ RESOLVED (v5) — Migration 009 added to ADR-0011 |
| C20 | Architectural abstraction (ProviderRouter) | ADR-0016 vs ADR-0006 | ✅ RESOLVED (v5) — ProviderRouter acknowledged in ADR-0006 |
| C21 | Interface extension (RealLLM.stream) | ADR-0015 vs ADR-0003 | ✅ RESOLVED (v5) — stream() method added to ADR-0003 |
| C22 | Interface extension (LoopContext.sse_encoder) | ADR-0015 vs ADR-0004 | ✅ RESOLVED (v5) — sse_encoder field added to ADR-0004 |

**All 9 conflicts resolved.** 0 open conflicts remain.

## ADR Inventory

| ADR | Title | Status | Depends On |
|---|---|---|---|
| ADR-0001 | Use-Mock Dual-Mode Switch | Accepted | (none) |
| ADR-0002 | R2 Cache Whitelist | Accepted | ADR-0001 |
| ADR-0003 | LLM Routing + Cost Cap | Accepted | ADR-0001 |
| ADR-0004 | Agent Loop Design | Accepted | ADR-0001, ADR-0003, ADR-0011 (transitive) |
| ADR-0005 | Memory Layer | Accepted | ADR-0001, ADR-0004, ADR-0011 |
| ADR-0006 | Tool Protocol | Accepted | ADR-0001, ADR-0003, ADR-0004 |
| ADR-0007 | Citation Validator | Accepted | ADR-0003 |
| ADR-0008 | Strategy DSL Schema | Accepted | ADR-0001, ADR-0011 |
| ADR-0009 | Backtest Engine + PaperBroker | Accepted | ADR-0008, ADR-0001, ADR-0011 |
| ADR-0010 | Dashboard Layout + Widgets | Accepted | ADR-0001, ADR-0002, ADR-0011 |
| ADR-0011 | D1 Schema Master | Accepted | ADR-0001, ADR-0002 |
| ADR-0012 | Community UGC + Moderation | Accepted | ADR-0008, ADR-0009, ADR-0011, ADR-0002 |
| ADR-0013 | Playbook System | Accepted | ADR-0008, ADR-0009, ADR-0011, ADR-0002 |
| ADR-0014 | Ask RAG Pipeline | Accepted | ADR-0001, ADR-0004, ADR-0007, ADR-0011 |
| ADR-0015 | SSE Streaming | Accepted | ADR-0001, ADR-0004, ADR-0007 |
| ADR-0016 | Circuit Breaker | Accepted | ADR-0001, ADR-0002 |

## Top Gap Priorities

Remaining gaps (low-mid priority, none block Vertical Slice):

1. **TR-EP01-001/002** Foundation architecture (9-layer + Supervisor-Worker) — covered by architecture.md, low risk
2. **TR-EP01-010/011** Test infrastructure (seams + coverage targets) — testing convention, low risk
3. **TR-EP01-015** Full-link trace viewable in Grafana — Observability, Phase 2
4. **TR-EP03-006** AnswerWithCitations interface — partially implicit in ADR-0007
5. **TR-EP03-014** Prompt template versioning — minor, can be ADR'd later
6. **TR-EP03-015** Mock QA samples ≥20 — testing data, low risk
7. **TR-EP03-021** Worker entry /api/ask handler — implementation detail
8. **TR-EP06-011** MCP broker server placeholder — Phase 2 only

## ADR Promotion Status

All 16 ADRs are now Accepted.

| ADR | Title | Previous Status | Current Status | Blocker Resolved |
|---|---|---|---|---|
| ADR-0004 | Agent Loop Design | Proposed | Accepted | C18 resolved (v4) |
| ADR-0007 | Citation Validator | Proposed | Accepted | No blockers (v4) |
| ADR-0008 | Strategy DSL Schema | Proposed | Accepted | No blockers (v4) |
| ADR-0009 | Backtest Engine + PaperBroker | Proposed | Accepted | No blockers (v4) |
| ADR-0010 | Dashboard Layout + Widgets | Proposed | Accepted | No blockers (v4) |
| ADR-0012 | Community UGC | Proposed | Accepted | C16 resolved (v4) |
| ADR-0013 | Playbook System | Proposed | Accepted | C17 resolved (v4) |
| ADR-0014 | Ask RAG Pipeline | Proposed | Accepted | C19 resolved (v5) |
| ADR-0015 | SSE Streaming | Proposed | Accepted | C21, C22 resolved (v5) |
| ADR-0016 | Circuit Breaker | Proposed | Accepted | C20 resolved (v5) |

**All Proposed ADRs promoted. 0 Remaining.**

## GDD Revision Status

All 3 stale GDD sections carried from v4 are now fixed:

| GDD | Section | Original Issue | Resolution |
|---|---|---|---|
| EP01 | §ID-5 cost_cap | Said $0.01 for simple_qa; ADR-0003 sets $0.001 | ✅ Fixed — `cost_cap: 0.001` aligned with ADR-0003 cloud routing rule |
| EP02 | §2.3 R2 TTL | Said daily=86400; ADR-0002 mandates 3600 | ✅ Fixed — `price: 3600` aligned with ADR-0002 R2_TTL.PRICE; 86400 deprecated with note |
| EP07 | §ID-7 mock path | Said mock_data/community/; canonical is web/public/mock/community/ | ✅ Fixed — `web/public/mock/community/` aligned with ADR-0001 API-0002 |
