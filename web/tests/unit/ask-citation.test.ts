/**
 * TDD Spec — ADR-0007 Stage 2: Quote Substring Verification
 *
 * Validates the Stage 2 (quote substring) anti-hallucination pipeline in:
 *   web/src/lib/ask/citation.ts
 *
 * Source of truth: docs/architecture/adr-0007-citation-validator.md
 *
 * This test file covers:
 *   - validateCitations() multi-fact pipeline (Stage 1 + Stage 2)
 *   - applyValidationResult() final response shaping
 *   - enqueueUrlChecks() Mock/Local/Cloud mode gating
 *   - All three failure modes: all_verified / partial_strip / strict_reject
 *   - BDD 防幻觉 scenario (no facts in RAG -> strict_reject)
 *   - Whitespace normalization tolerance
 *   - Case-sensitivity (financial data is case-sensitive)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyValidationResult,
  enqueueUrlChecks,
  validateCitations,
} from "@/lib/ask/citation";
import type { AskResponse, NumericFact } from "@/lib/types";

// ============ Fixtures ============

const RAG_CONTEXT = `Apple Inc. (AAPL) reported annual revenue of $383.29B for fiscal year 2025.
Net income was $96.95B, with diluted EPS of $6.11. The company's gross margin
was 46.8%, and operating expenses totaled $30.7B. Cash and equivalents
stood at $29.94B as of September 27, 2025.`;

const VALID_FACT: NumericFact = {
  value: 383.29,
  unit: "B USD",
  source: {
    source: "sec_edgar",
    url: "https://sec.gov/Archives/edgar/data/320193/000032019325000119/aapl-20250928.htm",
    quote: "Apple Inc. (AAPL) reported annual revenue of $383.29B for fiscal year 2025.",
  },
  confidence: 0.95,
};

const VALID_FACT_2: NumericFact = {
  value: 96.95,
  unit: "B USD",
  source: {
    source: "sec_edgar",
    url: "https://sec.gov/Archives/edgar/data/320193/000032019325000119/aapl-20250928.htm",
    quote: "Net income was $96.95B, with diluted EPS of $6.11.",
  },
  confidence: 0.92,
};

const FABRICATED_FACT: NumericFact = {
  value: 412.5,
  unit: "B USD",
  source: {
    source: "sec_edgar",
    url: "https://sec.gov/Archives/edgar/data/320193/000032019325000119/aapl-20250928.htm",
    quote: "Apple's revenue reached $412.5B in fiscal year 2025.",  // NOT in RAG_CONTEXT
  },
  confidence: 0.91,
};

const STRUCTURALLY_INVALID_FACT = {
  value: 100,
  unit: "B USD",
  source: {
    source: "yahoo",  // valid label but URL missing
    url: "",
    quote: "some quote",
  },
  confidence: 0.5,
} as unknown as NumericFact;

const WRONG_SOURCE_LABEL_FACT = {
  value: 200,
  unit: "B USD",
  source: {
    source: "wikipedia",  // not in source allowlist
    url: "https://sec.gov/x",
    quote: "some quote",
  },
  confidence: 0.5,
} as unknown as NumericFact;

const NON_HTTPS_FACT = {
  value: 50,
  unit: "B USD",
  source: {
    source: "sec_edgar",
    url: "http://sec.gov/x",  // not https
    quote: "some quote",
  },
  confidence: 0.5,
} as unknown as NumericFact;

const NON_ALLOWLISTED_HOST_FACT = {
  value: 75,
  unit: "B USD",
  source: {
    source: "sec_edgar",
    url: "https://evil.example.com/x",  // not in SOURCE_ALLOWLIST
    quote: "some quote",
  },
  confidence: 0.5,
} as unknown as NumericFact;

function makeAnswer(facts: NumericFact[], summary = "AAPL FY2025 summary"): AskResponse {
  return {
    summary,
    numeric_facts: facts,
    citations: facts.map((f) => f.source),
    confidence: 0.9,
    intent: "deep_research",
  };
}

describe("ADR-0007 Stage 2: validateCitations — multi-fact pipeline", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ---------- Happy path: all_verified ----------

  it("returns all_verified when every fact passes Stage 1+2", () => {
    const answer = makeAnswer([VALID_FACT, VALID_FACT_2]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("all_verified");
    expect(result.verified_facts).toHaveLength(2);
    expect(result.stripped_facts).toHaveLength(0);
    expect(result.failures).toEqual([]);
    expect(result.disclaimer).toBe("");
    // url_pending_facts equals verified (Stage 3 deferred; not strict_reject).
    expect(result.url_pending_facts).toEqual(result.verified_facts);
  });

  // ---------- BDD 防幻觉: zero facts -> all_verified ----------

  it("returns all_verified when answer has zero numeric_facts (BDD 防幻觉)", () => {
    const answer: AskResponse = {
      summary: "I don't have current data for NVDA 2026 Q4 revenue.",
      numeric_facts: [],
      citations: [],
      confidence: 0.3,
      intent: "clarify",
    };
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("all_verified");
    expect(result.verified_facts).toEqual([]);
    expect(result.stripped_facts).toEqual([]);
    expect(result.disclaimer).toBe("");
  });

  // ---------- Stage 2 failure: quote not in RAG ----------

  it("returns strict_reject when ALL facts fail Stage 2 (fabricated numbers)", () => {
    const answer = makeAnswer([FABRICATED_FACT]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("strict_reject");
    expect(result.verified_facts).toEqual([]);
    expect(result.stripped_facts).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].stage).toBe("quote_substring");
    expect(result.failures[0].reason).toMatch(/quote not found in RAG context/);
    expect(result.disclaimer).toMatch(/I don't have reliable data/);
    expect(result.url_pending_facts).toEqual([]);
  });

  // ---------- Mixed: partial_strip ----------

  it("returns partial_strip when some facts pass and some fail Stage 2", () => {
    const answer = makeAnswer([VALID_FACT, FABRICATED_FACT]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("partial_strip");
    expect(result.verified_facts).toHaveLength(1);
    expect(result.verified_facts[0]).toBe(VALID_FACT);
    expect(result.stripped_facts).toHaveLength(1);
    expect(result.disclaimer).toMatch(/1 of 2 data points could not be verified/);
  });

  // ---------- Stage 1 structural failures ----------

  it("rejects facts with missing URL via Stage 1 structural", () => {
    const answer = makeAnswer([STRUCTURALLY_INVALID_FACT]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("strict_reject");
    expect(result.failures[0].stage).toBe("structural");
    expect(result.failures[0].reason).toMatch(/url is missing or empty/);
  });

  it("rejects facts with non-allowlisted source label via Stage 1", () => {
    const answer = makeAnswer([WRONG_SOURCE_LABEL_FACT]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("strict_reject");
    expect(result.failures[0].stage).toBe("structural");
    expect(result.failures[0].reason).toMatch(/not in allowlist/);
  });

  it("rejects non-https URLs via Stage 1", () => {
    const answer = makeAnswer([NON_HTTPS_FACT]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("strict_reject");
    expect(result.failures[0].reason).toMatch(/not https/);
  });

  it("rejects URLs whose hostname is not in SOURCE_ALLOWLIST via Stage 1", () => {
    const answer = makeAnswer([NON_ALLOWLISTED_HOST_FACT]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("strict_reject");
    expect(result.failures[0].reason).toMatch(/not allowlisted/);
  });

  // ---------- Whitespace normalization ----------

  it("matches quote after whitespace normalization (newlines -> spaces)", () => {
    // Quote with collapsed whitespace; ragContext has newlines.
    const fact: NumericFact = {
      value: 46.8,
      unit: "%",
      source: {
        source: "sec_edgar",
        url: "https://sec.gov/Archives/edgar/data/320193/000032019325000119/aapl-20250928.htm",
        quote: "gross margin was 46.8%, and operating expenses totaled $30.7B.",
      },
      confidence: 0.9,
    };
    const answer = makeAnswer([fact]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("all_verified");
  });

  // ---------- Case sensitivity ----------

  it("case-sensitive match: lowercase 'aapl' does NOT match uppercase 'AAPL'", () => {
    const fact: NumericFact = {
      value: 383.29,
      unit: "B USD",
      source: {
        source: "sec_edgar",
        url: "https://sec.gov/x",
        quote: "apple inc. (aapl) reported annual revenue of $383.29b for fiscal year 2025.",
      },
      confidence: 0.9,
    };
    const answer = makeAnswer([fact]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    expect(result.validation_status).toBe("strict_reject");
    expect(result.failures[0].stage).toBe("quote_substring");
  });
});

describe("ADR-0007: applyValidationResult — response shaping", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("all_verified: returns answer unchanged", () => {
    const answer = makeAnswer([VALID_FACT]);
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    const final = applyValidationResult(answer, result);
    expect(final).toBe(answer);  // identity — same reference
  });

  it("partial_strip: appends disclaimer, keeps only verified facts", () => {
    const answer = makeAnswer([VALID_FACT, FABRICATED_FACT], "AAPL FY2025 revenue data.");
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    const final = applyValidationResult(answer, result);
    expect(final.numeric_facts).toHaveLength(1);
    expect(final.numeric_facts[0]).toBe(VALID_FACT);
    expect(final.summary).toMatch(/AAPL FY2025 revenue data\./);
    expect(final.summary).toMatch(/Note: 1 of 2 data points could not be verified/);
    // Citations filtered to only those matching verified facts.
    expect(final.citations).toHaveLength(1);
  });

  it("strict_reject: replaces summary, clears facts/citations, sets confidence=0", () => {
    const answer = makeAnswer([FABRICATED_FACT], "Original summary.");
    const result = validateCitations(answer, RAG_CONTEXT, { USE_MOCK: "true" });
    const final = applyValidationResult(answer, result);
    expect(final.summary).toBe(result.disclaimer);
    expect(final.numeric_facts).toEqual([]);
    expect(final.citations).toEqual([]);
    expect(final.confidence).toBe(0);
  });
});

describe("ADR-0007: enqueueUrlChecks — Mock/Local/Cloud gating", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("Mock mode: no-op (FP-0005 compliance, no HTTP)", async () => {
    await enqueueUrlChecks([VALID_FACT], "trace-1", { USE_MOCK: "true" });
    expect(console.log).not.toHaveBeenCalled();
  });

  it("Local mode (USE_MOCK=false, ENVIRONMENT!=production): no-op", async () => {
    await enqueueUrlChecks([VALID_FACT], "trace-1", {
      USE_MOCK: "false",
      ENVIRONMENT: "development",
    });
    expect(console.log).not.toHaveBeenCalled();
  });

  it("Cloud mode (USE_MOCK=false, ENVIRONMENT=production): logs enqueue count", async () => {
    await enqueueUrlChecks([VALID_FACT, VALID_FACT_2], "trace-xyz", {
      USE_MOCK: "false",
      ENVIRONMENT: "production",
    });
    expect(console.log).toHaveBeenCalledTimes(1);
    const logged = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(logged).toMatch(/2 facts queued/);
    expect(logged).toMatch(/trace_id=trace-xyz/);
  });

  it("Cloud mode with zero facts: no log line", async () => {
    await enqueueUrlChecks([], "trace-0", {
      USE_MOCK: "false",
      ENVIRONMENT: "production",
    });
    expect(console.log).not.toHaveBeenCalled();
  });
});
