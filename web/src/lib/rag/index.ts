/**
 * RAG module barrel export + factory.
 *
 * Re-exports all public types, pipeline classes, and adapters.
 * The `createRAGPipeline` factory constructs a RAGPipeline with all
 * adapters configured for mock or real mode.
 */

// Types (both Phase-1 and Phase-2)
export type {
  RAGSource,
  RAGQuery,
  RAGResult,
  SimpleRAGSourceAdapter,
  RAGSourceAdapter,
  RAGRetrieveOptions,
  RAGDocument,
  RAGPipelineResult,
} from "./types";

// Phase-1 pipeline (single adapter, keyword-boost rerank)
export {
  AskRAGPipeline,
  MockRAGSourceAdapter,
} from "./pipeline";

export type { CitationValidator } from "./pipeline";

// Phase-2 pipeline (multi-adapter, RRF)
export {
  RAGPipeline,
  reciprocalRankFusion,
} from "./pipeline";

// Adapters
export { KlineAdapter } from "./adapters/kline-adapter";
export { FundamentalsAdapter } from "./adapters/fundamentals-adapter";
export { NewsAdapter } from "./adapters/news-adapter";
export { PlaybookAdapter } from "./adapters/playbook-adapter";

import { RAGPipeline } from "./pipeline";
import type { RAGSourceAdapter } from "./types";
import { KlineAdapter } from "./adapters/kline-adapter";
import { FundamentalsAdapter } from "./adapters/fundamentals-adapter";
import { NewsAdapter } from "./adapters/news-adapter";
import { PlaybookAdapter } from "./adapters/playbook-adapter";

/**
 * Create a RAGPipeline with all adapters based on mode.
 *
 * @param mockMode - If true, adapters use mock data; if false, they
 *                   would connect to real data sources (currently falls
 *                   back to mock data until production wiring is complete).
 */
export function createRAGPipeline(mockMode: boolean = true): RAGPipeline {
  const adapters: RAGSourceAdapter[] = [
    new KlineAdapter(mockMode),
    new FundamentalsAdapter(mockMode),
    new NewsAdapter(mockMode),
    new PlaybookAdapter(mockMode),
  ];
  return new RAGPipeline(adapters);
}
