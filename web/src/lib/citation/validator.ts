/**
 * ADR-0007: Citation Validator (Anti-Hallucination Enforcement)
 *
 * Two-layer validation:
 *   Layer 1 (structural): URL parses, HTTPS, hostname in SOURCE_ALLOWLIST.
 *   Layer 2 (reachability): HTTP HEAD/GET returns 2xx.
 *
 * Layer 2 is skipped in Mock mode (FP-0005: zero external HTTP) and in
 * non-production Local mode (avoid localhost dev latency). It runs only
 * when `env.USE_MOCK === "false"` AND `env.ENVIRONMENT === "production"`.
 *
 * URL normalization strips `utm_*` tracking params before any check.
 *
 * Pure-function contract: no module-level state, no side effects beyond
 * the (optional, deferred) HTTP reachability fetch.
 */

import type { Citation, ValidationResult, ValidatorEnv } from "./types";

/**
 * Hostnames whose content is trustworthy enough to cite. The allowlist
 * is the single source of truth — `source` label strings are NOT
 * checked; only the URL hostname is.
 *
 * Per task spec: SEC EDGAR, Yahoo Finance, Alpha Vantage, Bloomberg,
 * Reuters.
 */
export const SOURCE_ALLOWLIST: ReadonlySet<string> = new Set([
  "sec.gov",
  "finance.yahoo.com",
  "alphavantage.co",
  "bloomberg.com",
  "reuters.com",
]);

/**
 * Read env from the explicit param, falling back to process.env.
 * Workers inject env via the param; Next.js via process.env.
 */
function resolveEnv(env?: ValidatorEnv): ValidatorEnv {
  if (env) return env;
  if (typeof process !== "undefined" && process.env) {
    return { USE_MOCK: process.env.USE_MOCK, ENVIRONMENT: process.env.ENVIRONMENT };
  }
  return { USE_MOCK: "true", ENVIRONMENT: "development" };
}

function isMockMode(env: ValidatorEnv): boolean {
  return (env.USE_MOCK ?? "true") === "true";
}

function isProductionMode(env: ValidatorEnv): boolean {
  return !isMockMode(env) && env.ENVIRONMENT === "production";
}

/**
 * Strip `utm_*` tracking params (and only those) from a URL string.
 * Returns the normalized URL string. If the URL is unparseable, returns
 * the input unchanged (the structural check downstream will reject it).
 */
export function normalizeUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return input;
  }
  const utmKeys: string[] = [];
  parsed.searchParams.forEach((_value, key) => {
    if (key.startsWith("utm_")) utmKeys.push(key);
  });
  for (const k of utmKeys) parsed.searchParams.delete(k);
  return parsed.toString();
}

/**
 * Validate a single citation.
 *
 * Structural checks always run. HTTP reachability runs only in
 * production Real mode; in Mock / Local mode the structural pass is
 * sufficient and `fetch` is never called (FP-0005 compliance).
 */
export async function validateCitation(
  citation: Citation,
  env?: ValidatorEnv,
): Promise<ValidationResult> {
  const resolvedEnv = resolveEnv(env);
  const normalized = normalizeUrl(citation.url);

  // --- Layer 1: structural ---

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { id: citation.id, valid: false, reason: "malformed_url" };
  }

  if (parsed.protocol !== "https:") {
    return { id: citation.id, valid: false, reason: "non_https" };
  }

  if (!SOURCE_ALLOWLIST.has(parsed.hostname)) {
    return { id: citation.id, valid: false, reason: "source_not_allowlisted" };
  }

  // --- Layer 2: HTTP reachability (production Real mode only) ---

  if (isProductionMode(resolvedEnv)) {
    try {
      // SSRF defence (CWE-918): use `redirect: "manual"` so we can detect
      // 3xx responses and reject them WITHOUT following the Location
      // header. The previous `redirect: "follow"` allowed an allowlisted
      // host with an open redirect to pivot the fetch to internal
      // addresses (e.g., cloud metadata service at 169.254.169.254).
      //
      // `manual` produces an `opaqueredirect` response type for any 3xx;
      // we treat that as a validation failure. Only same-host 2xx
      // responses pass.
      const response = await fetch(normalized, { method: "GET", redirect: "manual" });
      if (response.type === "opaqueredirect") {
        return {
          id: citation.id,
          valid: false,
          reason: "redirect_blocked",
          final_url: normalized,
        };
      }
      if (!response.ok) {
        return { id: citation.id, valid: false, reason: "unreachable", final_url: normalized };
      }
      // No redirect followed → response.url === normalized.
      return { id: citation.id, valid: true, final_url: normalized };
    } catch {
      return { id: citation.id, valid: false, reason: "unreachable", final_url: normalized };
    }
  }

  // Mock / Local mode: structural pass is sufficient.
  return { id: citation.id, valid: true, final_url: normalized };
}

/**
 * Apply a ValidationResult to a Citation, returning a new Citation
 * object with `validated` and `validated_at` populated. The input
 * citation is not mutated.
 */
export function applyValidationResult(
  citation: Citation,
  result: ValidationResult,
): Citation {
  return {
    ...citation,
    url: result.final_url ?? citation.url,
    validated: result.valid,
    validated_at: new Date().toISOString(),
  };
}

/**
 * Batch-validate an array of citations. Returns a new array of
 * citations with `validated` / `validated_at` populated. The input
 * array is not mutated.
 *
 * In Mock / Local mode, no HTTP calls are made. In production Real
 * mode, reachability checks run concurrently.
 */
export async function enqueueUrlChecks(
  citations: Citation[],
  env?: ValidatorEnv,
): Promise<Citation[]> {
  const results = await Promise.all(
    citations.map((c) => validateCitation(c, env)),
  );
  return citations.map((c, i) => applyValidationResult(c, results[i]));
}
