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
- [ ] Implement Supervisor pattern (multi-agent + fallback chain)
- [ ] Implement short-term memory (KV)
- [x] Implement long-term memory (D1) — conversation_history table in Migration 003
- [ ] RAG retrieval via Vectorize — ADR-0014 (schema ready, pipeline Phase 2)
- [ ] OpenTelemetry instrumentation
- [x] Cost cap enforcement (Sonnet → Haiku → Mock degradation) — ADR-0003
- [x] Mock/Real mode toggle — ADR-0001, isMockMode() factory

## Acceptance Criteria

- [x] All 4 intent types route correctly (simple_qa, deep_research, tool_call, clarify)
- [x] Cost cap degrades from Sonnet → Haiku → Mock under budget pressure
- [ ] Agent loop terminates within 5 iterations
- [ ] OpenTelemetry traces export to console in dev, Grafana in prod
- [x] Mock mode returns pre-generated samples without LLM calls

## References

- Architecture: `docs/architecture/architecture.md`
- Spec: `docs/spec/api_spec.md` (Ask Agent endpoints)
