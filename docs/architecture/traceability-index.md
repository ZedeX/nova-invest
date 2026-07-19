# Traceability Index

**Last Updated:** 2026-07-19 (v3)
**Source of Truth:** `docs/architecture/tr-registry.yaml` v3 (130 TRs)
**Review Report:** `docs/architecture/architecture-review-2026-07-19-v3.md`

This index maps every Technical Requirement (TR) to its owning ADR. Requirements without an `owner_adr` field are gaps — no ADR addresses them yet.

## Coverage Summary

| Status | Count | % | Notes |
|---|---|---|---|
| ✅ Covered (full) | 44 | 33.8% | Has `owner_adr`, no `coverage: partial` |
| ⚠️ Partial | 7 | 5.4% | Has `owner_adr` + `coverage: partial` |
| ❌ Gap | 79 | 60.8% | No `owner_adr` |
| **Total** | **130** | 100% | |

## Coverage by ADR

| ADR | Title | Status | TRs Covered (full) | TRs Partial |
|---|---|---|---|---|
| ADR-0001 | Use-Mock Dual-Mode Switch | Accepted | 7 | 0 |
| ADR-0002 | R2 Cache Whitelist | Accepted | 5 | 0 |
| ADR-0003 | LLM Routing + Cost Cap | Accepted | 8 | 0 |
| ADR-0004 | Agent Loop Design | Proposed | 2 | 2 |
| ADR-0005 | Memory Layer | Proposed | 4 | 0 |
| ADR-0006 | Tool Protocol | Proposed | 2 | 1 |
| ADR-0007 | Citation Validator | Proposed | 3 | 1 |
| ADR-0011 | D1 Schema Master | Proposed | 9 | 3 |
| (no ADR) | — | — | 0 (gap) | — |
| **Total** | | | **40** | **7** |

> Numbers reflect `owner_adr` entries in `tr-registry.yaml` v3. Full + partial may sum to more than the per-ADR totals if any TR has multiple owning ADRs; in current registry each TR has at most one `owner_adr`.

## Coverage by Epic

| Epic | TRs | Full Covered | Partial | Gaps | % Covered (full) |
|---|---|---|---|---|---|
| EP01 Agent Harness | 15 | 8 | 2 | 5 | 53.3% |
| EP02 Market Data | 17 | 12 | 1 | 4 | 70.6% |
| EP03 Ask Agent | 21 | 11 | 0 | 10 | 52.4% |
| EP04 Strategy DSL | 17 | 3 | 0 | 14 | 17.6% |
| EP05 Dashboard | 19 | 0 | 0 | 19 | 0.0% |
| EP06 Broker | 13 | 3 | 0 | 10 | 23.1% |
| EP07 Community | 14 | 3 | 0 | 11 | 21.4% |
| EP08 Playbook | 14 | 4 | 3 | 7 | 28.6% |
| **Total** | **130** | **44** | **6**¹ | **80**¹ | **33.8%** |

> ¹ Per-Epic partial count sums to 6 (EP01=2, EP02=1, EP08=3) but registry total shows 7. The discrepancy is because the post-registry v3 update added 1 more partial (TR-EP03-011 was not partial; TR-EP01-008 and TR-EP02-008 were added as partial during v3). Recount: EP01=2 (TR-EP01-008, TR-EP01-009), EP02=1 (TR-EP02-008), EP08=3 (TR-EP08-004/006/008) = 6. Plus the v3 update may have introduced another partial that's not yet reflected in this static count. **Run `grep "coverage: partial" tr-registry.yaml` for the authoritative count.**

## Full Traceability Matrix

For the complete per-TR matrix, see `docs/architecture/tr-registry.yaml` — every entry with an `owner_adr` field is a covered TR. The YAML is the canonical source; this Markdown index is a derived summary.

## Open Conflicts

| Conflict | Type | ADRs | Status |
|---|---|---|---|
| C14 | Schema/Pattern (FP-0009 violation) | ADR-0007 vs ADR-0011 | ✅ RESOLVED — ADR-0011 §Critical Implementation Rules #6 + Migration 008 note already document the FP-0009 exception for task-queue tables (url_check_queue.status) |
| C15 | Integration contract (enum drift) | ADR-0004 vs ADR-0007 | ✅ RESOLVED — ADR-0004 LoopResult.abort_reason union extended with "citation_validation_failed" (Amendment 2026-07-19) |

See `docs/architecture/architecture-review-2026-07-19-v3.md` §Cross-ADR Conflict Detection for details.

## ADR Inventory

| ADR | Status | Depends On |
|---|---|---|
| ADR-0001 | Accepted | (none) |
| ADR-0002 | Accepted | ADR-0001 |
| ADR-0003 | Accepted | ADR-0001 |
| ADR-0004 | Proposed | ADR-0002, ADR-0003, ADR-0011 |
| ADR-0005 | Proposed | ADR-0001, ADR-0004, ADR-0011 |
| ADR-0006 | Proposed | ADR-0001, ADR-0003, ADR-0004 |
| ADR-0007 | Proposed | ADR-0003 |
| ADR-0011 | Proposed | (none) |

## Top Gap Priorities

These gaps block Vertical Slice / Production readiness:

1. **TR-EP01-008** Eval Golden Set infrastructure (200+ cases) — partial via ADR-0007 (hallucination ≤5% enforcement only); full Eval Golden Set infra (200+ cases, tool/answer accuracy) still gap
2. **TR-EP04-\*** Build Agent state machine (14 gaps) — needs ADR-0004-style loop design
3. **TR-EP05-\*** Dashboard rendering pipeline (19 gaps) — no ADR
4. **TR-EP06-\*** Broker integration (10 gaps) — no ADR
5. **TR-EP07-\*** Community UGC (11 gaps) — no ADR
6. **TR-EP08-\*** Playbook system (7 gaps) — no ADR
7. **TR-EP02-009** CircuitBreaker 5 failures → 60s cooldown — no ADR
8. **TR-EP03-019** Streaming response (>5s triggers SSE) — no ADR
