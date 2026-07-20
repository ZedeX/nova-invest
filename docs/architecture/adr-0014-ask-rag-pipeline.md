# ADR-0014: Ask RAG Pipeline (Embed → Retrieve → Assemble)

## Status

Accepted

## Phase-1 Simplified Variants Accepted (2026-07-20)

- **Phase-1 Accepted Variant**: Single MockRAGSourceAdapter (filesystem-backed from `web/public/mock/qa_samples/`) in `web/src/lib/rag/pipeline.ts`. No multi-adapter RRF fusion. Keyword-boost rerank (not RRF). DEFAULT_TOTAL_RESULTS=10 (post-merge cap, per ADR §DEFAULT_RAG_CONFIG).
- **Rationale**: Phase-1 ships in USE_MOCK=true mode (ADR-0001). Vectorize index (NOVA_RAG_INDEX) requires Cloudflare binding not available in dev. RRF across multiple adapters requires multiple Vectorize queries - unnecessary cost when only 1 adapter exists.
- **Phase-1 Compliance**: ACCEPTED. Keyword-boost rerank is a valid Phase-1 substitute for RRF when adapter count = 1. DEFAULT_TOTAL_RESULTS=10 matches ADR §DEFAULT_RAG_CONFIG.
- **Migration Trigger**: When USE_MOCK=false goes live, wire Vectorize binding + implement EarningsAdapter, NewsAdapter, PlaybookAdapter, UserNoteAdapter + RRF fusion in one PR.

## Phase-2 Deferral Notes

- **Status**: Phase-1 implements single KlineMetadataAdapter; RRF fusion skipped (single source).
- **Current Implementation**: `web/src/lib/rag/pipeline.ts` (KlineMetadataAdapter only, RRF fusion bypassed)
- **Phase-2 Deferrals**:
  - EarningsAdapter (SEC EDGAR via Vectorize + D1 + R2)
  - NewsAdapter (RSS articles via Vectorize + D1 + R2)
  - PlaybookAdapter (Playbook sections via Vectorize + D1 + R2)
  - UserNoteAdapter (D1 conversation_history, keyword-only)
  - Reciprocal Rank Fusion (RRF) with source weights (k=60)
  - Vectorize index `NOVA_RAG_INDEX` binding + Workers AI embedding model

## Phase-2 Implementation Notes

- **Implemented in Phase 2 (2026-07-21)**: RAG adapters now implemented in `web/src/lib/rag/adapters/`: KlineAdapter (`kline-adapter.ts`), FundamentalsAdapter (`fundamentals-adapter.ts`), NewsAdapter (`news-adapter.ts`), PlaybookAdapter (`playbook-adapter.ts`). All implement the `RAGSourceAdapter` interface with `search(queryEmb, topK, env)` method.
- **Implemented in Phase 2 (2026-07-21)**: Reciprocal Rank Fusion (RRF) with source weights (k=60) now implemented in `web/src/lib/rag/pipeline.ts`. The `mergeAndRank()` method computes RRF scores per source, deduplicates by `(source_type, source_id)`, and returns ranked results capped by `totalResults`. This resolves the Phase-1 single-adapter limitation.

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + D1 + Vectorize + R2 |
| **Domain** | Core (Ask Agent / RAG Retrieval) |
| **Knowledge Risk** | MEDIUM — Cloudflare Vectorize API surface is small but query/filter semantics may differ from Pinecone/Weaviate patterns in training data |
| **References Consulted** | EP03 §2.4, EP03 §2.7, EP01 §ID-6, ADR-0001 §USE_MOCK, ADR-0004 §StepHandler.onExecute, ADR-0007 §validateCitations ragContext input, ADR-0011 §Master Schema, Cloudflare Vectorize docs, `docs/registry/architecture.yaml` |
| **Post-Cutoff APIs Used** | Cloudflare Vectorize query API (Workers AI binding `env.VECTORIZE_INDEX.query()`) — stable since 2024; Workers AI `@cf/baai/bge-small-en-v1.5` embedding model — stable since 2024 |
| **Verification Required** | `AskRAGPipeline.assemble()` returns structured context string that ADR-0007 `validateCitations()` can consume; Mock mode returns pre-computed results with zero external HTTP; 5 source adapters each implement `RAGSourceAdapter` interface; `mergeAndRank()` produces deterministic order for same inputs |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (USE_MOCK dual mode — MockRAG returns pre-computed results, no Vectorize/external HTTP when USE_MOCK=true), ADR-0004 (Agent Loop — AskHandler.onExecute invokes pipeline), ADR-0007 (Citation Validator — assemble() output feeds validateCitations), ADR-0011 (D1 Schema Master — metadata tables for retrieval filtering) — all Accepted except ADR-0004 (Proposed) |
| **Enables** | EP03 Ask Agent RAG retrieval (TR-EP03-008), EP03 §2.4 AskRAGPipeline class, EP03 §2.7 RAGRetrieve loop state, ADR-0007 citation validation (requires RAG context string) |
| **Blocks** | EP03 Ask Agent implementation stories involving RAG context assembly; ADR-0007 integration (validator needs RAG context) |
| **Ordering Note** | Must be Accepted before EP03 RAG-related stories begin. ADR-0007 is already Accepted but its production usage requires this pipeline to supply the `ragContext` string. Circular dependency is broken by ADR-0007 being unit-testable standalone (it takes a `string` — this pipeline produces that string). |

## Context

### Problem Statement

EP03 §2.4 specifies an `AskRAGPipeline` class with three methods: `embed(query)`, `retrieve(queryEmb, topK=5)`, `assemble(results)`. This pipeline is the core retrieval-augmented generation capability for the Ask Agent. Without it:

