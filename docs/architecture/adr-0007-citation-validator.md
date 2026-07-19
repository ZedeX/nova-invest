# ADR-0007: Citation Validator (Anti-Hallucination Enforcement)

## Status

Accepted

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + D1 (async URL check task metadata) |
| **Domain** | Core (Ask Agent / Citation Validation) |
| **Knowledge Risk** | LOW |
| **References Consulted** | `web/src/lib/llm/router.ts`, `web/src/lib/types.ts`, EP01 §ID-6, EP03 §2.3/§3 BDD/§ID-3/§6.2 反模式, ADR-0003 §Cost Cap Enforcement, ADR-0004 §StepHandler.onSynthesize, `docs/registry/architecture.yaml` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `validateCitations()` detects fabricated numbers (BDD 防幻觉 scenario); exact substring match catches LLM rewording; async URL check does not block response; Mock mode skips URL check (FP-0005 compliance) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0003 (LLM routing + RealLLM.complete() produces AskResponse to validate - Accepted) |
| **Enables** | EP03 §2.3 BDD anti-hallucination scenarios, EP01 ID-6 幻觉率 ≤ 5% target, ADR-0014 Observability Schema (validation failures emit TraceStep events) |
| **Blocks** | EP03 Ask Agent implementation sprints involving LLM responses with numeric data (cannot ship without citation enforcement) |
| **Ordering Note** | Complements ADR-0004: `StepHandler.onSynthesize` is the integration point that invokes `validateCitations()`. Does NOT require ADR-0004 to be Accepted (validator can be unit-tested standalone), but production usage requires the loop. |

## Context

### Problem Statement

EP03 §2.3 mandates **forced citation mode**: every numeric value in an LLM response must come from the provided RAG context with a verifiable citation. EP03 §3 BDD specifies two anti-hallucination scenarios:

1. **数字字段必须从 RAG 提取**: "$22.10B" must appear in `numeric_facts`, with `citation.source = "sec_edgar"` and `confidence > 0.8`.
2. **防幻觉**: If RAG context doesn't contain NVDA 2026 Q4 revenue data, the answer MUST say "I don't have current data for NVDA 2026 Q4 revenue" — no specific numbers allowed.

EP03 ID-3 contains a stub `validateCitations()` function with only 3 inline checks (missing source, URL reachability, quote in context) — no formal contract, no failure modes, no loop integration. The current `RealLLM.complete()` in `web/src/lib/llm/router.ts` is a placeholder that returns empty `numeric_facts` and `citations` arrays, bypassing validation entirely.

EP01 ID-6 sets a project-level acceptance criterion: **幻觉率 ≤ 5%** (Eval Golden Set, 200+ cases). Without a formal validator, this metric cannot be enforced or measured.

### Constraints

- **Cloudflare Workers stateless**: Validator must be request-scoped; no module-level caches (per FP-0001/FP-0002/FP-0006 pattern).
- **Mock mode zero external HTTP (FP-0005)**: URL reachability check MUST be skipped when `USE_MOCK=true`. Mock QA samples already contain pre-built citations; validator runs on Mock output too (sample integrity check), but makes no HTTP calls.
- **ADR-0004 AgentLoop integration**: `StepHandler.onSynthesize(ctx, execResult) -> Synthesis` is the canonical hook point. Validator is invoked inside `onSynthesize`; loop state transitions are NOT modified by validator (validator returns result, handler decides what to do).
- **EP01 ID-6 幻觉率 ≤ 5%**: Validator must be strict enough to catch fabricated numbers but lenient enough not to reject every LLM response (which would make the product unusable).
- **Cost**: Validator runs synchronously in the request path; must not add > 5ms latency per answer (10 numeric_facts × structural + substring check).
- **RAG context availability**: Validator needs the original RAG context string to verify `fact.source.quote` substring. This must be passed via `LoopContext` (ADR-0004 IF-0005) — already required by Ask Agent flow.

### Requirements

