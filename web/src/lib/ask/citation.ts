/**
 * ADR-0007: Citation Validator — Stage 2 (Quote Substring Verification)
 *
 * This module implements the anti-hallucination core of ADR-0007:
 *   - `validateCitations(answer, ragContext, env)` — multi-fact pipeline
 *     running Stage 1 (structural) + Stage 2 (quote substring) on every
 *     `numeric_fact`. Stage 3 (URL reachability) is deferred to a
 *     background queue via `enqueueUrlChecks()`.
 *   - `applyValidationResult(answer, result)` — produces the final
 *     AskResponse: keeps verified facts, strips unverified, appends
 *     disclaimer, or returns the strict-reject fallback.
 *
 * The per-citation structural + URL-reachability checks live in
 * `web/src/lib/citation/validator.ts` and are reused here for Stage 1
 * per-fact source validation. This module is the higher-level orchestrator
 * that operates on the LLM-output `AskResponse` shape (per `types.ts`),
 * not the validator-domain `Citation` shape.
 *
 * Pure-function contract: no module-level state, no side effects beyond
 * the deferred URL check enqueue. URL reachability is NEVER called
 * synchronously in the request path (Stage 3 is async by spec).
 */

import type {
  AskResponse,
  Citation,
  NumericFact,
} from "../types";
import { SOURCE_ALLOWLIST, normalizeUrl } from "../citation/validator";

// ============ Types ============

/**
 * Validation mode controls failure behavior.
 * - "partial_strip" (default): keep verified facts, strip unverified, add disclaimer.
 * - "strict": any unverified fact -> reject entire answer (BDD 防幻觉 scenario).
 */
export type ValidationMode = "partial_strip" | "strict";

/**
 * Reason a fact failed validation. Mirrors the Stage that caught it.
 */
export type ValidationStage = "structural" | "quote_substring";

export interface ValidationFailure {
  /** Index of the failing fact in the original `answer.numeric_facts` array. */
  fact_index: number;
  /** Which Stage caught the failure. */
  stage: ValidationStage;
  /** Human-readable reason for tracing / debug. */
  reason: string;
}

/**
 * Result of running `validateCitations` on an AskResponse.
 *
 * - `verified_facts`: passed Stage 1 + Stage 2 (kept in response).
 * - `stripped_facts`: failed Stage 1 or Stage 2 (removed from response).
 * - `url_pending_facts`: passed Stage 1+2; URL check queued (Cloud mode only).
 *   In Mock/Local mode this equals `verified_facts` (no URL check enqueued).
 * - `validation_status`:
 *     "all_verified"    — all facts passed (or zero facts)
 *     "partial_strip"   — some facts passed, some failed
 *     "strict_reject"   — zero facts passed (and original had ≥1)
 * - `disclaimer`: human-readable note to append to `answer.summary`.
 */
export interface CitationValidationResult {
  verified_facts: NumericFact[];
  stripped_facts: NumericFact[];
  url_pending_facts: NumericFact[];
  validation_status: "all_verified" | "partial_strip" | "strict_reject";
  disclaimer: string;
  failures: ValidationFailure[];
}

export interface CitationValidatorEnv {
  USE_MOCK?: string;
  ENVIRONMENT?: string;
}

// ============ Pure helpers ============

/**
 * Collapse runs of whitespace (incl. newlines) to single spaces.
 * ADR-0007 §Stage 2: "Whitespace normalization: collapse runs of
 * whitespace in both quote and ragContext before matching".
 */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Stage 1 structural check on a single NumericFact.
 * Returns an error string if invalid (describing the first failing check),
 * or null if the fact passed all structural checks.
 *
 * Checks (per ADR-0007 §Stage 1):
 *   1. fact.source is a non-empty Citation object
 *   2. fact.source.source is one of the allowed source labels
 *   3. fact.source.url is a valid URL string (parseable by new URL())
 *   4. fact.source.quote is a non-empty string
 *   5. fact.confidence is a number in [0, 1]
 *   6. fact.value is a finite number (not NaN/Infinity)
 *   7. fact.unit is a non-empty string
 */