1. **Ask Agent has no context**: LLM receives only the user query, producing generic or hallucinated answers — violating EP03 §2.3 forced citation mode and EP01 §ID-6 hallucination rate ≤ 5% target.
2. **No multi-source retrieval**: EP03 §2.4 mandates 5 retrieval sources (K-lines metadata, SEC EDGAR earnings, News RSS, Playbooks, User notes). Without a unified pipeline, each source would be queried independently with no cross-source ranking.
3. **ADR-0007 has no input**: The Citation Validator requires a RAG context string to verify quote substrings. Without this pipeline, there is no RAG context to validate against.
4. **ADR-0004 AskHandler.onExecute has no implementation**: The Agent Loop's Execute state for Ask must perform RAG retrieval before LLM call. This pipeline IS that retrieval.

### Constraints

- **Cloudflare Workers stateless**: No module-level caches (per FP-0001/FP-0002). Pipeline must be request-scoped.
- **Vectorize is the embedding index**: Cloudflare Vectorize stores pre-computed embeddings and supports `query()` for semantic search. It does NOT compute embeddings at query time — embeddings must be inserted via `insert()` during indexing. Query-time embedding computation uses Workers AI `@cf/baai/bge-small-en-v1.5`.
- **D1 stores metadata**: Vectorize stores only vector + ID. All retrievable metadata (ticker, date, source_type, title, snippet) lives in D1. Retrieval is a two-step: Vectorize returns IDs → D1 fetches metadata for those IDs.
- **R2 stores large documents**: SEC filings, news articles, and playbook YAML bodies are too large for D1. R2 stores the full text; D1 stores metadata + R2 key pointer.
- **ADR-0001 USE_MOCK compliance**: When `USE_MOCK=true`, pipeline must return pre-computed RAG results from `web/public/mock/qa_samples/` with zero external HTTP calls (no Vectorize, no Workers AI, no D1, no R2).
- **Latency budget**: RAG retrieval must complete in < 2s (EP03 §6.2 anti-pattern: "Synchronously waiting for LLM completion before returning: >5s must stream" — RAG is part of the pre-LLM phase and must not consume more than 40% of the 5s budget).
- **Embedding model**: `@cf/baai/bge-small-en-v1.5` produces 384-dim vectors. All Vectorize indexes must use this model for consistency. Alternative models (e.g., Volcano Ark) deferred to Phase 2.

### Requirements

- `AskRAGPipeline` class with 3 public methods: `embed(query)`, `retrieve(queryEmb, topK)`, `assemble(results)`.
- 5 source adapters: `KlineMetadataAdapter`, `EarningsAdapter`, `NewsAdapter`, `PlaybookAdapter`, `UserNoteAdapter`.
- Each adapter implements `RAGSourceAdapter` interface with `search(queryEmb, topK): Promise<RAGResult[]>`.
- `mergeAndRank()` combines results from all adapters using reciprocal rank fusion (RRF) with configurable source weights.
- `assemble()` produces the RAG context string consumed by ADR-0007 `validateCitations(answer, ragContext, env)`.
- Mock mode: `embed()` returns fixed 384-dim zero vector; `retrieve()` returns pre-computed RAG results from `web/public/mock/qa_samples/`.
- Pipeline is invoked from `AskHandler.onExecute()` (ADR-0004).
- Source markers in assembled context enable ADR-0007 citation validation (each chunk prefixed with `[source_type:id]`).

## Decision

**Adopt a 3-stage pipeline (embed → retrieve → assemble) with 5 source adapters, reciprocal rank fusion, and source-marked context assembly. Pipeline is request-scoped and USE_MOCK-compliant.**

### Architecture Diagram

```
                     ┌──────────────────────────────────────────────────┐
                     │  AskHandler.onExecute(ctx, plan)                 │
                     │  (ADR-0004 StepHandler, Ask-specific)            │
                     └────────────────────┬─────────────────────────────┘
                                          │
                                          ▼
               ┌──────────────────────────────────────────────────────────┐
               │  AskRAGPipeline (request-scoped)                        │
               │                                                          │
               │  Stage 1: embed(query)                                  │
               │    Mock mode: return fixed 384-dim zero vector          │
               │    Real mode: Workers AI @cf/baai/bge-small-en-v1.5    │
               │    -> queryEmb: float32[384]                            │
               │                                                          │
               │  Stage 2: retrieve(queryEmb, topK=5)                    │
               │    For each RAGSourceAdapter:                           │
               │      adapter.search(queryEmb, topK) -> RAGResult[]      │
               │    mergeAndRank(allResults) -> ranked RAGResult[]       │
               │      - RRF with source weights                          │
               │      - dedup by (source_type, source_id)               │
               │                                                          │
               │  Stage 3: assemble(rankedResults)                       │
               │    Concatenate chunks with source markers               │
               │    -> ragContext: string (feeds ADR-0007)               │
               └────────────────────┬─────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
          ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐
          │  Mock Mode   │  │  Real Mode   │  │  assemble() output     │
          │              │  │              │  │                         │
          │  embed:      │  │  embed:      │  │  [kline:AAPL_1d]       │
          │   zero vec   │  │   Workers AI │  │  AAPL close $213.07... │
          │              │  │              │  │  [sec_edgar:10-K_2025] │
          │  retrieve:   │  │  retrieve:   │  │  NVDA revenue $22.10B. │
          │   qa_samples │  │   Vectorize  │  │  [news:reuters_38291]  │
          │   JSON       │  │   + D1 meta  │  │  NVIDIA Q4 beat...     │
          │              │  │   + R2 docs  │  │  ...                   │
          │  0 HTTP      │  │              │  │                         │
          └─────────────┘  └─────────────┘  └────────────┬────────────┘
                                                           │
                                                           ▼
                                        ┌──────────────────────────────────┐
                                        │  validateCitations(answer,        │
                                        │    ragContext, env)               │
                                        │  (ADR-0007 Citation Validator)   │
                                        └──────────────────────────────────┘
```

### Source Adapter Architecture