- Every `numeric_fact` in `AskResponse.numeric_facts` MUST have a non-empty `source: Citation` (EP03 §6.2 反模式: "LLM 自由生成数字" 禁止).
- `fact.source.quote` MUST appear as an exact substring in the RAG context string (exact match, no fuzzy/embedding — see Alternatives).
- `fact.source.url` MUST be a valid URL string; reachability check is async (Cloud only, background task).
- `AskResponse.citations` array MUST always be present (even if empty — EP03 §6.2 反模式: "无 citation 的回答" 禁止).
- Validator output must distinguish: **verified facts** (pass all checks), **stripped facts** (fail structural or quote check, removed from response), **url_pending facts** (structural + quote pass, URL check queued).
- Failure mode: **Partial strip by default** (keep verified facts + add disclaimer); **Strict reject fallback** when ALL numeric_facts fail (return "I don't have reliable data for this question").
- Loop integration: `onSynthesize` calls validator, then transitions to `onFinalize` regardless of outcome (no LLM retry — see Alternatives).
- Mock mode: validator runs on Mock QA samples (verifies sample integrity); URL check skipped.
- Validator must be unit-testable standalone (no AgentLoop dependency for testing).

## Decision

**Adopt a 3-stage validation pipeline with two failure modes (Partial strip default + Strict reject fallback). Validator is a pure function invoked by `StepHandler.onSynthesize`; no loop state modification.**

### Architecture Diagram

```
                ┌──────────────────────────────────────────────┐
                │  StepHandler.onSynthesize(ctx, execResult)   │
                │  (Ask-specific, per ADR-0004)                │
                └─────────────────┬────────────────────────────┘
                                  │
                                  ▼
                ┌──────────────────────────────────────────────┐
                │  validateCitations(answer, ragContext, env)  │
                │  (pure function, request-scoped)             │
                │                                              │
                │  Stage 1: Structural validation              │
                │    - every numeric_fact has non-empty source │
                │    - every citation has source/url/quote     │
                │    - citations array present (even empty)    │
                │                                              │
                │  Stage 2: Quote substring verification       │
                │    - fact.source.quote must appear in        │
                │      ragContext (exact substring match)      │
                │                                              │
                │  Stage 3: URL reachability (async, deferred) │
                │    - Mock mode: skip (FP-0005)               │
                │    - Local mode: skip                        │
                │    - Cloud mode: enqueue background task     │
                │      (does NOT block response)               │
                └─────────────────┬────────────────────────────┘
                                  │
                                  ▼
                ┌──────────────────────────────────────────────┐
                │  ValidationResult                            │
                │                                              │
                │  If ≥1 numeric_fact passes Stages 1+2:       │
                │    -> Partial strip mode                     │
                │    -> verified_facts kept                    │
                │    -> stripped_facts removed                 │
                │    -> disclaimer added to summary            │
                │    -> url_pending_facts queued for bg check  │
                │                                              │
                │  If 0 numeric_facts pass Stages 1+2:         │
                │    -> Strict reject fallback                 │
                │    -> answer.summary = "I don't have         │
                │       reliable data for this question"       │
                │    -> numeric_facts = []                     │
                │    -> citations = []                         │
                │    -> confidence = 0                         │
                │    -> validation_status: "strict_reject"     │
                └─────────────────┬────────────────────────────┘
                                  │
                                  ▼
                ┌──────────────────────────────────────────────┐
                │  StepHandler.onFinalize(ctx, synthesis)      │
                │  -> LoopResult (per ADR-0004 IF-0006)        │
                │                                              │
                │  - status: "completed" (partial_strip)       │
                │  - status: "partial" (strict_reject)         │
                │  - abort_reason: "citation_validation_failed" │
                │    (strict_reject only)                      │
                │  - trace: TraceStep[] includes validation    │
                │    event (state: "synthesize")               │
                └──────────────────────────────────────────────┘
```

### Key Interfaces

