# 05 — Coverage Matrix (TR-ID → ADR → Test → Status)

> **Owner**: Engineering
> **Last reviewed**: 2026-07-20
> **Parent**: [`README.md`](./README.md)
> **Source of truth**: `docs/architecture/tr-registry.yaml` v7 (130 TRs: 111 full + 6 partial + 13 gaps).

This matrix maps every Traceability Requirement ID (TR-ID) to:
- **Owner ADR** — the ADR that governs the requirement.
- **Test file** — where the requirement is (or will be) tested.
- **Status** — `COVERED` (active test exists), `PARTIAL` (test exists but incomplete — see Notes), `MISSING` (no test exists yet, gap TR).
- **Priority** — `P0` (blocker / must ship), `P1` (important / should ship next sprint), `P2` (nice-to-have / backlog).

Grouped by Epic (EP01–EP08) per the registry structure.

---

## 1. Legend

| Status    | Meaning                                                                  |
|-----------|--------------------------------------------------------------------------|
| COVERED   | At least one active `it()` block asserts this TR.                        |
| PARTIAL   | Test stubbed with `it.todo` OR test exists but covers a subset of the TR.|
| MISSING   | No test file exists for this TR; it is a known gap from v7 registry.     |

| Priority  | Meaning                                                                  |
|-----------|--------------------------------------------------------------------------|
| P0        | Critical path; blocks EP01 acceptance (≥80% coverage, demo scenarios).   |
| P1        | Important for current milestone; should land in next 2 sprints.          |
| P2        | Backlog; lands opportunistically or when a related refactor touches it.  |

> **PARTIAL — two distinct counts.** The registry's "6 partial" (`tr-registry.yaml` v7: 111 full + 6 partial + 13 gaps) measures **ADR architectural coverage**: the ADR partially addresses the requirement (marked with `coverage: partial` in the registry). This matrix's "15 PARTIAL" measures **test coverage**: a test file exists but is incomplete (`it.todo` stub, TODO integration stub, or test covers only a subset). The two counts differ because they measure different things — a TR can be registry-full but matrix-PARTIAL (e.g., TR-EP01-006 has full ADR coverage from ADR-0001 but only an `it.todo` test stub), and a registry-partial TR can be matrix-MISSING (no test at all yet).

---

## 2. EP01 — Agent Harness (15 TRs)

> Owner ADR distribution: ADR-0001 (9 full), ADR-0004 (2 full + 2 partial), ADR-0011 (trace tables, 2 full).

| TR-ID         | Owner ADR  | Test file                                              | Status    | Priority | Notes                                              |
|---------------|------------|--------------------------------------------------------|-----------|----------|----------------------------------------------------|
| TR-EP01-001   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | COVERED   | P0       | Mock mode default.                                 |
| TR-EP01-002   | ADR-0004   | `tests/integration/agent-loop.test.ts`                 | PARTIAL   | P0       | TODO stub; happy-path loop.                        |
| TR-EP01-003   | ADR-0004   | `tests/integration/agent-loop.test.ts`                 | PARTIAL   | P0       | TODO stub; cost-exceeded abort.                    |
| TR-EP01-004   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | COVERED   | P0       | Zero-fetch in Mock mode.                           |
| TR-EP01-005   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | COVERED   | P0       | Canonical Mock path.                               |
| TR-EP01-006   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | PARTIAL   | P1       | `it.todo` — env param override.                    |
| TR-EP01-007   | ADR-0004   | `tests/integration/agent-loop.test.ts`                 | PARTIAL   | P0       | TODO stub; max_steps abort.                        |
| TR-EP01-008   | ADR-0004   | `tests/integration/agent-loop.test.ts`                 | PARTIAL   | P1       | **Gap**: Eval Golden Set (200+ cases) not yet wired.|
| TR-EP01-009   | ADR-0011   | `tests/integration/d1-memory.test.ts`                  | PARTIAL   | P1       | **Gap**: Trace aggregation across requests.        |
| TR-EP01-010   | ADR-0004   | `tests/integration/agent-loop.test.ts`                 | PARTIAL   | P0       | TODO stub; citation-failed abort.                  |
| TR-EP01-011   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | COVERED   | P0       | Defaults to Mock when unset.                       |
| TR-EP01-012   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | PARTIAL   | P1       | `it.todo` — no module cache.                       |
| TR-EP01-013   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | PARTIAL   | P1       | `it.todo` — env param overrides process.env.       |
| TR-EP01-014   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | **Gap**: agent_traces schema + persistence.        |
| TR-EP01-015   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | **Gap**: agent_steps per-step persistence.         |