```
                    ┌─────────────────────────────────────┐
                    │  RAGSourceAdapter interface          │
                    │                                     │
                    │  sourceType: RAGSourceType           │
                    │  search(queryEmb, topK):             │
                    │    Promise<RAGResult[]>              │
                    │  weight: number (for RRF)            │
                    └─────────────┬───────────────────────┘
                                  │ implemented by
                                  │
        ┌────────────┬────────────┼────────────┬────────────┐
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Kline    │ │Earnings  │ │ News     │ │ Playbook │ │ UserNote │
  │ Metadata │ │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │
  │          │ │          │ │          │ │          │ │          │
  │ Source:  │ │ Source:  │ │ Source:  │ │ Source:  │ │ Source:  │
  │ D1       │ │ Vectorize│ │ Vectorize│ │ Vectorize│ │ D1       │
  │ symbols+ │ │ +D1 meta │ │ +D1 meta │ │ +D1 meta │ │ conv_    │
  │ fundmntls│ │ +R2 SEC  │ │ +R2 RSS  │ │ +R2 YAML │ │ history  │
  │          │ │ filings  │ │ articles │ │ bodies   │ │          │
  │ weight:  │ │ weight:  │ │ weight:  │ │ weight:  │ │ weight:  │
  │ 0.15     │ │ 0.30     │ │ 0.20     │ │ 0.20     │ │ 0.15     │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### Key Interfaces

```typescript
// web/src/lib/ask/rag-pipeline.ts (canonical)

import type { QueryIntent } from "../types";

// ---- Types ----

export type RAGSourceType =
  | "kline"        // EP02 K-line metadata (D1 symbols + fundamentals)
  | "sec_edgar"    // SEC EDGAR earnings filings (Vectorize + D1 + R2)
  | "news"         // News RSS articles (Vectorize + D1 + R2)
  | "playbook"     // EP08 Playbooks (Vectorize + D1 + R2)
  | "user_note";   // User conversation notes (D1 conversation_history)

export interface RAGResult {
  source_type: RAGSourceType;
  source_id: string;           // unique ID within source (e.g., "AAPL_1d", "10-K_2025", "reuters_38291")
  title: string;
  snippet: string;             // text chunk (≤ 512 chars) for LLM context
  relevance_score: number;     // raw similarity score from Vectorize or D1 match
  rrf_score: number;           // reciprocal rank fusion score (computed by mergeAndRank)
  metadata: {
    ticker?: string;           // applicable ticker symbol
    date?: string;             // ISO date of the source document
    r2_key?: string;           // R2 object key for full document (if stored in R2)
    url?: string;              // canonical URL for citation (e.g., SEC filing URL)
  };
}

export interface RAGPipelineConfig {
  topK: number;                         // results per adapter (default: 5)
  totalResults: number;                 // max results after merge (default: 10)
  sourceWeights: Record<RAGSourceType, number>;  // RRF weights
  embeddingModel: string;               // Workers AI model ID
  vectorizeIndex: string;               // Vectorize index name
}

export interface RAGPipelineResult {
  queryEmbedding: Float32Array;          // 384-dim embedding
  results: RAGResult[];                  // ranked results
  context: string;                       // assembled RAG context string
  sourceCounts: Record<RAGSourceType, number>;  // results per source
  duration_ms: number;                   // total pipeline latency
}

// ---- RAGSourceAdapter interface ----

export interface RAGSourceAdapter {
  readonly sourceType: RAGSourceType;
  readonly weight: number;
  search(queryEmb: Float32Array, topK: number, env: RAGEnv): Promise<RAGResult[]>;
}

export interface RAGEnv {
  USE_MOCK?: string;
  ENVIRONMENT?: string;
  DB?: D1Database;                      // Cloudflare D1 binding
  VECTORIZE_INDEX?: VectorizeIndex;     // Cloudflare Vectorize binding
  R2_BUCKET?: R2Bucket;                 // Cloudflare R2 binding
  AI?: Ai;                              // Cloudflare Workers AI binding
}

// ---- AskRAGPipeline class ----

export class AskRAGPipeline {
  private adapters: RAGSourceAdapter[];
  private config: RAGPipelineConfig;

