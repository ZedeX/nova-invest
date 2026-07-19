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
      ENVIRONMENT: (process.env.NODE_ENV as "development" | "staging" | "production") || "development",
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
 */
export const R2_CACHE_SYMBOLS = new Set([
  "AAPL", "MSFT", "NVDA", "GOOG", "META",
  "AMZN", "TSLA", "NFLX", "AMD", "INTC",
]);