**EP01 summary**: 4 COVERED, 9 PARTIAL, 2 MISSING. **P0 blockers**: 4 (agent loop integration TODO stubs: happy-path + cost-exceeded + max_steps + citation-failed — all P0 PARTIAL, need promotion to active tests).

---

## 3. EP02 — Data Layer (17 TRs)

> Owner ADR distribution: ADR-0002 (6 full), ADR-0006 (2 full), ADR-0011 (5 full + 1 partial), ADR-0016 (2 full), ADR-0001 cross-cutting (1 full).

| TR-ID         | Owner ADR  | Test file                                              | Status    | Priority | Notes                                              |
|---------------|------------|--------------------------------------------------------|-----------|----------|----------------------------------------------------|
| TR-EP02-001   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | COVERED   | P0       | USE_MOCK=true → MockProvider.                      |
| TR-EP02-002   | ADR-0001   | `tests/unit/use-mock-switch.test.ts`                   | COVERED   | P0       | USE_MOCK=false → RealProvider.                     |
| TR-EP02-003   | ADR-0002   | `tests/unit/r2-cache-whitelist.test.ts`                | COVERED   | P0       | shouldCacheR2 true for whitelist.                  |
| TR-EP02-004   | ADR-0002   | `tests/unit/r2-cache-whitelist.test.ts`                | COVERED   | P0       | shouldCacheR2 false for non-whitelist.             |
| TR-EP02-005   | ADR-0002   | `tests/unit/r2-cache-whitelist.test.ts`                | COVERED   | P0       | 10 symbols + bidirectional sync.                   |
| TR-EP02-006   | ADR-0006   | `tests/unit/provider-router.test.ts` *(planned)*       | MISSING   | P0       | Router happy path.                                 |
| TR-EP02-007   | ADR-0006   | `tests/unit/provider-router.test.ts` *(planned)*       | MISSING   | P0       | Router fallback chain.                             |
| TR-EP02-008   | ADR-0006   | `tests/unit/provider-router.test.ts` *(planned)*       | MISSING   | P1       | Router rejects non-whitelisted.                    |
| TR-EP02-009   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | symbols table.                                     |
| TR-EP02-010   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | watchlists table.                                  |
| TR-EP02-011   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | kline_cache_index table.                           |
| TR-EP02-012   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | fundamentals table.                                |
| TR-EP02-013   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | Indexes on FKs.                                    |
| TR-EP02-014   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | PARTIAL   | P1       | **Gap**: kline_cache_index cache invalidation.     |
| TR-EP02-015   | ADR-0002   | `tests/unit/r2-cache-whitelist.test.ts`                | COVERED   | P0       | Case-insensitive lookup.                           |
| TR-EP02-016   | ADR-0016   | `tests/unit/circuit-breaker.test.ts` *(planned)*       | MISSING   | P0       | 5-failure threshold.                               |
| TR-EP02-017   | ADR-0016   | `tests/unit/circuit-breaker.test.ts` *(planned)*       | MISSING   | P0       | 60s cooldown + Half-Open trial.                    |

**EP02 summary**: 6 COVERED, 1 PARTIAL, 10 MISSING. **P0 blockers**: 4 (router happy-path + router fallback + circuit breaker threshold + circuit breaker cooldown — all P0 MISSING, no test files yet).

---

## 4. EP03 — Ask Agent (21 TRs)

> Owner ADR distribution: ADR-0003 (6 TRs: 001-004, 013, 016), ADR-0007 (3 TRs: 005, 007, 020), ADR-0005 (3 TRs: 009, 017, 018), (Ask Agent, no ADR) (4 TRs: 006, 014, 015, 021), ADR-0004 (1 partial: 012), ADR-0006 (1: 011), ADR-0011 (1: 010), ADR-0014 (1: 008), ADR-0015 (1: 019).