  constructor(config?: Partial<RAGPipelineConfig>) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
    this.adapters = [
      new KlineMetadataAdapter(this.config.sourceWeights.kline),
      new EarningsAdapter(this.config.sourceWeights.sec_edgar),
      new NewsAdapter(this.config.sourceWeights.news),
      new PlaybookAdapter(this.config.sourceWeights.playbook),
      new UserNoteAdapter(this.config.sourceWeights.user_note),
    ];
  }

  /**
   * Stage 1: Embed the user query into a 384-dim vector.
   *
   * Mock mode: returns fixed zero vector (no Workers AI call).
   * Real mode: calls Workers AI @cf/baai/bge-small-en-v1.5.
   */
  async embed(query: string, env: RAGEnv): Promise<Float32Array> {
    if (isMockMode(env)) {
      return new Float32Array(384); // zero vector
    }
    const response = await env.AI!.run("@cf/baai/bge-small-en-v1.5", {
      text: [query],
    });
    return new Float32Array(response.data[0]);
  }

  /**
   * Stage 2: Retrieve relevant results from all source adapters.
   *
   * Mock mode: returns pre-computed results from web/public/mock/qa_samples/.
   * Real mode: queries all adapters in parallel, then mergeAndRank().
   */
  async retrieve(
    queryEmb: Float32Array,
    topK: number,
    env: RAGEnv,
    intent?: QueryIntent,
  ): Promise<RAGResult[]> {
    if (isMockMode(env)) {
      return loadMockRAGResults(intent);
    }

    // Query all adapters in parallel
    const allResults = await Promise.all(
      this.adapters.map(adapter =>
        adapter.search(queryEmb, topK, env).catch(err => {
          // Adapter failure is non-fatal: log and return empty
          console.error(`RAG adapter ${adapter.sourceType} failed:`, err);
          return [] as RAGResult[];
        })
      ),
    );

    return this.mergeAndRank(allResults.flat(), this.config.totalResults);
  }

  /**
   * Stage 3: Assemble ranked results into a structured context string.
   *
   * Format: each chunk prefixed with [source_type:source_id] marker.
   * This marker is used by ADR-0007 validateCitations() to verify
   * that citation quotes appear in the RAG context.
   *
   * Example output:
   *   [kline:AAPL_1d] AAPL closed at $213.07 on 2026-07-18. Volume: 62.3M. ...
   *   [sec_edgar:10-K_2025] NVIDIA Corporation reported annual revenue of $22.10B ...
   *   [news:reuters_38291] NVIDIA Q4 earnings beat expectations ...
   */
  assemble(results: RAGResult[]): string {
    return results
      .map(r => `[${r.source_type}:${r.source_id}] ${r.snippet}`)
      .join("\n\n");
  }

  /**
   * Convenience: run full pipeline (embed → retrieve → assemble).
   */
  async run(query: string, env: RAGEnv, intent?: QueryIntent): Promise<RAGPipelineResult> {
    const start = Date.now();

    const queryEmb = await this.embed(query, env);
    const results = await this.retrieve(queryEmb, this.config.topK, env, intent);
    const context = this.assemble(results);

    const sourceCounts = results.reduce(
      (acc, r) => {
        acc[r.source_type] = (acc[r.source_type] || 0) + 1;
        return acc;
      },
      {} as Record<RAGSourceType, number>,
    );

    return {
      queryEmbedding: queryEmb,
      results,
      context,
      sourceCounts,
      duration_ms: Date.now() - start,
    };
  }

  /**
   * Reciprocal Rank Fusion (RRF) with source weights.
   *
   * RRF score for each result = weight / (k + rank_in_source)
   * where k = 60 (standard RRF constant).
   * Results are deduped by (source_type, source_id),
   * then sorted by descending RRF score.
   */
  private mergeAndRank(
    results: RAGResult[],
    totalLimit: number,
  ): RAGResult[] {
    const K = 60; // RRF constant

    // Group by source type for per-source ranking
    const bySource = new Map<RAGSourceType, RAGResult[]>();
    for (const r of results) {
      const list = bySource.get(r.source_type) ?? [];
      list.push(r);
      bySource.set(r.source_type, list);
    }

    // Compute RRF scores: rank within each source, then apply weight
    const scored: RAGResult[] = [];
    for (const [sourceType, list] of bySource) {
      // Sort by descending relevance_score within source
      list.sort((a, b) => b.relevance_score - a.relevance_score);

      const adapter = this.adapters.find(a => a.sourceType === sourceType);
      const weight = adapter?.weight ?? 1;

      for (let i = 0; i < list.length; i++) {
        list[i].rrf_score = weight / (K + i + 1);
        scored.push(list[i]);
      }
    }

    // Dedup by (source_type, source_id), keeping higher RRF score
    const deduped = new Map<string, RAGResult>();
    for (const r of scored) {
      const key = `${r.source_type}:${r.source_id}`;
      const existing = deduped.get(key);
      if (!existing || r.rrf_score > existing.rrf_score) {
        deduped.set(key, r);
      }
    }

    // Sort by descending RRF score, take top totalLimit
    return Array.from(deduped.values())
      .sort((a, b) => b.rrf_score - a.rrf_score)
      .slice(0, totalLimit);
  }
}

// ---- Default config ----

export const DEFAULT_RAG_CONFIG: RAGPipelineConfig = {
  topK: 5,
  totalResults: 10,
  sourceWeights: {
    kline: 0.15,
    sec_edgar: 0.30,
    news: 0.20,
    playbook: 0.20,
    user_note: 0.15,
  },
  embeddingModel: "@cf/baai/bge-small-en-v1.5",
  vectorizeIndex: "NOVA_RAG_INDEX",
};

// ---- Helper ----

function isMockMode(env: RAGEnv): boolean {
  return (env.USE_MOCK ?? "true") === "true";
}

/**
 * Load pre-computed RAG results from mock QA samples.
 * Returns results matching the query intent (or default AAPL sample).
 */
async function loadMockRAGResults(intent?: QueryIntent): Promise<RAGResult[]> {
  // Mock results are bundled at build time in web/public/mock/qa_samples/
  // For USE_MOCK=true: no HTTP, no Vectorize, no D1, no R2 calls.
  // Implementation reads from static JSON files served locally.
  const ticker = intent?.ticker ?? "AAPL";
  // ... loads from /mock/qa_samples/{ticker}_rag.json
  // Returns pre-built RAGResult[] with source markers
  throw new Error("Not implemented — story-level implementation");
}
```

### Source Adapter Implementations

#### KlineMetadataAdapter (EP02 data)

```typescript
// web/src/lib/ask/adapters/kline-metadata.ts

export class KlineMetadataAdapter implements RAGSourceAdapter {
  readonly sourceType: RAGSourceType = "kline";
  readonly weight: number;

  constructor(weight: number = 0.15) { this.weight = weight; }

  async search(queryEmb: Float32Array, topK: number, env: RAGEnv): Promise<RAGResult[]> {
    // K-line metadata is NOT in Vectorize (no embeddings for price data).
    // Instead, query D1 symbols + fundamentals tables with ticker matching.
    // This adapter is keyword-based, not semantic.
    const ticker = /* extract from queryEmb metadata or context */ null;
    if (!ticker) return [];

    const rows = await env.DB!.prepare(`
      SELECT s.ticker, s.name, s.exchange, s.sector, f.field, f.value, f.period
      FROM symbols s
      LEFT JOIN fundamentals f ON s.ticker = f.ticker
      WHERE s.ticker = ?
      LIMIT ?
    `).bind(ticker, topK).all();

    return rows.results.map(row => ({
      source_type: "kline" as RAGSourceType,
      source_id: `${row.ticker}_fundamentals`,
      title: `${row.name} (${row.ticker}) Fundamentals`,
      snippet: `${row.ticker} ${row.name} - Exchange: ${row.exchange}, Sector: ${row.sector}, ${row.field}: ${row.value} (${row.period})`,
      relevance_score: 1.0, // exact ticker match = highest relevance
      rrf_score: 0,
      metadata: { ticker: row.ticker, date: row.period },
    }));
  }
}
```

#### EarningsAdapter (SEC EDGAR)

```typescript
// web/src/lib/ask/adapters/earnings.ts

