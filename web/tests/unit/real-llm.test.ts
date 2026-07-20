import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RealLLM, type LLMConfig } from "@/lib/llm/router";

describe("RealLLM (ADR-0003 LLM Routing + Cost Cap)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const arkConfig: LLMConfig = {
    provider: "ark",
    model: "doubao-pro-32k",
    max_tokens: 4000,
    cost_cap: 0.05,
  };

  const lmStudioConfig: LLMConfig = {
    provider: "lmstudio",
    model: "qwen2.5-14b-instruct",
    max_tokens: 500,
    cost_cap: 0,
    api_base: "http://localhost:1234/v1",
  };

  it("should instantiate with config", () => {
    const llm = new RealLLM(arkConfig);
    expect(llm).toBeInstanceOf(RealLLM);
  });

  it("should call LM Studio API with correct format", async () => {
    const llm = new RealLLM(lmStudioConfig);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"AAPL is at $182","confidence":0.85}' } }],
        model: "qwen2.5-14b-instruct",
      }),
    } as Response);

    const result = await llm.complete("What is AAPL price?", "simple_qa");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("http://localhost:1234/v1/chat/completions");

    const body = JSON.parse(call[1].body);
    expect(body.model).toBe("qwen2.5-14b-instruct");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.max_tokens).toBe(500);
    expect(body.temperature).toBe(0.3);
    expect(body.stream).toBe(false);

    expect(result.summary).toBe("AAPL is at $182");
    expect(result.confidence).toBe(0.85);
  });

  it("should call Volcengine Ark API with authorization header", async () => {
    const llm = new RealLLM(arkConfig);
    process.env.VOLCANO_ARK_API_KEY = "test_ark_key";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"NVDA analysis","confidence":0.9,"numeric_facts":[{"value":487.16,"unit":"USD","source":{"source":"Yahoo","url":"https://yahoo.com","quote":"NVDA at $487"},"confidence":0.85}]}' } }],
        model: "doubao-pro-32k",
        usage: { total_tokens: 500 },
      }),
    } as Response);

    const result = await llm.complete("Analyze NVDA", "deep_research");

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("ark.cn-beijing.volces.com");
    expect(call[1].headers.Authorization).toBe("Bearer test_ark_key");

    expect(result.summary).toBe("NVDA analysis");
    expect(result.confidence).toBe(0.9);
    expect(result.numeric_facts).toHaveLength(1);
    expect(result.numeric_facts[0].value).toBe(487.16);
    expect(result.cost?.model).toBe("doubao-pro-32k");

    delete process.env.VOLCANO_ARK_API_KEY;
  });

  it("should throw error when Ark API key is missing", async () => {
    const llm = new RealLLM(arkConfig);
    delete process.env.VOLCANO_ARK_API_KEY;
    delete process.env.LLM_API_KEY;

    await expect(llm.complete("test", "simple_qa")).rejects.toThrow("VOLCANO_ARK_API_KEY not configured");
  });

  it("should handle LM Studio API errors", async () => {
    const llm = new RealLLM(lmStudioConfig);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(llm.complete("test", "simple_qa")).rejects.toThrow("LM Studio API error: 500");
  });

  it("should handle Ark API errors with response body", async () => {
    const llm = new RealLLM(arkConfig);
    process.env.VOLCANO_ARK_API_KEY = "test_key";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    } as Response);

    await expect(llm.complete("test", "simple_qa")).rejects.toThrow("Ark API error: 429");

    delete process.env.VOLCANO_ARK_API_KEY;
  });

  it("should parse JSON response with numeric_facts and citations", async () => {
    const llm = new RealLLM(arkConfig);
    process.env.VOLCANO_ARK_API_KEY = "test_key";

    const mockResponse = {
      summary: "AAPL closed at $182.45",
      numeric_facts: [
        {
          value: 182.45,
          unit: "USD",
          source: { source: "Yahoo Finance", url: "https://finance.yahoo.com/quote/AAPL", quote: "AAPL closed at $182.45" },
          confidence: 0.85,
        },
        {
          value: 2.81,
          unit: "trillion USD",
          source: { source: "Market Cap", url: "https://finance.yahoo.com/quote/AAPL", quote: "Market cap: $2.81T" },
          confidence: 0.9,
        },
      ],
      citations: [
        { source: "Yahoo Finance", url: "https://finance.yahoo.com/quote/AAPL", quote: "AAPL closed at $182.45" },
      ],
      confidence: 0.85,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        model: "doubao-pro-32k",
      }),
    } as Response);

    const result = await llm.complete("AAPL price and market cap", "deep_research");

    expect(result.summary).toBe("AAPL closed at $182.45");
    expect(result.numeric_facts).toHaveLength(2);
    expect(result.numeric_facts[0].value).toBe(182.45);
    expect(result.numeric_facts[1].value).toBe(2.81);
    expect(result.citations).toHaveLength(1);
    expect(result.confidence).toBe(0.85);

    delete process.env.VOLCANO_ARK_API_KEY;
  });

  it("should handle non-JSON response as plain text summary", async () => {
    const llm = new RealLLM(lmStudioConfig);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "This is a plain text response without JSON structure." } }],
        model: "qwen2.5-14b",
      }),
    } as Response);

    const result = await llm.complete("test", "simple_qa");

    expect(result.summary).toBe("This is a plain text response without JSON structure.");
    expect(result.numeric_facts).toHaveLength(0);
    expect(result.citations).toHaveLength(0);
    expect(result.confidence).toBe(0.5);
  });

  it("should estimate cost based on token count and model tier", async () => {
    const proLlm = new RealLLM(arkConfig);
    process.env.VOLCANO_ARK_API_KEY = "test_key";

    // Long response to trigger higher cost estimate
    const longContent = JSON.stringify({
      summary: "A".repeat(4000),  // ~1000 tokens
      confidence: 0.8,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: longContent } }],
        model: "doubao-pro-32k",
      }),
    } as Response);

    const result = await proLlm.complete("test", "deep_research");

    // Pro model: $0.01 per 1000 tokens → 1000 tokens × $0.01 = $0.01 = 10 credits (× 1000 scaling)
    expect(result.cost?.credits_used).toBeGreaterThan(0);
    expect(result.cost?.model).toBe("doubao-pro-32k");

    delete process.env.VOLCANO_ARK_API_KEY;
  });

  it("should throw for unknown provider", async () => {
    const unknownConfig: LLMConfig = {
      provider: "unknown" as "ark",
      model: "test",
      max_tokens: 100,
      cost_cap: 0.01,
    };
    const llm = new RealLLM(unknownConfig);

    await expect(llm.complete("test", "simple_qa")).rejects.toThrow("Unknown LLM provider");
  });

  it("should use low temperature (0.3) for factual responses", async () => {
    const llm = new RealLLM(lmStudioConfig);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"test"}' } }],
        model: "test",
      }),
    } as Response);

    await llm.complete("test", "simple_qa");

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.temperature).toBe(0.3);
  });

  it("should include intent-specific system prompt", async () => {
    const llm = new RealLLM(lmStudioConfig);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"test"}' } }],
        model: "test",
      }),
    } as Response);

    await llm.complete("analyze NVDA", "deep_research");

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[0].content).toContain("in-depth analysis");
    expect(body.messages[0].content).toContain("NEVER fabricate numbers");
    expect(body.messages[0].content).toContain("NOT investment advice");
  });
});
