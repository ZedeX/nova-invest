/**
 * TDD Spec — ADR-0014 Integration: Ask RAG Pipeline end-to-end
 *
 * Cross-ADR integration: ADR-0014 (RAG pipeline) + ADR-0007 (Citation
 * Validator). The pipeline's `cite()` stage invokes the real validator
 * (not a stub), so these tests verify the two ADRs compose correctly.
 *
 * All tests run in Mock mode (USE_MOCK=true) — no real HTTP calls.
 * The citation validator's HTTP reachability check is skipped per
 * ADR-0007 §Stage 3 (FP-0005 compliance).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AskRAGPipeline, MockRAGSourceAdapter } from "@/lib/rag/pipeline";
import type { RAGQuery, RAGSource, SimpleRAGSourceAdapter } from "@/lib/rag/types";

// ---- Fixtures ----

function makeSource(overrides: Partial<RAGSource>): RAGSource {
  const id = overrides.id ?? "src_1";
  return {
    id,
    content: "Apple Inc. reported annual revenue of $383.29B for fiscal year 2025.",
    url: `https://sec.gov/filing/${id}.htm`,
    source: "sec_edgar",
    score: 0.9,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
});

// ============================================================
// 1. Full pipeline end-to-end
// ============================================================

describe("ADR-0014 integration: full pipeline (question → retrieve → rerank → cite)", () => {
  it("MockRAGSourceAdapter + real validator produces RAGResult with sources + citations", async () => {
    const pipeline = new AskRAGPipeline(
      new MockRAGSourceAdapter(),
      // Default validator = real ADR-0007 implementation.
    );
    const query: RAGQuery = { question: "AAPL earnings" };
    const result = await pipeline.run(query);

    // Mock adapter returns ≥ 5 sources (1 summary + 0..1 citation per file × 5 files).
    expect(result.sources.length).toBeGreaterThan(0);
    // Citations array is parallel to sources.
    expect(result.citations).toHaveLength(result.sources.length);

    // Every citation carries a `validated` flag (true or false — mock URLs
    // are relative paths so most will be `validated:false` per ADR-0007
    // structural check; that's expected and acceptable).
    for (const cit of result.citations) {
      expect(typeof cit.validated).toBe("boolean");
      expect(typeof cit.validated_at).toBe("string");
    }
  });
});

// ============================================================
// 2. Vectorize failure → graceful degradation
// ============================================================

describe("ADR-0014 integration: graceful degradation on adapter failure", () => {
  it("throwing adapter → pipeline returns empty sources, does not throw", async () => {
    const throwingAdapter: SimpleRAGSourceAdapter = {
      retrieve: vi.fn(async () => {
        throw new Error("Vectorize binding missing");
      }),
    };
    const pipeline = new AskRAGPipeline(throwingAdapter);
    const result = await pipeline.run({ question: "NVDA revenue" });
    expect(result.sources).toEqual([]);
    expect(result.citations).toEqual([]);
  });
});

// ============================================================
// 3. Citation validation failure → still included
// ============================================================

describe("ADR-0014 integration: citation validation failure is non-fatal", () => {
  it("sources with non-allowlisted URLs → citations have validated:false but are still included", async () => {
    // Use https URLs whose hostname is NOT in SOURCE_ALLOWLIST.
    // Real validator returns reason:"source_not_allowlisted".
    const sources = [
      makeSource({
        id: "wiki_1",
        url: "https://en.wikipedia.org/wiki/Apple_Inc.",
        source: "wikipedia",
      }),
      makeSource({
        id: "random_1",
        url: "https://example.com/article",
        source: "random",
      }),
    ];
    const adapter: SimpleRAGSourceAdapter = {
      retrieve: vi.fn(async () => sources),
    };
    const pipeline = new AskRAGPipeline(adapter);
    const result = await pipeline.run({ question: "Apple" });

    expect(result.sources).toHaveLength(2);
    expect(result.citations).toHaveLength(2);
    // Every citation is present but marked invalid.
    for (const cit of result.citations) {
      expect(cit.validated).toBe(false);
    }
  });
});

// ============================================================
// 4. Deduplication by URL
// ============================================================

describe("ADR-0014 integration: deduplication by URL", () => {
  it("multiple sources with same URL → only the highest-scored is kept", async () => {
    const dupUrl = "https://sec.gov/Archives/edgar/data/320193/dup.htm";
    const sources = [
      makeSource({ id: "low_score", url: dupUrl, score: 0.3 }),
      makeSource({ id: "high_score", url: dupUrl, score: 0.95 }),
      makeSource({ id: "mid_score", url: dupUrl, score: 0.6 }),
      // A source with a distinct URL — must survive dedup.
      makeSource({ id: "unique", url: "https://sec.gov/Archives/unique.htm", score: 0.5 }),
    ];
    const adapter: SimpleRAGSourceAdapter = {
      retrieve: vi.fn(async () => sources),
    };
    const pipeline = new AskRAGPipeline(adapter);
    const result = await pipeline.run({ question: "earnings" });

    // 3 dup-URL sources collapse to 1, plus 1 unique → 2 total.
    expect(result.sources).toHaveLength(2);
    // The surviving dup must be the highest-scored one.
    const ids = result.sources.map((s) => s.id);
    expect(ids).toContain("high_score");
    expect(ids).toContain("unique");
    expect(ids).not.toContain("low_score");
    expect(ids).not.toContain("mid_score");
  });
});

// ============================================================
// 5. Top-k limit enforced
// ============================================================

describe("ADR-0014 integration: top-k limit", () => {
  it("top_k=3 is enforced on a 10-source result set", async () => {
    const sources = Array.from({ length: 10 }, (_, i) =>
      makeSource({
        id: `src_${i}`,
        url: `https://sec.gov/filing/${i}.htm`,
        score: 1 - i * 0.05, // 1.0, 0.95, 0.90, ... 0.55
      }),
    );
    const adapter: SimpleRAGSourceAdapter = {
      retrieve: vi.fn(async () => sources),
    };
    const pipeline = new AskRAGPipeline(adapter);
    const result = await pipeline.run({ question: "earnings", top_k: 3 });
    expect(result.sources).toHaveLength(3);
    // Highest scores first.
    expect(result.sources[0].id).toBe("src_0");
    expect(result.sources[1].id).toBe("src_1");
    expect(result.sources[2].id).toBe("src_2");
  });

  it("default totalResults=10 is enforced when top_k is unset (ADR-0014 §DEFAULT_RAG_CONFIG)", async () => {
    const sources = Array.from({ length: 15 }, (_, i) =>
      makeSource({
        id: `src_${i}`,
        url: `https://sec.gov/filing/${i}.htm`,
        score: 1 - i * 0.05,
      }),
    );
    const adapter: SimpleRAGSourceAdapter = {
      retrieve: vi.fn(async () => sources),
    };
    const pipeline = new AskRAGPipeline(adapter);
    const result = await pipeline.run({ question: "earnings" });
    // ADR-0014 §DEFAULT_RAG_CONFIG: totalResults=10 (post-merge cap).
    expect(result.sources).toHaveLength(10);
  });
});