export class EarningsAdapter implements RAGSourceAdapter {
  readonly sourceType: RAGSourceType = "sec_edgar";
  readonly weight: number;

  constructor(weight: number = 0.30) { this.weight = weight; }

  async search(queryEmb: Float32Array, topK: number, env: RAGEnv): Promise<RAGResult[]> {
    // 1. Query Vectorize for semantically similar SEC filing chunks
    const vectorResults = await env.VECTORIZE_INDEX!.query(queryEmb, {
      topK,
      filter: { source_type: "sec_edgar" },  // metadata filter
      returnMetadata: "all",
    });

    // 2. Fetch full metadata from D1 by Vectorize-returned IDs
    // 3. For snippets needing full text, fetch from R2 via r2_key
    // ... (story-level implementation)
    return [];
  }
}
```

#### NewsAdapter, PlaybookAdapter (same Vectorize + D1 + R2 pattern)

```typescript
// Same pattern as EarningsAdapter, differing only in:
// - source_type filter ("news" | "playbook")
// - D1 metadata table (news_articles | playbook_versions)
// - R2 key format (news/<id>.json | playbooks/<id>/<version>.yaml)
```

#### UserNoteAdapter (D1-only, no Vectorize)

```typescript
// web/src/lib/ask/adapters/user-note.ts

export class UserNoteAdapter implements RAGSourceAdapter {
  readonly sourceType: RAGSourceType = "user_note";
  readonly weight: number;

  constructor(weight: number = 0.15) { this.weight = weight; }

  async search(queryEmb: Float32Array, topK: number, env: RAGEnv): Promise<RAGResult[]> {
    // User notes are NOT in Vectorize (privacy: user data not in shared index).
    // Query D1 conversation_history for the user's recent sessions.
    // Simple keyword matching on content column.
    // ... (story-level implementation)
    return [];
  }
}
```

### Mock Mode Contract

Per ADR-0001, `USE_MOCK=true` means zero external HTTP calls. The RAG pipeline mock behavior:

| Stage | Mock Behavior | External Calls |
|-------|--------------|----------------|
| `embed()` | Returns `new Float32Array(384)` (zero vector) | Zero |
| `retrieve()` | Returns pre-computed `RAGResult[]` from `web/public/mock/qa_samples/{ticker}_rag.json` | Zero (local static file) |
| `assemble()` | Same as real mode (pure function, no I/O) | Zero |

Mock RAG sample file format (`web/public/mock/qa_samples/AAPL_rag.json`):

```json
{
  "query": "What is AAPL's latest earnings?",
  "results": [
    {
      "source_type": "kline",
      "source_id": "AAPL_1d",
      "title": "AAPL (Apple Inc.) Fundamentals",
      "snippet": "AAPL Apple Inc. - Exchange: NASDAQ, Sector: Technology, pe_ratio: 33.2, revenue: $383.29B (2025-FY)",
      "relevance_score": 1.0,
      "rrf_score": 0.005,
      "metadata": { "ticker": "AAPL", "date": "2025-FY" }
    },
    {
      "source_type": "sec_edgar",
      "source_id": "10-K_2025",
      "title": "Apple Inc. 10-K FY2025",
      "snippet": "Apple Inc. reported annual revenue of $383.29B for fiscal year 2025, up 2.1% YoY.",
      "relevance_score": 0.92,
      "rrf_score": 0.0049,
      "metadata": { "ticker": "AAPL", "date": "2025-10-31", "url": "https://sec.gov/Archives/edgar/data/320193/000032019325000119/aapl-20250928.htm" }
    }
  ]
}
```

### AgentLoop Integration (ADR-0004)

The pipeline is invoked from `AskHandler.onExecute()`, which populates `ExecResult.rag_context` for downstream `onSynthesize()`:

```typescript
// web/src/lib/agent/ask-handlers.ts (future implementation)

export class AskStepHandler implements StepHandler {
  private ragPipeline = new AskRAGPipeline();

  async onExecute(ctx: LoopContext, plan: Plan): Promise<ExecResult> {
    const ragResult = await this.ragPipeline.run(ctx.query, ctx.env, ctx.intent);

    // ragResult.context is the RAG context string for ADR-0007
    return {
      rag_context: ragResult.context,     // consumed by onSynthesize -> validateCitations
      rag_results: ragResult.results,     // for trace/debug
      rag_duration_ms: ragResult.duration_ms,
      cost_usd: 0,                        // RAG retrieval is free (no LLM call)
      needs_tool: false,
    };
  }

  async onSynthesize(ctx: LoopContext, execResult: ExecResult): Promise<Synthesis> {
    // execResult.rag_context feeds validateCitations (ADR-0007)
    const ragContext = (execResult as any).rag_context as string;
    // ... LLM call with ragContext in prompt, then validateCitations
  }
}
```

### Vectorize Index Schema

One Vectorize index (`NOVA_RAG_INDEX`) for all source types except `kline` and `user_note`:

```typescript
// wrangler.toml
// [[vectorize]]
// binding = "VECTORIZE_INDEX"
// index_name = "NOVA_RAG_INDEX"
// Dimensions: 384 (bge-small-en-v1.5)
// Metric: cosine

// Vector metadata (per-vector, stored in Vectorize):
interface VectorizeMetadata {
  source_type: RAGSourceType;  // "sec_edgar" | "news" | "playbook"
  source_id: string;           // e.g., "10-K_2025", "reuters_38291"
  ticker?: string;             // primary ticker
  date?: string;               // ISO date
  chunk_index: number;         // chunk position in source document (0-based)
}
```

**Indexing pipeline** (out of scope for this ADR, noted for implementation stories):
- SEC EDGAR filings: fetch → chunk (512 tokens, 64 overlap) → embed → insert into Vectorize + D1 metadata + R2 full text
- News RSS: same chunking pipeline
- Playbooks: chunk YAML sections → embed → insert

### D1 Schema Addition (Sync with ADR-0011)

This ADR adds two new tables to ADR-0011 §Master Schema:

```sql
-- Migration: 009_rag_metadata.sql
-- (Extends ADR-0011 Migration 008_citation_url_check.sql; runs after 008)

