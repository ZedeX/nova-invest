/**
 * TDD Spec — ADR-0014: Ask RAG Pipeline
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0014-ask-rag-pipeline.md
 *
 * The pipeline is the canonical retrieval-augmented generation entry
 * point for the Ask Agent. It composes a pluggable RAGSourceAdapter
 * (Vectorize in production, Mock in tests) with the ADR-0007 citation
 * validator, producing a RAGResult that downstream LLM synthesis can
 * consume.
 *
 * Pipeline contract (per task spec):
 *   retrieve(query)  -> RAGSource[]      (delegates to adapter)
 *   rerank(sources,q) -> RAGSource[]      (sort by score desc + threshold filter)
 *   cite(sources)    -> Citation[]        (convert + validate each source)
 *   run(query)       -> RAGResult         (retrieve → rerank → cite)
 *
 * Graceful degradation: if the adapter throws, retrieve() returns [].
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AskRAGPipeline, MockRAGSourceAdapter } from "@/lib/rag/pipeline";
import type { RAGQuery, RAGSource, RAGSourceAdapter } from "@/lib/rag/types";
import type { CitationValidator } from "@/lib/rag/pipeline";
import type { Citation, ValidationResult } from "@/lib/citation/types";

// ---- Fixtures ----

function makeSource(overrides: Partial<RAGSource> = {}): RAGSource {
  const id = overrides.id ?? "src_1";
  return {
    id,
    content: "Apple Inc. reported annual revenue of $383.29B for fiscal year 2025.",
    // Derive a unique URL per id so rerank dedup doesn't collapse fixtures.
    url: `https://sec.gov/filing/${id}.htm`,
    source: "sec_edgar",
    score: 0.92,
    ...overrides,
  };
}

/** Stub adapter returning a fixed list of sources, for pipeline tests. */
function makeStubAdapter(sources: RAGSource[]): RAGSourceAdapter {
  return {
    retrieve: vi.fn(async (_query: RAGQuery) => sources),
  };
}

/** Stub validator that always returns valid:true (for pipeline unit tests). */
function makePassValidator(): CitationValidator {
  return {
    validate: vi.fn(async (c: Citation): Promise<ValidationResult> => ({
      id: c.id,
      valid: true,
    })),
    apply: vi.fn((c: Citation, r: ValidationResult): Citation => ({
      ...c,
      validated: r.valid,
      validated_at: "2026-07-19T00:00:00.000Z",
    })),
  };
}

beforeEach(() => {
  vi.resetModules();
});

// ============================================================
// retrieve()
// ============================================================

describe("ADR-0014: AskRAGPipeline.retrieve", () => {
  it("returns RAGSource[] from the injected adapter", async () => {
    const sources = [makeSource(), makeSource({ id: "src_2" })];
    const pipeline = new AskRAGPipeline(
      makeStubAdapter(sources),
      makePassValidator(),
    );
    const query: RAGQuery = { question: "What is AAPL revenue?" };
    const result = await pipeline.retrieve(query);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("src_1");
  });

  it("graceful degradation: adapter throws → retrieve returns [] (does not throw)", async () => {
    const throwingAdapter: RAGSourceAdapter = {
      retrieve: vi.fn(async () => {
        throw new Error("Vectorize unavailable");
      }),
    };
    const pipeline = new AskRAGPipeline(throwingAdapter, makePassValidator());
    const result = await pipeline.retrieve({ question: "anything" });
    expect(result).toEqual([]);
  });
});

// ============================================================
// rerank()
// ============================================================

describe("ADR-0014: AskRAGPipeline.rerank", () => {
  it("sorts sources by score descending", async () => {
    const sources = [
      makeSource({ id: "low", score: 0.3 }),
      makeSource({ id: "high", score: 0.95 }),
      makeSource({ id: "mid", score: 0.6 }),
    ];
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), makePassValidator());
    const ranked = await pipeline.rerank(sources, { question: "earnings" });
    expect(ranked.map((s) => s.id)).toEqual(["high", "mid", "low"]);
  });

  it("filters out sources below the query threshold", async () => {
    const sources = [
      makeSource({ id: "high", score: 0.9 }),
      makeSource({ id: "low", score: 0.2 }),
    ];
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), makePassValidator());
    const ranked = await pipeline.rerank(sources, {
      question: "earnings",
      threshold: 0.5,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe("high");
  });

  it("boosts sources whose content matches query keywords", async () => {
    // Two sources with equal base score; only one mentions "NVDA".
    const sources = [
      makeSource({ id: "aapl", content: "Apple revenue", score: 0.8 }),
      makeSource({ id: "nvda", content: "NVDA Q4 earnings beat", score: 0.8 }),
    ];
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), makePassValidator());
    const ranked = await pipeline.rerank(sources, { question: "NVDA earnings" });
    // The NVDA-matching source must rank first despite equal base score.
    expect(ranked[0].id).toBe("nvda");
  });
});