| TR-ID         | Owner ADR    | Test file                                              | Status    | Priority | Notes                                              |
|---------------|--------------|--------------------------------------------------------|-----------|----------|----------------------------------------------------|
| TR-EP03-001   | ADR-0003     | `tests/unit/classify-intent.test.ts`                   | COVERED   | P0       | simple_qa classification.                          |
| TR-EP03-002   | ADR-0003     | `tests/unit/llm-route.test.ts`                         | COVERED   | P0       | LLMRouter route + getLLM factory.                  |
| TR-EP03-003   | ADR-0003     | `tests/unit/llm-route.test.ts`                         | COVERED   | P0       | ROUTING_RULES local/cloud dual configs.            |
| TR-EP03-004   | ADR-0003     | `tests/unit/llm-route.test.ts`                         | COVERED   | P0       | cost_cap tiers ($0.001/$0.05/$0.01/$0.0005).       |
| TR-EP03-005   | ADR-0007     | `tests/unit/citation-validator.test.ts` *(planned)*    | MISSING   | P0       | Forced citation mode.                              |
| TR-EP03-006   | (Ask Agent)  | *(planned)*                                            | MISSING   | P0       | AnswerWithCitations interface (no owner_adr).      |
| TR-EP03-007   | ADR-0007     | `tests/unit/citation-validator.test.ts` *(planned)*    | MISSING   | P0       | validateCitations hallucination detection.         |
| TR-EP03-008   | ADR-0014     | `tests/integration/rag-pipeline.test.ts` *(planned)*   | MISSING   | P0       | AskRAGPipeline 5-source fan-out.                   |
| TR-EP03-009   | ADR-0005     | `tests/unit/memory-store.test.ts` *(planned)*          | MISSING   | P0       | Short-term memory (sessionId/messages/4096).       |
| TR-EP03-010   | ADR-0011     | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | Long-term memory D1 (user_profiles + conversation_history). |
| TR-EP03-011   | ADR-0006     | `tests/unit/tool-protocol.test.ts` *(planned)*         | MISSING   | P0       | MCP + Function Call protocol.                      |
| TR-EP03-012   | ADR-0004     | `tests/integration/agent-loop.test.ts`                 | PARTIAL   | P1       | **Gap**: Ask-specific StepHandlers.                |
| TR-EP03-013   | ADR-0003     | `tests/unit/llm-route.test.ts`                         | COVERED   | P0       | Cost Budget degrade chain (cost_cap tiers tested). |
| TR-EP03-014   | (Ask Agent)  | *(planned)*                                            | MISSING   | P1       | Prompt template versioning (no owner_adr).         |
| TR-EP03-015   | (Ask Agent)  | *(planned)*                                            | MISSING   | P1       | Mock QA samples ≥20 (no owner_adr).                |
| TR-EP03-016   | ADR-0003     | `tests/unit/llm-route.test.ts`                         | COVERED   | P0       | Mock mode zero LLM API calls (mock config).        |
| TR-EP03-017   | ADR-0005     | `tests/unit/memory-store.test.ts` *(planned)*          | MISSING   | P0       | Multi-turn memory with pronoun resolution.         |
| TR-EP03-018   | ADR-0005     | `tests/unit/memory-store.test.ts` *(planned)*          | MISSING   | P1       | Cross-session long-term memory.                    |
| TR-EP03-019   | ADR-0015     | `tests/unit/sse-stream.test.ts` *(planned)*            | MISSING   | P0       | Streaming response >5s triggers SSE.               |
| TR-EP03-020   | ADR-0007     | `tests/unit/citation-validator.test.ts` *(planned)*    | MISSING   | P0       | Citations array even empty.                        |
| TR-EP03-021   | (Ask Agent)  | *(planned)*                                            | MISSING   | P0       | Worker entry /api/ask handler (no owner_adr).      |

**EP03 summary**: 6 COVERED, 1 PARTIAL, 14 MISSING. **P0 blockers**: 10.

---

## 5. EP04 — Strategy DSL (17 TRs)

> Owner ADR distribution: ADR-0008 (10 full), ADR-0009 (7 full). ADR-0010 owns no EP04 TRs (Dashboard is EP05).

