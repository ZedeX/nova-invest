/**
 * ADR-0014: Ask RAG Pipeline (Embed → Retrieve → Rerank → Cite)
 *
 * Pipeline stages:
 *   1. retrieve(query)  — delegate to RAGSourceAdapter (Vectorize / Mock)
 *   2. rerank(sources,q) — threshold filter + query-keyword boost + score sort
 *   3. cite(sources)    — convert each source to Citation + validate (ADR-0007)
 *   4. run(query)       — full pipeline: retrieve → rerank → top_k slice → cite
 *
 * Graceful degradation: if the adapter throws, retrieve() returns []. The
 * pipeline never throws due to adapter failure — downstream LLM synthesis
 * sees an empty RAG context and produces an "I don't have data" response
 * (per ADR-0007 strict_reject fallback).
 *
 * The citation validator is injected (Dependency Inversion) so tests can
 * substitute a stub. The default validator is the real ADR-0007
 * implementation from `@/lib/citation/validator`.
 */

import {
  applyValidationResult,
  validateCitation,
} from "@/lib/citation/validator";
import type { Citation, ValidationResult, ValidatorEnv } from "@/lib/citation/types";
import type {
  RAGQuery,
  RAGResult,
  RAGSource,
  RAGSourceAdapter,
} from "./types";

/**
 * Citation validator contract injected into the pipeline. Mirrors the
 * ADR-0007 `validateCitation` + `applyValidationResult` pair.
 */
export interface CitationValidator {
  validate(citation: Citation, env?: ValidatorEnv): Promise<ValidationResult>;
  apply(citation: Citation, result: ValidationResult): Citation;
}

/** Default validator: delegates to the real ADR-0007 implementation. */
export const defaultCitationValidator: CitationValidator = {
  validate: validateCitation,
  apply: applyValidationResult,
};

/**
 * Post-merge total results: upper bound on the final citation list returned
 * to the caller. Per ADR-0014 §DEFAULT_RAG_CONFIG, `totalResults: 10` is the
 * merge cap (vs the per-adapter `topK: 5` which controls each adapter's
 * Vectorize query - Phase-2 multi-adapter concern, not used in Phase-1).
 */
const DEFAULT_TOTAL_RESULTS = 10;

/**
 * Query-keyword boost multiplier per token match. Tuned so that a
 * source matching 2 query tokens gets a +0.2 boost (enough to break
 * ties between equal-score sources without overwhelming the base
 * relevance score).
 */
const KEYWORD_BOOST_PER_MATCH = 0.1;

export class AskRAGPipeline {
  constructor(
    private readonly adapter: RAGSourceAdapter,
    private readonly citationValidator: CitationValidator = defaultCitationValidator,
    private readonly env?: ValidatorEnv,
  ) {}

  /**
   * Stage 1: Retrieve sources via the injected adapter.
   *
   * Adapter failures are caught and logged to console.error; an empty
   * array is returned. The pipeline never throws on adapter failure.
   */
  async retrieve(query: RAGQuery): Promise<RAGSource[]> {
    try {
      return await this.adapter.retrieve(query);
    } catch (err) {
      console.error("[AskRAGPipeline] adapter.retrieve failed:", err);
      return [];
    }
  }

  /**
   * Stage 2: Rerank sources by (boosted) score.
   *
   * Boost formula:  adjusted = score + KEYWORD_BOOST_PER_MATCH * match_count
   * where match_count = number of query tokens (case-insensitive) found
   * in source.content.
   *
   * Sources below `query.threshold` (if set) are filtered out — using the
   * BOOSTED score, not the raw score. Filtering on the raw score created
   * an asymmetry where a source with raw 0.05 + 3 keyword matches
   * (adjusted 0.35) would be filtered out even though its boosted score
   * exceeds a threshold of 0.3.
   *
   * Deduplication: sources sharing the same `url` are collapsed to the
   * one with the highest adjusted score (prevents the same document
   * from being cited multiple times).
   */
  async rerank(sources: RAGSource[], query: RAGQuery): Promise<RAGSource[]> {
    const threshold = query.threshold ?? 0;
    const queryTokens = tokenize(query.question);

    const scored = sources
      .map((s) => {
        const matchCount = countTokenMatches(s.content, queryTokens);
        const adjusted = s.score + KEYWORD_BOOST_PER_MATCH * matchCount;
        return { source: s, adjusted };
      })
      .filter((entry) => entry.adjusted >= threshold)
      .sort((a, b) => b.adjusted - a.adjusted);

    // Dedup by URL: keep the first (highest-adjusted) entry per URL.
    // Empty URLs are NOT deduped (each empty-URL source is distinct).
    const seen = new Set<string>();
    const deduped: { source: RAGSource; adjusted: number }[] = [];
    for (const entry of scored) {
      const key = entry.source.url;
      if (key === "") {
        deduped.push(entry);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }

    return deduped.map((entry) => entry.source);
  }

  /**
   * Stage 3: Convert sources to validated citations.
   *
   * Each RAGSource becomes a Citation (id, url, source, snippet=content).
   * The injected validator runs against each; results are applied so
   * `validated` and `validated_at` are populated.
   *
   * Invalid citations are still included (per ADR-0007: "无 citation 的
   * 回答" 禁止 — empty citations array is forbidden; invalid citations
   * are kept with `validated: false`).
   */
  async cite(sources: RAGSource[]): Promise<Citation[]> {
    const citations: Citation[] = sources.map((s) => ({
      id: s.id,
      url: s.url,
      source: s.source,
      snippet: s.content,
    }));
    const results = await Promise.all(
      citations.map((c) => this.citationValidator.validate(c, this.env)),
    );
    return citations.map((c, i) => this.citationValidator.apply(c, results[i]));
  }

  /**
   * Full pipeline: retrieve → rerank → top_k slice → cite.
   *
   * Returns RAGResult with parallel `sources` and `citations` arrays.
   */
  async run(query: RAGQuery): Promise<RAGResult> {
    const all = await this.retrieve(query);
    const ranked = await this.rerank(all, query);
    // query.top_k overrides the post-merge cap (caller wants fewer than the
    // default 10). When unset, use DEFAULT_TOTAL_RESULTS (=10) per ADR-0014
    // §DEFAULT_RAG_CONFIG. NOTE: this is the post-merge slice, NOT the
    // per-adapter top_k (DEFAULT_PER_ADAPTER_TOP_K=5) which is consumed by
    // the adapter's Vectorize query (Phase-2 multi-adapter concern).
    const topK = query.top_k ?? DEFAULT_TOTAL_RESULTS;
    const top = ranked.slice(0, topK);
    const citations = await this.cite(top);
    return { sources: top, citations };
  }
}

// ---- Helpers ----

/** Tokenize a query string into lowercase word tokens. */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,.?;:!?'"\-_/]+/)
    .filter((t) => t.length > 1);
}