// ============================================================
// cite()
// ============================================================

describe("ADR-0014: AskRAGPipeline.cite", () => {
  it("converts each source to a Citation and runs validation", async () => {
    const sources = [
      makeSource({ id: "src_1" }),
      makeSource({ id: "src_2", url: "https://finance.yahoo.com/quote/AAPL", source: "yahoo" }),
    ];
    const validator = makePassValidator();
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), validator);
    const citations = await pipeline.cite(sources);
    expect(citations).toHaveLength(2);
    expect(validator.validate).toHaveBeenCalledTimes(2);
    // Each citation carries the source's original URL.
    expect(citations[0].url).toBe(sources[0].url);
    expect(citations[1].url).toBe(sources[1].url);
    // validated flag is set by the validator's apply().
    expect(citations[0].validated).toBe(true);
  });

  it("citations include the original source URL and a validated flag", async () => {
    const sources = [makeSource({ id: "src_x" })];
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), makePassValidator());
    const [citation] = await pipeline.cite(sources);
    expect(citation.url).toBe(sources[0].url);
    expect(citation.source).toBe(sources[0].source);
    expect(typeof citation.validated).toBe("boolean");
  });
});

// ============================================================
// run()
// ============================================================

describe("ADR-0014: AskRAGPipeline.run", () => {
  it("returns RAGResult with sources + citations (full pipeline)", async () => {
    const sources = [
      makeSource({ id: "src_1", score: 0.9 }),
      makeSource({ id: "src_2", score: 0.7 }),
    ];
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), makePassValidator());
    const result = await pipeline.run({ question: "AAPL revenue" });
    expect(result.sources).toHaveLength(2);
    expect(result.citations).toHaveLength(2);
    expect(result.sources.map((s) => s.id)).toEqual(["src_1", "src_2"]);
  });

  it("applies top_k limit (default 5)", async () => {
    const sources = Array.from({ length: 10 }, (_, i) =>
      makeSource({ id: `src_${i}`, score: 1 - i * 0.05 }),
    );
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), makePassValidator());
    // No top_k specified → default 5.
    const result = await pipeline.run({ question: "earnings" });
    expect(result.sources).toHaveLength(5);
    expect(result.sources[0].id).toBe("src_0"); // highest score first
  });

  it("respects explicit top_k override", async () => {
    const sources = Array.from({ length: 10 }, (_, i) =>
      makeSource({ id: `src_${i}`, score: 1 - i * 0.05 }),
    );
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), makePassValidator());
    const result = await pipeline.run({ question: "earnings", top_k: 3 });
    expect(result.sources).toHaveLength(3);
  });
});

// ============================================================
// MockRAGSourceAdapter
// ============================================================

describe("ADR-0014: MockRAGSourceAdapter", () => {
  it("returns canned RAGSource[] from qa_samples/*.json", async () => {
    const adapter = new MockRAGSourceAdapter();
    const query: RAGQuery = { question: "AAPL price" };
    const sources = await adapter.retrieve(query);
    expect(sources.length).toBeGreaterThan(0);
    // Each source has the canonical RAGSource shape.
    for (const s of sources) {
      expect(typeof s.id).toBe("string");
      expect(typeof s.content).toBe("string");
      expect(typeof s.url).toBe("string");
      expect(typeof s.source).toBe("string");
      expect(typeof s.score).toBe("number");
    }
  });

  it("reads all 5 qa_sample files (aapl, nvda, tsla, clarify, portfolio)", async () => {
    const adapter = new MockRAGSourceAdapter();
    const sources = await adapter.retrieve({ question: "anything" });
    // All 5 mock files have at least one citation; expect ≥ 5 sources.
    expect(sources.length).toBeGreaterThanOrEqual(5);
    // The set of source filenames encoded in metadata covers all 5 samples.
    const filenames = new Set(
      sources.map((s) => (s.metadata as { filename?: string }).filename),
    );
    expect(filenames.has("aapl_price.json")).toBe(true);
    expect(filenames.has("nvda_earnings.json")).toBe(true);
    expect(filenames.has("tsla_news.json")).toBe(true);
    expect(filenames.has("clarify.json")).toBe(true);
    expect(filenames.has("portfolio_risk.json")).toBe(true);
  });
});
