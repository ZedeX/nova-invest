/**
 * TDD Spec — ADR-0007: Citation Validator
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0007-citation-validator.md
 *
 * The validator enforces two layers of anti-hallucination control:
 *   1. Structural URL validation (HTTPS + allowlisted source)
 *   2. HTTP reachability (mockable, skipped in Mock mode per FP-0005)
 *
 * The Citation domain object here is the validator's own shape — it is
 * distinct from (but related to) the LLM-output Citation in `types.ts`.
 * The validator's Citation carries validation metadata (`validated`,
 * `validated_at`) that the LLM-output Citation does not.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyValidationResult,
  enqueueUrlChecks,
  SOURCE_ALLOWLIST,
  validateCitation,
} from "@/lib/citation/validator";
import type { Citation } from "@/lib/citation/types";

// ---- Fixtures ----

const SEC_CITATION: Citation = {
  id: "cit_sec_1",
  url: "https://sec.gov/Archives/edgar/data/320193/000032019325000119/aapl-20250928.htm",
  source: "sec_edgar",
  title: "Apple Inc. 10-K FY2025",
  snippet: "Apple Inc. reported annual revenue of $383.29B for fiscal year 2025.",
};

beforeEach(() => {
  vi.resetModules();
});

describe("ADR-0007: validateCitation — structural validation", () => {
  it("returns valid:true for well-formed HTTPS URL with allowlisted source", async () => {
    const result = await validateCitation(SEC_CITATION, { USE_MOCK: "true" });
    expect(result.valid).toBe(true);
    expect(result.id).toBe(SEC_CITATION.id);
    expect(result.reason).toBeUndefined();
  });

  it("returns valid:false for malformed URL (missing protocol)", async () => {
    const bad: Citation = { ...SEC_CITATION, url: "sec.gov/Archives/edgar/data/xyz" };
    const result = await validateCitation(bad, { USE_MOCK: "true" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("malformed_url");
  });

  it("returns valid:false for HTTP (non-HTTPS) URL", async () => {
    const bad: Citation = { ...SEC_CITATION, url: "http://sec.gov/filing.htm" };
    const result = await validateCitation(bad, { USE_MOCK: "true" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("non_https");
  });

  it("returns valid:false for non-allowlisted source", async () => {
    const bad: Citation = {
      ...SEC_CITATION,
      source: "wikipedia",
      url: "https://en.wikipedia.org/wiki/Apple_Inc.",
    };
    const result = await validateCitation(bad, { USE_MOCK: "true" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("source_not_allowlisted");
  });
});

describe("ADR-0007: validateCitation — HTTP reachability (Mock mode skips)", () => {
  it("returns valid:false when fetch returns 404 (production Real mode)", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("Not Found", { status: 404, statusText: "Not Found" }),
        ),
      ),
    );

    // Per ADR-0007: HTTP reachability runs only in Cloud/Production mode.
    // Mock + Local mode skip the fetch entirely.
    const result = await validateCitation(SEC_CITATION, {
      USE_MOCK: "false",
      ENVIRONMENT: "production",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("unreachable");
  });

  it("skips HTTP reachability check in Mock mode (FP-0005)", async () => {
    // In Mock mode, fetch is stubbed to reject by tests/setup.ts.
    // validateCitation must NOT call fetch; it should return valid:true
    // based on structural checks alone.
    const result = await validateCitation(SEC_CITATION, { USE_MOCK: "true" });
    expect(result.valid).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("ADR-0007: applyValidationResult", () => {
  it("updates citation.validated=true and sets validated_at (ISO string)", async () => {
    const result = await validateCitation(SEC_CITATION, { USE_MOCK: "true" });
    const updated = applyValidationResult(SEC_CITATION, result);
    expect(updated.validated).toBe(true);
    expect(typeof updated.validated_at).toBe("string");
    // ISO 8601 format check
    expect(() => new Date(updated.validated_at as string).toISOString()).not.toThrow();
  });

  it("preserves original fields (id, url, source, title, snippet)", async () => {
    const result = await validateCitation(SEC_CITATION, { USE_MOCK: "true" });
    const updated = applyValidationResult(SEC_CITATION, result);
    expect(updated.id).toBe(SEC_CITATION.id);
    expect(updated.url).toBe(SEC_CITATION.url);
    expect(updated.source).toBe(SEC_CITATION.source);
    expect(updated.title).toBe(SEC_CITATION.title);
    expect(updated.snippet).toBe(SEC_CITATION.snippet);
  });
});

describe("ADR-0007: enqueueUrlChecks — batch validation", () => {
  it("processes batch and returns updated citations with validated flags set", async () => {
    const citations: Citation[] = [
      SEC_CITATION,
      {
        id: "cit_yahoo_1",
        url: "https://finance.yahoo.com/quote/AAPL",
        source: "yahoo",
        title: "AAPL Quote",
      },
      {
        id: "cit_bad_1",
        url: "not-a-url",
        source: "sec_edgar",
      },
    ];
    const updated = await enqueueUrlChecks(citations, { USE_MOCK: "true" });
    expect(updated).toHaveLength(3);
    expect(updated[0].validated).toBe(true);
    expect(updated[1].validated).toBe(true);
    expect(updated[2].validated).toBe(false);
  });
});

describe("ADR-0007: URL normalization", () => {
  it("strips utm_* tracking params from URL before validation", async () => {
    const tracked: Citation = {
      ...SEC_CITATION,
      url: "https://sec.gov/filing.htm?utm_source=newsletter&utm_medium=email&id=123",
    };
    const result = await validateCitation(tracked, { USE_MOCK: "true" });
    expect(result.valid).toBe(true);
    // final_url should have utm_* stripped but preserve id=123
    expect(result.final_url).toBe("https://sec.gov/filing.htm?id=123");
  });
});

describe("ADR-0007: SOURCE_ALLOWLIST", () => {
  it("includes the 5 canonical domains: sec.gov, finance.yahoo.com, alphavantage.co, bloomberg.com, reuters.com", () => {
    // SOURCE_ALLOWLIST is a Set<string> of hostnames
    expect(SOURCE_ALLOWLIST.has("sec.gov")).toBe(true);
    expect(SOURCE_ALLOWLIST.has("finance.yahoo.com")).toBe(true);
    expect(SOURCE_ALLOWLIST.has("alphavantage.co")).toBe(true);
    expect(SOURCE_ALLOWLIST.has("bloomberg.com")).toBe(true);
    expect(SOURCE_ALLOWLIST.has("reuters.com")).toBe(true);
  });

  it("does NOT include non-allowlisted domains (e.g., en.wikipedia.org)", () => {
    expect(SOURCE_ALLOWLIST.has("en.wikipedia.org")).toBe(false);
    expect(SOURCE_ALLOWLIST.has("example.com")).toBe(false);
  });
});