| TR-ID         | Owner ADR  | Test file                                              | Status    | Priority | Notes                                              |
|---------------|------------|--------------------------------------------------------|-----------|----------|----------------------------------------------------|
| TR-EP04-001   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P0       | validateDSL happy path.                            |
| TR-EP04-002   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P0       | JSON Schema strict mode.                           |
| TR-EP04-003   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P0       | Closed indicator enum (8).                         |
| TR-EP04-004   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P0       | BacktestEngine 8-step pipeline.                    |
| TR-EP04-005   | ADR-0009   | `tests/unit/backtest-engine.test.ts` *(planned)*       | MISSING   | P1       | BacktestResult ≥8 metrics.                         |
| TR-EP04-006   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P0       | Built-in indicator library ≥8 (SMA/EMA/RSI/MACD/Bollinger/ATR/OBV/VWAP). |
| TR-EP04-007   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P0       | jsep expression parser (no Function()).            |
| TR-EP04-008   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P0       | Position sizing 3 methods.                         |
| TR-EP04-009   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P0       | Risk management (stop_loss/take_profit/max_drawdown). |
| TR-EP04-010   | ADR-0009   | `tests/unit/backtest-engine.test.ts` *(planned)*       | MISSING   | P0       | D1 schema: strategies + backtest_results tables.   |
| TR-EP04-011   | ADR-0009   | `tests/unit/backtest-engine.test.ts` *(planned)*       | MISSING   | P0       | Alpha/beta formulas.                               |
| TR-EP04-012   | ADR-0009   | `tests/unit/backtest-engine.test.ts` *(planned)*       | MISSING   | P0       | 70/30 in/out-of-sample split.                      |
| TR-EP04-013   | ADR-0009   | `tests/unit/backtest-engine.test.ts` *(planned)*       | MISSING   | P1       | Indicator computation consistent with ta-lib.      |
| TR-EP04-014   | ADR-0009   | `tests/unit/backtest-engine.test.ts` *(planned)*       | MISSING   | P1       | Deterministic results (fixed random seed).         |
| TR-EP04-015   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P1       | 3 example strategies (MA Cross/RSI Oversold/Bollinger Breakout). |
| TR-EP04-016   | ADR-0008   | `tests/unit/strategy-dsl.test.ts` *(planned)*          | MISSING   | P1       | Strategy versioning (each modification → new version). |
| TR-EP04-017   | ADR-0009   | `tests/unit/backtest-engine.test.ts` *(planned)*       | MISSING   | P1       | BacktestEngine uses EP02 MarketDataProvider.       |

**EP04 summary**: 0 COVERED, 0 PARTIAL, 17 MISSING. **P0 blockers**: 11 (validateDSL + JSON Schema + indicator enum + BacktestEngine pipeline + indicator library + jsep parser + position sizing + risk management + D1 strategies/backtest_results + alpha/beta + in/out-of-sample split).

---

## 6. EP05 — Dashboard (19 TRs)

> Owner ADR distribution: ADR-0010 (all 19 TRs: 001-019) — Dashboard Layout + Widget System.

| TR-ID         | Owner ADR  | Test file                                              | Status    | Priority | Notes                                              |
|---------------|------------|--------------------------------------------------------|-----------|----------|----------------------------------------------------|
| TR-EP05-001   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P0       | 6 default widgets render.                          |
| TR-EP05-002   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P0       | Mock Badge on every widget.                        |
| TR-EP05-003   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P0       | Watchlist 10 symbols.                              |
| TR-EP05-004   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P0       | 12-column grid layout.                             |
| TR-EP05-005   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P1       | Widget drag-and-drop reorder.                      |
| TR-EP05-006   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P1       | 9 widget types.                                    |
| TR-EP05-007   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P0       | LCP <2s Mock mode.                                 |
| TR-EP05-008   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P0       | Widget render <100ms Mock.                         |
| TR-EP05-009   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P1       | LCP <3s Real mode.                                 |
| TR-EP05-010   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P2       | lightweight-charts integration.                    |
| TR-EP05-011   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P1       | SWR dedup 5000ms.                                  |
| TR-EP05-012   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P1       | react-grid-layout integration.                     |
| TR-EP05-013   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P2       | Symbol picker updates URL.                         |
| TR-EP05-014   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P2       | Timeframe switch reloads chart.                    |
| TR-EP05-015   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P2       | Visual regression baseline.                        |
| TR-EP05-016   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P2       | Empty state for no watchlist.                      |
| TR-EP05-017   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P2       | Error state for fetch failure.                     |
| TR-EP05-018   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P1       | Mobile responsive breakpoint.                      |
| TR-EP05-019   | ADR-0010   | `tests/unit/dashboard-layout.test.ts` *(planned)*      | MISSING   | P2       | Theme toggle (dark/light).                         |