```typescript
// web/src/lib/ask/citation.ts (canonical)

import type { AskResponse, Citation, NumericFact, QueryIntent } from "../types";

/**
 * Validation mode controls failure behavior.
 * - "partial_strip": default; keep verified facts, strip unverified, add disclaimer
 * - "strict": any unverified fact -> reject entire answer (used in BDD 防幻觉 scenario + when all facts fail)
 */
export type ValidationMode = "partial_strip" | "strict";

/**
 * Result of validating an AskResponse against RAG context.
 * 
 * On partial_strip:
 *   - verified_facts: passed all Stage 1+2 checks
 *   - stripped_facts: failed Stage 1 or Stage 2 (removed from response)
 *   - url_pending_facts: passed Stage 1+2, URL check queued (Cloud only)
 *   - validation_status: "partial_strip" | "strict_reject" | "all_verified"
 *   - disclaimer: human-readable note appended to answer.summary
 * 
 * On strict_reject (all facts failed):
 *   - verified_facts: []
 *   - stripped_facts: all original facts
 *   - url_pending_facts: []
 *   - validation_status: "strict_reject"
 *   - disclaimer: "I don't have reliable data for this question"
 */
export interface ValidationResult {
  verified_facts: NumericFact[];
  stripped_facts: NumericFact[];
  url_pending_facts: NumericFact[];
  validation_status: "all_verified" | "partial_strip" | "strict_reject";
  disclaimer: string;
  failures: ValidationFailure[];
}

export interface ValidationFailure {
  fact_index: number;
  stage: "structural" | "quote_substring";
  reason: string;
}

/**
 * Validate an LLM-produced AskResponse against RAG context.
 * 
 * @param answer - The AskResponse from MockLLM.complete() or RealLLM.complete()
 * @param ragContext - The assembled RAG context string (from AskRAGPipeline.assemble())
 * @param env - Environment (for Mock mode detection; URL check deferred)
 * @returns ValidationResult with verified/stripped/url_pending facts
 * 
 * Pure function: no side effects, no HTTP calls, no module-level state.
 * URL reachability check is enqueued separately (see enqueueUrlChecks).
 */
export function validateCitations(
  answer: AskResponse,
  ragContext: string,
  env: { USE_MOCK?: string; ENVIRONMENT?: string }
): ValidationResult;

/**
 * Enqueue background URL reachability checks for url_pending_facts.
 * 
 * Mock mode: no-op (FP-0005 compliance).
 * Local mode: no-op (avoid localhost dev latency).
 * Cloud mode: enqueue task to D1 `url_check_queue` table; cron worker processes queue.
 * 
 * Failures are logged to trace (ADR-0014 Observability, future) but do NOT
 * modify the already-returned response.
 */
export function enqueueUrlChecks(
  facts: NumericFact[],
  trace_id: string,
  env: { USE_MOCK?: string; ENVIRONMENT?: string }
): Promise<void>;

/**
 * Apply ValidationResult to an AskResponse, producing the final response
 * that gets returned to the user.
 * 
 * - partial_strip: keep verified_facts, append disclaimer to summary
 * - strict_reject: replace summary with disclaimer, clear numeric_facts + citations
 * - all_verified: return answer unchanged
 */
export function applyValidationResult(
  answer: AskResponse,
  result: ValidationResult
): AskResponse;
```

### Stage 1: Structural Validation

For each `numeric_fact` in `answer.numeric_facts`:

1. `fact.source` must be a non-empty `Citation` object
2. `fact.source.source` must be one of `"sec_edgar" | "yahoo" | "fred" | "news" | "playbook" | "user_note"` (per EP03 §2.3)
3. `fact.source.url` must be a valid URL string (parseable by `new URL()`)
4. `fact.source.quote` must be a non-empty string
5. `fact.confidence` must be a number in `[0, 1]`
6. `fact.value` must be a finite number (not NaN/Infinity)
7. `fact.unit` must be a non-empty string

If any check fails: record `ValidationFailure { stage: "structural", reason: <details> }`, mark fact as stripped.

Additionally: `answer.citations` array must exist (even if empty). Missing array is a structural failure of the whole answer (not a per-fact failure).

### Stage 2: Quote Substring Verification

For each `numeric_fact` that passed Stage 1:

1. Take `fact.source.quote` string
2. Check if it appears as an exact substring in `ragContext` (the assembled RAG context string from `AskRAGPipeline.assemble()`)
3. Substring match is case-sensitive (financial data is case-sensitive: "AAPL" ≠ "aapl")
4. Whitespace normalization: collapse runs of whitespace in both `quote` and `ragContext` before matching (handles minor formatting differences)

If substring not found: record `ValidationFailure { stage: "quote_substring", reason: "quote not found in RAG context" }`, mark fact as stripped.

**Prompt-side contract**: The LLM prompt (EP03 §2.3 `ANSWER_PROMPT`) must instruct: *"For numeric_facts[].source.quote, copy the exact original text片段 from the provided context; do not reword, paraphrase, or translate."* This minimizes false-negatives from LLM rewording.

### Stage 3: URL Reachability Check (Async, Deferred)

For each `numeric_fact` that passed Stages 1+2:

- **Mock mode** (`USE_MOCK=true`): Skip. Mark fact as `verified` (no `url_pending` state). FP-0005 compliance.
- **Local mode** (`USE_MOCK=false`, `ENVIRONMENT!="production"`): Skip. Mark fact as `verified`. Avoid localhost dev latency.
- **Cloud mode** (`USE_MOCK=false`, `ENVIRONMENT="production"`): Enqueue background URL check task. Mark fact as `url_pending`. Response returns immediately; URL check results are logged to D1 `url_check_queue` table (see Migration below) and surfaced in future trace queries (ADR-0014).