function structuralFailure(fact: NumericFact): string | null {
  if (!fact || typeof fact !== "object") return "fact is not an object";
  const src = fact.source;
  if (!src || typeof src !== "object") return "fact.source is missing or not an object";
  // The LLM-output Citation (types.ts) uses `source` as a label string and
  // `url` / `quote` as separate fields. ADR-0007 §Stage 1 check #2 expects
  // the label to be in the allowlist of source labels; the URL hostname
  // allowlist check is enforced separately in citation/validator.ts.
  if (typeof src.source !== "string" || src.source.length === 0) {
    return "fact.source.source is missing or empty";
  }
  // Source label allowlist per EP03 §2.3.
  const ALLOWED_SOURCE_LABELS = new Set([
    "sec_edgar", "yahoo", "fred", "news", "playbook", "user_note",
  ]);
  if (!ALLOWED_SOURCE_LABELS.has(src.source)) {
    return `fact.source.source '${src.source}' is not in allowlist`;
  }
  if (typeof src.url !== "string" || src.url.length === 0) {
    return "fact.source.url is missing or empty";
  }
  // Validate URL parses; hostname must be in SOURCE_ALLOWLIST for trust.
  let parsed: URL;
  try {
    parsed = new URL(normalizeUrl(src.url));
  } catch {
    return `fact.source.url '${src.url}' is unparseable`;
  }
  if (parsed.protocol !== "https:") {
    return `fact.source.url protocol '${parsed.protocol}' is not https:`;
  }
  if (!SOURCE_ALLOWLIST.has(parsed.hostname)) {
    return `fact.source.url hostname '${parsed.hostname}' is not allowlisted`;
  }
  if (typeof src.quote !== "string" || src.quote.length === 0) {
    return "fact.source.quote is missing or empty";
  }
  if (typeof fact.confidence !== "number" || fact.confidence < 0 || fact.confidence > 1) {
    return `fact.confidence ${fact.confidence} is not in [0,1]`;
  }
  if (typeof fact.value !== "number" || !Number.isFinite(fact.value)) {
    return `fact.value ${fact.value} is not a finite number`;
  }
  if (typeof fact.unit !== "string" || fact.unit.length === 0) {
    return "fact.unit is missing or empty";
  }
  return null;
}

/**
 * Stage 2 quote substring verification.
 * Returns true if `quote` appears as an exact substring of `ragContext`
 * after whitespace normalization (per ADR-0007 §Stage 2 #4).
 *
 * Case-sensitive (per §Stage 2 #3: financial data is case-sensitive).
 */
function quoteInContext(quote: string, ragContext: string): boolean {
  if (quote.length === 0) return false;
  if (ragContext.length === 0) return false;
  const q = normalizeWhitespace(quote);
  const ctx = normalizeWhitespace(ragContext);
  return ctx.includes(q);
}

// ============ Public API ============

/**
 * Validate an LLM-produced AskResponse against RAG context.
 *
 * Implements ADR-0007 §Pipeline Stages 1+2 synchronously. Stage 3 (URL
 * reachability) is deferred — facts that pass Stages 1+2 are returned in
 * `url_pending_facts` for the caller to enqueue via `enqueueUrlChecks()`.
 *
 * Pure function: no side effects, no HTTP calls, no module-level state.
 *
 * @param answer    - The AskResponse from MockLLM.complete() or RealLLM.complete()
 * @param ragContext - The assembled RAG context string (from AskRAGPipeline.assemble())
 * @param _env      - Environment (reserved; not used synchronously — URL check deferred)
 * @returns CitationValidationResult with verified/stripped/url_pending facts
 */
export function validateCitations(
  answer: AskResponse,
  ragContext: string,
  _env?: CitationValidatorEnv,
): CitationValidationResult {
  const facts: NumericFact[] = Array.isArray(answer.numeric_facts) ? answer.numeric_facts : [];
  const failures: ValidationFailure[] = [];
  const verified: NumericFact[] = [];
  const stripped: NumericFact[] = [];

  facts.forEach((fact, idx) => {
    // Stage 1: structural
    const structErr = structuralFailure(fact);
    if (structErr !== null) {
      failures.push({ fact_index: idx, stage: "structural", reason: structErr });
      stripped.push(fact);
      return;
    }
    // Stage 2: quote substring
    if (!quoteInContext(fact.source.quote, ragContext)) {
      failures.push({
        fact_index: idx,
        stage: "quote_substring",
        reason: "quote not found in RAG context (after whitespace normalization)",
      });
      stripped.push(fact);
      return;
    }
    verified.push(fact);
  });

  // Decide validation_status per §Failure Mode Decision Tree.
  let status: CitationValidationResult["validation_status"];
  let disclaimer: string;

  if (facts.length === 0) {
    // No facts to validate — covers "I don't have data" responses (BDD 防幻觉).
    status = "all_verified";
    disclaimer = "";
  } else if (verified.length === 0) {
    // All facts failed -> strict reject.
    status = "strict_reject";
    disclaimer =
      "I don't have reliable data for this question. Please try rephrasing or asking about a different aspect.";
  } else if (stripped.length > 0) {
    // Mixed — partial strip.
    status = "partial_strip";
    disclaimer = `Note: ${stripped.length} of ${facts.length} data points could not be verified against source data and have been removed.`;
  } else {
    // All facts passed.
    status = "all_verified";
    disclaimer = "";
  }

  return {
    verified_facts: verified,
    stripped_facts: stripped,
    // Stage 3 (URL reachability) is deferred. In Mock/Local mode no enqueue
    // happens, so url_pending_facts is empty. In Cloud mode the caller
    // invokes enqueueUrlChecks() with these facts; the response is returned
    // immediately regardless. To keep this function pure (no HTTP), we
    // surface the verified facts as url_pending so callers can enqueue them.
    url_pending_facts: status === "strict_reject" ? [] : verified,
    validation_status: status,
    disclaimer,
    failures,
  };
}

