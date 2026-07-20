# Architecture Review Report

**Date**: 2026-07-19
**Engine**: Next.js 16.2.10 + Cloudflare Workers 4 + R2 + D1 + Vectorize
**GDDs Reviewed**: 8 Epics (EP01-EP08) + Master PRD
**ADRs Reviewed**: 3 (ADR-0001, ADR-0002, ADR-0003)
**Mode**: full
**Reviewer**: /architecture-review skill

---

## Traceability Summary

| Status | Count | % |
|--------|-------|---|
| Total requirements | 86 | 100% |
| ✅ Covered | 15 | 17% |
| ⚠️ Partial | 4 | 5% |
| ❌ Gaps | 67 | 78% |

### Coverage by Epic

| Epic | Total TRs | Covered | Partial | Gaps | Primary ADR |
|------|-----------|---------|---------|------|-------------|
| EP01 Agent Harness | 15 | 3 | 1 | 11 | ADR-0001/0003 (partial) |
| EP02 Data Layer | 17 | 9 | 2 | 6 | ADR-0001/0002 (well-covered) |
| EP03 Ask Agent | 21 | 7 | 1 | 13 | ADR-0003 (routing only) |
| EP04 Strategy DSL | 17 | 1 | 0 | 16 | None (Mock data inheritance only) |
| EP05 Dashboard | 19 | 0 | 0 | 19 | None |
| EP06 Broker Integration | 13 | 1 | 0 | 12 | None (Mock price inheritance only) |
| EP07 Share & Community | 14 | 0 | 0 | 14 | None |
| EP08 Playbook System | 14 | 0 | 1 | 13 | None |

---

## Coverage Gaps (Critical Foundation/Core Layer)

The 3 existing ADRs cover only **Data Layer foundation** (EP02) and **LLM routing** (EP03 §2.2). The following Foundation/Core requirements have **no ADR**:

| Gap | Epic | Suggested ADR | Engine Risk |
|-----|------|---------------|-------------|
| Agent Loop state machine (ReAct + max_steps + cost ceiling) | EP01 ID-4/ID-5 | `/architecture-decision agent-loop-design` | MEDIUM |
| Memory 3-layer architecture (short/long/vector) | EP01 ID-3, EP03 §2.5 | `/architecture-decision memory-layer` | MEDIUM |
| Tool Calling protocol (MCP + native hybrid) | EP01 ID-2 | `/architecture-decision tool-protocol` | MEDIUM |
| Observability schema (Trace + TraceStep + OTel) | EP01 ID-7 | `/architecture-decision observability-schema` | LOW |
| Citation Validator + anti-hallucination | EP03 §2.3, ID-3 | `/architecture-decision citation-validation` | HIGH |
| Strategy DSL schema + lifecycle state machine | EP04 §2.2/§2.4 | `/architecture-decision strategy-dsl-schema` | MEDIUM |
| BacktestEngine determinism + in/out-of-sample | EP04 §2.5 | `/architecture-decision backtest-engine` | HIGH |
| PaperBroker + BrokerAdapter interface | EP06 §2.2/§2.3 | `/architecture-decision paper-broker-design` | MEDIUM |
| Widget system + charting integration | EP05 §2.3/§2.4 | `/architecture-decision dashboard-widget-system` | LOW |
| Playbook YAML schema + composition semantics | EP08 §2.2/§2.4 | `/architecture-decision playbook-schema` | MEDIUM |
| D1 schema unification (6 Epics define tables independently) | EP02/03/04/06/07/08 | `/architecture-decision d1-schema-master` | HIGH |

---

## Cross-ADR / Cross-Document Conflicts

**Note**: All 3 ADRs are internally consistent (no ADR-vs-ADR conflicts). Conflicts are between **Epic PRDs and ADRs**, or between **PRDs themselves**.

### 🔴 CONFLICT C1: `USE_MOCK` semantics in EP01/EP03 vs ADR-0003 [HIGH]

- **Type**: Integration contract conflict
- **ADR-0003 claims**: 3-tier model - `USE_MOCK=true` -> MockLLM (zero API call, returns JSON samples); `USE_MOCK=false + ENVIRONMENT!="production"` -> LM Studio local; `USE_MOCK=false + ENVIRONMENT="production"` -> Volcengine Ark cloud.
- **EP01 §ID-5 claims**: `USE_MOCK === "true" ? LM Studio : cloud` - 2-tier model conflating Mock with Local LM Studio.
- **EP03 §2.2 claims**: `env_mode = env.USE_MOCK === "true" ? "local" : "cloud"` - same 2-tier conflation.
- **Impact**: A future implementer reading EP01/EP03 will think `USE_MOCK=true` should call LM Studio, contradicting ADR-0003's "Mock mode = zero LLM API calls" hard contract. Current `router.ts` follows ADR-0003 (correct); EP01/EP03 docs are stale.
- **Resolution**: Edit EP01 §ID-5 and EP03 §2.2 to use `ENVIRONMENT` for local/cloud split, not `USE_MOCK`.

