# Epic 03: Ask Agent

**PRD**: [`docs/prd/epic/03_Ask_Agent.md`](../docs/prd/epic/03_Ask_Agent.md)
**Status**: Phase 1 — PMF Validation
**Priority**: P1

## Summary

Multi-step reasoning Ask Agent with citation validation, anti-hallucination, and short/long-term memory.

- LLM routing rules (4 intents × 2 environments)
- Citation validator (URL + numeric fact grounding)
- Short-term memory (KV) + Long-term (D1)
- 5 Mock QA samples (aapl_price, nvda_earnings, tsla_news, portfolio_risk, clarify)
- Intent classifier via regex patterns

## Sub-tasks

- [x] Implement `AskAgentPanel` widget
- [x] Mock QA sample routing (regex match → sample file)
- [x] Intent classifier (`classifyIntent`)
- [x] Real mode `/api/ask` endpoint — full Mock + Real mode, Sprint 5
- [x] Citation validator (reject answers without sources for factual claims) — ADR-0007
- [x] Numeric fact grounding (verify numbers against data sources) — NumericFact type
- [x] Conversation history persistence — conversation_history table in Migration 003
- [x] Suggested questions UI
- [x] Credit charging integration — Sprint 9, ADR-0017

## Acceptance Criteria

- [x] 5 Mock QA samples load correctly based on query pattern
- [x] Intent is correctly classified for 80%+ of test queries
- [x] Citations display with clickable links
- [x] Confidence score visible to user
- [x] Cost (credits_used) shown per answer
- [x] Mock mode = 0 credit consumption

## References

- LLM Router: `web/src/lib/llm/router.ts`
- Types: `web/src/lib/types.ts` (AskResponse, Citation, NumericFact)
