# Architecture Review Report (v2 - Re-run after ADR-0004 + ADR-0011)

**Date**: 2026-07-19 (re-run)
**Engine**: Next.js 16.2.10 + Cloudflare Workers 4 + R2 + D1 + Vectorize
**GDDs Reviewed**: 8 Epics (EP01-EP08) + Master PRD
**ADRs Reviewed**: 5 (ADR-0001/0002/0003 Accepted + ADR-0004/0011 Proposed)
**Mode**: full
**Reviewer**: /architecture-review skill
**Previous Review**: `docs/architecture/architecture-review-2026-07-19.md` (3 ADRs, 17% coverage, CONCERNS)

---

## Traceability Summary

| Status | Count | % | (prev) |
|--------|-------|---|--------|
| Total requirements | 86 | 100% | 86 |
| ✅ Covered | 30 | 35% | 15 (17%) |
| ⚠️ Partial | 11 | 13% | 4 (5%) |
| ❌ Gaps | 45 | 52% | 67 (78%) |

**Delta**: +15 newly covered, +7 newly partial. Coverage nearly doubled.

### Coverage by Epic

| Epic | Total TRs | Covered | Partial | Gaps | Primary ADR | Δ Covered |
|------|-----------|---------|---------|------|-------------|-----------|
| EP01 Agent Harness | 15 | 5 | 2 | 8 | ADR-0001/0003/0004 | +2 |
| EP02 Data Layer | 17 | 11 | 3 | 3 | ADR-0001/0002/0011 | +2 |
| EP03 Ask Agent | 21 | 6 | 1 | 14 | ADR-0003 (+0004 partial) | +1 cov, +1 partial |
| EP04 Strategy DSL | 17 | 3 | 0 | 14 | ADR-0001/0011 | +1 |
| EP05 Dashboard | 19 | 0 | 0 | 19 | None | 0 |
| EP06 Broker Integration | 13 | 3 | 0 | 10 | ADR-0001/0011 | +2 |
| EP07 Share & Community | 14 | 2 | 1 | 11 | ADR-0002/0011 | +2 |
| EP08 Playbook System | 14 | 0 | 4 | 10 | ADR-0002/0011 (partial) | +4 partial |

---

## Newly Covered TRs (13)

### By ADR-0004 (Agent Loop Design)
- **TR-EP01-003**: ReAct loop with max_steps ≤20 and cost ceiling per query
  - ADR-0004 §Constants: `MAX_STEPS=20`, `AGGREGATE_COST_CEILING_USD=5`
- **TR-EP01-006**: Agent Loop state machine Init->Plan->Execute->ToolCall->Synthesize->FinalAnswer + Fallback + CostExceeded->Degrade
  - ADR-0004 §State Machine + `LoopState` type + `run()` control flow

### By ADR-0011 (D1 Schema Master)
- **TR-EP02-006**: D1 schema: symbols/watchlists/kline_cache_index/fundamentals 4 tables
  - ADR-0011 §Migration 002 (4 tables with FKs)
- **TR-EP02-013**: db:seed script initializes D1 metadata
  - ADR-0011 §Migration Plan step 4 (seed.sql with 10 mock symbols + 100 S&P + test user + broker account + 3 strategies)
- **TR-EP03-010**: Long-term memory D1 schema (user_profiles + conversation_history)
  - ADR-0011 §Migration 003 (holdings_json column REMOVED per ADR-0011)
- **TR-EP04-010**: D1 schema: strategies + backtest_results
  - ADR-0011 §Migration 004 (FK to users)
- **TR-EP06-005**: D1 schema: broker_accounts/orders/positions/trades 4 tables
  - ADR-0011 §Migration 005 (`symbol` renamed to `ticker`; FKs to symbols + strategies added)
- **TR-EP06-008**: Order ID generation `ord_<timestamp>_<random6>`
  - ADR-0011 §orders.id TEXT PRIMARY KEY (app-generated per EP06 ID-3 pattern)
- **TR-EP07-002**: D1 schema: community_playbooks + 4 related tables
  - ADR-0011 §Migration 007 (5 tables; `yaml_r2_key` removed; `status` renamed to `moderation_status`)