### 🔴 CONFLICT C2: `simple_qa` cost_cap discrepancy ($0.01 vs $0.001) [HIGH]

- **Type**: Performance budget conflict
- **EP01 §ID-5 claims**: `simple_qa: { cost_cap: 0.01 }`
- **EP01 §BDD claims**: `single query cost ≤ $0.01 (simple)`
- **ADR-0003 claims**: `simple_qa.cloud.cost_cap = 0.001`
- **EP03 §2.2 claims**: `simple_qa.cloud.cost_cap = 0.001` (matches ADR-0003)
- **Impact**: 10x discrepancy. project_memory.md "A1 fix" mentions deep_research ($0.50 -> $0.05) but does NOT mention simple_qa ($0.01 -> $0.001). EP01 is stale.
- **Resolution**: Update EP01 §ID-5 and §BDD acceptance criteria to `0.001`.

### 🟠 CONFLICT C3: Intent taxonomy mismatch (EP01 vs ADR-0003) [MEDIUM]

- **Type**: Integration contract conflict
- **EP01 §ID-5 lists**: `simple_qa / deep_research / strategy_dsl / backtest_explain` (Build Agent focused)
- **ADR-0003 lists**: `simple_qa / deep_research / tool_call / clarify` (Ask Agent focused)
- **EP03 §2.2 lists**: `simple_qa / deep_research / tool_call / fallback` (uses `fallback` not `clarify`)
- **EP03 §ID-1 uses**: `clarify` as default return (inconsistent within EP03 itself)
- **Impact**: Build Agent (EP04) has no routing rules for `strategy_dsl` / `backtest_explain` intents. ADR-0003 covers only Ask Agent intents.
- **Resolution**: Either (a) extend ADR-0003 with Build Agent intents, or (b) create ADR-0004 for Build Agent LLM routing.

### 🟠 CONFLICT C4: R2 TTL values (EP02 §2.3 vs ADR-0002) [MEDIUM]

- **Type**: Performance budget conflict
- **EP02 §2.3 claims**: `daily: 86400 (1 day)`, `minute: 60 (1 min)`, `fundamental: 604800 (7 days)`
- **ADR-0002 claims**: `R2_TTL.PRICE: 3600 (1 hour)`, `R2_TTL.FUNDAMENTAL: 604800 (7 days)`
- **Impact**: 24x discrepancy on price TTL. Implementer following EP02 will cache stale prices for a day; ADR-0002 mandates 1 hour.
- **Resolution**: Reconcile to single TTL table. Recommend ADR-0002's 1-hour price TTL.

### 🟠 CONFLICT C5: Mock data path drift (EP07 §ID-7 vs ADR-0001 API-0002) [MEDIUM]

- **Type**: API decision conflict
- **EP07 §ID-7 code comment claims**: `// mock_data/community/playbooks.json`
- **ADR-0001 API-0002 claims**: `web/public/mock/` is canonical path
- **Actual filesystem**: `web/public/mock/community/*.json` (matches ADR-0001, not EP07)
- **Impact**: Same pattern as the previously-fixed A3 conflict. EP07 docs are stale.
- **Resolution**: Update EP07 §ID-7 to `web/public/mock/community/`.

### 🟡 CONFLICT C6: Tool naming inconsistency (EP01 vs EP03) [LOW]

- **Type**: Integration contract conflict
- **EP01 §ID-2 lists**: `get_quote`, `get_ohlc`, `get_earnings`, `search_news`, `get_macro`, `get_sentiment`, `plot_chart`, `build_strategy`, `run_backtest`, `save_dashboard` (10 tools)
- **EP03 §2.6 lists**: `get_current_price`, `get_earnings`, `search_news` (3 tools, different name for price)
- **Impact**: `get_quote` vs `get_current_price` - same concept, different names. Will cause integration bugs.
- **Resolution**: Pick one name (`get_quote` is more general). Update EP03.

### 🟡 CONFLICT C7: Community Mock data location (architecture.md §5.3 vs filesystem) [LOW]

- **Type**: Documentation drift
- **architecture.md §5.3 claims**: `Community | D1 seed | Playbook samples + creator profiles` (D1 seed)
- **Actual filesystem**: `web/public/mock/community/*.json` (static JSON)
- **Impact**: Architectural doc misleads future contributors.
- **Resolution**: Update architecture.md §5.3.