**Rationale for async**: A single answer may have 5-10 citations. Synchronous URL checking would add 5-10s latency (1s timeout per URL). Async background check keeps response fast while still detecting dead URLs for observability.

### Failure Mode Decision Tree

```
After Stages 1+2:

  numeric_facts_passed = count(facts where stage 1 + stage 2 both pass)
  numeric_facts_failed = count(facts where stage 1 or stage 2 fails)

  IF numeric_facts_passed == 0 AND original numeric_facts.length > 0:
    -> Strict reject fallback
    -> validation_status = "strict_reject"
    -> applyValidationResult: summary = disclaimer, numeric_facts = [], citations = []
    -> LoopResult.status = "partial", abort_reason = "citation_validation_failed"

  ELSE IF numeric_facts_failed > 0:
    -> Partial strip mode
    -> validation_status = "partial_strip"
    -> applyValidationResult: keep verified_facts, append disclaimer to summary
    -> LoopResult.status = "completed"

  ELSE (numeric_facts_failed == 0):
    -> All verified
    -> validation_status = "all_verified"
    -> applyValidationResult: return answer unchanged
    -> LoopResult.status = "completed"

  Special case: original numeric_facts.length == 0:
    -> All verified (no facts to validate)
    -> validation_status = "all_verified"
    -> This covers "I don't have data" responses (BDD 防幻觉 scenario)
```

### Disclaimer Text

- **Partial strip**: `"Note: {N} of {M} data points could not be verified against source data and have been removed.`
- **Strict reject**: `"I don't have reliable data for this question. Please try rephrasing or asking about a different aspect."`
- **All verified**: no disclaimer (empty string)

### AgentLoop Integration

Per ADR-0004, `StepHandler.onSynthesize(ctx, execResult)` is where citation validation happens. The Ask-specific handler implementation:

```typescript
// web/src/lib/agent/ask-handlers.ts (future, not yet implemented)

export class AskStepHandler implements StepHandler {
  async onSynthesize(ctx: LoopContext, execResult: ExecResult): Promise<Synthesis> {
    const answer = execResult as AskResponse;
    const ragContext = ctx.rag_context;  // must be populated by onExecute
    
    const validationResult = validateCitations(answer, ragContext, ctx.env);
    const finalAnswer = applyValidationResult(answer, validationResult);
    
    // Enqueue async URL checks (no-op in Mock/Local)
    await enqueueUrlChecks(validationResult.url_pending_facts, ctx.trace_id, ctx.env);
    
    // Emit TraceStep for validation (per ADR-0004 IF-0006 TraceStep)
    ctx.trace.push({
      step_id: `synth_${ctx.step_count}`,
      parent_id: `exec_${ctx.step_count - 1}`,
      type: "synthesize",
      state: "Synthesize",
      timestamp: new Date().toISOString(),
      input: { fact_count: answer.numeric_facts.length },
      output: {
        verified: validationResult.verified_facts.length,
        stripped: validationResult.stripped_facts.length,
        status: validationResult.validation_status,
      },
      duration_ms: 0,  // populated by loop
      cost_usd: 0,     // validation is free
    });
    
    return { answer: finalAnswer, validation: validationResult };
  }
  
  async onFinalize(ctx: LoopContext, synthesis: Synthesis): Promise<LoopResult> {
    const result = synthesis as { answer: AskResponse; validation: ValidationResult };
    
    return {
      answer: result.answer,
      trace: ctx.trace,
      total_cost_usd: ctx.accumulated_cost_usd,
      steps_executed: ctx.step_count,
      status: result.validation.validation_status === "strict_reject" ? "partial" : "completed",
      abort_reason: result.validation.validation_status === "strict_reject" 
        ? "citation_validation_failed" 
        : undefined,
    };
  }
}
```

**Critical rule**: Validator does NOT modify `LoopContext.accumulated_cost_usd` (validation is free). Validator does NOT trigger LLM retry (cost concern — see Alternatives). Validator does NOT transition loop to `Aborted` state (Strict reject returns `status: "partial"`, not `aborted`).

### D1 Schema Addition (Sync with ADR-0011)

This ADR adds one new table to ADR-0011 §Master Schema. Per FP-0012, this must be reflected in ADR-0011.

