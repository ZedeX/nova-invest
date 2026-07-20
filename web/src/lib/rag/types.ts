/**
 * ADR-0014: Ask RAG Pipeline — domain types.
 *
 * These types are the validator/pipeline-facing shape. They are related
 * to but distinct from the ADR-0014 canonical `RAGResult` interface
 * (which uses `source_type` / `source_id` / `relevance_score`); this
 * module's shape is the simplified task-spec variant.
 */

/**
 * A retrieved RAG source. `content` is the text chunk fed to the LLM;
 * `url` and `source` feed the ADR-0007 citation validator.
 */
export interface RAGSource {
  id: string;
  content: string;
  url: string;
  /** Source label, e.g. "sec_edgar", "yahoo", "bloomberg", "reuters". */
  source: string;
  /** Raw relevance score from the adapter (Vectorize cosine, etc.). */
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Query into the RAG pipeline.
 *
 * - `top_k`: max sources returned after rerank (default 5).
 * - `threshold`: minimum score to keep a source (default 0, no filter).
 * - `filters`: opaque adapter-specific filters (e.g., ticker, date range).
 */
export interface RAGQuery {
  question: string;
  top_k?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
}

/**
 * Final pipeline output. `citations` is parallel to `sources` (i-th
 * citation validates the i-th source).
 */
export interface RAGResult {
  sources: RAGSource[];
  citations: import("@/lib/citation/types").Citation[];
  answer?: string;
}

/**
 * Phase-1 simple source adapter (single-adapter, keyword-boost rerank).
 * Used by AskRAGPipeline. Real adapter wraps Cloudflare Vectorize +
 * D1 + R2; mock adapter returns canned results from qa_samples.
 */
export interface SimpleRAGSourceAdapter {
  retrieve(query: RAGQuery): Promise<RAGSource[]>;
}

// ============================================================
// Phase-2 Multi-Adapter RRF Pipeline Types
// ============================================================

/** Multi-adapter RAG source adapter interface (RRF pipeline). */
export interface RAGSourceAdapter {
  /** Unique source identifier */
  id: string;
  /** Display name */
  name: string;
  /** Weight for Reciprocal Rank Fusion (higher = more trusted) */
  weight: number;
  /** Retrieve relevant documents for a query */
  retrieve(query: string, options?: RAGRetrieveOptions): Promise<RAGDocument[]>;
}

export interface RAGRetrieveOptions {
  /** Maximum number of documents to return */
  limit?: number;
  /** Filter by source type */
  sourceType?: string;
  /** Minimum relevance score (0-1) */
  minScore?: number;
}

export interface RAGDocument {
  /** Document ID */
  id: string;
  /** Source adapter that produced this document */
  source: string;
  /** Document content / snippet */
  content: string;
  /** Relevance score (0-1) from the source adapter */
  score: number;
  /** Metadata (URL, date, symbol, etc.) */
  metadata: Record<string, unknown>;
  /** Timestamp of the original document */
  timestamp?: string;
}

export interface RAGPipelineResult {
  /** Merged and ranked documents */
  documents: RAGDocument[];
  /** Total documents before dedup */
  totalRetrieved: number;
  /** Pipeline execution metadata */
  meta: {
    sources_queried: string[];
    elapsed_ms: number;
    fusion_method: "rrf";
  };
}
