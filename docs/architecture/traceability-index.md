# Architecture Traceability Index

**Last Updated**: 2026-07-19 (re-run after ADR-0004 + ADR-0011)
**Engine**: Next.js 16.2.10 + Cloudflare Workers 4 + R2 + D1 + Vectorize
**Total ADRs**: 5 (ADR-0001/0002/0003 Accepted + ADR-0004/0011 Proposed)
**Previous Coverage**: 17% (15/86 covered, 4 partial, 67 gaps) - see `architecture-review-2026-07-19.md`

## Coverage Summary

- Total requirements: 86
- Covered: 30 (35%)
- Partial: 11 (13%)
- Gaps: 45 (52%)

**Delta vs previous**: +15 covered, +7 partial, -22 gaps

## Full Matrix

### EP01 - Agent Harness

| TR-ID | Requirement | ADR | Status |
|-------|-------------|-----|--------|
| TR-EP01-001 | 9-layer architecture (UI/Orch/Loop/Planning/Tool/Memory/RAG/LLM/Obs) | - | ❌ GAP |
| TR-EP01-002 | Supervisor-Worker multi-agent pattern (3 sub-agents) | - | ❌ GAP |
| TR-EP01-003 | Agent Loop: ReAct + max_steps ≤20 + cost ceiling | ADR-0004 | ✅ |
| TR-EP01-004 | Tool Protocol: MCP (external) + native function call | - | ❌ GAP |
| TR-EP01-005 | Memory 3-layer (short/long_struct/long_vector) | - | ❌ GAP |
| TR-EP01-006 | Agent Loop state machine (Init->Plan->Execute->Synthesize) | ADR-0004 | ✅ |
| TR-EP01-007 | LLM Routing with ROUTING table, cost_cap by intent | ADR-0003 | ✅ |
| TR-EP01-008 | Eval Golden Set 200+ cases, 4 categories | - | ❌ GAP |
| TR-EP01-009 | Observability schema (Trace + TraceStep) | ADR-0004 | ⚠️ Partial (TraceStep only; full Trace -> ADR-0014) |
| TR-EP01-010 | Test seams: MockLLMClient/MockTool/MockSubAgent | - | ❌ GAP |
| TR-EP01-011 | Coverage: Unit 80% / Integration 70% / E2E 100% | - | ❌ GAP |
| TR-EP01-012 | USE_MOCK=true -> zero external API calls | ADR-0001 | ✅ |
| TR-EP01-013 | USE_MOCK=false -> LM Studio + Volcengine Ark | ADR-0003 | ✅ |
| TR-EP01-014 | Single query cost ≤$0.001 (simple) / ≤$0.05 (deep) | ADR-0003 | ✅ |
| TR-EP01-015 | Full-link trace viewable in Grafana | - | ❌ GAP |

### EP02 - Data Layer