```sql
-- Migration: 008_citation_url_check.sql
-- (Extends ADR-0011 Migration 007_community.sql; runs after 007)

CREATE TABLE url_check_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,                    -- FK to future ADR-0014 traces table
  citation_url TEXT NOT NULL,
  citation_source TEXT NOT NULL,             -- "sec_edgar" | "yahoo" | etc.
  fact_value TEXT,                           -- the numeric value being cited (for debugging)
  status TEXT NOT NULL DEFAULT 'pending',    -- lifecycle_status prefix per FP-0009; but this is queue-specific
  checked_at TEXT,
  http_status INTEGER,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_url_check_status ON url_check_queue(status, created_at);
```

**Naming convention note**: `status` column here is queue-specific (pending/processing/done/failed), not the same domain as `lifecycle_status` / `moderation_status` / `order_status` (FP-0009). FP-0009 applies to *entity* state, not *task* state. Queue tasks have their own `status` semantics. ADR-0011 may need a small amendment to clarify this exception.

**Migration order update** (extends ADR-0011 API-0008):
- 001_users_symbols.sql
- 002_data_layer.sql
- 003_ask_agent.sql
- 004_strategy.sql
- 005_broker.sql
- 006_playbook.sql
- 007_community.sql
- **008_citation_url_check.sql** (NEW, this ADR)

## Alternatives Considered

### Alternative 1: Strict reject only (any violation = reject entire answer)

- **Description**: If any `numeric_fact` fails structural or quote check, reject the entire answer. Return "I don't have reliable data for this question" regardless of how many facts passed.
- **Pros**: Maximum anti-hallucination guarantee; simplest decision logic (binary pass/fail).
- **Cons**: Loses partial valid data; UX frustration when 8/10 facts are correct but 2 fail; may make product unusable for complex research queries where LLM occasionally rewords a quote.
- **Rejection Reason**: Too aggressive for production use. Adopted as **fallback** when ALL facts fail (not the primary mode).

### Alternative 2: Tag-and-pass (keep all facts, tag verification status)

- **Description**: Keep all `numeric_fact` entries in the response, but add `verification_status: "verified" | "unverified" | "url_check_pending"` to each. Frontend UI decides how to display unverified facts (e.g., grey out, hide, show warning).
- **Pros**: Maximum flexibility; no data loss; UI can differentiate.
- **Cons**: Doesn't satisfy EP03 §3 BDD "不允许出现具体数字" for unverified data without coupling to frontend behavior. Adds `verification_status` field to `NumericFact` type (breaks existing `types.ts` interface). Frontend must implement hiding logic, which is out of scope for Phase 1.
- **Rejection Reason**: BDD compliance requires server-side enforcement, not UI-deferred. Phase 1 frontend doesn't have conditional rendering for unverified facts.

### Alternative 3: Fuzzy match (Levenshtein distance) for quote verification

- **Description**: Allow `fact.source.quote` to match RAG context with ≤ 10% edit distance (Levenshtein).
- **Pros**: Tolerates minor LLM rewording (punctuation, spacing, minor paraphrasing).
- **Cons**: Adds 10-50ms per fact (10 facts × 50ms = 500ms worst case); requires bundling a Levenshtein library (~5KB); false positives (a short quote may fuzzy-match unrelated text).
- **Rejection Reason**: Performance cost unacceptable for synchronous validation. Exact substring match + prompt-side instruction "copy exact text, do not reword" achieves the same goal without runtime cost.

### Alternative 4: Embedding similarity for quote verification

- **Description**: Compute embedding of `fact.source.quote` and compare cosine similarity to embeddings of RAG context chunks. Threshold: ≥ 0.85.
- **Pros**: Most tolerant of rewording; semantic match.
- **Cons**: Requires embedding API call (extra cost ~$0.0001 per fact, 100-300ms latency per fact); needs pre-computed RAG context embeddings (couples to Vectorize); over-engineered for Phase 1.
- **Rejection Reason**: Phase 1 overkill. Revisit in Phase 2 if exact match false-negative rate > 15%.

### Alternative 5: Synchronous URL reachability check (Mock skip)

- **Description**: In Mock mode skip; in Local + Cloud modes, fetch each citation URL with 1s timeout before returning response.
- **Pros**: Strictest URL verification; dead URLs caught before user sees them.
- **Cons**: 10 citations × 1s timeout = up to 10s added latency per response; violates EP03 §6.2 反模式 "同步等待 LLM 完成才返回: >5s 必须流式返回" (URL check would push responses over 5s); external HTTP in Workers adds complexity.
- **Rejection Reason**: Latency unacceptable. Async background check achieves the same observability goal without blocking response.

