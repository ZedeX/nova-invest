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
import type { Env } from "../env";
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

export function route(intent: QueryIntent, env?: Env): LLMConfig {
  const resolvedEnv = env ?? getEnv();

  // Mock mode: return mock config (no actual LLM call)
  const useMock = env ? env.USE_MOCK === "true" : isMockMode();
  if (useMock) {
    return { provider: "mock", model: "mock-qa-sample",
             max_tokens: 0, cost_cap: 0 };
  }

  // Determine environment: local (LM Studio) vs cloud (Ark)
  const envMode = resolvedEnv.ENVIRONMENT === "production" ? "cloud" : "local";
  return ROUTING_RULES[intent][envMode];
}

// ============ Mock LLM (returns pre-generated samples) ============

export class MockLLM {
  provider = "mock" as const;

  async complete(query: string, intent: QueryIntent): Promise<AskResponse> {
    // Load pre-generated Mock QA samples based on intent + query match
    const sample = await this.findMatchingSample(query, intent);
    if (sample) {
      const sampleResponse = (sample as { response?: AskResponse }).response;
      if (sampleResponse) {
        return {
          ...sampleResponse,
          intent,
          cost: { credits_used: 0, model: "mock-qa-sample" },
        };
      }
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

/**
 * RealLLM makes actual API calls to LLM providers.
 *
 * Supported providers:
 *   - lmstudio: OpenAI-compatible API at http://localhost:1234/v1
 *   - ark:      Volcengine Ark (Doubao) API
 *
 * The response is parsed to extract:
 *   - summary: the main text response
 *   - numeric_facts: extracted numeric values with citations
 *   - citations: source URLs
 *   - confidence: model self-reported confidence (default 0.7)
 *
 * Cost tracking:
 *   - credits_used: estimated based on token count × model price
 *   - Per ADR-0003: cost cap enforced per request
 */
export class RealLLM {
  constructor(public readonly config: LLMConfig) {}

  /**
   * Estimate the cost (in USD) of a query before the API call.
   *
   * Per ADR-0003 §Cost Cap: estimateCost() runs before the API call so we
   * can degrade the model when the estimate exceeds cost_cap.
   *
   * Heuristic: input tokens ≈ query.length / 4, output tokens ≈ max_tokens.
   * Price per 1k tokens: pro models $0.01, lite models $0.001.
   */
  estimateCost(query: string): number {
    const inputTokens = Math.ceil(query.length / 4);
    const outputTokens = this.config.max_tokens;
    const totalTokens = inputTokens + outputTokens;
    const pricePer1k = this.config.model.includes("pro") ? 0.01 : 0.001;
    return (totalTokens / 1000) * pricePer1k;
  }

  /**
   * Degrade the model tier when the estimated cost exceeds cost_cap.
   *
   * Strategy: pro → lite (10× cheaper). If still over cap, return null
   * (caller should fall back to Mock mode).
   */
  private degradeModel(): LLMConfig | null {
    if (this.config.model.includes("pro")) {
      // Downgrade pro → lite by swapping the model name suffix.
      const liteModel = this.config.model.replace(/pro/i, "lite");
      return { ...this.config, model: liteModel };
    }
    // Already on lite tier — cannot degrade further.
    return null;
  }

  async complete(query: string, intent: QueryIntent): Promise<AskResponse> {
    // ADR-0003 §Cost Cap: estimate cost before API call, degrade if needed.
    const estimatedCost = this.estimateCost(query);
    let activeConfig = this.config;
    if (this.config.cost_cap > 0 && estimatedCost > this.config.cost_cap) {
      const degraded = this.degradeModel();
      if (degraded) {
        console.warn(
          `[RealLLM] Cost estimate $${estimatedCost.toFixed(5)} exceeds cap $${this.config.cost_cap}; ` +
          `degrading ${this.config.model} → ${degraded.model}`,
        );
        activeConfig = degraded;
      } else {
        console.warn(
          `[RealLLM] Cost estimate $${estimatedCost.toFixed(5)} exceeds cap $${this.config.cost_cap}; ` +
          `already on lite tier — proceeding anyway`,
        );
      }
    }

    const systemPrompt = this.buildSystemPrompt(intent);
    const userPrompt = this.buildUserPrompt(query);

    let rawResponse: string;
    let model: string;

    if (activeConfig.provider === "lmstudio") {
      const result = await this.callLMStudio(systemPrompt, userPrompt, activeConfig);
      rawResponse = result.content;
      model = result.model;
    } else if (activeConfig.provider === "ark") {
      const result = await this.callArk(systemPrompt, userPrompt, activeConfig);
      rawResponse = result.content;
      model = result.model;
    } else {
      throw new Error(`Unknown LLM provider: ${activeConfig.provider}`);
    }

    // Parse the LLM response into structured AskResponse
    const parsed = this.parseResponse(rawResponse, query, intent, model);

    // Enforce cost cap (ADR-0003)
    const creditsUsed = parsed.cost?.credits_used ?? 0;
    if (creditsUsed > activeConfig.cost_cap * 1000) {
      console.warn(`[RealLLM] Cost cap exceeded: ${creditsUsed} credits > ${activeConfig.cost_cap * 1000} (cap=$${activeConfig.cost_cap})`);
    }

    return parsed;
  }

  private buildSystemPrompt(intent: QueryIntent): string {
    return `You are Nova Invest's AI investment research assistant.
Your task: ${this.getIntentDescription(intent)}

CRITICAL RULES:
1. Every numeric value MUST be accompanied by a citation source.
2. Format your response as JSON with the following structure:
{
  "summary": "Brief answer to the user's question",
  "numeric_facts": [
    {
      "value": 123.45,
      "unit": "USD",
      "source": { "source": "Yahoo Finance", "url": "https://...", "quote": "exact quote text" },
      "confidence": 0.85
    }
  ],
  "citations": [
    { "source": "Yahoo Finance", "url": "https://...", "quote": "exact quote text" }
  ],
  "confidence": 0.85
}

3. If you are unsure, set confidence < 0.5 and say so in the summary.
4. NEVER fabricate numbers. If you don't have data, say "I don't have current data for this."
5. This is for educational purposes only. NOT investment advice.`;
  }

  private buildUserPrompt(query: string): string {
    return `User question: ${query}

Please provide a structured JSON response following the system instructions.`;
  }

  private getIntentDescription(intent: QueryIntent): string {
    switch (intent) {
      case "simple_qa":
        return "Answer a simple factual question about a stock (price, market cap, etc.)";
      case "deep_research":
        return "Provide in-depth analysis combining multiple data sources (fundamentals, news, trends)";
      case "tool_call":
        return "Execute a tool-based query (search news, fetch filings, etc.)";
      case "clarify":
        return "Ask the user to clarify their question";
    }
  }

  /**
   * Call LM Studio (OpenAI-compatible API at localhost:1234).
   */
  private async callLMStudio(
    systemPrompt: string,
    userPrompt: string,
    config: LLMConfig,
  ): Promise<{ content: string; model: string }> {
    const apiBase = config.api_base || "http://localhost:1234/v1";
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // LM Studio doesn't require an API key, but the field may be expected
        "Authorization": "Bearer lm-studio",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: config.max_tokens,
        temperature: 0.3,  // Low temperature for factual responses
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`LM Studio API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    const content = json.choices?.[0]?.message?.content || "";
    if (!content) {
      throw new Error("LM Studio returned empty response");
    }

    return { content, model: json.model || config.model };
  }

  /**
   * Call Volcengine Ark (Doubao) API.
   * API docs: https://www.volcengine.com/docs/82379
   */
  private async callArk(
    systemPrompt: string,
    userPrompt: string,
    config: LLMConfig,
  ): Promise<{ content: string; model: string }> {
    const apiKey = process.env.VOLCANO_ARK_API_KEY || process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error("VOLCANO_ARK_API_KEY not configured");
    }

    const apiBase = config.api_base || "https://ark.cn-beijing.volces.com/api/v3";
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: config.max_tokens,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Ark API error: ${res.status} ${errText}`);
    }

    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    };

    const content = json.choices?.[0]?.message?.content || "";
    if (!content) {
      throw new Error("Ark API returned empty response");
    }

    return { content, model: json.model || config.model };
  }

