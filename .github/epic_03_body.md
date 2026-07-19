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

- [ ] Implement `AskAgentPanel` widget
- [ ] Mock QA sample routing (regex match → sample file)
- [ ] Intent classifier (`classifyIntent`)
- [ ] Real mode `/api/ask` endpoint (placeholder)
- [ ] Citation validator (reject answers without sources for factual claims)
- [ ] Numeric fact grounding (verify numbers against data sources)
- [ ] Conversation history persistence
- [ ] Suggested questions UI

## Acceptance Criteria

- [ ] 5 Mock QA samples load correctly based on query pattern
- [ ] Intent is correctly classified for 80%+ of test queries
- [ ] Citations display with clickable links
- [ ] Confidence score visible to user
- [ ] Cost (credits_used) shown per answer
- [ ] Mock mode = 0 credit consumption

## References

- LLM Router: `web/src/lib/llm/router.ts`
- Types: `web/src/lib/types.ts` (AskResponse, Citation, NumericFact)