| TR-ID | Requirement | ADR | Status |
|-------|-------------|-----|--------|
| TR-EP02-001 | MarketDataProvider interface | ADR-0001 | ✅ |
| TR-EP02-002 | USE_MOCK single env var | ADR-0001 | ✅ |
| TR-EP02-003 | Mock reads web/public/mock/*.json | ADR-0001 | ✅ |
| TR-EP02-004 | R2 cache only for 10 whitelisted symbols | ADR-0002 | ✅ |
| TR-EP02-005 | shouldCacheR2(symbol) canonical predicate | ADR-0002 | ✅ |
| TR-EP02-006 | D1 schema: symbols/watchlists/kline_cache_index/fundamentals | ADR-0011 | ✅ |
| TR-EP02-007 | Mock data set 10 symbols × 2 timeframes = 20 files | ADR-0001 | ✅ |
| TR-EP02-008 | Multi-source fallback Yahoo -> AV -> Polygon -> Mock | - | ⚠️ Partial (Phase 1.5+) |
| TR-EP02-009 | CircuitBreaker: 5 failures -> 60s cooldown | - | ❌ GAP |
| TR-EP02-010 | R2 TTL: price 1h / fundamental 7d | ADR-0002 | ⚠️ Partial (EP02 §2.3 stale, fixed in previous review) |
| TR-EP02-011 | Mock mode zero R2 writes | ADR-0001/0002 | ✅ |
| TR-EP02-012 | gen:mock script generates 10 symbols | - | ❌ GAP |
| TR-EP02-013 | db:seed script initializes D1 metadata | ADR-0011 | ✅ (seed.sql defined in §Migration Plan step 4) |
| TR-EP02-014 | Contract test: Mock/Real same data structure | - | ❌ GAP |
| TR-EP02-015 | R2 cache hit rate >60% in production Real mode | ADR-0002 | ⚠️ Partial (no monitoring ADR) |
| TR-EP02-016 | R2 cache hit <50ms | ADR-0002 (PB-0002) | ✅ |
| TR-EP02-017 | Mock response <100ms | ADR-0001 (PB-0003) | ✅ |

### EP03 - Ask Agent

| TR-ID | Requirement | ADR | Status |
|-------|-------------|-----|--------|
| TR-EP03-001 | classifyIntent() returns 4 intents | ADR-0003 | ✅ |
| TR-EP03-002 | LLMRouter route(query, env) | ADR-0003 | ✅ |
| TR-EP03-003 | ROUTING_RULES local/cloud dual configs | ADR-0003 | ✅ |
| TR-EP03-004 | cost_cap $0.001/$0.05/$0.01/$0.0005 by intent | ADR-0003 | ✅ |
| TR-EP03-005 | Forced citation mode for numeric fields | - | ❌ GAP (needs ADR-0007) |
| TR-EP03-006 | AnswerWithCitations interface | - | ❌ GAP (needs ADR-0007) |
| TR-EP03-007 | validateCitations() anti-hallucination | - | ❌ GAP (needs ADR-0007) |
| TR-EP03-008 | AskRAGPipeline: embed -> retrieve -> assemble | - | ❌ GAP |
| TR-EP03-009 | Short-term memory (sessionId/messages/4096 context) | - | ❌ GAP (needs ADR-0005) |
| TR-EP03-010 | Long-term memory D1 schema (user_profiles/conversation_history) | ADR-0011 | ✅ |
| TR-EP03-011 | MCP + Function Call protocol | - | ❌ GAP (needs ADR-0006) |
| TR-EP03-012 | Ask Agent Loop state machine | ADR-0004 | ⚠️ Partial (generic loop; Ask-specific handlers not ADR'd) |
| TR-EP03-013 | Cost Budget degrade chain: Sonnet->Haiku->Mock | ADR-0003 | ✅ |
| TR-EP03-014 | Prompt template versioning in src/prompts/ask/ | - | ❌ GAP |
| TR-EP03-015 | Mock QA samples ≥20 covering 4 intents | - | ❌ GAP |
| TR-EP03-016 | Mock mode zero LLM API calls | ADR-0003 | ✅ |
| TR-EP03-017 | Multi-turn memory with "它" resolution | - | ❌ GAP (needs ADR-0005) |
| TR-EP03-018 | Cross-session long-term memory persistence | - | ❌ GAP (needs ADR-0005) |
| TR-EP03-019 | Streaming response (>5s triggers SSE) | - | ❌ GAP |
| TR-EP03-020 | Every answer includes citations array | - | ❌ GAP (needs ADR-0007) |
| TR-EP03-021 | Worker entry /api/ask handler | - | ❌ GAP |

### EP04 - Strategy DSL

| TR-ID | Requirement | ADR | Status |
|-------|-------------|-----|--------|
| TR-EP04-001 | YAML DSL v1.0 schema | - | ❌ GAP (needs ADR-0008) |
| TR-EP04-002 | JSON Schema strict validation | - | ❌ GAP (needs ADR-0008) |
| TR-EP04-003 | Strategy lifecycle state machine | - | ❌ GAP (needs ADR-0008) |
| TR-EP04-004 | BacktestEngine 8-step pipeline | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-005 | BacktestResult ≥8 metrics | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-006 | Built-in indicator library ≥8 | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-007 | Signal expression parser (jsep) | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-008 | Position sizing 3 methods | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-009 | Risk management rules | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-010 | D1 schema: strategies + backtest_results | ADR-0011 | ✅ |
| TR-EP04-011 | Mock mode backtest uses web/public/mock/klines | ADR-0001 | ✅ |
| TR-EP04-012 | In/out-of-sample 70/30 split | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-013 | Indicator computation consistent with ta-lib | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-014 | Deterministic backtest results | - | ❌ GAP (needs ADR-0009) |
| TR-EP04-015 | 3 example strategies | - | ❌ GAP |
| TR-EP04-016 | Strategy versioning - each mod creates new version | - | ❌ GAP |
| TR-EP04-017 | BacktestEngine uses Epic 02 MarketDataProvider | ADR-0001 | ✅ |

### EP05 - Dashboard

| TR-ID | Requirement | ADR | Status |
|-------|-------------|-----|--------|
| TR-EP05-001 | Next.js 16 + lightweight-charts | - | ❌ GAP (needs ADR-0012) |
| TR-EP05-002 | 12-column grid with 6 default widgets | - | ❌ GAP (needs ADR-0012) |
| TR-EP05-003 | Phase 1 SVG; Phase 1.5 lightweight-charts | - | ❌ GAP (needs ADR-0012) |
| TR-EP05-004 | Widget system 9 types | - | ❌ GAP (needs ADR-0012) |
| TR-EP05-005 | Strategy markers on K-line | - | ❌ GAP |
| TR-EP05-006 | Indicator overlay (≥3) | - | ❌ GAP |
| TR-EP05-007 | Backtest report with quantile chart | - | ❌ GAP |
| TR-EP05-008 | Mock Badge visual indicator | - | ❌ GAP |
| TR-EP05-009 | Mobile responsive | - | ❌ GAP |
| TR-EP05-010 | Real-time SSE / Polling 30s / Static | - | ❌ GAP |
| TR-EP05-011 | Routes structure | - | ❌ GAP |
| TR-EP05-012 | OpenTelemetry tracing | - | ❌ GAP (needs ADR-0014) |
| TR-EP05-013 | react-grid-layout draggable widgets | - | ❌ GAP (needs ADR-0012) |
| TR-EP05-014 | Theme system dark/light | - | ❌ GAP |
| TR-EP05-015 | Performance budget LCP <2s Mock | - | ❌ GAP |
| TR-EP05-016 | Accessibility WCAG 2.1 AA | - | ❌ GAP (needs /ux-design) |
| TR-EP05-017 | Error boundary per widget | - | ❌ GAP |
| TR-EP05-018 | SWR data loading | - | ❌ GAP |
| TR-EP05-019 | Dark/light theme toggle | - | ❌ GAP |

### EP06 - Broker Integration

| TR-ID | Requirement | ADR | Status |
|-------|-------------|-----|--------|
| TR-EP06-001 | BrokerAdapter interface | - | ❌ GAP (needs ADR-0010) |
| TR-EP06-002 | PaperBroker implementation | - | ❌ GAP (needs ADR-0010) |
| TR-EP06-003 | 4 order types (market/limit/stop/stop_limit) | - | ❌ GAP (needs ADR-0010) |
| TR-EP06-004 | Order lifecycle state machine | - | ❌ GAP (needs ADR-0010) |
| TR-EP06-005 | D1 schema: 4 tables | ADR-0011 | ✅ |
| TR-EP06-006 | Slippage model 5bps default | - | ❌ GAP (needs ADR-0010) |
| TR-EP06-007 | BrokerRiskManager 5 rules | - | ❌ GAP (needs ADR-0010) |
| TR-EP06-008 | Order ID generation | ADR-0011 | ✅ (orders.id TEXT PK, app-generated per EP06 ID-3 pattern) |
| TR-EP06-009 | T+1 settlement simulation | - | ❌ GAP (needs ADR-0010) |
| TR-EP06-010 | Strategy auto-order via strategy_id | ADR-0011 | ⚠️ Partial (FK added; auto-order logic not ADR'd) |
| TR-EP06-011 | MCP broker server placeholder | - | ❌ GAP (Phase 2) |
| TR-EP06-012 | Mock mode fill price from Mock K-line | ADR-0001 | ✅ |
| TR-EP06-013 | Cancel order functionality | - | ❌ GAP (needs ADR-0010) |

### EP07 - Share & Community

| TR-ID | Requirement | ADR | Status |
|-------|-------------|-----|--------|
| TR-EP07-001 | Share Package schema | - | ❌ GAP |
| TR-EP07-002 | D1 schema: 5 tables | ADR-0011 | ✅ (Migration 007: 5 tables) |
| TR-EP07-003 | Publish flow | - | ❌ GAP |
| TR-EP07-004 | Feed stream (chronological + popularity) | - | ❌ GAP |
| TR-EP07-005 | Search by tag/author/title | - | ❌ GAP |
| TR-EP07-006 | Install creates reference | ADR-0011 | ✅ (user_playbook_installs references playbook_id + package_id) |
| TR-EP07-007 | Rating 1-5 with dedup | - | ❌ GAP |
| TR-EP07-008 | Comments nested 2 layers | - | ❌ GAP |
| TR-EP07-009 | Report severity tiers | - | ❌ GAP |
| TR-EP07-010 | AntiAbuseFilter | - | ❌ GAP |
| TR-EP07-011 | R2 stores Playbook YAML | ADR-0002 | ⚠️ Partial (R2 usage pattern, not Playbook-specific) |
| TR-EP07-012 | Mock mode preloaded 10 Playbooks | - | ❌ GAP |
| TR-EP07-013 | Creator incentive (Phase 2) | - | ❌ GAP |
| TR-EP07-014 | Recommendation algorithm | - | ❌ GAP |

### EP08 - Playbook System

| TR-ID | Requirement | ADR | Status |
|-------|-------------|-----|--------|
| TR-EP08-001 | Playbook YAML Schema v1 | - | ❌ GAP (needs ADR-0013) |
| TR-EP08-002 | 6 Playbook kinds | - | ❌ GAP (needs ADR-0013) |
| TR-EP08-003 | 3 composition types | - | ❌ GAP (needs ADR-0013) |
| TR-EP08-004 | Parallel weight sum = 1.0 | ADR-0011 | ⚠️ Partial (weight column provided; app validation not ADR'd) |
| TR-EP08-005 | Circular dependency detection | - | ❌ GAP (app-level graph traversal) |
| TR-EP08-006 | SemVer versioning | ADR-0011 | ⚠️ Partial (version column provided; semver.valid() not ADR'd) |
| TR-EP08-007 | Narrative fields required | - | ❌ GAP (needs ADR-0013) |
| TR-EP08-008 | D1 schema: 4 tables | ADR-0011 | ⚠️ Partial (3 tables in Migration 006 + 1 shared user_playbook_installs in Migration 007; user_playbooks merged) |
| TR-EP08-009 | R2 storage for Playbook YAML | ADR-0002 | ⚠️ Partial |
| TR-EP08-010 | PlaybookExecutor 3 paths | - | ❌ GAP (needs ADR-0013) |
| TR-EP08-011 | Playbook lifecycle state machine | - | ❌ GAP (needs ADR-0013) |
| TR-EP08-012 | Mock mode ≥5 Playbook samples | - | ❌ GAP |
| TR-EP08-013 | API endpoints | - | ❌ GAP |
| TR-EP08-014 | Narrative Markdown rendering | - | ❌ GAP |

## Known Gaps

See `docs/architecture/architecture-review-2026-07-19-v2.md` §"Required ADRs" for the prioritized list of 9 ADRs to create.

**Top 5 priority gaps (HIGH engine risk or Core blocker):**
1. ADR-0007 Citation Validator (HIGH engine risk, blocks EP03 §2.3 BDD) - TR-EP03-005/006/007/020
2. ADR-0009 Backtest Engine (HIGH engine risk, determinism, blocks EP04) - TR-EP04-004/005/006/007/008/009/012/013/014
3. ADR-0005 Memory Layer (Core, blocks EP01+EP03) - TR-EP01-005, TR-EP03-009/017/018
4. ADR-0006 Tool Protocol (Core, blocks EP01+EP03) - TR-EP01-004, TR-EP03-011
5. ADR-0008 Strategy DSL Schema (Feature, blocks EP04) - TR-EP04-001/002/003/016

## Superseded Requirements

None yet - no GDD requirements have been removed or replaced since initial v0.1 publication on 2026-07-19.

## History

| Date | ADRs | Covered | Partial | Gaps | Verdict | Report |
|------|------|---------|---------|------|---------|--------|
| 2026-07-19 (initial) | 3 | 15 (17%) | 4 (5%) | 67 (78%) | CONCERNS | `architecture-review-2026-07-19.md` |
| 2026-07-19 (re-run) | 5 | 30 (35%) | 11 (13%) | 45 (52%) | CONCERNS | `architecture-review-2026-07-19-v2.md` |
