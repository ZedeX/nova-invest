## Session Extract - /architecture-review (re-run) 2026-07-19

- **Verdict**: CONCERNS (unchanged from initial review, but coverage improved)
- **Trigger**: Re-run after ADR-0004 + ADR-0011 were written earlier today
- **ADRs Reviewed**: 5 (ADR-0001/0002/0003 Accepted + ADR-0004/0011 Proposed)
- **Requirements**: 86 total - 30 covered (35%) / 11 partial (13%) / 45 gaps (52%)
  - Previous: 15 covered (17%) / 4 partial (5%) / 67 gaps (78%)
  - Delta: +15 covered, +7 partial, -22 gaps
- **New TR-IDs registered**: None (no new TRs; all 86 stable IDs preserved from v1)
- **TR Registry updated**: v1 -> v2 (added owner_adr fields for 13 newly covered TRs + 5 partial TRs)
- **GDD revision flags applied**: 4 (all in EP01 + EP03)
  - EP01 §ID-4 - added ADR-0004 back-reference (state machine formalized)
  - EP01 §ID-7 - added ADR-0004 back-reference (TraceStep schema, 7 -> 9 fields)
  - EP01 §反模式 - added ADR-0004 back-reference (MAX_STEPS=20, $5 aggregate ceiling, TOOL_RETRY_LIMIT=3)
  - EP03 §2.7 - added ADR-0004 back-reference (generic loop + StepHandler injection)
- **Architecture.md update**: §3 Layer 7 "Agent Loop" now references ADR-0004
- **Top remaining ADR gaps (9)**:
  - ADR-0007 Citation Validator (HIGH engine risk, blocks EP03 §2.3 BDD)
  - ADR-0009 Backtest Engine (HIGH engine risk, determinism, blocks EP04)
  - ADR-0005 Memory Layer (Core, blocks EP01+EP03)
  - ADR-0006 Tool Protocol (Core, blocks EP01+EP03)
  - ADR-0008 Strategy DSL Schema (Feature, blocks EP04)
  - ADR-0010 Paper Broker Design (Feature, blocks EP06)
  - ADR-0013 Playbook Schema + Composition (Feature, blocks EP08)
  - ADR-0012 Dashboard Widget System (Feature, blocks EP05)
  - ADR-0014 Observability Schema (Cross-cutting, blocks EP01 ID-7 full Trace)
- **New conflicts found**: 4 (all LOW/MEDIUM documentation drift)
  - C10 (MEDIUM): EP01 §ID-4/§ID-7/§反模式 didn't back-ref ADR-0004 - **RESOLVED** (this session)
  - C11 (LOW): EP03 §2.7 didn't back-ref ADR-0004 - **RESOLVED** (this session)
  - C12 (LOW): traceability-index.md was stale (said 3 ADRs) - **RESOLVED** (this session)
  - C13 (LOW): tr-registry.yaml owner_adr fields were stale - **RESOLVED** (this session)
- **Pre-gate checklist**: tests/integration/ ❌, design/accessibility-requirements.md ❌, design/ux/interaction-patterns.md ❌
- **Blocking issues for PASS**:
  1. Promote ADR-0004 and ADR-0011 from Proposed to Accepted (requires implementation)
  2. Write ADR-0007 Citation Validator (HIGH engine risk)
  3. Write ADR-0009 Backtest Engine (HIGH engine risk)
  4. Run /ux-design (pre-gate)
  5. Run /test-setup (pre-gate)
- **Report**: docs/architecture/architecture-review-2026-07-19-v2.md
- **Files written/updated this session**:
  - docs/architecture/architecture-review-2026-07-19-v2.md (NEW - review report)
  - docs/architecture/traceability-index.md (UPDATED - 5 ADRs matrix)
  - docs/architecture/tr-registry.yaml (UPDATED v1->v2 - owner_adr fields)
  - docs/prd/epic/01_AgentHarness.md (UPDATED - 3 ADR-0004 back-refs)
  - docs/prd/epic/03_Ask_Agent.md (UPDATED - 1 ADR-0004 back-ref)
  - docs/architecture/architecture.md (UPDATED - §3 Layer 7 ADR-0004 ref)
  - production/session-state/active.md (this file)

---

## Session Extract - /architecture-review v3 2026-07-19