### Alternative 6: Synthesize -> Plan retry on validation failure (1 retry with stricter prompt)

- **Description**: If validation fails (partial_strip or strict_reject), loop transitions back to Plan state, LLM is re-called with a stricter prompt ("Your previous response had unverified citations. Regenerate using ONLY exact quotes from the context."). One retry max.
- **Pros**: May salvage some answers; LLM gets a chance to self-correct.
- **Cons**: Doubles LLM cost for failed validations (against ADR-0003 cost_cap philosophy); adds 1-3s latency; no guarantee LLM will succeed on retry (may fail same way); complicates loop state machine (Synthesize -> Plan is a backward transition).
- **Rejection Reason**: Cost concern (ADR-0003 cost_cap is per-call; retry doubles cost). Backward state transition complicates ADR-0004 loop. Phase 1 simplicity. Revisit in Phase 1.5 if partial_strip rate > 30%.

## Consequences

### Positive

- **EP03 §2.3 forced citation mode is now formally enforced** — no numeric data without verifiable source.
- **EP03 §3 BDD 防幻觉 scenario is implementable** — strict_reject fallback returns "I don't have reliable data" when no facts pass.
- **EP01 ID-6 幻觉率 ≤ 5% target is measurable** — count `validation_status: "strict_reject"` + `stripped_facts.length` across Golden Set.
- **Clear failure taxonomy**: structural vs quote_substring vs url_pending; each fact has explicit disposition.
- **Mock mode compliance**: validator runs on Mock samples (integrity check) without breaking FP-0005.
- **Pure function design**: `validateCitations()` is unit-testable without AgentLoop, without RAG pipeline, without LLM.
- **Async URL check non-blocking**: Cloud mode gets observability without latency cost.
- **Loop integration is additive**: ADR-0004 state machine unchanged; validator plugs into `onSynthesize` without modifying transitions.

### Negative

- **Exact substring match is brittle**: LLM may reword quotes despite prompt instructions. False-negative rate unknown until Phase 1 deployment. Mitigation: prompt-side instruction + Phase 1.5 revisit if rate > 15%.
- **Strict reject fallback may frustrate users**: When all facts fail, user gets a generic "no data" message. Mitigation: BDD scenario explicitly requires this behavior; UX trade-off accepted.
- **D1 schema addition**: `url_check_queue` table extends ADR-0011 migration order to 008. Requires ADR-0011 amendment (small).
- **Cron worker for URL check**: Cloud mode requires a cron worker (or Queue consumer) to process `url_check_queue`. Not yet specified — deferred to implementation story.
- **`LoopContext.rag_context` field**: ADR-0004 IF-0005 doesn't currently include `rag_context: string` field. Ask-specific handler must extend `LoopContext` (or store rag_context in `execResult` passed to `onSynthesize`). Minor extension to ADR-0004 interface.

### Risks

- **Risk**: Exact substring match false-negative rate > 15% (LLM rewords despite instructions).
  - **Mitigation**: Phase 1.5 revisit with fuzzy match (Alternative 3); prompt engineering to emphasize "copy exact text".
