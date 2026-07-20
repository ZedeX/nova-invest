# Epic 01: Agent Harness

**PRD**: [`docs/prd/epic/01_AgentHarness.md`](../docs/prd/epic/01_AgentHarness.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P0 (foundational)

## Summary

Build the 9-layer Agent Harness that powers all AI capabilities:
1. UI Layer
2. Orchestration Layer (Supervisor pattern)
3. Agent Loop
4. Planning Layer
5. Tool Calling
6. Memory (KV short-term + D1 long-term)
7. RAG (Vectorize)
8. LLM Provider (routing: LM Studio local / Volcano Ark cloud)
9. Observability (OpenTelemetry + Grafana)

## Sub-tasks

- [x] Define `AgentHarness` interface
- [x] Implement LLM router (`src/lib/llm/router.ts`) — ADR-0003
- [x] Implement Supervisor pattern (multi-agent + fallback chain) — `src/lib/agent/supervisor.ts` (Phase 2, 2026-07-21)
- [x] Implement short-term memory (KV) — `src/lib/memory/store.ts` (ADR-0005 Phase-2: KV interface ready; MockMemoryStore + D1MemoryStore unified via MemoryStore interface)
- [x] Implement long-term memory (D1) — conversation_history table in Migration 003
- [~] RAG retrieval via Vectorize — ADR-0014 pipeline + 4 adapters (Kline/Fundamentals/News/Playbook) implemented in `src/lib/rag/`; real Vectorize backend requires Cloudflare Workers paid plan (Phase 2 external)
- [x] OpenTelemetry instrumentation — `src/lib/telemetry/index.ts` (Phase 1.5 scaffold: console export; OTLP → Grafana deferred to Phase 2 external)
- [x] Cost cap enforcement (Sonnet → Haiku → Mock degradation) — ADR-0003
- [x] Mock/Real mode toggle — ADR-0001, isMockMode() factory

## Acceptance Criteria

- [x] All 4 intent types route correctly (simple_qa, deep_research, tool_call, clarify)
- [x] Cost cap degrades from Sonnet → Haiku → Mock under budget pressure
- [x] Agent loop terminates within MAX_STEPS=20 iterations per ADR-0004 §Constants (originally "5 iterations" in early PRD; ADR-0004 formalized as 20 — synced 2026-07-21)
- [~] OpenTelemetry traces export to console in dev (done), Grafana in prod (Phase 2 external — requires OTLP exporter + Grafana Cloud account)
- [x] Mock mode returns pre-generated samples without LLM calls

## References

- Architecture: `docs/architecture/architecture.md`
- Spec: `docs/spec/api_spec.md` (Ask Agent endpoints)