-- Metadata for Vectorize-indexed RAG chunks (SEC filings, news, playbook sections)
CREATE TABLE rag_chunks (
  id            TEXT PRIMARY KEY,           -- Vectorize vector ID
  source_type   TEXT NOT NULL,              -- "sec_edgar" | "news" | "playbook"
  source_id     TEXT NOT NULL,              -- source document ID
  ticker        TEXT REFERENCES symbols(ticker),
  title         TEXT NOT NULL,
  snippet       TEXT NOT NULL,              -- chunk text (≤ 512 chars)
  chunk_index   INTEGER NOT NULL DEFAULT 0,
  r2_key        TEXT,                       -- R2 object key for full document
  url           TEXT,                       -- canonical URL for citation
  date          TEXT,                       -- document date
  indexed_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_rag_chunks_source ON rag_chunks(source_type, source_id);
CREATE INDEX idx_rag_chunks_ticker ON rag_chunks(ticker, date DESC);
CREATE INDEX idx_rag_chunks_source_type ON rag_chunks(source_type, ticker);

-- News article metadata (for NewsAdapter D1 queries)
CREATE TABLE news_articles (
  id            TEXT PRIMARY KEY,           -- news article ID
  source        TEXT NOT NULL,              -- "reuters" | "bloomberg" | "yahoo_news"
  title         TEXT NOT NULL,
  snippet       TEXT NOT NULL,
  ticker        TEXT REFERENCES symbols(ticker),
  url           TEXT NOT NULL,
  r2_key        TEXT,                       -- R2 key for full article
  published_at  TEXT NOT NULL,
  indexed_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_news_ticker_date ON news_articles(ticker, published_at DESC);
CREATE INDEX idx_news_source ON news_articles(source, published_at DESC);
```

**Migration order update** (extends ADR-0011):
- 001 through 008 (existing per ADR-0011)
- **009_rag_metadata.sql** (NEW, this ADR)

## Alternatives Considered

### Alternative 1: Single Vectorize index per source type (5 indexes)

- **Description**: Create separate Vectorize indexes: `NOVA_KLINE_IDX`, `NOVA_SEC_IDX`, `NOVA_NEWS_IDX`, `NOVA_PB_IDX`, `NOVA_USER_IDX`. Each adapter queries its own index.
- **Pros**: Source-level isolation; per-source dimension tuning; simpler filter logic.
- **Cons**: Cloudflare free tier limit is 1 Vectorize index per account (5 indexes paid). 5 indexes = 5× operational overhead. Cross-source ranking requires merging results from 5 separate queries.
- **Rejection Reason**: Free tier constraint. Single index with `source_type` metadata filter achieves the same isolation without the cost. Paid-tier revisit in Phase 2 if per-source tuning is needed.

### Alternative 2: Pinecone or Weaviate as external vector DB

- **Description**: Use Pinecone Serverless or Weaviate Cloud for vector storage and retrieval.
- **Pros**: Mature product; hybrid search (dense + sparse); better filtering; larger index sizes.
- **Cons**: External dependency (violates Cloudflare-native architecture); adds latency (cross-region HTTP); adds cost ($70+/mo minimum); breaks ADR-0001 Mock mode simplicity.
- **Rejection Reason**: Architecture decision is Cloudflare-native (Workers + D1 + Vectorize + R2). Adding external vector DB breaks the stack coherence. Vectorize is sufficient for Phase 1 scale (< 100K vectors).

### Alternative 3: D1-only retrieval (no Vectorize)

- **Description**: Skip vector search entirely. Use D1 FTS5 (full-text search) for retrieval. No embeddings, no Vectorize.
- **Pros**: Simpler; no embedding pipeline; no chunking; D1 FTS5 is built-in.
- **Cons**: D1 does not support FTS5 (Cloudflare D1 is SQLite but FTS5 is not enabled). Keyword-only retrieval misses semantic similarity ("revenue" ≠ "earnings" ≠ "top line"). Violates EP03 §2.4 which specifies embedding-based retrieval.
- **Rejection Reason**: D1 lacks FTS5. Semantic search is a core EP03 requirement. Vectorize is the designated solution.

### Alternative 4: Weighted sum fusion (instead of RRF)

- **Description**: Combine results by weighted sum of relevance scores: `final_score = Σ(weight_i * score_i)`.
- **Pros**: Preserves score magnitude; more intuitive weighting.
- **Cons**: Scores across sources are not comparable (Vectorize cosine [0,1] vs D1 exact match {0,1}). Weighted sum conflates incomparable scales. Sensitive to score distribution.
- **Rejection Reason**: RRF is rank-based, avoiding the incomparable-scores problem. RRF is the standard for multi-source retrieval (used by Elasticsearch, Vespa, Meilisearch). Weighted sum is fragile when source score distributions differ.

### Alternative 5: Pre-compute and cache RAG results in D1

- **Description**: For common queries (AAPL earnings, NVDA revenue), pre-compute RAG results and cache in D1. Pipeline checks cache first.
- **Pros**: Sub-100ms retrieval for cached queries; reduces Vectorize load.
- **Cons**: Workers stateless — no module-level cache (FP-0001/FP-0002). D1 cache requires request-scoped read. Cache invalidation when source data changes. Adds complexity for uncertain gain (Vectorize query is already ~50ms).
- **Rejection Reason**: Premature optimization. Vectorize query latency is acceptable (< 200ms). If P99 latency exceeds 2s, revisit with D1 caching in Phase 1.5.

## Consequences

### Positive

- **EP03 §2.4 AskRAGPipeline is formally specified** — 3 methods, 5 sources, merge/rank, assemble.
- **Multi-source retrieval with unified ranking** — RRF produces a single ranked list from 5 heterogeneous sources, enabling cross-source citation.
- **ADR-0007 integration is clean** — `assemble()` output format (`[source_type:source_id] snippet`) gives the Citation Validator exact source markers for quote substring verification.
- **ADR-0004 integration is clean** — `AskHandler.onExecute()` runs the pipeline and passes `rag_context` to `onSynthesize()`.
- **Mock mode zero external HTTP** — Pre-computed RAG results from static JSON files. Full pipeline testable offline.
- **Adapter pattern is extensible** — New sources (e.g., FRED economic data, Yahoo Finance real-time) can be added by implementing `RAGSourceAdapter` without modifying the pipeline core.
- **Source weights are configurable** — RRF weights can be tuned per deployment or per intent type (e.g., boost `sec_edgar` for deep_research, boost `kline` for simple_qa).

### Negative

- **Vectorize is a single point of failure for 3 of 5 adapters** — If Vectorize is down, `sec_edgar`, `news`, `playbook` adapters return empty. Only `kline` (D1-only) and `user_note` (D1-only) survive. Mitigation: adapter failures are non-fatal (caught, logged, empty returned); partial RAG context still usable.
- **Two-step retrieval (Vectorize → D1)** — Latency is Vectorize query (~50ms) + D1 batch read (~20ms) + R2 fetch for large docs (~100ms). Total ~170ms for typical query, within 2s budget but adds operational complexity.
- **Embedding model lock-in** — `@cf/baai/bge-small-en-v1.5` is 384-dim. Switching models requires re-indexing all vectors. Phase 2 alternative (Volcano Ark) would need a migration plan.
- **D1 schema addition** — 2 new tables (`rag_chunks`, `news_articles`) extend ADR-0011 migration order to 009. Requires ADR-0011 amendment.
- **Snippet size limit (512 chars)** — May truncate important context for long SEC filing sections. LLM sees only the snippet, not the full document. Mitigation: R2 stores full text; future streaming can fetch on demand.
- **KlineMetadataAdapter is keyword-based, not semantic** — No embeddings for K-line data (too volatile for Vectorize). Ticker match only. Misses "price performance" → "kline" semantic link.

### Risks

- **Risk**: Vectorize query latency > 500ms for large indexes (> 1M vectors).
  - **Mitigation**: Phase 1 index size < 100K vectors (SEC filings for 10 mockup tickers + 100 S&P tickers). Vectorize query is O(log N) for HNSW. Monitor P99 latency; add D1 cache (Alternative 5) if needed.
- **Risk**: Workers AI embedding model rate limit hit under load.
  - **Mitigation**: Cloudflare Workers AI free tier: 10K neurons/day (bge-small-en-v1.5 = 384 neurons per call = ~26 queries/day free). Paid tier: 50M neurons/day. Phase 1 demo stays within free tier; production requires paid tier.
- **Risk**: `mergeAndRank()` produces poor ranking when source scores are highly skewed (e.g., one adapter returns all scores near 1.0, another near 0.5).
  - **Mitigation**: RRF is rank-based, not score-based — it ignores score magnitude and only uses rank position. This is precisely why RRF was chosen over weighted sum (Alternative 4).
- **Risk**: Mock RAG samples drift from real Vectorize result format.
  - **Mitigation**: Mock samples are validated against `RAGResult` TypeScript type at build time. Add CI check that mock sample `source_type` values match `RAGSourceType` union.
- **Risk**: `assemble()` context string exceeds LLM context window (4096 tokens for smaller models).
  - **Mitigation**: `totalResults=10` with `snippet ≤ 512 chars` = ~5KB context (~1250 tokens at 4 chars/token). Well within 4096. For larger models (8K+ context), increase `totalResults` via config.
- **Risk**: Adapter failure silently returns empty results, degrading RAG quality without visibility.
  - **Mitigation**: Each adapter failure is logged to `console.error`. Future ADR (Observability) should capture adapter failure counts in TraceStep metadata. Consider adding `adapterErrors: { sourceType: string, error: string }[]` to `RAGPipelineResult`.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP03 §2.4 | AskRAGPipeline class with embed/retrieve/assemble 3 methods | Canonical `AskRAGPipeline` class with `embed()`, `retrieve()`, `assemble()` |
| EP03 §2.4 | 5 retrieval sources: K-lines metadata, SEC EDGAR earnings, News RSS, Playbooks, User notes | 5 `RAGSourceAdapter` implementations |
| EP03 §2.4 | Mock mode: embed returns fixed vector | `embed()` returns `new Float32Array(384)` when `USE_MOCK=true` |
| EP03 §2.4 | mergeAndRank() combines results from all sources | `mergeAndRank()` using RRF with source weights |
| EP03 §2.4 | assemble() produces RAG context string used by Citation Validator | `assemble()` returns `[source_type:source_id] snippet` format consumed by ADR-0007 |
| EP03 §2.7 | RAGRetrieve loop state | `AskHandler.onExecute()` invokes pipeline in Execute state |
| EP03 §2.3 | "Forced Citation mode: all numeric fields must be extracted from structured data" | Pipeline provides the structured RAG context that citation-validated answers draw from |
| TR-EP03-008 | AskRAGPipeline (embed → retrieve → assemble) | This ADR is the formal specification for TR-EP03-008 |
| EP01 §ID-6 | "Hallucination rate ≤ 5%" Eval Golden Set | Pipeline provides RAG context; without it, hallucination rate would approach 100% for numeric queries |
| ADR-0001 | USE_MOCK compliance: zero external HTTP when true | Mock mode returns pre-computed results; no Vectorize/Workers AI/D1/R2 calls |
| ADR-0007 | validateCitations needs ragContext string | `assemble()` produces the ragContext string |
| ADR-0004 | AskHandler.onExecute performs RAG retrieval | Pipeline is invoked from onExecute |

## Performance Implications

- **embed()**: Mock mode: ~0.01ms (array allocation). Real mode: Workers AI inference ~50-200ms depending on model load.
- **retrieve()**: Mock mode: ~1ms (JSON parse). Real mode: Vectorize query ~50ms + D1 batch read ~20ms per adapter. 5 adapters in parallel: ~100ms total (bounded by slowest adapter). R2 fetch for snippets: ~100ms (1-2 documents).
- **mergeAndRank()**: ~1ms for 25 results (5 adapters × 5 topK). O(n log n) for sort.
- **assemble()**: ~0.5ms for 10 results. Pure string concatenation.
- **Total pipeline**: Mock mode: ~5ms. Real mode: ~350ms (embed 200ms + retrieve 100ms + assemble 0.5ms + R2 100ms). Well within 2s latency budget.
- **Memory**: `RAGResult` ~500 bytes each. 10 results = 5KB. `queryEmbedding` = 384 × 4 bytes = 1.5KB. Assembled context string ~5KB. Total ~12KB per request.
- **Cost**: Workers AI embedding: free tier (10K neurons/day). Vectorize query: free tier (1M queries/day). D1 reads: 10 reads/request × 5M/day free. R2 reads: ~2 reads/request. All within free tier for Phase 1.

## Migration Plan

Current state: No RAG pipeline code exists. This is greenfield.

Migration steps:

1. **Create `web/src/lib/ask/rag-pipeline.ts`** with `AskRAGPipeline`, `RAGResult`, `RAGSourceAdapter`, `RAGPipelineConfig`, `RAGPipelineResult` types, and `mergeAndRank()` logic.
2. **Create `web/src/lib/ask/adapters/kline-metadata.ts`** with `KlineMetadataAdapter` (D1-only).
3. **Create `web/src/lib/ask/adapters/earnings.ts`** with `EarningsAdapter` (Vectorize + D1 + R2).
4. **Create `web/src/lib/ask/adapters/news.ts`** with `NewsAdapter` (Vectorize + D1 + R2).
5. **Create `web/src/lib/ask/adapters/playbook.ts`** with `PlaybookAdapter` (Vectorize + D1 + R2).
6. **Create `web/src/lib/ask/adapters/user-note.ts`** with `UserNoteAdapter` (D1-only).
7. **Create mock RAG samples** in `web/public/mock/qa_samples/` for AAPL, NVDA, MSFT (3 sample files).
8. **Create `web/migrations/009_rag_metadata.sql`** with `rag_chunks` + `news_articles` tables. Update ADR-0011 §Master Schema.
9. **Add Vectorize binding** to `wrangler.toml`: `NOVA_RAG_INDEX` with 384 dimensions, cosine metric.
10. **Add unit tests** in `web/tests/unit/rag-pipeline.test.ts` covering:
    - Mock mode: embed returns zero vector
    - Mock mode: retrieve returns pre-computed results
    - Mock mode: zero external HTTP calls (FP-0005)
    - mergeAndRank: RRF scoring correctness
    - mergeAndRank: dedup by (source_type, source_id)
    - assemble: source marker format `[source_type:source_id]`
    - assemble: output consumable by ADR-0007 validateCitations
    - Pipeline completes within 2s latency budget (Real mode mock)
11. **Update `AskStepHandler.onExecute()`** (per ADR-0004) to invoke `AskRAGPipeline.run()` and populate `ExecResult.rag_context`.
12. **Add ADR-0011 amendment**: Migration order extended to 009.

## Validation Criteria

- [ ] `AskRAGPipeline.embed("test query", { USE_MOCK: "true" })` returns `Float32Array(384)` of zeros
- [ ] `AskRAGPipeline.embed("test query", { USE_MOCK: "false", AI: mockAI })` returns 384-dim vector from Workers AI
- [ ] `AskRAGPipeline.retrieve(zeroVec, 5, { USE_MOCK: "true" })` returns results from mock QA samples with zero external HTTP
- [ ] `AskRAGPipeline.retrieve(vec, 5, { USE_MOCK: "false", ... })` queries all 5 adapters in parallel
- [ ] `mergeAndRank()` produces descending RRF score order
- [ ] `mergeAndRank()` deduplicates results with same (source_type, source_id)
- [ ] `assemble()` output starts with `[source_type:source_id]` marker for each chunk
- [ ] `assemble()` output is a valid input for ADR-0007 `validateCitations(answer, ragContext, env)`
- [ ] Mock mode: pipeline makes zero external HTTP calls (verified by `vi.spyOn(globalThis, "fetch")`)
- [ ] Pipeline completes in < 2s for typical query (Real mode with mocked adapters)
- [ ] Adapter failure is non-fatal: failed adapter returns empty, other adapters continue
- [ ] `RAGPipelineResult.sourceCounts` correctly tallies results per source type
- [ ] All 5 adapters implement `RAGSourceAdapter` interface (TypeScript compiler check)
- [ ] Mock QA samples in `web/public/mock/qa_samples/` validate against `RAGResult[]` type

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) — Mock mode: zero-vector embedding + pre-computed retrieval; Real mode: Workers AI + Vectorize
- **ADR-0004** (Agent Loop Design) — `AskHandler.onExecute()` invokes pipeline; `ExecResult.rag_context` flows to `onSynthesize()`
- **ADR-0007** (Citation Validator) — `assemble()` output is the `ragContext` string consumed by `validateCitations()`
- **ADR-0011** (D1 Schema Master) — This ADR adds `rag_chunks` + `news_articles` tables (Migration 009)
- EP03 §2.4 — originating AskRAGPipeline specification
- EP03 §2.7 — Ask Agent Loop RAGRetrieve state
- TR-EP03-008 — traced requirement this ADR formalizes

## TECH_DEBT - None at ADR Creation

This is a new ADR; no existing RAG pipeline implementation to carry tech debt. The 14 validation criteria in §Validation Criteria are the acceptance signals for future implementation.

When the pipeline is implemented, the following known tech debt should be tracked:

1. **KlineMetadataAdapter is keyword-only** (no semantic search for K-line data). Mitigation: ticker extraction from query is heuristic-based; may miss indirect references ("Apple" → "AAPL"). Future: add ticker aliases or keyword-to-ticker mapping in D1.
2. **UserNoteAdapter is keyword-only** (no embeddings for user data — privacy decision). Future: if user opts in to semantic search on their notes, add per-user Vectorize index or local embedding.
3. **Indexing pipeline is out of scope** — this ADR defines retrieval, not the ETL that populates Vectorize/D1/R2. Indexing stories must be tracked separately.