  /**
   * Parse the LLM's text response into a structured AskResponse.
   *
   * The LLM is instructed to return JSON, but we handle parse failures
   * gracefully by treating the entire response as the summary.
   */
  private parseResponse(raw: string, _query: string, intent: QueryIntent, model: string): AskResponse {
    // Try to extract JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as {
          summary?: string;
          numeric_facts?: Array<{
            value: number;
            unit: string;
            source: { source: string; url: string; quote: string };
            confidence: number;
          }>;
          citations?: Array<{ source: string; url: string; quote: string }>;
          confidence?: number;
        };

        // Estimate cost: ~$0.001 per 1000 tokens for lite models, $0.01 for pro
        const tokenEstimate = Math.ceil(raw.length / 4);  // rough: 4 chars ≈ 1 token
        const pricePer1k = model.includes("pro") ? 0.01 : 0.001;
        const creditsUsed = Math.max(1, Math.ceil((tokenEstimate / 1000) * pricePer1k * 1000));

        return {
          summary: parsed.summary || raw,
          numeric_facts: parsed.numeric_facts || [],
          citations: parsed.citations || [],
          confidence: parsed.confidence ?? 0.7,
          intent,
          cost: { credits_used: creditsUsed, model },
        };
      } catch {
        // JSON parse failed - treat as plain text
      }
    }

    // Fallback: treat entire response as summary
    return {
      summary: raw,
      numeric_facts: [],
      citations: [],
      confidence: 0.5,
      intent,
      cost: { credits_used: 1, model },
    };
  }
}

// ============ Factory ============
//
// Per ADR-0003 §Critical Implementation Rule: factory is request-scoped —
// each call returns a fresh instance. No module-level cache.
// Callers can pass an explicit `env` for test isolation; if omitted, the
// factory reads from the current process/globalThis environment.

export function getLLM(intent: QueryIntent, env?: Env): MockLLM | RealLLM {
  const config = route(intent, env);
  if (config.provider === "mock") {
    return new MockLLM();
  }
  return new RealLLM(config);
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
