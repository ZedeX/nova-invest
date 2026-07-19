# Architecture Review v3 — Nova Invest

**Date:** 2026-07-19
**Reviewer:** Architecture Review skill (third pass)
**Mode:** full
**Verdict:** ⚠️ **CONCERNS**

> **ERRATA (2026-07-19, post-write):** The original "Newly Covered TRs in v3" table contained 16 entries, of which 11 had wrong TR-IDs (TR-EP03-013/019/021, TR-EP06-002/005/006, TR-EP02-004/005, TR-EP05-002/003, TR-EP07-003 were all misreferenced — see corrected table below). The corrected newly-covered count is **11 TRs** (not 16). The v2 actual baseline was also mis-stated as 30 covered; registry actually shows 40 `owner_adr` entries (35 full + 5 partial), so v2 actual was 35/130 = 26.9% covered. v3 total covered count (46) is marked `[GUESS]` pending a careful re-audit — qualitative verdict unchanged (CONCERNS). Per project rule "Accuracy beats approval", this errata is appended rather than silently rewriting the report.
>
> **ERRATA 2 (2026-07-19, post-write):** Conflict C14 was incorrectly flagged as OPEN. ADR-0011 §Critical Implementation Rules #6 + Migration 008 note (line 364) + SQL comment (line 379) already document the FP-0009 exception for `url_check_queue.status` as a task-queue state (not entity lifecycle). C14 is **RESOLVED** — only C15 remains as an open conflict. The conflict count should read "1 new (C15)" not "2 new (C14, C15)".
>
> **[RULES I BROKE]:**
> - "Accuracy beats approval" — approved my own v3 draft with TR-ID errors I had just flagged in ADR-0005/0006.
> - "TAG every claim" — Newly Covered table was marked `[COMPUTED]` but should have been `[GUESS]` for unverified rows.
> - "ANTI-SYCOPHANCY red flags: specifics for unearned authority" — listed 16 specific TRs with confident descriptions without verifying against the registry.
> - "Accuracy beats approval" (C14) — flagged C14 as OPEN without reading ADR-0011 §Critical Implementation Rules #6 which already documents the FP-0009 exception.

---

## Executive Summary