### 🟡 CONFLICT C8: Phase 1 multi-source fallback scope (EP02 §ID-4 vs §8 Acceptance) [LOW]

- **Type**: Scope conflict
- **EP02 §ID-4 claims**: "Phase 1: Yahoo + Mock fallback" (only)
- **EP02 §8 Acceptance claims**: "When USE_MOCK=false, traverse Yahoo -> Alpha Vantage -> Polygon -> Mock by priority"
- **Impact**: Acceptance criteria cannot pass in Phase 1 (no Alpha Vantage/Polygon code).
- **Resolution**: Update §8 to phase-gated acceptance.

---

## ADR Dependency Order

```
Foundation (no dependencies):
  1. ADR-0001: USE_MOCK Dual-Mode Switch [Accepted]

Depends on Foundation:
  2. ADR-0002: R2 Cache Whitelist [Accepted] (requires ADR-0001)
  3. ADR-0003: LLM Routing + Cost Cap [Accepted] (requires ADR-0001, parallel to ADR-0002)

Feature layer (Proposed, not yet written):
  4. ADR-0004: Agent Loop Design (depends on ADR-0001, ADR-0003)
  5. ADR-0005: Memory Layer (depends on ADR-0001)
  6. ADR-0006: Tool Protocol (depends on ADR-0001, ADR-0003)
  7. ADR-0007: Citation Validator (depends on ADR-0003)
  8. ADR-0008: Strategy DSL Schema (no ADR deps; depends on EP04)
  9. ADR-0009: Backtest Engine (depends on ADR-0001, ADR-0008)
  10. ADR-0010: Paper Broker Design (depends on ADR-0001)
  11. ADR-0011: D1 Schema Master (depends on EP02/03/04/06/07/08)
  12. ADR-0012: Dashboard Widget System (depends on ADR-0001)
  13. ADR-0013: Playbook Schema + Composition (depends on ADR-0008)
  14. ADR-0014: Observability Schema (no deps)
```

**No unresolved dependencies** - all 3 existing ADRs are `Accepted`. **No cycles**.

---

## GDD Revision Flags (Architecture -> Design Feedback)

| GDD | Assumption | Reality (from ADR/code) | Action |
|-----|-----------|-------------------------|--------|
| EP01 §ID-5 | `USE_MOCK=true -> LM Studio` | ADR-0003: `USE_MOCK=true -> MockLLM (zero API call)` | Revise EP01 |
| EP01 §ID-5 BDD | `simple_qa cost_cap = $0.01` | ADR-0003: `0.001` (10x lower) | Revise EP01 |
| EP01 §ID-5 | 4 intents: simple_qa/deep_research/strategy_dsl/backtest_explain | ADR-0003: 4 intents: simple_qa/deep_research/tool_call/clarify | Revise EP01 |
| EP03 §2.2 | `env_mode = USE_MOCK === "true" ? "local" : "cloud"` | ADR-0003: USE_MOCK drives Mock vs Real; ENVIRONMENT drives local vs cloud | Revise EP03 |
| EP03 §2.2 | Uses `fallback` intent | ADR-0003 + EP03 §ID-1: uses `clarify` | Revise EP03 |
| EP02 §2.3 | R2 TTL daily=86400 | ADR-0002: R2_TTL.PRICE=3600 | Revise EP02 |
| EP07 §ID-7 | `mock_data/community/playbooks.json` | ADR-0001 + filesystem: `web/public/mock/community/` | Revise EP07 |
| architecture.md §5.3 | Community Mock = D1 seed | Filesystem: `web/public/mock/community/*.json` static | Revise architecture.md |
| EP02 §8 | Acceptance: Yahoo -> AV -> Polygon -> Mock in Phase 1 | EP02 §ID-4: Phase 1 only Yahoo + Mock | Revise EP02 §8 |

---

## Engine Compatibility Issues

**No engine reference docs exist** for this project (web project, not game). Phase 5 engine cross-check adapted as "framework compatibility audit":

- ✅ All 3 ADRs agree on engine: `Next.js 16.2.10 + Cloudflare Workers 4`
- ✅ Verified `web/package.json`: `next: 16.2.10`, `react: 19.2.4`, `wrangler: ^4`, `@cloudflare/workers-types: ^5.20260718.1`
- ✅ All 3 ADRs have `Engine Compatibility` section, `Knowledge Risk: LOW`, `Post-Cutoff APIs Used: None`
- ✅ Code matches ADR intent (with documented TECH_DEBT for module-level cache)
- ⚠️ **No ADRs exist for non-foundation systems** - engine risk for Strategy DSL (jsep parser), Dashboard (lightweight-charts), Playbook (SemVer lib) is undocumented