**EP05 summary**: 0 COVERED, 0 PARTIAL, 19 MISSING. **P0 blockers**: 6 (layout + badges + perf budgets).

---

## 7. EP06 — Broker Integration (13 TRs)

> Owner ADR distribution: ADR-0011 (broker tables, 4 full + 1 partial), BrokerAdapter domain (no ADR yet — TRs validated against EP06 GDD).

| TR-ID         | Owner ADR  | Test file                                              | Status    | Priority | Notes                                              |
|---------------|------------|--------------------------------------------------------|-----------|----------|----------------------------------------------------|
| TR-EP06-001   | (EP06 GDD) | `tests/unit/broker-adapter.test.ts` *(planned)*        | MISSING   | P0       | BrokerAdapter interface.                           |
| TR-EP06-002   | (EP06 GDD) | `tests/unit/paper-broker.test.ts` *(planned)*          | MISSING   | P0       | PaperBroker default $100k.                         |
| TR-EP06-003   | (EP06 GDD) | `tests/unit/paper-broker.test.ts` *(planned)*          | MISSING   | P0       | 4 order types (market/limit/stop/stop_limit).      |
| TR-EP06-004   | (EP06 GDD) | `tests/unit/paper-broker.test.ts` *(planned)*          | MISSING   | P0       | Order lifecycle FSM (pending→partial→filled).      |
| TR-EP06-005   | (EP06 GDD) | `tests/unit/paper-broker.test.ts` *(planned)*          | MISSING   | P0       | 5bps slippage.                                     |
| TR-EP06-006   | (EP06 GDD) | `tests/unit/broker-risk.test.ts` *(planned)*           | MISSING   | P0       | BrokerRiskManager 5 rules.                         |
| TR-EP06-007   | (EP06 GDD) | `tests/unit/broker-risk.test.ts` *(planned)*           | MISSING   | P0       | Buying power check.                                |
| TR-EP06-008   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | broker_accounts table.                             |
| TR-EP06-009   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | orders table.                                      |
| TR-EP06-010   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | positions table.                                   |
| TR-EP06-011   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | trades table.                                      |
| TR-EP06-012   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | PARTIAL   | P1       | **Gap**: trades.executed_at index missing.         |
| TR-EP06-013   | (EP06 GDD) | `tests/e2e/ep06-broker.spec.ts` *(planned)*            | MISSING   | P2       | MCP broker placeholder (Phase 2).                  |

**EP06 summary**: 0 COVERED, 1 PARTIAL, 12 MISSING. **P0 blockers**: 7 (paper broker + risk).

---

## 8. EP07 — Share & Community (14 TRs)

> Owner ADR distribution: ADR-0012 (11 TRs: 001, 003-005, 007-010, 012-014), ADR-0011 (2 TRs: 002, 006), ADR-0002 (1 TR: 011).

| TR-ID         | Owner ADR  | Test file                                              | Status    | Priority | Notes                                              |
|---------------|------------|--------------------------------------------------------|-----------|----------|----------------------------------------------------|
| TR-EP07-001   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P0       | SharePackage 5-section structure.                  |
| TR-EP07-002   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P0       | D1 schema: 5 community tables.                     |
| TR-EP07-003   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P0       | Publish flow: Strategy → Playbook → Share → Community. |
| TR-EP07-004   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P0       | Feed stream (chronological + popularity).          |
| TR-EP07-005   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P1       | Search by tag/author/title.                        |
| TR-EP07-006   | ADR-0011   | `tests/integration/community-playbook.test.ts` *(planned)* | MISSING | P0     | Install creates reference (not content copy).      |
| TR-EP07-007   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P0       | Rating 1-5 stars with dedup (1 per user per Playbook). |
| TR-EP07-008   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P0       | Comments nested 2 layers max.                      |
| TR-EP07-009   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P0       | Report with severity tiers (high/medium/low).      |
| TR-EP07-010   | ADR-0012   | `tests/unit/anti-abuse-filter.test.ts` *(planned)*     | MISSING   | P0       | AntiAbuseFilter: forbidden words + dedup hash + 5/day. |
| TR-EP07-011   | ADR-0002   | `tests/unit/r2-cache-whitelist.test.ts` *(planned)*    | MISSING   | P1       | R2 stores Playbook YAML large files.               |
| TR-EP07-012   | ADR-0012   | `tests/e2e/ep07-community.spec.ts` *(planned)*         | MISSING   | P1       | Mock mode preloaded 10 Playbook samples.           |
| TR-EP07-013   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P1       | Creator incentive (Phase 2, 0.5 Credit per install). |
| TR-EP07-014   | ADR-0012   | `tests/unit/community-share.test.ts` *(planned)*       | MISSING   | P1       | Recommendation algorithm (tag match + popularity). |

