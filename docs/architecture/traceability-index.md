# Traceability Index

**Last Updated:** 2026-07-19 (v6, post-v4 fixes)
**Source of Truth:** `docs/architecture/tr-registry.yaml` v6 (130 TRs)
**Review Report:** `docs/architecture/architecture-review-2026-07-19-v4.md`

This index maps every Technical Requirement (TR) to its owning ADR. Requirements without an `owner_adr` field are gaps — no ADR addresses them yet.

## Coverage Summary

| Status | Count | % | Notes |
|---|---|---|---|
| ✅ Covered (full) | 110 | 84.6% | Has `owner_adr`, no `coverage: partial` |
| ⚠️ Partial | 7 | 5.4% | Has `owner_adr` + `coverage: partial` |
| ❌ Gap | 13 | 10.0% | No `owner_adr` |
| **Total** | **130** | 100% | |

> v4→v6 delta: +3 full covered (107→110), 0 partial change (7→7), −3 gaps (16→13). Driven by 3 new ADRs (ADR-0014/0015/0016) + C16/C17/C18 conflict resolutions + 7 ADR promotions.

## Coverage by ADR

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

## Coverage by Epic

| Epic | TRs | Full Covered | Partial | Gaps | % Covered (full) |
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

> EP04, EP05, EP07 achieve 100% full coverage. EP06 has only 1 gap (MCP broker server, Phase 2). EP08 has 0 gaps but 3 partials (app-level validations not ADR'd).

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

## Partial Coverage TRs (7 total)

| TR-ID | Epic | owner_adr | Coverage Note |
|---|---|---|---|
| TR-EP01-008 | EP01 | ADR-0007 | ADR-0007 enforces hallucination ≤5%; Eval Golden Set infra (200+ cases) not ADR'd |
| TR-EP01-009 | EP01 | ADR-0004 | ADR-0004 defines TraceStep; full Trace aggregation deferred to ADR-0014 |
| TR-EP02-008 | EP02 | ADR-0006 | ADR-0006 specifies source switching; CircuitBreaker now ADR'd by ADR-0016 |
| TR-EP03-012 | EP03 | ADR-0004 | ADR-0004 provides generic 6-state loop; Ask-specific StepHandlers not ADR'd |
| TR-EP08-004 | EP08 | ADR-0011 | ADR-0011 provides playbook_dependencies.weight; app-level sum validation not ADR'd |
| TR-EP08-006 | EP08 | ADR-0011 | ADR-0011 provides playbook_versions.version; app-level semver.valid() not ADR'd |
| TR-EP08-008 | EP08 | ADR-0011 | ADR-0011 Migration 006 defines 3 tables; user_playbooks merged into shared table |

## Open Conflicts

| Conflict | Type | ADRs | Status |
|---|---|---|---|
| C14 | Schema/Pattern (FP-0009 violation) | ADR-0007 vs ADR-0011 | ✅ RESOLVED |
| C15 | Integration contract (enum drift) | ADR-0004 vs ADR-0007 | ✅ RESOLVED |
| C16 | Schema (content_hash column missing) | ADR-0012 vs ADR-0011 | ✅ RESOLVED — content_hash added to community_playbooks |
| C17 | Pattern (Function() vs jsep) | ADR-0013 vs ADR-0008 | ✅ RESOLVED — Phase 2 migration plan documented in ADR-0013 |
| C18 | Dependency metadata (stale Depends On) | ADR-0004 vs ADR-0011 | ✅ RESOLVED — ADR-0004 Depends On updated with ADR-0011 |

All conflicts resolved. No open conflicts remain.

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
| ADR-0014 | Ask RAG Pipeline | Proposed | ADR-0001, ADR-0004, ADR-0007, ADR-0011 |
| ADR-0015 | SSE Streaming | Proposed | ADR-0001, ADR-0004, ADR-0007 |
| ADR-0016 | Circuit Breaker | Proposed | ADR-0001, ADR-0002 |

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

All ADRs with resolved blockers have been promoted:

| ADR | Title | Previous Status | Current Status | Blocker Resolved |
|---|---|---|---|---|
| ADR-0004 | Agent Loop Design | Proposed | Accepted | C18 resolved |
| ADR-0007 | Citation Validator | Proposed | Accepted | No blockers |
| ADR-0008 | Strategy DSL Schema | Proposed | Accepted | No blockers |
| ADR-0009 | Backtest Engine + PaperBroker | Proposed | Accepted | No blockers |
| ADR-0010 | Dashboard Layout + Widgets | Proposed | Accepted | No blockers |
| ADR-0012 | Community UGC | Proposed | Accepted | C16 resolved |
| ADR-0013 | Playbook System | Proposed | Accepted | C17 resolved |

Remaining Proposed ADRs: ADR-0014, ADR-0015, ADR-0016.
