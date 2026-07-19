/**
 * ADR-0007: Citation Validator — domain types.
 *
 * The validator's Citation domain object is distinct from (but related to)
 * the LLM-output Citation in `web/src/lib/types.ts`. The validator's
 * Citation carries validation metadata (`validated`, `validated_at`)
 * that the LLM-output Citation does not.
 *
 * Pipeline conversion (RAGSource → validator Citation) happens in
 * `web/src/lib/rag/pipeline.ts`.
 */

/**
 * A citation under validation. `validated` and `validated_at` are
 * populated by `applyValidationResult`; callers should treat them as
 * write-only until validation has run.
 */
export interface Citation {
  /** Stable unique id within one AskResponse. */
  id: string;
  /** Canonical URL (will be normalized: utm_* params stripped). */
  url: string;
  /**
   * Source label (e.g., "sec_edgar", "yahoo", "bloomberg", "reuters",
   * "alphavantage"). Used for tracing and display; the allowlist check
   * is enforced on the URL hostname, not on this label.
   */
  source: string;
  title?: string;
  snippet?: string;
  /** Populated by `applyValidationResult`. */
  validated?: boolean;
  /** ISO 8601 timestamp; populated by `applyValidationResult`. */
  validated_at?: string;
}

/**
 * Result of validating a single Citation.
 *
 * `final_url` carries the normalized URL (utm_* stripped, redirects
 * resolved in Real mode) so downstream consumers can persist the
 * canonical form.
 */
export interface ValidationResult {
  id: string;
  valid: boolean;
  reason?: "malformed_url" | "non_https" | "source_not_allowlisted" | "unreachable";
  final_url?: string;
}

/**
 * Environment shape consumed by the validator. Mirrors ADR-0007's
 * `{ USE_MOCK?, ENVIRONMENT? }` contract.
 */
export interface ValidatorEnv {
  USE_MOCK?: string;
  ENVIRONMENT?: string;
}