**EP07 summary**: 0 COVERED, 0 PARTIAL, 14 MISSING. **P0 blockers**: 9.

---

## 9. EP08 — Playbook System (14 TRs)

> Owner ADR distribution: ADR-0013 (10 full), ADR-0011 (playbook tables, 2 full + 1 partial — content_hash + user_playbooks).

| TR-ID         | Owner ADR  | Test file                                              | Status    | Priority | Notes                                              |
|---------------|------------|--------------------------------------------------------|-----------|----------|----------------------------------------------------|
| TR-EP08-001   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | MISSING   | P0       | validatePlaybook happy path.                       |
| TR-EP08-002   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | MISSING   | P0       | 6 playbook kinds enum.                             |
| TR-EP08-003   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | MISSING   | P0       | Narrative required (why/how/risks).                |
| TR-EP08-004   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | PARTIAL   | P0       | **Gap**: parallel weight sum === 1.0 validation.   |
| TR-EP08-005   | ADR-0013   | `tests/unit/playbook-cycles.test.ts` *(planned)*       | MISSING   | P0       | Topological sort DAG.                              |
| TR-EP08-006   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | PARTIAL   | P0       | **Gap**: strict Semver regex validation.           |
| TR-EP08-007   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | MISSING   | P1       | Conditional composition if/then/else integrity.    |
| TR-EP08-008   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | PARTIAL   | P1       | **Gap**: user_playbooks table ownership tracking.  |
| TR-EP08-009   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | playbooks table.                                   |
| TR-EP08-010   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | playbook_versions table.                           |
| TR-EP08-011   | ADR-0011   | `tests/unit/d1-schema.test.ts` *(planned)*             | MISSING   | P1       | playbook_dependencies table.                       |
| TR-EP08-012   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | MISSING   | P0       | PlaybookExecutor strategy kind.                    |
| TR-EP08-013   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | MISSING   | P0       | PlaybookExecutor parallel composition.             |
| TR-EP08-014   | ADR-0013   | `tests/unit/playbook.test.ts` *(planned)*              | MISSING   | P0       | PlaybookExecutor sequential composition.           |

**EP08 summary**: 0 COVERED, 3 PARTIAL, 11 MISSING. **P0 blockers**: 9.

---

## 10. Roll-up Summary

### 10.1 By Epic

| Epic  | Total TRs | COVERED | PARTIAL | MISSING | Coverage % |
|-------|-----------|---------|---------|---------|------------|
| EP01  | 15        | 4       | 9       | 2       | 26.7%      |
| EP02  | 17        | 6       | 1       | 10      | 35.3%      |
| EP03  | 21        | 6       | 1       | 14      | 28.6%      |
| EP04  | 17        | 0       | 0       | 17      | 0.0%       |
| EP05  | 19        | 0       | 0       | 19      | 0.0%       |
| EP06  | 13        | 0       | 1       | 12      | 0.0%       |
| EP07  | 14        | 0       | 0       | 14      | 0.0%       |
| EP08  | 14        | 0       | 3       | 11      | 0.0%       |
| **Total** | **130** | **16**  | **15**  | **99**  | **12.3%**  |

> Coverage % = COVERED / Total. Excludes PARTIAL (incomplete) from numerator.

### 10.2 By ADR

Recomputed from the per-Epic tables (§2–§9). Owners marked `(Ask Agent)` have no `owner_adr` in `tr-registry.yaml` (interface-only requirements). Owners marked `(EP06 GDD)` are EP06 BrokerAdapter TRs validated against the EP06 GDD (no ADR yet).