- **TR-EP07-006**: Install creates reference (not content copy)
  - ADR-0011 §user_playbook_installs (references playbook_id + package_id, no content copy)

## Newly Partial TRs (7)

### By ADR-0004
- **TR-EP01-009**: Trace + TraceStep schema
  - Partial: ADR-0004 defines `TraceStep` (with added `state` + `timestamp` fields); full `Trace` aggregation shape deferred to ADR-0014 Observability Schema
- **TR-EP03-012**: Ask Agent Loop state machine (Init->Classify->SimpleQA/DeepResearch/ToolCall/Clarify->RAGRetrieve->CheckCost->LLMCall->ValidateCitations->SaveMemory)
  - Partial: ADR-0004 provides the generic 6-state loop; Ask-specific state behavior (Classify, RAGRetrieve, ValidateCitations, SaveMemory) goes in `StepHandler` implementations (not yet ADR'd)

### By ADR-0011
- **TR-EP08-004**: Parallel composition weight must sum to 1.0 (tolerance 0.001)
  - Partial: ADR-0011 §playbook_dependencies.weight REAL column provided; app-level sum validation not ADR'd
- **TR-EP08-006**: SemVer versioning with strict validation (must be > current)
  - Partial: ADR-0011 §playbook_versions.version TEXT column provided; app-level `semver.valid()` + comparison not ADR'd
- **TR-EP08-008**: D1 schema: playbooks + playbook_versions + playbook_dependencies + user_playbooks 4 tables
  - Partial: ADR-0011 §Migration 006 defines 3 tables (playbooks, playbook_versions, playbook_dependencies); EP08 `user_playbooks` is merged with EP07 `playbook_installs` into `user_playbook_installs` (Migration 007, shared with EP07)

---

## Cross-ADR Conflict Detection

**No ADR-vs-ADR conflicts.** All 5 ADRs are internally consistent:

- ADR-0004 depends on ADR-0001 (`getProvider()`) + ADR-0003 (`getLLM()`) - both Accepted, no cycle
- ADR-0011 depends on ADR-0001 (mock_data_path) + ADR-0002 (r2_cache_symbols_set) - both Accepted, no cycle
- ADR-0004 §Critical Implementation Rules #4 (tool source-switching is tool-internal) is consistent with ADR-0001 §RealProvider fallback chain
- ADR-0011 §Critical Implementation Rules #3 (symbols.is_mockup sync) is consistent with ADR-0002 §R2_CACHE_SYMBOLS
- ADR-0004 §LoopContext.memory_ref forward-references future ADR-0005; ADR-0011 §conversation_history.metadata_json stores trace_id for loop traceability - complementary, no conflict

### New Documentation Conflicts (4 items)

#### 🟠 CONFLICT C10: EP01 §ID-4/§ID-7/§反模式 don't back-reference ADR-0004 [MEDIUM]

- **Type**: Documentation drift (GDD sync gap)
- **EP01 §ID-4** defines the state machine inline (Init->Plan->Execute->ToolCall->Synthesize->FinalAnswer + Fallback + CostExceeded)
- **EP01 §ID-7** defines `TraceStep` schema inline (step_id, parent_id, type, input, output, duration_ms, cost_usd)
- **EP01 §反模式** lists `max_steps > 20` and `single query cost > $5` as inline rules
- **ADR-0004** formalizes all three: `LoopState` type, `TraceStep` interface (adds `state` + `timestamp` fields), `MAX_STEPS=20` / `AGGREGATE_COST_CEILING_USD=5` constants
- **Impact**: Future implementer reading EP01 won't know an ADR exists; may diverge from ADR-0004's exact interface shapes (especially the added `state` and `timestamp` fields on TraceStep).
- **Resolution**: Add ADR-0004 back-references to EP01 §ID-4, §ID-7, §反模式.

#### 🟡 CONFLICT C11: EP03 §2.7 doesn't back-reference ADR-0004 [LOW]

- **Type**: Documentation drift (GDD sync gap)
- **EP03 §2.7** defines Ask-specific loop state machine inline (Classify -> SimpleQA/DeepResearch/ToolCall/Clarify -> RAGRetrieve -> CheckCost -> LLMCall -> ValidateCitations -> SaveMemory)
- **ADR-0004** provides the generic loop; Ask-specific behavior goes in `StepHandler` implementations (per ADR-0004 §GDD Requirements Addressed row for EP03 §2.7)
- **Impact**: Ask Agent implementer may not realize they need to implement `StepHandler` interface to plug into the generic loop.
- **Resolution**: Add ADR-0004 back-reference to EP03 §2.7.

#### 🟡 CONFLICT C12: traceability-index.md is stale [LOW]

- **Type**: Documentation drift
- **traceability-index.md** still says "Total ADRs: 3" and shows all D1 schema TRs (TR-EP02-006, TR-EP03-010, TR-EP04-010, TR-EP06-005, TR-EP07-002, TR-EP08-008) as ❌ GAP
- **Reality**: 5 ADRs exist; ADR-0011 covers 8+ D1 schema TRs
- **Resolution**: This review updates traceability-index.md in place.

#### 🟡 CONFLICT C13: tr-registry.yaml owner_adr fields stale [LOW]

- **Type**: Documentation drift
- **tr-registry.yaml** has `owner_adr: ADR-0001/0002/0003` entries but no `owner_adr: ADR-0004` or `owner_adr: ADR-0011` entries
- **Impact**: Story authors querying the registry by ADR won't find ADR-0004/0011 TRs.
- **Resolution**: This review updates tr-registry.yaml owner_adr fields.

### Previously-Resolved Conflicts (from earlier review today)

C1-C8 from the previous review (`architecture-review-2026-07-19.md`):
- C1 (USE_MOCK semantics): **Resolved** - EP01 §ID-5 and EP03 §2.2 updated to use ENVIRONMENT for local/cloud split
- C2 (simple_qa cost_cap $0.01 vs $0.001): **Resolved** - EP01 §ID-5 + §BDD updated to $0.001
- C3 (Intent taxonomy mismatch): **Partially resolved** - EP01 §ID-5 has note "待 ADR-0004 扩展或新建 ADR" (still accurate - ADR-0004 explicitly defers Build Agent intents)
- C4 (R2 TTL): **Resolved** - EP02 §2.3 updated to price=3600
- C5 (Mock data path): **Resolved** - EP07 §ID-7 updated to web/public/mock/community/
- C6 (Tool naming get_quote vs get_current_price): **Unresolved** - low priority, awaiting human decision
- C7 (architecture.md §5.3 community D1 seed): **Resolved** - updated to web/public/mock/community/*.json
- C8 (EP02 §8 acceptance scope): **Resolved** - phase-gated acceptance

---

## ADR Dependency Order

```
Foundation (no dependencies):
  1. ADR-0001: USE_MOCK Dual-Mode Switch [Accepted]

Depends on Foundation:
  2. ADR-0002: R2 Cache Whitelist [Accepted] (requires ADR-0001)
  3. ADR-0003: LLM Routing + Cost Cap [Accepted] (requires ADR-0001)

Depends on ADR-0001 + ADR-0003:
  4. ADR-0004: Agent Loop Design [Proposed] (requires ADR-0001, ADR-0003)

Depends on ADR-0001 + ADR-0002:
  5. ADR-0011: D1 Schema Master [Proposed] (requires ADR-0001, ADR-0002)

Feature layer (Proposed, not yet written):
  6. ADR-0005: Memory Layer (depends on ADR-0001, ADR-0004)
  7. ADR-0006: Tool Protocol (depends on ADR-0001, ADR-0003, ADR-0004)
  8. ADR-0007: Citation Validator (depends on ADR-0003)
  9. ADR-0008: Strategy DSL Schema (depends on ADR-0011)
  10. ADR-0009: Backtest Engine (depends on ADR-0001, ADR-0008)
  11. ADR-0010: Paper Broker Design (depends on ADR-0001, ADR-0011)
  12. ADR-0012: Dashboard Widget System (depends on ADR-0001)
  13. ADR-0013: Playbook Schema + Composition (depends on ADR-0008, ADR-0011)
  14. ADR-0014: Observability Schema (depends on ADR-0004)
```

**No cycles.** All 5 existing ADRs have resolved dependencies.

**⚠️ Proposed-status flag**: ADR-0004 and ADR-0011 are `Proposed`, not `Accepted`. Their dependents (ADR-0005/0006/0014 depend on ADR-0004; ADR-0008/0010/0013 depend on ADR-0011) cannot be safely Accepted until their parents are Accepted. Per ADR skill protocol, `Proposed` ADRs should be promoted to `Accepted` only after their Validation Criteria are satisfied by implementation.

---

## GDD Revision Flags (Architecture -> Design Feedback)

These GDD assumptions conflict with verified ADR decisions. The GDDs should be revised before their systems enter implementation.

| GDD | Current State | Reality (from ADR) | Action |
|-----|---------------|--------------------|--------|
| EP01 §ID-4 | State machine inline, no ADR ref | ADR-0004 §State Machine formalizes as `LoopState` type | Add ADR-0004 reference |
| EP01 §ID-7 | TraceStep inline (7 fields), no ADR ref | ADR-0004 §Key Interfaces defines `TraceStep` with 9 fields (adds `state` + `timestamp`) | Add ADR-0004 reference |
| EP01 §反模式 | max_steps=20, $5 ceiling inline | ADR-0004 §Constants `MAX_STEPS=20`, `AGGREGATE_COST_CEILING_USD=5` | Add ADR-0004 reference |
| EP03 §2.7 | Ask Agent Loop inline, no ADR ref | ADR-0004 generic loop; Ask behavior via `StepHandler` interface | Add ADR-0004 reference |

All 4 GDD revision flags will be applied by this review (per user approval).

---

## Engine Compatibility Issues

**No engine reference docs exist** for this project (web project, not game). Phase 5 engine cross-check adapted as "framework compatibility audit":

- ✅ All 5 ADRs agree on engine: `Next.js 16.2.10 + Cloudflare Workers 4`
- ✅ ADR-0011 adds `Cloudflare D1 (SQLite)` - consistent with Cloudflare stack
- ✅ Verified `web/package.json`: `next: 16.2.10`, `react: 19.2.4`, `wrangler: ^4`, `@cloudflare/workers-types: ^5.20260718.1`
- ✅ All 5 ADRs have `Engine Compatibility` section, `Knowledge Risk: LOW`, `Post-Cutoff APIs Used: None`
- ✅ Code matches ADR intent (with documented TECH_DEBT for module-level cache in ADR-0001/0003)
- ⚠️ **ADR-0004 and ADR-0011 are `Proposed`, not `Accepted`** - engine compatibility is documented but not yet validated by implementation. Their dependents cannot be safely Accepted until parents are Accepted.
- ⚠️ **No ADRs exist for non-foundation systems** - engine risk for Strategy DSL (jsep parser), Dashboard (lightweight-charts), Playbook (SemVer lib) is undocumented

**Specialist consultation skipped** - no `.claude/docs/technical-preferences.md`, no engine specialists configured.

---

## Architecture Document Coverage

`docs/architecture/architecture.md` validation:

- ✅ All 8 modules from systems-index (Master PRD §9.2) appear in architecture §7 module dependencies
- ✅ §3 9-layer Agent Harness maps to EP01 §2 architecture
- ✅ §5.3 Mock dataset (fixed in previous review)
- ✅ §9.4 LLM routing 3-tier (fixed in previous review)
- ⚠️ **§3 Layer 7 "Agent Loop"** doesn't reference ADR-0004 (inline decision now ADR'd) - **will be fixed by this review**
- ⚠️ **§3 Layer 4 "Memory"** doesn't reference future ADR-0005 (no ADR yet - acceptable)
- ⚠️ **No ADR references anywhere in architecture.md** - decisions are inline, not linked to ADR-0001/0002/0003/0004/0011 (except §9.4 which references ADR-0003)
- ⚠️ **No data flow for Build/Dashboard/Broker/Playbook** - §4 only covers Ask Agent flow

---

## Verdict: **CONCERNS**

**Improvement vs previous review**:
- Coverage 17% -> 35% (+18pp)
- Gaps 78% -> 52% (-26pp)
- No new ADR-vs-ADR conflicts
- ADR-0004 and ADR-0011 are internally consistent with existing ADRs and with each other

**Not PASS because:**
1. **52% of requirements still have no ADR** (45/86 gaps)
2. **2 new ADRs are `Proposed`, not `Accepted`** - ADR-0004 and ADR-0011 block their dependents (ADR-0005/0006/0008/0010/0013/0014)
3. **4 GDD sync gaps** - EP01 §ID-4/§ID-7/§反模式 and EP03 §2.7 don't back-reference ADR-0004 (this review applies fixes)
4. **2 HIGH engine risk ADRs still missing** - Citation Validator (ADR-0007), Backtest Engine (ADR-0009)
5. **Pre-gate items still missing** - `tests/integration/`, `design/accessibility-requirements.md`, `design/ux/interaction-patterns.md`
6. **architecture.md has minimal ADR references** - decisions inline, not linked (except §9.4)

**Not FAIL because:**
- No blocking ADR-vs-ADR conflicts
- No dependency cycles
- Foundation ADRs (0001/0002/0003) still Accepted and code-aligned
- New ADRs (0004/0011) are internally consistent with existing ADRs and each other
- Coverage is improving (17% -> 35%)

---

## Blocking Issues (must resolve before PASS)

1. **Promote ADR-0004 and ADR-0011 from Proposed to Accepted** - requires implementation + Validation Criteria sign-off
2. **Apply 4 GDD sync fixes** (this review applies) - back-reference ADR-0004 in EP01 §ID-4/§ID-7/§反模式 and EP03 §2.7
3. **Write ADR-0007 Citation Validator** - HIGH engine risk, blocks EP03 anti-hallucination BDD
4. **Write ADR-0009 Backtest Engine** - HIGH engine risk, determinism + in/out-of-sample contract
5. **Run `/ux-design`** - create `design/accessibility-requirements.md` + `design/ux/interaction-patterns.md` (pre-gate)
6. **Create `tests/integration/` directory** - pre-gate requirement (run `/test-setup`)

---

## Required ADRs (priority order, updated)

1. **ADR-0007: Citation Validator** - HIGH engine risk, blocks EP03 §2.3 BDD (depends on ADR-0003)
2. **ADR-0009: Backtest Engine** - HIGH engine risk, determinism contract, blocks EP04 (depends on ADR-0001, ADR-0008)
3. **ADR-0005: Memory Layer** - Core, blocks EP01+EP03 (depends on ADR-0001, ADR-0004)
4. **ADR-0006: Tool Protocol** - Core, blocks EP01+EP03 (depends on ADR-0001, ADR-0003, ADR-0004)
5. **ADR-0008: Strategy DSL Schema** - Feature, blocks EP04 (depends on ADR-0011)
6. **ADR-0010: Paper Broker Design** - Feature, blocks EP06 (depends on ADR-0001, ADR-0011)
7. **ADR-0013: Playbook Schema + Composition** - Feature, blocks EP08 (depends on ADR-0008, ADR-0011)
8. **ADR-0012: Dashboard Widget System** - Feature, blocks EP05
9. **ADR-0014: Observability Schema** - Cross-cutting, blocks EP01 ID-7 full Trace aggregation (depends on ADR-0004)

---

## Pre-Gate Checklist

| Item | Status | Action if ❌ |
|------|--------|-------------|
| `tests/unit/` directory | ✅ (at `web/tests/unit/`) | - |
| `tests/integration/` directory | ❌ (not yet created) | Run `/test-setup` |
| `.github/workflows/tests.yml` | ✅ | - |
| `design/accessibility-requirements.md` | ❌ (no `design/` dir) | Run `/ux-design` |
| `design/ux/interaction-patterns.md` | ❌ (no `design/` dir) | Run `/ux-design` |

---

## References

- ADRs: `docs/architecture/adr-000{1,2,3,4}-*.md`, `docs/architecture/adr-0011-*.md`
- Architecture registry: `docs/registry/architecture.yaml` (v3, 45 entries)
- Traceability index: `docs/architecture/traceability-index.md` (updated by this review)
- TR registry: `docs/architecture/tr-registry.yaml` (updated by this review)
- Test infra: `web/vitest.config.ts`, `web/playwright.config.ts`, `.github/workflows/tests.yml`
- TDD specs: `web/tests/unit/{use-mock-switch,r2-cache-whitelist,llm-route,classify-intent}.test.ts`
- Previous review: `docs/architecture/architecture-review-2026-07-19.md` (3-ADR baseline, preserved for history)

> End of report.
