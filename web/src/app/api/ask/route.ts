import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "@/lib/env";
import { classifyIntent, getLLM } from "@/lib/llm/router";
import type { AskResponse, Citation, NumericFact, QueryIntent } from "@/lib/types";

/**
 * POST /api/ask
 * Body: {
 *   query: string,
 *   session_id?: string,
 *   stream?: boolean
 * }
 *
 * Returns: {
 *   data: { answer: AskResponse },
 *   trace_id: string
 * }
 *
 * Per ADR-0003 + ADR-0007 + ADR-0014:
 *   - Mock mode: returns pre-written responses (no LLM call)
 *   - Real mode: classifyIntent → getLLM → RealLLM.complete()
 *     (RAG pipeline + Citation Validator integration is Phase 2)
 */

interface AskRequest {
  query: string;
  session_id?: string;
  stream?: boolean;
}

function makeTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Mock Ask response generator.
 * Returns pre-written responses for common queries about the 10 mock symbols.
 */
function mockAskResponse(query: string, intent: QueryIntent): AskResponse {
  // Simple pattern matching for common queries
  const upperQuery = query.toUpperCase();
  const symbolMatch = ["AAPL", "MSFT", "NVDA", "GOOG", "META", "AMZN", "TSLA", "NFLX", "AMD", "INTC"]
    .find(s => upperQuery.includes(s));

  if (!symbolMatch) {
    return {
      summary: `I can only answer questions about the 10 supported Mock symbols in Phase 1. Your query "${query}" did not match any of them. Try asking about AAPL, MSFT, NVDA, etc.`,
      numeric_facts: [],
      citations: [],
      confidence: 0.3,
      intent,
      cost: { credits_used: 0, model: "mock" },
    };
  }

  // Mock price data for each symbol
  const mockPrices: Record<string, { price: number; change: number }> = {
    AAPL: { price: 182.45, change: 1.23 },
    MSFT: { price: 378.91, change: -0.45 },
    NVDA: { price: 487.16, change: 5.67 },
    GOOG: { price: 142.78, change: 0.89 },
    META: { price: 352.96, change: 2.34 },
    AMZN: { price: 155.20, change: -1.12 },
    TSLA: { price: 248.50, change: 8.91 },
    NFLX: { price: 462.15, change: 1.45 },
    AMD:  { price: 143.03, change: -2.78 },
    INTC: { price: 35.67, change: 0.23 },
  };

  const data = mockPrices[symbolMatch];
  const url = `https://finance.yahoo.com/quote/${symbolMatch}`;
  const quote = `${symbolMatch} closed at $${data.price.toFixed(2)}`;

  const numeric_facts: NumericFact[] = [
    {
      value: data.price,
      unit: "USD",
      source: { source: "Yahoo Finance", url, quote },
      confidence: 0.85,
    },
  ];

  const citations: Citation[] = [
    { source: "Yahoo Finance", url, quote },
  ];

  return {
    summary: `${symbolMatch} is trading at $${data.price.toFixed(2)}. The stock ${data.change > 0 ? "gained" : "lost"} ${Math.abs(data.change).toFixed(2)} in the latest session. This is Mock data for demonstration purposes only.`,
    numeric_facts,
    citations,
    confidence: 0.85,
    intent,
    cost: { credits_used: 0, model: "mock" },
  };
}

export async function POST(request: NextRequest) {
  const trace_id = makeTraceId();

  try {
    const body = (await request.json()) as AskRequest;

    if (!body.query) {
      return NextResponse.json(
        { error: "Missing required field: query", trace_id },
        { status: 400 },
      );
    }

    // Classify intent (shared between Mock and Real modes)
    const intent = classifyIntent(body.query);

    let answer: AskResponse;

    if (isMockMode()) {
      // Mock mode: return pre-written responses (no LLM call)
      answer = mockAskResponse(body.query, intent);
    } else {
      // Real mode: route through LLM (ADR-0003)
      // Phase 2 will add RAG pipeline (ADR-0014) + Citation Validator (ADR-0007)
      try {
        const llm = getLLM(intent);
        answer = await llm.complete(body.query, intent);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          {
            error: `LLM call failed: ${message}`,
            trace_id,
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      data: { answer },
      trace_id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message, trace_id },
      { status: 500 },
    );
  }
}
