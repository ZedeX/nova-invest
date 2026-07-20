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
 *
 * Phase-2 additions:
 *   RAGPipeline (multi-adapter, RRF fusion)
 *   reciprocalRankFusion
 *   KlineAdapter, FundamentalsAdapter, NewsAdapter, PlaybookAdapter
 *   createRAGPipeline factory
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AskRAGPipeline, MockRAGSourceAdapter, RAGPipeline, reciprocalRankFusion } from "@/lib/rag/pipeline";
import type { RAGQuery, RAGSource, SimpleRAGSourceAdapter, RAGDocument, RAGSourceAdapter, RAGRetrieveOptions } from "@/lib/rag/types";
import type { CitationValidator } from "@/lib/rag/pipeline";
import type { Citation, ValidationResult } from "@/lib/citation/types";
import { KlineAdapter } from "@/lib/rag/adapters/kline-adapter";
import { FundamentalsAdapter } from "@/lib/rag/adapters/fundamentals-adapter";
import { NewsAdapter } from "@/lib/rag/adapters/news-adapter";
import { PlaybookAdapter } from "@/lib/rag/adapters/playbook-adapter";
import { createRAGPipeline } from "@/lib/rag";

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
function makeStubAdapter(sources: RAGSource[]): SimpleRAGSourceAdapter {
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
    const throwingAdapter: SimpleRAGSourceAdapter = {
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

  it("applies top_k limit (default 10 per ADR-0014 §DEFAULT_RAG_CONFIG totalResults)", async () => {
    const sources = Array.from({ length: 15 }, (_, i) =>
      makeSource({ id: `src_${i}`, score: 1 - i * 0.05 }),
    );
    const pipeline = new AskRAGPipeline(makeStubAdapter(sources), makePassValidator());
    // No top_k specified -> default 10 (post-merge totalResults cap).
    // ADR-0014 §DEFAULT_RAG_CONFIG: totalResults=10 (vs per-adapter topK=5).
    const result = await pipeline.run({ question: "earnings" });
    expect(result.sources).toHaveLength(10);
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

// ============================================================
// Phase-2: RAGPipeline (Multi-Adapter, RRF)
// ============================================================

// ---- Phase-2 Fixtures ----

function makeDoc(overrides: Partial<RAGDocument> = {}): RAGDocument {
  const id = overrides.id ?? "doc_1";
  return {
    id,
    source: overrides.source ?? "test",
    content: overrides.content ?? `Test document content for ${id}`,
    score: overrides.score ?? 0.9,
    metadata: overrides.metadata ?? {},
    timestamp: overrides.timestamp,
  };
}

/** Stub multi-adapter returning a fixed list of documents */
function makeStubMultiAdapter(id: string, docs: RAGDocument[], weight: number = 1.0): RAGSourceAdapter {
  return {
    id,
    name: `Stub ${id}`,
    weight,
    retrieve: vi.fn(async (_query: string, _options?: RAGRetrieveOptions) => docs),
  };
}

// ============================================================
// RAGPipeline: empty adapters
// ============================================================

describe("RAGPipeline: empty adapters returns empty result", () => {
  it("returns empty documents with no adapters", async () => {
    const pipeline = new RAGPipeline([]);
    const result = await pipeline.retrieve("test query");
    expect(result.documents).toEqual([]);
    expect(result.totalRetrieved).toBe(0);
    expect(result.meta.sources_queried).toEqual([]);
    expect(result.meta.fusion_method).toBe("rrf");
  });
});

// ============================================================
// RAGPipeline: single adapter
// ============================================================

describe("RAGPipeline: single adapter returns its documents", () => {
  it("returns documents from a single adapter", async () => {
    const docs = [makeDoc({ id: "d1" }), makeDoc({ id: "d2" })];
    const adapter = makeStubMultiAdapter("src_a", docs);
    const pipeline = new RAGPipeline([adapter]);
    const result = await pipeline.retrieve("test query");
    expect(result.documents).toHaveLength(2);
    expect(result.totalRetrieved).toBe(2);
    expect(result.meta.sources_queried).toEqual(["src_a"]);
  });
});

// ============================================================
// RAGPipeline: multiple adapters merge via RRF
// ============================================================

describe("RAGPipeline: multiple adapters merge via RRF", () => {
  it("merges documents from multiple adapters", async () => {
    const adapterA = makeStubMultiAdapter("a", [
      makeDoc({ id: "d1", source: "a", content: "Doc A1", score: 0.9 }),
    ]);
    const adapterB = makeStubMultiAdapter("b", [
      makeDoc({ id: "d2", source: "b", content: "Doc B1", score: 0.8 }),
    ]);
    const pipeline = new RAGPipeline([adapterA, adapterB]);
    const result = await pipeline.retrieve("test query");
    expect(result.documents).toHaveLength(2);
    expect(result.totalRetrieved).toBe(2);
    expect(result.meta.sources_queried).toEqual(["a", "b"]);
  });

  it("graceful degradation: adapter failure returns empty, others continue", async () => {
    const goodAdapter = makeStubMultiAdapter("good", [
      makeDoc({ id: "d1", source: "good", content: "Good doc", score: 0.9 }),
    ]);
    const badAdapter: RAGSourceAdapter = {
      id: "bad",
      name: "Bad Adapter",
      weight: 1.0,
      retrieve: vi.fn(async () => { throw new Error("Vectorize down"); }),
    };
    const pipeline = new RAGPipeline([goodAdapter, badAdapter]);
    const result = await pipeline.retrieve("test query");
    expect(result.documents).toHaveLength(1);
    expect(result.meta.sources_queried).toEqual(["good", "bad"]);
  });
});

// ============================================================
// RAGPipeline: addAdapter / removeAdapter
// ============================================================

describe("RAGPipeline: addAdapter / removeAdapter", () => {
  it("addAdapter adds an adapter to the pipeline", async () => {
    const pipeline = new RAGPipeline([]);
    pipeline.addAdapter(makeStubMultiAdapter("a", [makeDoc({ id: "d1" })]));
    const result = await pipeline.retrieve("test");
    expect(result.documents).toHaveLength(1);
  });

  it("removeAdapter removes an adapter by ID", async () => {
    const adapter = makeStubMultiAdapter("a", [makeDoc({ id: "d1" })]);
    const pipeline = new RAGPipeline([adapter]);
    pipeline.removeAdapter("a");
    const result = await pipeline.retrieve("test");
    expect(result.documents).toHaveLength(0);
  });
});

// ============================================================
// RRF: simple 2-source merge with correct scoring
// ============================================================

describe("RRF: simple 2-source merge with correct scoring", () => {
  it("computes RRF scores correctly for a simple case", () => {
    const docA: RAGDocument = { id: "d1", source: "a", content: "Shared doc", score: 0.9, metadata: {} };
    const docB: RAGDocument = { id: "d2", source: "a", content: "Doc A only", score: 0.7, metadata: {} };
    const docC: RAGDocument = { id: "d3", source: "b", content: "Doc B only", score: 0.8, metadata: {} };

    const bySource = new Map<string, { documents: RAGDocument[]; weight: number }>();
    bySource.set("a", { documents: [docA, docB], weight: 1.0 });
    bySource.set("b", { documents: [docC], weight: 1.0 });

    const result = reciprocalRankFusion(bySource, 60);

    // With k=60, weight=1.0:
    // Source A: d1 rank 0 -> 1/(60+1) = 0.01639, d2 rank 1 -> 1/(60+2) = 0.01613
    // Source B: d3 rank 0 -> 1/(60+1) = 0.01639
    // d1 and d3 tie at 0.01639, d2 at 0.01613
    expect(result).toHaveLength(3);
    // d1 and d3 should have higher RRF scores than d2
    expect(result[0].score).toBeGreaterThan(result[2].score);
  });
});

// ============================================================
// RRF: deduplication (same document from 2 sources)
// ============================================================

describe("RRF: deduplication (same document from 2 sources)", () => {
  it("deduplicates documents with same content from different sources, accumulating RRF score", () => {
    // Same content appears in both sources
    const sharedContent = "Apple Inc. reported annual revenue of $383.29B";
    const docA: RAGDocument = { id: "d1", source: "a", content: sharedContent, score: 0.9, metadata: {} };
    const docB: RAGDocument = { id: "d2", source: "b", content: sharedContent, score: 0.8, metadata: {} };

    const bySource = new Map<string, { documents: RAGDocument[]; weight: number }>();
    bySource.set("a", { documents: [docA], weight: 1.0 });
    bySource.set("b", { documents: [docB], weight: 1.0 });

    const result = reciprocalRankFusion(bySource, 60);

    // Should be deduped to 1 document
    expect(result).toHaveLength(1);
    // RRF score should be accumulated: 1/(60+1) + 1/(60+1) = 2/61
    const expectedScore = 2 / 61;
    expect(result[0].score).toBeCloseTo(expectedScore, 6);
  });
});

// ============================================================
// RRF: weight affects final ranking
// ============================================================

describe("RRF: weight affects final ranking", () => {
  it("higher weight source ranks its documents higher", () => {
    const docA: RAGDocument = { id: "d1", source: "a", content: "Low weight doc", score: 0.9, metadata: {} };
    const docB: RAGDocument = { id: "d2", source: "b", content: "High weight doc", score: 0.9, metadata: {} };

    const bySource = new Map<string, { documents: RAGDocument[]; weight: number }>();
    bySource.set("a", { documents: [docA], weight: 0.5 });  // low weight
    bySource.set("b", { documents: [docB], weight: 2.0 });  // high weight

    const result = reciprocalRankFusion(bySource, 60);

    // Both have same original score, so same rank within source.
    // But source b has weight 2.0 vs source a weight 0.5
    // RRF(d2) = 2.0/(60+1) = 0.03279
    // RRF(d1) = 0.5/(60+1) = 0.00820
    // d2 should rank first
    expect(result[0].id).toBe("d2");
    expect(result[1].id).toBe("d1");
  });
});

// ============================================================
// RRF: k parameter affects ranking
// ============================================================

describe("RRF: k parameter affects ranking", () => {
  it("smaller k gives more weight to top ranks", () => {
    const doc1: RAGDocument = { id: "d1", source: "a", content: "Top doc", score: 1.0, metadata: {} };
    const doc2: RAGDocument = { id: "d2", source: "a", content: "Second doc", score: 0.5, metadata: {} };

    const bySource = new Map<string, { documents: RAGDocument[]; weight: number }>();
    bySource.set("a", { documents: [doc1, doc2], weight: 1.0 });

    const resultK1 = reciprocalRankFusion(bySource, 1);
    const resultK100 = reciprocalRankFusion(bySource, 100);

    // With k=1: d1 = 1/(1+1)=0.5, d2 = 1/(1+2)=0.333, ratio = 1.5
    // With k=100: d1 = 1/(100+1)=0.0099, d2 = 1/(100+2)=0.0098, ratio ≈ 1.01
    // Smaller k means bigger difference between ranks
    const ratioK1 = resultK1[0].score / resultK1[1].score;
    const ratioK100 = resultK100[0].score / resultK100[1].score;
    expect(ratioK1).toBeGreaterThan(ratioK100);
  });
});

// ============================================================
// KlineAdapter mock mode
// ============================================================

describe("KlineAdapter mock mode", () => {
  it("returns data for known symbols", async () => {
    const adapter = new KlineAdapter(true);
    const docs = await adapter.retrieve("What is AAPL price?");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].source).toBe("kline");
    expect(docs[0].content).toContain("AAPL");
    expect(docs[0].metadata.ticker).toBe("AAPL");
  });

  it("returns empty for unknown queries", async () => {
    const adapter = new KlineAdapter(true);
    const docs = await adapter.retrieve("What is the weather today?");
    expect(docs).toEqual([]);
  });
});

// ============================================================
// FundamentalsAdapter mock mode
// ============================================================

describe("FundamentalsAdapter mock mode", () => {
  it("returns fundamentals for known symbols", async () => {
    const adapter = new FundamentalsAdapter(true);
    const docs = await adapter.retrieve("MSFT fundamentals");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].source).toBe("fundamentals");
    expect(docs[0].content).toContain("MSFT");
    expect(docs[0].metadata.ticker).toBe("MSFT");
    expect(docs[0].metadata.pe_ratio).toBeDefined();
  });

  it("returns empty for unknown queries", async () => {
    const adapter = new FundamentalsAdapter(true);
    const docs = await adapter.retrieve("Unknown XYZ corp");
    expect(docs).toEqual([]);
  });
});