| ADR          | TRs owned | COVERED | PARTIAL | MISSING |
|--------------|-----------|---------|---------|---------|
| ADR-0001     | 9         | 6       | 3       | 0       |
| ADR-0002     | 5         | 4       | 0       | 1       |
| ADR-0003     | 6         | 6       | 0       | 0       |
| ADR-0004     | 6         | 0       | 6       | 0       |
| ADR-0005     | 3         | 0       | 0       | 3       |
| ADR-0006     | 4         | 0       | 0       | 4       |
| ADR-0007     | 3         | 0       | 0       | 3       |
| ADR-0008     | 10        | 0       | 0       | 10      |
| ADR-0009     | 7         | 0       | 0       | 7       |
| ADR-0010     | 19        | 0       | 0       | 19      |
| ADR-0011     | 21        | 0       | 4       | 17      |
| ADR-0012     | 11        | 0       | 0       | 11      |
| ADR-0013     | 10        | 0       | 2       | 8       |
| ADR-0014     | 1         | 0       | 0       | 1       |
| ADR-0015     | 1         | 0       | 0       | 1       |
| ADR-0016     | 2         | 0       | 0       | 2       |
| (Ask Agent)  | 4         | 0       | 0       | 4       |
| (EP06 GDD)   | 8         | 0       | 0       | 8       |
| **Total**    | **130**   | **16**  | **15**  | **99**  |

> Totals reconcile with §10.1 By Epic (16 COVERED + 15 PARTIAL + 99 MISSING = 130).

### 10.3 By Priority

| Priority | TR count | COVERED | PARTIAL | MISSING |
|----------|----------|---------|---------|---------|
| P0       | 76       | 16      | 6       | 54      |
| P1       | 46       | 0       | 9       | 37      |
| P2       | 8        | 0       | 0       | 8       |
| **Total**| **130**  | **16**  | **15**  | **99**  |

> P0 coverage 21.1% (16/76). All P0 COVERED TRs sit in EP01 (Mock switch) and EP02/EP03 (LLM Routing + R2 whitelist). P2 is entirely EP05/EP06 visual-regression and theme work — all still MISSING.

---

## 11. Known Gap TRs (from v7 registry)

These 13 TRs are explicit gaps called out in `docs/architecture/traceability-index.md`:

| TR-ID         | ADR      | Gap description                                       | Priority |
|---------------|----------|-------------------------------------------------------|----------|
| TR-EP01-008   | ADR-0004 | Eval Golden Set (200+ cases) not wired                | P1       |
| TR-EP01-009   | ADR-0011 | Trace aggregation across requests                     | P1       |
| TR-EP01-014   | ADR-0011 | agent_traces schema + persistence                     | P1       |
| TR-EP01-015   | ADR-0011 | agent_steps per-step persistence                      | P1       |
| TR-EP02-014   | ADR-0011 | kline_cache_index invalidation policy                 | P1       |
| TR-EP03-012   | ADR-0004 | Ask-specific StepHandlers                             | P1       |
| TR-EP04-017   | ADR-0009 | BacktestEngine uses EP02 MarketDataProvider          | P1       |
| TR-EP06-012   | ADR-0011 | trades.executed_at index missing                      | P1       |
| TR-EP08-004   | ADR-0013 | parallel weight sum === 1.0 validation                | P0       |
| TR-EP08-006   | ADR-0013 | strict Semver regex validation                        | P0       |
| TR-EP08-008   | ADR-0011 | user_playbooks table ownership tracking               | P1       |
| TR-EP01-014   | ADR-0011 | agent_traces aggregate_cost_usd column                | P1       |
| TR-EP07-014   | ADR-0012 | Recommendation algorithm (tag match + popularity)     | P1       |

(13 gaps total — 11 unique + 2 sub-gaps of TR-EP01-014 split for tracking.)

---

## 12. P0 Blockers — Sprint Planning View

The 54 P0 MISSING TRs are the immediate work queue (down from 59 in the pre-fix draft — EP03/EP07 owner reassignment moved several TRs to the correct ADRs and corrected priority mislabels). Grouped by ADR for sprint planning:

| ADR / Epic          | P0 MISSING count | Sprint suggestion                  |
|---------------------|------------------|------------------------------------|
| ADR-0005 (EP03)     | 2                | Sprint N (Memory Layer)            |
| ADR-0006 (EP02)     | 3                | Sprint N (ProviderRouter)          |
| ADR-0007 (EP03)     | 3                | Sprint N+1 (Citation Validator)    |
| ADR-0008 (EP04)     | 8                | Sprint N (Strategy DSL)            |
| ADR-0009 (EP04)     | 3                | Sprint N+1 (Backtest Engine)       |
| ADR-0010 (EP05)     | 6                | Sprint N+2 (Dashboard Layout)      |
| ADR-0011 (EP07)     | 2                | Sprint N+2 (Community D1 tables)   |
| ADR-0012 (EP07)     | 7                | Sprint N+2 (Community UGC)         |
| ADR-0013 (EP08)     | 7                | Sprint N+2 (Playbook)              |
| ADR-0014 (EP03)     | 1                | Sprint N+1 (RAG)                   |
| ADR-0015 (EP03)     | 1                | Sprint N+1 (SSE)                   |
| ADR-0016 (EP02)     | 2                | Sprint N (Circuit Breaker)         |
| (Ask Agent) (EP03)  | 2                | Sprint N+1 (Ask Agent interface)   |
| (EP06 GDD)          | 7                | Sprint N+2 (Broker unit + E2E)     |
| **Total**           | **54**           |                                    |

> ADR-0001, ADR-0002, ADR-0003, ADR-0004 have 0 P0 MISSING TRs — their P0 work is either already COVERED (ADR-0001/0002/0003) or PARTIAL TODO stubs that need promotion to active tests (ADR-0004: TR-EP01-002/003/007/010). Excluded from this P0 MISSING view but still required for the EP01 acceptance gate.

**Recommended next sprint (Sprint N)**: ADR-0005, 0006, 0008, 0016 — these unblock the EP01/EP02/EP04 acceptance gates (Mock switch ✓ + Provider routing + Strategy DSL + Circuit Breaker). ADR-0004 (Agent Loop) should be worked in parallel — its 4 P0 PARTIAL stubs need to be promoted to COVERED to lift EP01 coverage above 80%.

---

## 13. Maintenance Rules

### 13.1 When to update this matrix
- A new test is added → flip the row's Status from `MISSING`/`PARTIAL` to `COVERED`.
- A test is renamed or moved → update the Test file column.
- A TR is added or removed in `tr-registry.yaml` → add/remove the row here in the same PR.
- A gap TR is closed → move it out of §11 (Known Gap TRs) and update its Status to `COVERED`.

### 13.2 Ownership
- Each ADR's rows are owned by the ADR's author (or current maintainer).
- PRs that change Status must tag the ADR owner for review.

### 13.3 Audit cadence
- Every sprint end: run `/architecture-review` to refresh this matrix from `tr-registry.yaml`.
- Every release: verify §10.1 roll-up matches the CI coverage report.

---

## 14. Cross-references

- ADR inventory: `docs/architecture/traceability-index.md`
- TR registry (source of truth): `docs/architecture/tr-registry.yaml`
- Per-ADR unit test specs: [`01-unit-tests.md`](./01-unit-tests.md)
- Integration scenarios: [`02-integration-tests.md`](./02-integration-tests.md)
- E2E specs: [`03-e2e-tests.md`](./03-e2e-tests.md)
- Fixtures: [`04-test-fixtures.md`](./04-test-fixtures.md)
- Strategy: [`00-test-strategy.md`](./00-test-strategy.md)
- Master plan: [`README.md`](./README.md)

---

## 15. Change Log

| Date       | Change                                                                  | Author      |
|------------|-------------------------------------------------------------------------|-------------|
| 2026-07-20 | Initial coverage matrix from tr-registry v7 (130 TRs, 16 ADRs).         | Engineering |
| 2026-07-20 | Fixed CRITICAL/MAJOR/MINOR issues from ADR cross-check: rewrote EP03/EP05/EP07 sections to match `tr-registry.yaml` v7 owner_adr mappings; recomputed §10.1/§10.2/§10.3 roll-ups (16 COVERED, 15 PARTIAL, 99 MISSING); fixed §11 TR-EP04-017 (ADR-0010→ADR-0009) and TR-EP07-014 description; rewrote §12 P0 Blockers (59→54 P0 MISSING); added §1 PARTIAL clarifying note distinguishing registry partial (6, ADR coverage) from matrix PARTIAL (15, test coverage). | Engineering |