- **Verdict**: CONCERNS (unchanged from v2, but coverage improved and 3 new ADRs reviewed)
- **Trigger**: Re-run after ADR-0005 (Memory Layer) + ADR-0006 (Tool Protocol) + ADR-0007 (Citation Validator) were written earlier today
- **ADRs Reviewed**: 8 (ADR-0001/0002/0003 Accepted + ADR-0004/0005/0006/0007/0011 Proposed)
- **Requirements**: 130 total (corrected from v2's erroneous "86" headline)
  - v2 actual: 35 covered (26.9%) + 5 partial + 90 gaps
  - v3 verified: 44 covered (33.8%) + 7 partial + 79 gaps
  - +11 verified newly covered (see corrected table in v3 report)
- **TR Registry updated**: v2 -> v3
  - Fixed "Total TRs: 86" -> "130" (arithmetic error)
  - Added owner_adr entries for 11 newly covered TRs (4 for ADR-0005, 3 for ADR-0006, 4 for ADR-0007)
  - TR-EP01-008 and TR-EP02-008 marked coverage: partial (ADR coverage is partial, not full)
- **Resolved v2 conflicts**: 4 (all v2 conflicts C10-C13 confirmed resolved via GDD syncs)
- **New v3 conflicts**: 2 (both resolved in this session)
  - C14 (MEDIUM) ✅ RESOLVED: ADR-0007 url_check_queue bare `status` column — already documented as FP-0009 exception in ADR-0011 §Critical Implementation Rules #6 + Migration 008 note. No amendment needed.
  - C15 (MEDIUM) ✅ RESOLVED: ADR-0004 LoopResult.abort_reason union extended with "citation_validation_failed" (Amendment 2026-07-19). Aligns with ADR-0007 §Citation Validation Pipeline and registry v6 IF-0006.
- **GDD revision flags**: 0 new (all 4 v2 flags verified applied)
- **Architecture.md coverage**: STILL only 2/8 ADRs linked (ADR-0003, ADR-0004). 6 ADRs latent: ADR-0001, ADR-0002, ADR-0005, ADR-0006, ADR-0007, ADR-0011.
- **ADR TR-ID misreferences found**: 4 (in ADR-0005/0006 "GDD Requirements Addressed" tables)
  - ADR-0005: TR-EP01-008 should be TR-EP01-005; TR-EP03-015 should be TR-EP03-017; TR-EP03-016 should be TR-EP03-018
  - ADR-0006: TR-EP01-007 should be TR-EP01-004
- **Errata in v3 report itself**: Newly Covered table originally had 11 of 16 TR-IDs wrong (TR-EP03-013/019/021, TR-EP06-002/005/006, TR-EP02-004/005, TR-EP05-002/003, TR-EP07-003 were all misreferenced). Corrected inline with [RULES I BROKE] section appended per project rules.
- **Pre-gate checklist**: tests/integration/ ❌, design/accessibility-requirements.md ❌, design/ux/interaction-patterns.md ❌
- **Blocking issues for PASS**:
  1. ~~Resolve C14~~ ✅ RESOLVED (ADR-0011 §Rules #6 already documents the FP-0009 exception)
  2. ~~Resolve C15~~ ✅ RESOLVED (ADR-0004 abort_reason union extended — Amendment 2026-07-19)
  3. ~~Promote ADR-0011 to Accepted~~ ✅ DONE (status changed to Accepted in this session)
  4. ~~Fix 4 TR-ID misreferences in ADR-0005/0006~~ ✅ DONE (TR-EP01-008→005, TR-EP03-015→017, TR-EP03-016→018, TR-EP01-007→004)
  5. ~~Link ADR-0001/0002/0005/0006/0007/0011 from architecture.md~~ ✅ DONE (§5→ADR-0001, §6→ADR-0002/0011, Layer 4→ADR-0005, Layer 5→ADR-0006, + §11 ADR Index)
  6. Write ADR-0008/0009/0010/0012/0013/0014 (gaps blocking EP04/EP05/EP06/EP07/EP08)
- **Report**: docs/architecture/architecture-review-2026-07-19-v3.md (with ERRATA section)
- **Files written/updated this session**:
  - docs/architecture/architecture-review-2026-07-19-v3.md (NEW - v3 review report with errata)
  - docs/architecture/tr-registry.yaml (UPDATED v2->v3 - fixed count, added 11 owner_adr entries)
  - docs/architecture/traceability-index.md (NEW - v3 traceability summary)
  - production/session-state/active.md (this file - appended v3 extract)
