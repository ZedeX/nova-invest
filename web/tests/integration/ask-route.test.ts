/**
 * Integration tests for POST /api/ask route handler.
 *
 * Directly invokes the route handler with mocked NextRequest to verify:
 *   - Mock mode returns pre-written responses with correct schema
 *   - Real mode routes through RealLLM (mocked)
 *   - trace_id is present in all responses
 *   - Intent classification drives the response
 *   - Error handling for missing query field
 *
 * Per ADR-0003 (LLM Routing) + ADR-0007 (Citation Validator) + ADR-0014 (RAG).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/ask/route";
import type { AskResponse } from "@/lib/types";

// ============ Helpers ============

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function parseResponse(res: Response) {
  return {
    status: res.status,
    body: await res.json() as Record<string, unknown>,
  };
}

// ============ Tests ============

describe("POST /api/ask — Mock mode", () => {
  beforeEach(() => {
    // Force Mock mode
    vi.stubEnv("USE_MOCK", "true");
    vi.stubEnv("ENVIRONMENT", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should return 400 when query is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toContain("query");
    expect(body.trace_id).toMatch(/^trace_/);
  });

  it("should return mock response for known symbol (AAPL)", async () => {
    const req = makeRequest({ query: "AAPL current price" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.trace_id).toMatch(/^trace_/);

    const answer = (body.data as { answer: AskResponse }).answer;
    expect(answer.summary).toContain("AAPL");
    expect(answer.summary).toContain("182.45");
    expect(answer.numeric_facts).toHaveLength(1);
    expect(answer.numeric_facts[0].value).toBe(182.45);
    expect(answer.numeric_facts[0].unit).toBe("USD");
    expect(answer.numeric_facts[0].source.source).toBe("Yahoo Finance");
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0].url).toContain("finance.yahoo.com");
    expect(answer.confidence).toBeGreaterThan(0);
    expect(answer.confidence).toBeLessThanOrEqual(1);
    expect(answer.intent).toBe("simple_qa");
    expect(answer.cost?.model).toBe("mock");
    expect(answer.cost?.credits_used).toBe(0);
  });

  it("should return low-confidence response for unknown symbol", async () => {
    const req = makeRequest({ query: "Tell me about UNKNOWN" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    const answer = (body.data as { answer: AskResponse }).answer;
    expect(answer.confidence).toBeLessThan(0.5);
    expect(answer.numeric_facts).toHaveLength(0);
    expect(answer.summary).toContain("Mock symbols");
  });

  it("should classify intent as deep_research for analysis queries", async () => {
    const req = makeRequest({ query: "Analyze NVDA fundamentals" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    const answer = (body.data as { answer: AskResponse }).answer;
    expect(answer.intent).toBe("deep_research");
  });

  it("should classify intent as tool_call for news queries", async () => {
    const req = makeRequest({ query: "Search TSLA news" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    const answer = (body.data as { answer: AskResponse }).answer;
    expect(answer.intent).toBe("tool_call");
  });

  it("should include unique trace_id per request", async () => {
    const req1 = makeRequest({ query: "AAPL price" });
    const res1 = await POST(req1 as unknown as import("next/server").NextRequest);
    const body1 = await res1.json() as { trace_id: string };

    const req2 = makeRequest({ query: "MSFT price" });
    const res2 = await POST(req2 as unknown as import("next/server").NextRequest);
    const body2 = await res2.json() as { trace_id: string };

    expect(body1.trace_id).not.toBe(body2.trace_id);
  });
});

describe("POST /api/ask — Real mode (LLM routing)", () => {
  beforeEach(() => {
    // Force Real mode
    vi.stubEnv("USE_MOCK", "false");
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("LLM_PROVIDER", "ark");
    vi.stubEnv("VOLCANO_ARK_API_KEY", "test_ark_key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should call RealLLM and return structured response", async () => {
    // Mock the fetch call to Ark API
    const mockArkResponse = {
      summary: "NVDA is a leading AI chip designer",
      numeric_facts: [
        {
          value: 487.16,
          unit: "USD",
          source: {
            source: "Yahoo Finance",
            url: "https://finance.yahoo.com/quote/NVDA",
            quote: "NVDA closed at $487.16",
          },
          confidence: 0.85,
        },
      ],
      citations: [
        {
          source: "Yahoo Finance",
          url: "https://finance.yahoo.com/quote/NVDA",
          quote: "NVDA closed at $487.16",
        },
      ],
      confidence: 0.85,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockArkResponse) } }],
        model: "doubao-pro-32k",
        usage: { total_tokens: 200 },
      }),
    } as Response);

    const req = makeRequest({ query: "Analyze NVDA" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.trace_id).toMatch(/^trace_/);

    const answer = (body.data as { answer: AskResponse }).answer;
    expect(answer.summary).toBe("NVDA is a leading AI chip designer");
    expect(answer.numeric_facts).toHaveLength(1);
    expect(answer.numeric_facts[0].value).toBe(487.16);
    expect(answer.intent).toBe("deep_research");
    expect(answer.cost?.model).toBe("doubao-pro-32k");
    expect(answer.cost?.credits_used).toBeGreaterThan(0);
  });

  it("should return 502 when LLM API key is missing", async () => {
    vi.stubEnv("VOLCANO_ARK_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");

    const req = makeRequest({ query: "test query" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(502);
    expect(body.error).toContain("LLM call failed");
    expect(body.trace_id).toMatch(/^trace_/);
  });

  it("should return 502 when LLM API call fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Rate limit exceeded",
      text: async () => "Rate limit exceeded",
    } as Response);

    const req = makeRequest({ query: "test query" });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(502);
    expect(body.error).toContain("LLM call failed");
  });
});
