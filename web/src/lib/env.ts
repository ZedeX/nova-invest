/**
 * Environment configuration.
 * Reads from process.env (Next.js) or globalThis.env (Cloudflare Workers).
 */

export interface Env {
  // Mock mode switch (single source of truth)
  USE_MOCK: string;

  // LLM provider selection
  LLM_PROVIDER?: "lmstudio" | "ark" | "mock";

  // LLM API keys (only used in Real mode)
  LLM_API_KEY?: string;
  ALPHA_VANTAGE_KEY?: string;
  POLYGON_API_KEY?: string;

  // Cloudflare bindings (only in production)
  DB?: D1Database;
  R2?: R2Bucket;
  SESSION_KV?: KVNamespace;
  VECTORIZE?: VectorizeIndex;

  // Environment
  ENVIRONMENT?: "development" | "staging" | "production";
}

declare global {
  // Cloudflare Workers inject `env` as global
  // eslint-disable-next-line no-var
  var env: Env | undefined;
}

export function getEnv(): Env {
  // Next.js client/server side
  if (typeof process !== "undefined" && process.env) {
    return {
      USE_MOCK: process.env.USE_MOCK || process.env.NEXT_PUBLIC_USE_MOCK || "true",
      LLM_PROVIDER: (process.env.LLM_PROVIDER as "lmstudio" | "ark" | "mock") || "lmstudio",
      LLM_API_KEY: process.env.LLM_API_KEY,
      ALPHA_VANTAGE_KEY: process.env.ALPHA_VANTAGE_KEY,
      POLYGON_API_KEY: process.env.POLYGON_API_KEY,
      // Per ADR-0003 §Validation Criteria: ENVIRONMENT is the canonical env var
      // for production/development routing. Falls back to NODE_ENV for Next.js
      // compatibility (NODE_ENV is set automatically by Next/vitest).
      ENVIRONMENT: (process.env.ENVIRONMENT as "development" | "staging" | "production")
        || (process.env.NODE_ENV as "development" | "staging" | "production")
        || "development",
    };
  }

  // Cloudflare Workers
  if (typeof globalThis !== "undefined" && globalThis.env) {
    return globalThis.env;
  }

  // Fallback (should never happen)
  return { USE_MOCK: "true", LLM_PROVIDER: "mock", ENVIRONMENT: "development" };
}

export function isMockMode(): boolean {
  return getEnv().USE_MOCK === "true";
}

/**
 * The 10 symbols in the Mockup pool.
 * Used to decide whether to cache in R2 (Real mode).
 *
 * Per ADR-0002: MUST stay in sync with Mock dataset filenames
 * (web/public/mock/klines/*.json). CI enforces this via
 * `pnpm run check:mock-symbols`.
 */
export const R2_CACHE_SYMBOLS = new Set([
  "AAPL", "MSFT", "NVDA", "GOOG", "META",
  "AMZN", "TSLA", "NFLX", "AMD", "INTC",
]);

/**
 * Returns true if the symbol should be cached in R2.
 * All R2 write paths MUST call this before writing.
 *
 * Per ADR-0002 §Decision: canonical predicate lives in env.ts.
 */
export function shouldCacheR2(symbol: string): boolean {
  return R2_CACHE_SYMBOLS.has(symbol.toUpperCase());
}