/** Count how many of `tokens` appear (case-insensitive) in `content`. */
function countTokenMatches(content: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const lower = content.toLowerCase();
  let count = 0;
  for (const t of tokens) {
    if (lower.includes(t)) count++;
  }
  return count;
}

// ============================================================
// MockRAGSourceAdapter
// ============================================================

/**
 * Mock adapter that returns canned RAGSource[] from
 * `web/public/mock/qa_samples/*.json`.
 *
 * Conversion strategy (one AskResponse sample → 1+ RAGSource):
 *   - 1 summary-derived source per file (always emitted, even when the
 *     sample has no citations — guarantees clarify.json is represented)
 *   - + 1 source per citation in the sample
 *
 * This is dev/test-only: reads from the filesystem via Node's `fs`.
 * Production uses a Vectorize-backed adapter.
 */
export class MockRAGSourceAdapter implements RAGSourceAdapter {
  private readonly samplesDir: string;

  constructor(samplesDir?: string) {
    this.samplesDir =
      samplesDir ?? resolveSamplesDir();
  }

  async retrieve(query: RAGQuery): Promise<RAGSource[]> {
    const files = listSampleFiles(this.samplesDir);
    const sources: RAGSource[] = [];
    for (const file of files) {
      const sample = readSampleFile(file);
      if (!sample) continue;
      sources.push(...sampleToSources(sample));
    }
    // Mock adapter does no filtering by query — rerank handles relevance.
    void query;
    return sources;
  }
}

// ---- MockRAGSourceAdapter helpers ----

function resolveSamplesDir(): string {
  // Vitest sets cwd to web/; Next.js dev server also runs from web/.
  // In Cloudflare Workers, MockRAGSourceAdapter is never instantiated.
  const path = requireNodePath();
  const candidates = [
    path.resolve(process.cwd(), "public/mock/qa_samples"),
    path.resolve(process.cwd(), "web/public/mock/qa_samples"),
  ];
  const fs = requireNodeFs();
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function requireNodePath(): import("node:path").PlatformPath {
  // Lazy require so the module can be loaded in non-Node environments
  // (the adapter simply won't be used there).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:path");
}

function requireNodeFs(): typeof import("node:fs") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs");
}

function listSampleFiles(dir: string): string[] {
  const fs = requireNodeFs();
  const path = requireNodePath();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => path.resolve(dir, f));
}

interface QaSample {
  filename: string;
  query_pattern?: string;
  intent?: string;
  response?: {
    summary?: string;
    numeric_facts?: Array<{ value?: number; unit?: string; source?: string; quote?: string; confidence?: number }>;
    citations?: Array<{ source?: string; url?: string; quote?: string }>;
    confidence?: number;
  };
}

function readSampleFile(filePath: string): QaSample | null {
  const fs = requireNodeFs();
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as QaSample;
  } catch (err) {
    console.error(`[MockRAGSourceAdapter] failed to read ${filePath}:`, err);
    return null;
  }
}

function sampleToSources(sample: QaSample): RAGSource[] {
  const sources: RAGSource[] = [];
  const filename = sample.filename;
  const intent = sample.intent;
  const response = sample.response;

  if (!response) return sources;

  // 1 summary-derived source (always emitted — covers clarify.json).
  if (response.summary) {
    sources.push({
      id: `${filename}_summary`,
      content: response.summary,
      url: response.citations?.[0]?.url ?? "",
      source: response.citations?.[0]?.source ?? "mock",
      score: response.confidence ?? 0.5,
      metadata: { filename, intent, type: "summary" },
    });
  }

  // + 1 source per citation.
  const citations = response.citations ?? [];
  citations.forEach((cit, i) => {
    sources.push({
      id: `${filename}_cit_${i}`,
      content: cit.quote ?? response.summary ?? "",
      url: cit.url ?? "",
      source: cit.source ?? "mock",
      score: response.confidence ?? 0.5,
      metadata: { filename, intent, type: "citation" },
    });
  });

  return sources;
}