// ============================================================
// NewsAdapter mock mode
// ============================================================

describe("NewsAdapter mock mode", () => {
  it("returns news for known symbols", async () => {
    const adapter = new NewsAdapter(true);
    const docs = await adapter.retrieve("NVDA latest news");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].source).toBe("news");
    expect(docs[0].content).toContain("NVIDIA");
  });

  it("returns empty for unknown queries", async () => {
    const adapter = new NewsAdapter(true);
    const docs = await adapter.retrieve("XYZ corp news");
    expect(docs).toEqual([]);
  });
});

// ============================================================
// PlaybookAdapter mock mode
// ============================================================

describe("PlaybookAdapter mock mode", () => {
  it("returns playbooks matching tags", async () => {
    const adapter = new PlaybookAdapter(true);
    const docs = await adapter.retrieve("momentum breakout strategy");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].source).toBe("playbook");
    // Should match the momentum playbook
    const titles = docs.map((d) => d.metadata.title as string);
    expect(titles.some((t) => t.includes("Momentum"))).toBe(true);
  });

  it("returns playbooks matching earnings tag", async () => {
    const adapter = new PlaybookAdapter(true);
    const docs = await adapter.retrieve("earnings surprise");
    expect(docs.length).toBeGreaterThan(0);
    const titles = docs.map((d) => d.metadata.title as string);
    expect(titles.some((t) => t.includes("Earnings"))).toBe(true);
  });

  it("returns empty for queries with no matching playbooks", async () => {
    const adapter = new PlaybookAdapter(true);
    const docs = await adapter.retrieve("weather forecast alchemy");
    expect(docs).toEqual([]);
  });
});

// ============================================================
// createRAGPipeline factory
// ============================================================

describe("createRAGPipeline factory", () => {
  it("creates pipeline with correct adapters", () => {
    const pipeline = createRAGPipeline(true);
    // The pipeline should have 4 adapters
    const result = pipeline.retrieve("AAPL price");
    expect(result).toBeDefined();
  });

  it("pipeline with mock mode can retrieve AAPL data", async () => {
    const pipeline = createRAGPipeline(true);
    const result = await pipeline.retrieve("What is AAPL price and fundamentals?");
    // Should get data from kline and fundamentals adapters
    expect(result.documents.length).toBeGreaterThan(0);
    expect(result.totalRetrieved).toBeGreaterThan(0);
    expect(result.meta.fusion_method).toBe("rrf");
    const sources = new Set(result.documents.map((d) => d.source));
    // Should have at least kline and fundamentals
    expect(sources.has("kline")).toBe(true);
    expect(sources.has("fundamentals")).toBe(true);
  });
});