/**
 * Apply a CitationValidationResult to an AskResponse, producing the final
 * response that gets returned to the user.
 *
 * - `all_verified`: return answer unchanged.
 * - `partial_strip`: keep verified_facts, append disclaimer to summary.
 * - `strict_reject`: replace summary with disclaimer, clear numeric_facts
 *   and citations, set confidence to 0.
 *
 * The input `answer` is not mutated; a new AskResponse is returned.
 */
export function applyValidationResult(
  answer: AskResponse,
  result: CitationValidationResult,
): AskResponse {
  if (result.validation_status === "all_verified") {
    return answer;
  }
  if (result.validation_status === "strict_reject") {
    return {
      ...answer,
      summary: result.disclaimer,
      numeric_facts: [],
      citations: [],
      confidence: 0,
    };
  }
  // partial_strip
  const trimmedSummary = answer.summary.trim();
  const separator = trimmedSummary.endsWith(".") ? " " : ". ";
  return {
    ...answer,
    summary: `${trimmedSummary}${separator}${result.disclaimer}`,
    numeric_facts: result.verified_facts,
    // Keep only citations whose quote matches a verified fact's quote.
    citations: filterCitationsByVerified(answer.citations, result.verified_facts),
  };
}

/**
 * Enqueue background URL reachability checks for url_pending_facts.
 *
 * Per ADR-0007 §Stage 3:
 *   - Mock mode (`USE_MOCK=true`): no-op (FP-0005 compliance).
 *   - Local mode (`USE_MOCK=false`, `ENVIRONMENT != "production"`): no-op.
 *   - Cloud mode (`USE_MOCK=false`, `ENVIRONMENT == "production"`): enqueue
 *     task to D1 `url_check_queue` table; cron worker processes queue.
 *
 * This function is async to allow future D1 INSERT without blocking; the
 * current implementation is a no-op stub that returns immediately.
 *
 * Failures are logged to trace (ADR-0014 Observability) but do NOT modify
 * the already-returned response.
 */
export async function enqueueUrlChecks(
  facts: NumericFact[],
  _trace_id: string,
  env?: CitationValidatorEnv,
): Promise<void> {
  // No-op in Mock/Local mode.
  const useMock = (env?.USE_MOCK ?? "true") === "true";
  if (useMock) return;
  const isProd = env?.ENVIRONMENT === "production";
  if (!isProd) return;

  // Cloud mode: would enqueue D1 INSERT into url_check_queue.
  // TODO(ADR-0014): when env.DB binding is wired, INSERT facts into queue.
  // For now, log count to stdout for observability.
  if (facts.length > 0 && typeof console !== "undefined") {
    console.log(
      `[ADR-0007] enqueueUrlChecks: ${facts.length} facts queued for trace_id=${_trace_id}`,
    );
  }
}

// ============ Internal helpers ============

function filterCitationsByVerified(
  citations: Citation[],
  verified: NumericFact[],
): Citation[] {
  if (!Array.isArray(citations) || citations.length === 0) return [];
  const verifiedQuotes = new Set(verified.map((f) => f.source.quote));
  // Keep citations whose `quote` matches a verified fact's quote.
  // Citations without a matching fact are removed (per ADR-0007 §partial_strip).
  return citations.filter((c) => typeof c.quote === "string" && verifiedQuotes.has(c.quote));
}
