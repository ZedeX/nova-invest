/**
 * LLM Router.
 *
 * Per user's refinement decision (Q3 + LLM routing):
 *   - Local development: USE_MOCK=true → use Mock answers (no LLM call)
 *   - Local with real LLM: USE_MOCK=false, LLM_PROVIDER=lmstudio → LM Studio
 *   - Production (Cloudflare): USE_MOCK=false, LLM_PROVIDER=ark → Volcengine Ark
 *
 * Cost tiers:
 *   - simple_qa:     haiku-tier,    max_tokens 500,  cost $0.001
 *   - deep_research: sonnet-tier,   max_tokens 4000, cost $0.05
 *   - tool_call:     sonnet-tier,   max_tokens 800,  cost $0.01
 *
 * See: docs/prd/epic/03_Ask_Agent.md
 */

import { getEnv, isMockMode } from "../env";
import type { AskResponse, QueryIntent } from "../types";

export interface LLMConfig {
  provider: "mock" | "lmstudio" | "ark";
  model: string;
  max_tokens: number;
  cost_cap: number;  // USD per request
  api_base?: string;
}

export const ROUTING_RULES: Record<QueryIntent, { local: LLMConfig; cloud: LLMConfig }> = {
  simple_qa: {
    local:  { provider: "lmstudio", model: "qwen2.5-7b-instruct",  max_tokens: 500,  cost_cap: 0      },
    cloud:  { provider: "ark",      model: "doubao-lite-4k",      max_tokens: 500,  cost_cap: 0.001  },
  },
  deep_research: {
    local:  { provider: "lmstudio", model: "qwen2.5-32b-instruct", max_tokens: 4000, cost_cap: 0      },
    cloud:  { provider: "ark",      model: "doubao-pro-32k",     max_tokens: 4000, cost_cap: 0.05   },
  },
  tool_call: {
    local:  { provider: "lmstudio", model: "qwen2.5-7b-instruct",  max_tokens: 800,  cost_cap: 0      },
    cloud:  { provider: "ark",      model: "doubao-pro-32k",     max_tokens: 800,  cost_cap: 0.01   },
  },
  clarify: {
    local:  { provider: "lmstudio", model: "qwen2.5-7b-instruct",  max_tokens: 200,  cost_cap: 0      },
    cloud:  { provider: "ark",      model: "doubao-lite-4k",      max_tokens: 200,  cost_cap: 0.0005 },
  },
};

export function route(intent: QueryIntent): LLMConfig {
  const env = getEnv();

  // Mock mode: return mock config (no actual LLM call)
  if (isMockMode()) {
    return { provider: "mock", model: "mock-qa-sample",
             max_tokens: 0, cost_cap: 0 };
  }

  // Determine environment: local (LM Studio) vs cloud (Ark)
  const envMode = env.ENVIRONMENT === "production" ? "cloud" : "local";
  return ROUTING_RULES[intent][envMode];
}

// ============ Mock LLM (returns pre-generated samples) ============

export class MockLLM {
  provider = "mock" as const;

  async complete(query: string, intent: QueryIntent): Promise<AskResponse> {
    // Load pre-generated Mock QA samples based on intent + query match
    const sample = await this.findMatchingSample(query, intent);
    if (sample) {
      return {
        ...(sample as any).response,
        intent,
        cost: { credits_used: 0, model: "mock-qa-sample" },
      };
    }

    // Fallback generic response
    return {
      summary: `Mock response for query: "${query}" (intent: ${intent}). In Mock mode, no LLM is called.`,
      numeric_facts: [],
      citations: [],
      confidence: 0.5,
      intent,
      cost: { credits_used: 0, model: "mock" },
    };
  }

  private async findMatchingSample(query: string, intent: QueryIntent) {
    try {
      // Try to load a sample matching the intent
      const sampleFiles: Record<QueryIntent, string> = {
        simple_qa: "/mock/qa_samples/aapl_price.json",
        deep_research: "/mock/qa_samples/nvda_earnings.json",
        tool_call: "/mock/qa_samples/tsla_news.json",
        clarify: "/mock/qa_samples/clarify.json",
      };
      const res = await fetch(sampleFiles[intent]);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}

// ============ Real LLM (LM Studio or Volcengine Ark) ============

export class RealLLM {
  constructor(private config: LLMConfig) {}

  async complete(query: string, intent: QueryIntent): Promise<AskResponse> {
    // Phase 1.5 implementation: actual LLM API call
    // For now, return a structured placeholder
    return {
      summary: `[Real LLM placeholder] Query: "${query}", intent: ${intent}, model: ${this.config.model}`,
      numeric_facts: [],
      citations: [],
      confidence: 0.7,
      intent,
      cost: { credits_used: 1, model: this.config.model },
    };
  }
}

// ============ Factory ============

let _llm: MockLLM | RealLLM | null = null;

export function getLLM(intent: QueryIntent): MockLLM | RealLLM {
  if (_llm) return _llm;

  const config = route(intent);
  if (config.provider === "mock") {
    _llm = new MockLLM();
  } else {
    _llm = new RealLLM(config);
  }
  return _llm;
}

// ============ Intent Classifier ============

export function classifyIntent(query: string): QueryIntent {
  const q = query.toLowerCase();

  // NOTE: Do NOT use \b around Chinese alternations — JS \b matches the
  // boundary between [A-Za-z0-9_] and any other char, and CJK chars are
  // "other" so \b当前\b never matches a pure-Chinese substring. Use bare
  // alternations for Chinese; keep \b for English patterns.
  // (Discovered by ADR-0003 TDD spec — see tests/unit/classify-intent.test.ts)

  if (/(?:当前|现在).*(?:价格|股价|多少钱)/.test(q) ||
      /\bcurrent price\b|\bhow much\b/.test(q)) {
    return "simple_qa";
  }
  if (/(?:分析|研究|比较|趋势|过去|历史)/.test(q) ||
      /\banalyze\b|\bresearch\b|\bcompare\b|\btrend\b|\bpast\b|\bhistory\b/.test(q)) {
    return "deep_research";
  }
  if (/(?:查询|查一下|调用|搜索|新闻)/.test(q) ||
      /\bsearch\b|\bfetch\b|\bnews\b/.test(q)) {
    return "tool_call";
  }
  return "clarify";
}