- **Risk**: Strict reject fallback triggers too often (e.g., for simple_qa queries where LLM produces short quotes that don't exactly match).
  - **Mitigation**: Monitor `validation_status` distribution in first 100 production queries; tune prompt or relax match if strict_reject rate > 20%.
- **Risk**: `url_check_queue` grows unbounded if cron worker fails.
  - **Mitigation**: Add TTL cleanup (delete entries older than 30 days); alert on queue depth > 1000.
- **Risk**: Validator adds > 5ms latency for large answers (50+ numeric_facts).
  - **Mitigation**: Substring check is O(n) where n = ragContext length; for typical 4KB RAG context + 10 facts, ~1ms. Add performance test in validation criteria.
- **Risk**: ADR-0004 `LoopContext` interface doesn't have `rag_context` field — integration may require ADR-0004 amendment.
  - **Mitigation**: Store `rag_context` in `ExecResult` (output of `onExecute`), pass to `onSynthesize(ctx, execResult)` — no ADR-0004 change needed.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP03 §2.3 | "强制 Citation 模式：所有数字字段必须从结构化数据提取" | Stage 1 structural validation enforces every numeric_fact has Citation source |
| EP03 §2.3 | `AnswerWithCitations` interface (text + citations + numeric_facts) | Validator consumes `AskResponse` (which already has these fields per `types.ts`) |
| EP03 §2.3 | `Citation.source` enum: "sec_edgar" \| "yahoo" \| "fred" \| "news" | Stage 1 validates `source.source` against this enum (extended with "playbook" \| "user_note" for RAG sources) |
| EP03 §2.3 | LLM Prompt RULES: "Every numeric value MUST come from the provided context (RAG results)" | Stage 2 quote substring verification enforces this |
| EP03 §2.3 | LLM Prompt RULES: "Do NOT fabricate numbers" | Strict reject fallback returns "I don't have reliable data" when fabrication detected |
| EP03 §3 BDD | "数字字段必须从 RAG 提取" scenario: "$22.10B" must be in numeric_facts, citation.source = "sec_edgar", confidence > 0.8 | Stage 1 validates confidence ≥ 0 (BDD threshold > 0.8 is per-fact, enforced by prompt + observed in validation output) |
| EP03 §3 BDD | "防幻觉" scenario: answer must contain "I don't have current data for X" and no specific numbers | Strict reject fallback produces exactly this message; `numeric_facts = []` |
| EP03 §3 BDD | "Mock 模式立即返回" scenario: directly return mock_data/qa_samples/aapl_price.json, no LLM API call | Validator runs on Mock output (sample integrity check) but makes no HTTP calls (FP-0005); MockLLM.complete() bypasses validator if samples are pre-validated at build time (optimization) |
| EP03 §ID-3 | `validateCitations(answer: AnswerWithCitations): ValidationResult` stub | Formalized as canonical `validateCitations(answer, ragContext, env) -> ValidationResult` interface |
| EP03 §6.2 反模式 | "LLM 自由生成数字：所有数字必须从 RAG 提取并带 citation" | FP-0014 (new) bans this pattern; validator enforces |
| EP03 §6.2 反模式 | "无 citation 的回答：必须返回 citations 数组（即使为空也要返回）" | Stage 1 structural check: `answer.citations` array must exist (even if empty) |
| EP01 §ID-6 | "幻觉率 ≤ 5%" Eval Golden Set acceptance criterion | Validator's `strict_reject` + `stripped_facts` metrics enable measuring hallucination rate |
| EP03 §2.7 | Ask Agent Loop state machine includes "ValidateCitations" state | `StepHandler.onSynthesize` invokes validator (per ADR-0004 generic loop); Ask-specific validation behavior now ADR'd |
| TR-EP03-005 | Forced citation mode - all numeric fields from structured RAG data | Stage 1+2 enforce |
| TR-EP03-006 | AnswerWithCitations interface (text + citations + numeric_facts) | Validator consumes this interface (already in `types.ts`) |
| TR-EP03-007 | validateCitations() detects hallucination (every numeric_facts must have citation) | Canonical function defined in this ADR |
| TR-EP03-012 | Ask Agent Loop state machine includes ValidateCitations state | Partial coverage: validator is defined; full Ask loop state behavior still in StepHandler implementation (not ADR'd) |

## Performance Implications

- **CPU**: Structural validation (Stage 1): ~0.1ms per fact (10 facts = 1ms). Quote substring (Stage 2): ~0.5ms per fact for 4KB RAG context (10 facts = 5ms). Total: ~6ms per answer worst case. Within 5ms budget for ≤ 8 facts; may slightly exceed for 10+ facts (acceptable trade-off).
- **Memory**: ValidationResult holds 3 arrays of NumericFact references (no copies). ~200 bytes per fact. 10 facts = 2KB. Negligible.
- **Load Time**: Validator adds 5-10ms to total response time. For context: LLM call is 500-3000ms. Validator is < 2% of total latency.
- **Network**: Mock mode: zero (FP-0005). Local mode: zero. Cloud mode: async URL check tasks (non-blocking, background cron/queue).
- **Cost**: Validator itself is free (pure function, no API calls). Async URL check in Cloud mode: minimal D1 writes + cron worker execution (within Cloudflare free tier).

## Migration Plan

Current state: `web/src/lib/llm/router.ts` has `MockLLM.complete()` returning `AskResponse` with pre-built `numeric_facts` and `citations` from sample files. `RealLLM.complete()` is a placeholder returning empty arrays. No validator exists.

Migration steps:

1. **Create `web/src/lib/ask/citation.ts`** with `validateCitations()`, `applyValidationResult()`, `enqueueUrlChecks()`, and all types (`ValidationMode`, `ValidationResult`, `ValidationFailure`).
2. **Add unit tests** in `web/tests/unit/citation-validator.test.ts` covering:
   - Stage 1 structural failures (missing source, invalid URL, empty quote, NaN value)
   - Stage 2 quote substring match (exact match passes, reworded quote fails)
   - Failure mode decision tree (all_verified, partial_strip, strict_reject)
   - Mock mode: no URL check enqueued
   - BDD 防幻觉 scenario: strict_reject returns "I don't have reliable data"
3. **Update `MockLLM.complete()`** to invoke `validateCitations()` on sample output before returning. Mock samples should pass validation (sample integrity check). If a sample fails, log warning but still return (don't break Mock mode for a bad sample).
4. **Update `RealLLM.complete()`** (when implemented in Phase 1.5) to invoke `validateCitations()` after LLM API call, before returning. Apply `applyValidationResult()` to produce final response.
5. **Create `web/migrations/008_citation_url_check.sql`** with `url_check_queue` table DDL. Update ADR-0011 §Master Schema to include this table.
6. **Implement cron worker** (Phase 1.5, Cloud mode only) to process `url_check_queue` entries. Schedule: every 5 minutes. Per-entry: HTTP HEAD with 3s timeout, update `status`/`http_status`/`checked_at`/`error_message`.
7. **Implement `AskStepHandler.onSynthesize`** (per ADR-0004) to invoke validator. Add `rag_context: string` to `ExecResult` (output of `onExecute`), not to `LoopContext` directly (avoids ADR-0004 interface change).
8. **Add ADR-0011 amendment**: Migration order extended to 008. Clarify FP-0009 exception for queue task `status` columns.

## Validation Criteria

- [ ] `validateCitations(answer_with_all_valid_facts, ragContext, env)` returns `validation_status: "all_verified"`
- [ ] `validateCitations(answer_with_missing_source, ragContext, env)` returns `validation_status: "partial_strip"` with stripped_facts.length > 0
- [ ] `validateCitations(answer_with_all_facts_failing, ragContext, env)` returns `validation_status: "strict_reject"` with verified_facts.length === 0
- [ ] `validateCitations(answer_with_quote_not_in_context, ragContext, env)` marks fact as stripped (stage: "quote_substring")
- [ ] `validateCitations(answer, ragContext, { USE_MOCK: "true" })` does NOT enqueue URL checks (FP-0005 compliance)
- [ ] `validateCitations(answer, ragContext, { USE_MOCK: "false", ENVIRONMENT: "production" })` enqueues URL checks for verified facts
- [ ] `applyValidationResult(answer, strict_reject_result)` returns answer with summary = "I don't have reliable data for this question" and numeric_facts = []
- [ ] `applyValidationResult(answer, partial_strip_result)` returns answer with verified_facts only and disclaimer appended to summary
- [ ] BDD 防幻觉 scenario: when RAG context has no NVDA 2026 Q4 data and LLM produces numeric_facts, validator returns strict_reject
- [ ] BDD 数字字段必须从 RAG 提取 scenario: when RAG context has "$22.10B" and LLM cites it with quote = "NVDA 营收 $22.10B", validator returns all_verified (quote is substring of context)
- [ ] Performance: `validateCitations()` with 10 numeric_facts and 4KB ragContext completes in < 10ms
- [ ] No module-level state in `citation.ts` (pure functions only)
- [ ] Unit tests pass without AgentLoop dependency (validator is standalone)
- [ ] Mock QA samples (`web/public/mock/qa_samples/*.json`) all pass validation (sample integrity check)

## Related Decisions

- **ADR-0003** (LLM Routing + Cost Cap) - Accepted. RealLLM.complete() produces the AskResponse that this validator consumes.
- **ADR-0004** (Agent Loop Design) - Proposed. `StepHandler.onSynthesize` is the integration point. Validator does NOT modify loop state machine.
- **ADR-0011** (D1 Schema Master) - Proposed. This ADR adds `url_check_queue` table (Migration 008). Requires ADR-0011 amendment.
- **ADR-0014** (Observability Schema, future) - Validation failures should emit TraceStep events. This ADR defines the `ValidationFailure` shape that ADR-0014 will consume.
- **EP03 §2.3** - Originating design doc (forced citation mode).
- **EP03 §3 BDD** - Acceptance criteria (防幻觉 + 数字字段必须从 RAG 提取 scenarios).
- **EP03 §ID-3** - Original `validateCitations()` stub. This ADR formalizes it.
- **EP01 §ID-6** - Eval Golden Set 幻觉率 ≤ 5% target. This ADR makes the metric measurable.