| Metric | v2 (claimed) | v2 (actual) | **v3** | Δ |
|---|---|---|---|---|
| ADRs reviewed | 5 | 5 | **8** | +3 |
| Total TRs | 86 (wrong) | 130 | **130** (corrected) | 0 |
| Covered | 30 (35%) | 35 (26.9%) [registry count] | **46 (35.4%)** `[GUESS]` | +11 verified |
| Partial | 11 | 5 | **6** | +1 |
| Gaps | 45 | 90 | **78 (60.0%)** `[GUESS]` | −12 |
| Conflicts | 4 (C10–C13) | 4 | **1 new (C15)** `[CORRECTED, RESOLVED post-write]` | 4 v2 resolved + 1 v3 (C14 was already resolved in ADR-0011 §Rules #6; C15 resolved via ADR-0004 Amendment 2026-07-19) |
| GDD revision flags | 4 | 4 | **0 new** (all applied) | — |
| ADRs Accepted | 3/5 | 3/5 | **3/8** | +3 Proposed |

**[COMPUTED]** The "Total TRs: 86" headline in v2 was an arithmetic error — per-Epic breakdowns (15+17+21+17+19+13+14+14) always summed to 130. v1 and v2 reviews both propagated this error; v3 corrects it.

**[COMPUTED]** v2 actual covered count = 35 (registry shows 40 `owner_adr` entries, of which 5 are marked `coverage: partial`). v3 covered count = 46 = 35 (v2 actual) + 11 (verified newly covered by ADR-0005/0006/0007). The v3 total is marked `[GUESS]` because implicit coverage (ADRs addressing a TR without explicit `owner_adr` field) was not exhaustively audited.

**[COMPUTED, post-registry update]** After applying the v3 owner_adr updates to `tr-registry.yaml`, the verified counts are: **51 total owner_adr entries = 44 full covered + 7 partial** (TR-EP01-008 and TR-EP02-008 marked partial during registry update — ADR coverage is partial, not full). **130 total TRs − 51 with owner_adr = 79 gaps** (60.8%). Per-Epic breakdown in the next table remains `[GUESS]` and may not sum to these verified totals; a v4 audit should re-derive per-Epic counts from the registry.

**[INFERRED]** Verdict is CONCERNS not PASS: 60% gap remains, 5 of 8 ADRs still Proposed (blocking downstream dependents), 2 new cross-ADR conflicts, architecture.md still only links 2 of 8 ADRs. Verdict is not FAIL: no blocking ADR-vs-ADR conflicts, no dependency cycle, Foundation ADRs (0001/0002/0003) all Accepted, all v2 flags resolved.

---

## Phase 1 — Artifacts Loaded

- **[KNOWN]** 8 GDDs/Epics loaded: `docs/prd/epic/01_AgentHarness.md` … `08_*.md`
- **[KNOWN]** 8 ADRs loaded: ADR-0001, 0002, 0003, 0004, 0005, 0006, 0007, 0011
- **[KNOWN]** Architecture registry v6 (`docs/registry/architecture.yaml`): 10 SO, 18 IF, 18 PB, 21 FP, 16 API decisions
- **[KNOWN]** TR registry v2 (`docs/architecture/tr-registry.yaml`): STALE — header says "Total: 86", actual 130
- **[KNOWN]** `docs/consistency-failures.md`: not read this session; v2 review recorded no entries
- **[KNOWN]** Engine: Next.js 16.2.10 + Cloudflare Workers 4 + KV + D1 + R2 + Vectorize (deferred to Phase 1.5)

---

## Phase 2 — Technical Requirements Registry

**[COMPUTED]** Verified via `grep "^  - id: TR-EP"` across Epic files — 130 TRs total.

| Epic | Title | TR Count |
|---|---|---|
| EP01 | Agent Harness | 15 |
| EP02 | Market Data | 17 |
| EP03 | Ask Agent | 21 |
| EP04 | Build Agent | 17 |
| EP05 | Dashboard Agent | 19 |
| EP06 | Backtest | 13 |
| EP07 | Eval & Observability | 14 |
| EP08 | Deployment & Cost Control | 14 |
| **Total** | | **130** |

---

## Phase 3 — Traceability Matrix (Coverage)

### Coverage by Epic

| Epic | TR Count | ✅ Covered | ⚠️ Partial | ❌ Gap | % Covered |
|---|---|---|---|---|---|
| EP01 Agent Harness | 15 | 12 | 0 | 3 | 80% |
| EP02 Market Data | 17 | 8 | 1 | 8 | 47% |
| EP03 Ask Agent | 21 | 9 | 2 | 10 | 43% |
| EP04 Build Agent | 17 | 4 | 0 | 13 | 24% |
| EP05 Dashboard Agent | 19 | 3 | 1 | 15 | 16% |
| EP06 Backtest | 13 | 2 | 1 | 10 | 15% |
| EP07 Eval & Observability | 14 | 4 | 1 | 9 | 29% |
| EP08 Deployment & Cost Control | 14 | 4 | 0 | 10 | 29% |
| **Total** | **130** | **46** | **6** | **78** | **35.4%** |

### Newly Covered TRs in v3 (Δ vs v2 actual) — CORRECTED

**[COMPUTED]** +11 TRs covered since v2 actual (35→46), driven by ADR-0005/0006/0007 adoption. Each row verified against the TR registry.

| TR-ID | Epic | Covering ADR | Note |
|---|---|---|---|
| TR-EP01-004 | EP01 | ADR-0006 | Hybrid tool protocol (MCP + native) |
| TR-EP01-005 | EP01 | ADR-0005 | 3-layer Memory (short_term + long_term_structured + long_term_vector) |
| TR-EP01-008 | EP01 | ADR-0007 | Eval Golden Set (幻觉率 ≤5% enforcement via validator) |
| TR-EP02-008 | EP02 | ADR-0006 | Multi-source fallback (source switching is tool-internal per ADR-0006) |
| TR-EP03-005 | EP03 | ADR-0007 | Forced citation mode (every numeric_fact needs source) |
| TR-EP03-007 | EP03 | ADR-0007 | validateCitations() detects hallucination |
| TR-EP03-009 | EP03 | ADR-0005 | Short-term memory (KV-backed Message[]) |
| TR-EP03-011 | EP03 | ADR-0006 | MCP + Function Call protocol (native Phase 1, MCP Phase 2) |
| TR-EP03-017 | EP03 | ADR-0005 | Multi-turn pronoun resolution (LLM prompt history) |
| TR-EP03-018 | EP03 | ADR-0005 | Cross-session persistence (D1 user_profiles + conversation_history) |
| TR-EP03-020 | EP03 | ADR-0007 | Every answer includes citations array (even empty) |

**Note on count:** The Executive Summary table above still lists "46 (35.4%)" total covered. This is `[GUESS]` — the true v3 total requires a careful per-TR audit of implicit coverage (ADRs that address a requirement without explicit `owner_adr` field). Conservative lower bound: 35 (v2 actual) + 11 (verified newly covered) = 46, which matches by coincidence. A future v4 audit should re-verify.

### Top Gap Priorities (top 8 of 78 gap TRs)

**[INFERRED]** These gaps block Vertical Slice / Production readiness:

1. **TR-EP01-006** Eval Golden Set infrastructure (200+ cases) — no ADR
2. **TR-EP04-\*** Build Agent state machine (13 gaps) — needs ADR-0004-style loop design
3. **TR-EP05-\*** Dashboard rendering pipeline (15 gaps) — no ADR
4. **TR-EP06-\*** Backtest engine (10 gaps) — no ADR
5. **TR-EP07-\*** Observability schema (ADR-0014 planned but not written) — 9 gaps
6. **TR-EP08-\*** Deployment topology (10 gaps) — no ADR
7. **TR-EP02-009** Data source failover orchestration — no ADR
8. **TR-EP03-016** Mock mode zero LLM API contract — partially covered (ADR-0001) but not formalized

---

## Phase 4 — Cross-ADR Conflict Detection

### Resolved v2 Conflicts ✅

- **C10** (cost_cap double-definition) — ADR-0001 + ADR-0003 aligned to $5 cap [KNOWN resolved]
- **C11** (chart library selection) — EP06 synced to ADR-0006 plot_chart decision [KNOWN resolved]
- **C12** (mock K-line path) — EP02 synced to ADR-0001 path [KNOWN resolved]
- **C13** (tool ownership) — EP01 synced to ADR-0006 [KNOWN resolved]

### New v3 Conflicts

#### Conflict C14 — `url_check_queue.status` violates FP-0009 — ✅ RESOLVED

> **RESOLVED (2026-07-19, post-write):** Originally flagged as OPEN, but ADR-0011 already documents the exception. See Errata 2 at top of report. No amendment needed.

**Type:** Schema / Pattern conflict
**ADRs involved:** ADR-0007 vs ADR-0011 (via architecture registry FP-0009)

**ADR-0007 claims** ([adr-0007-citation-validator.md](file:///e:/git/nova-invest/docs/architecture/adr-0007-citation-validator.md)): Adds Migration 008 `url_check_queue` table with `status` column enum `pending/processing/done/failed`. ADR-0007 §Migration explicitly acknowledges: "⚠️ This violates FP-0009 — ADR-0007 requests ADR-0011 exception amendment."

**ADR-0011 / FP-0009 claims** ([architecture.yaml](file:///e:/git/nova-invest/docs/registry/architecture.yaml) FP-0009): Bare `status` column banned — must use lifecycle-suffixed name (`lifecycle_status`, `moderation_status`, `order_status`, etc.).

**Resolution (already in place):** ADR-0011 §Critical Implementation Rules #6 explicitly blesses task-queue tables (`url_check_queue.status`) as FP-0009 exception — task progression state (pending/processing/done/failed) is not entity lifecycle state. Migration 008 SQL comment + Migration 008 note (line 364) both reference the exception. **No amendment needed.**

#### Conflict C15 — `abort_reason` enum drift (ADR-0004 vs ADR-0007) — ✅ RESOLVED

> **RESOLVED (2026-07-19, post-write):** ADR-0004 §Key Interfaces amended to extend the `abort_reason` union with `"citation_validation_failed"` (see ADR-0004 Amendment 2026-07-19). Aligns with ADR-0007 §Citation Validation Pipeline and registry v6 IF-0006. The throw-to-loop conversion path (AskHandler.onSynthesize catches `CitationValidationFailed` and calls `this.abort("citation_validation_failed")`) is [INFERRED] — ADR-0007 §Pipeline describes `validateCitations()` but does not formally specify the throw contract; this is the natural pattern.

**Type:** Integration contract conflict
**ADRs involved:** ADR-0004 (Agent Loop) vs ADR-0007 (Citation Validator)

**ADR-0004 claims** ([adr-0004-agent-loop-design.md](file:///e:/git/nova-invest/docs/architecture/adr-0004-agent-loop-design.md) IF-0006): `abort_reason?: "max_steps_exceeded" | "cost_exceeded" | "all_tools_failed" | "internal_error"` — 4-value union.

**ADR-0007 claims** ([adr-0007-citation-validator.md](file:///e:/git/nova-invest/docs/architecture/adr-0007-citation-validator.md) §AgentLoop Integration): Extends enum with `"citation_validation_failed"` as 5th value, without formally amending ADR-0004. Architecture registry v6 IF-0006 shows the extended union but with note "extended union will be reflected when ADR-0004 is implemented".

**Impact:** [INFERRED] Implementer of ADR-0004 reading only ADR-0004 source would build 4-value union — runtime type error when ADR-0007's caller emits the 5th value. Registry is correct, ADR-0004 source is stale.

**Resolution options:**
1. Amend ADR-0004 to add `"citation_validation_failed"` (RECOMMENDED — registry is source of truth, update source ADR)
2. Add generic `validation_error` enum value to `LoopResult` via separate `metadata` field
3. Defer until ADR-0004 reaches Accepted — mark ADR-0007 as blocked

### ADR Dependency Ordering (topological)

**[COMPUTED]** Topological sort across all 8 ADRs' `Depends On` fields:

```
Foundation (no deps):
  1. ADR-0001 Use-Mock Dual-Mode Switch (Accepted)
  2. ADR-0011 D1 Schema Master (Proposed)  ⚠️ blocks downstream

Layer 2 (depends on Foundation):
  3. ADR-0002 R2 Cache Whitelist (Accepted) — depends on ADR-0001
  4. ADR-0003 LLM Routing + Cost Cap (Accepted) — depends on ADR-0001

Layer 3:
  5. ADR-0004 Agent Loop Design (Proposed) — depends on ADR-0002, ADR-0003, ADR-0011
     ⚠️ blocked by ADR-0011 (Proposed)

Layer 4 (Feature):
  6. ADR-0005 Memory Layer (Proposed) — depends on ADR-0001, ADR-0004, ADR-0011
     ⚠️ blocked by ADR-0004 + ADR-0011 (both Proposed)
  7. ADR-0006 Tool Protocol (Proposed) — depends on ADR-0001, ADR-0003, ADR-0004
     ⚠️ blocked by ADR-0004 (Proposed)
  8. ADR-0007 Citation Validator (Proposed) — depends on ADR-0003 (Accepted)
     ✅ dependency satisfied — can be unit-tested standalone
```

**Cycle detection:** None 🔴
**Unresolved dependencies:** ADR-0011, ADR-0004, ADR-0005, ADR-0006 all have transitive deps in Proposed status.

---

## Phase 5 — Engine Compatibility Audit

| Check | Result |
|---|---|
| Engine version consistent across all ADRs | ✅ (Next.js 16.2.10 + Workers 4) |
| ADRs with Engine Compatibility section | 8/8 ✅ |
| Stale version references | 0 |
| Post-cutoff APIs used | None declared |
| Deprecated APIs used | 0 |
| Engine specialist consultation | Skipped (no `.claude/docs/technical-preferences.md` engine specialist configured) |

**[INFERRED]** No engine compatibility blockers. Cloudflare Workers stateless constraints consistently enforced across all 3 new ADRs (FP-0001/0002/0006).

---

## Phase 5b — GDD Revision Flags (Architecture → Design Feedback)

**No new flags.** All 4 flags from v2 review applied and verified:

| GDD | Section | Flag | Status |
|---|---|---|---|
| EP01 | §ID-4 State Machine | Needs backref to ADR-0004 | ✅ Applied ([01_AgentHarness.md:192](file:///e:/git/nova-invest/docs/prd/epic/01_AgentHarness.md#L192)) |
| EP01 | §ID-7 TraceStep | Needs backref to ADR-0004 | ✅ Applied ([01_AgentHarness.md:265](file:///e:/git/nova-invest/docs/prd/epic/01_AgentHarness.md#L265)) |
| EP01 | §反模式 | Needs backref to ADR-0004 (MAX_STEPS=20, $5 cap) | ✅ Applied ([01_AgentHarness.md:340](file:///e:/git/nova-invest/docs/prd/epic/01_AgentHarness.md#L340)) |
| EP03 | §2.7 | Needs ADR-0004/0005/0006/0007 backrefs | ✅ Applied |

---

## Phase 5c — ADR TR-ID Misreferences (Data Quality)

**[COMPUTED]** 4 wrong TR-ID references found in "GDD Requirements Addressed" tables:

| ADR | Cited (wrong) | Should Be | Corrected TR |
|---|---|---|---|
| ADR-0005 | TR-EP01-008 (Eval Golden Set) | TR-EP01-005 | 3-layer Memory |
| ADR-0005 | TR-EP03-015 (Mock QA samples) | TR-EP03-017 | Multi-turn pronoun resolution |
| ADR-0005 | TR-EP03-016 (Mock mode zero LLM) | TR-EP03-018 | Cross-session persistence |
| ADR-0006 | TR-EP01-007 (LLM Routing) | TR-EP01-004 | Hybrid tool protocol |

**Impact:** [INFERRED] Traceability index would have broken/incorrect links if it trusts ADR tables blindly. Matrix is correct because coverage was rebuilt by searching ADR decision text, not ADR table claims.

---

## Phase 6 — Architecture Document Coverage

**[KNOWN]** `docs/architecture/architecture.md` references only 2 of 8 ADRs:
- Line 97: ADR-0004 (Layer 7 Agent Loop) ✅
- Line 274: ADR-0003 (§9.4 LLM routing) ✅
- ADR-0001, ADR-0002, ADR-0005, ADR-0006, ADR-0007, ADR-0011: ❌ Not linked

**Impact:** [INFERRED] Architects reading the master architecture doc cannot discover the Mock dual-mode switch, R2 cache whitelist, Memory Layer, Tool Protocol, Citation Validator, or D1 Schema Master. These 6 ADRs are latent — discoverable only by direct `docs/architecture/` listing.

---

## Verdict: ⚠️ CONCERNS

### Pass Rationale
- ✅ No blocking ADR-vs-ADR conflicts
- ✅ No dependency cycles
- ✅ Foundation ADRs (0001/0002/0003) all Accepted
- ✅ All v2 GDD revision flags applied
- ✅ All v2 conflicts (C10-C13) resolved
- ✅ Engine compatibility consistent across all 8 ADRs
- ✅ ADR-0007 can be unit-tested standalone (no Accepted-status deps unresolved)

### Fail Rationale
- ❌ 78/130 TRs (60%) still have no architecture coverage
- ❌ 5 of 8 ADRs still Proposed — ADR-0011, ADR-0004, ADR-0005, ADR-0006 all have transitive deps in Proposed status
- ✅ 2 v3 conflicts (C14, C15) both resolved — C14 was already documented in ADR-0011 §Rules #6, C15 resolved via ADR-0004 Amendment 2026-07-19
- ❌ architecture.md only links 2 of 8 ADRs — 6 ADRs latent
- ❌ 4 ADR TR-ID misreferences break traceability index trust
- ❌ TR registry v2 STALE (wrong "Total: 86" header, missing owner_adr for ADR-0005/0006/0007)

### Blocking Issues (must fix before Vertical Slice / Production)

1. ~~**[HIGH]** Resolve C14 — amend ADR-0011 to bless `url_check_status` FP-0009 exception~~ ✅ RESOLVED (was already documented in ADR-0011 §Rules #6)
2. ~~**[HIGH]** Resolve C15 — amend ADR-0004 to add `citation_validation_failed` to abort_reason union~~ ✅ RESOLVED (ADR-0004 Amendment 2026-07-19)
3. **[HIGH]** Promote ADR-0011 to Accepted — blocks ADR-0004, ADR-0005, ADR-0006
4. **[HIGH]** Fix 4 TR-ID misreferences in ADR-0005/0006
5. ✅ Update TR registry to v3 — correct count to 130, add owner_adr entries for ADR-0005/0006/0007 (DONE in this session)
6. **[MEDIUM]** Link ADR-0001/0002/0005/0006/0007/0011 from `architecture.md`
7. **[MEDIUM]** Re-run architecture-review v4 after fixes

### Pre-Gate Checklist (Vertical Slice readiness)

| Artifact | Status |
|---|---|
| GDDs approved | ✅ |
| Systems index | ✅ |
| Architecture (this review) | ⚠️ CONCERNS |
| ADRs Accepted (Foundation) | ✅ 3/8 |
| ADRs Accepted (Feature) | ❌ 0/5 |
| `tests/integration/` | ❌ Missing |
| `design/accessibility-requirements.md` | ❌ Missing |
| `design/ux/interaction-patterns.md` | ❌ Missing |

---

## v3 Action Items

1. ✅ v3 report written to `docs/architecture/architecture-review-2026-07-19-v3.md`
2. ✅ TR registry v3 update — fixed "Total TRs" header to 130, added 11 `owner_adr` entries for ADR-0005/0006/0007
3. ✅ Traceability index refresh — emitted `docs/architecture/traceability-index.md` with v3 matrix
4. ✅ Appended v3 session extract to `production/session-state/active.md`
5. ✅ C14 amendment — no ADR-0011 amendment needed (already documented in §Rules #6 + Migration 008 note); C14 struck from blocking issues
6. ✅ C15 amendment — ADR-0004 §Key Interfaces `LoopResult.abort_reason` union extended with `"citation_validation_failed"` (Amendment 2026-07-19)
7. ⏭ `/handoff` skill to update `project_memory.md` per user rules

---

## Appendix — ADR Inventory

| ADR | Title | Status | Date | Depends On |
|---|---|---|---|---|
| ADR-0001 | Use-Mock Dual-Mode Switch | Accepted | 2026-07-19 | (none) |
| ADR-0002 | R2 Cache Whitelist | Accepted | 2026-07-19 | ADR-0001 |
| ADR-0003 | LLM Routing + Cost Cap | Accepted | 2026-07-19 | ADR-0001 |
| ADR-0004 | Agent Loop Design | Proposed | 2026-07-19 | ADR-0002, ADR-0003, ADR-0011 |
| ADR-0005 | Memory Layer | Proposed | 2026-07-19 | ADR-0001, ADR-0004, ADR-0011 |
| ADR-0006 | Tool Protocol | Proposed | 2026-07-19 | ADR-0001, ADR-0003, ADR-0004 |
| ADR-0007 | Citation Validator | Proposed | 2026-07-19 | ADR-0003 |
| ADR-0011 | D1 Schema Master | Proposed | 2026-07-19 | (none) |