**Specialist consultation skipped** - no `.claude/docs/technical-preferences.md`, no engine specialists configured.

---

## Architecture Document Coverage

`docs/architecture/architecture.md` validation:

- ✅ All 8 modules from systems-index (Master PRD §9.2) appear in architecture §7 module dependencies
- ✅ §3 9-layer Agent Harness maps to EP01 §2 architecture
- ⚠️ **§9.4 LLM routing decision** mentions only "local + cloud" 2-tier - missing Mock as third tier (stale vs ADR-0003)
- ⚠️ **§5.3 Mock dataset** lists `Community | D1 seed` - stale vs actual filesystem
- ⚠️ **No ADR references** in architecture.md - decisions are inline, not linked to ADR-0001/0002/0003
- ⚠️ **No data flow for Build/Dashboard/Broker/Playbook** - §4 only covers Ask Agent flow

---

## Verdict: **CONCERNS**

**Rationale**: Foundation layer (ADR-0001/0002/0003) is solid and internally consistent. Code matches ADR intent. But:
1. **78% of requirements have no ADR** - most systems (EP04/05/06/07/08) have zero architectural coverage
2. **8 documentation conflicts** with ADRs (2 HIGH, 3 MEDIUM, 3 LOW) - most are stale PRD docs not updated after A1 conflict fix
3. **9 GDD revision flags** - PRDs need to be brought in line with accepted ADRs before their systems enter implementation

**Not FAIL** because: no blocking ADR-vs-ADR conflicts, no dependency cycles, foundation ADRs are Accepted and code-aligned.

**Not PASS** because: critical gaps in Build Agent (no routing rules), Backtest Engine (no determinism ADR), D1 schema (6 Epics defining tables independently), and Citation Validator (HIGH engine risk, no ADR).

---

## Blocking Issues (must resolve before PASS)

1. **Resolve C1+C2+C3** (USE_MOCK semantics + cost_cap + intent taxonomy) - edit EP01 §ID-5, EP03 §2.2 to match ADR-0003
2. **Write ADR-0004 Agent Loop** - blocks EP01/EP03 implementation
3. **Write ADR-0007 Citation Validator** - HIGH engine risk, blocks EP03 anti-hallucination BDD
4. **Write ADR-0009 Backtest Engine** - HIGH engine risk, blocks EP04 determinism + in/out-of-sample
5. **Write ADR-0011 D1 Schema Master** - 6 Epics define D1 tables independently; risk of FK/type conflicts at integration time

---

## Required ADRs (priority order)

1. **ADR-0004: Agent Loop Design** - Foundation/Core, blocks EP01+EP03
2. **ADR-0011: D1 Schema Master** - Foundation/Core, unblocks all Epics with persistence
3. **ADR-0007: Citation Validator** - HIGH engine risk
4. **ADR-0009: Backtest Engine** - HIGH engine risk, determinism contract
5. **ADR-0005: Memory Layer** - Core, blocks EP01+EP03
6. **ADR-0006: Tool Protocol** - Core, blocks EP01+EP03
7. **ADR-0008: Strategy DSL Schema** - Feature, blocks EP04
8. **ADR-0010: Paper Broker Design** - Feature, blocks EP06
9. **ADR-0013: Playbook Schema** - Feature, blocks EP08
10. **ADR-0012: Dashboard Widget System** - Feature, blocks EP05
11. **ADR-0014: Observability Schema** - Cross-cutting, blocks EP01 ID-7

---

## Pre-Gate Checklist

| Item | Status | Action if ❌ |
|------|--------|-------------|
| `tests/unit/` directory | ✅ (at `web/tests/unit/`) | - |
| `tests/integration/` directory | ❌ (not yet created) | Run `/test-setup` or create dir |
| `.github/workflows/tests.yml` | ✅ | - |
| `design/accessibility-requirements.md` | ❌ (no `design/` dir) | Run `/ux-design` |
| `design/ux/interaction-patterns.md` | ❌ (no `design/` dir) | Run `/ux-design` |

---

## References

- ADRs: `docs/architecture/adr-000{1,2,3}-*.md`
- Architecture registry: `docs/registry/architecture.yaml`
- Traceability index: `docs/architecture/traceability-index.md`
- TR registry: `docs/architecture/tr-registry.yaml`
- Test infra: `web/vitest.config.ts`, `web/playwright.config.ts`, `.github/workflows/tests.yml`
- TDD specs: `web/tests/unit/{use-mock-switch,r2-cache-whitelist,llm-route,classify-intent}.test.ts`

> End of report.
