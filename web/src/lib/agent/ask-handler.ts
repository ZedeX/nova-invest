/**
 * AskHandler — StepHandler implementation for the Ask Sub-Agent (EP03 §2.7).
 *
 * Implements the full ADR-0004 step lifecycle:
 *   onInit → onPlan → onExecute → onToolCall → onSynthesize → onFinalize
 *
 * Two modes:
 *   - mock:  returns pre-written responses, no LLM/API calls
 *   - real:  routes through LLM, calls MarketDataProvider for tools
 *
 * Reference: docs/prd/epic/03_Ask_Agent.md
 *            docs/architecture/adr-0004-agent-loop-design.md
 */

import type { AskResponse, Citation, NumericFact, QueryIntent } from "../types";
import type { DegradationLevel } from "../credit/types";
import type {
  ExecResult,
  LoopContext,
  LoopResult,
  Plan,
  StepHandler,
  Synthesis,
  ToolCall,
  ToolResult,
} from "./types";

// ============ Mock Ask Response ============

/**
 * Mock Ask response generator.
 * Returns pre-written responses for common queries about the 10 mock symbols.
 *
 * Extracted from /api/ask/route.ts so it can be shared by both
 * the route handler and the AskHandler in mock mode.
 */
export function mockAskResponse(query: string, intent: QueryIntent): AskResponse {
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

// ============ Deep Research Plan Steps ============

const DEEP_RESEARCH_STEPS = [
  { id: "retrieve_fundamentals", description: "Retrieve fundamental data" },
  { id: "retrieve_news", description: "Retrieve recent news" },
  { id: "retrieve_technicals", description: "Retrieve technical indicators" },
  { id: "synthesize", description: "Synthesize multi-source analysis" },
];

// ============ AskHandler class ============

/**
 * AskHandler implements StepHandler for the Ask Sub-Agent.
 *
 * Mock mode: all LLM/tool calls are skipped, returns pre-written responses.
 * Real mode: routes through getLLM() and MarketDataProvider.
 */
export class AskHandler implements StepHandler {
  constructor(
    private mode: "mock" | "real",
    private degradationLevel?: DegradationLevel,
  ) {}

  // ---- onInit ----

  async onInit(ctx: LoopContext): Promise<LoopContext> {
    // Intent is already classified by the Supervisor and set in ctx.
    // In real mode, we would load memory and set up LLM here.
    return ctx;
  }

  // ---- onPlan ----

  async onPlan(ctx: LoopContext): Promise<Plan> {
    if (this.mode === "mock") {
      // Mock mode: simple_qa skips planning; return empty plan
      return { steps: [] };
    }

    // Real mode: return step plan based on intent
    if (ctx.intent === "deep_research") {
      return { steps: DEEP_RESEARCH_STEPS };
    }

    // simple_qa / tool_call / clarify: no multi-step plan needed
    return { steps: [] };
  }

  // ---- onExecute ----

  async onExecute(_ctx: LoopContext, _plan: Plan): Promise<ExecResult> {
    if (this.mode === "mock") {
      // Mock mode: return immediately, no LLM call
      return { cost_usd: 0, mock: true };
    }

    // Real mode: call LLM with query
    // Phase 2: implement RealLLM.complete() integration here
    return { cost_usd: 0.01 };
  }

  // ---- onToolCall ----

  async onToolCall(_ctx: LoopContext, tool: ToolCall): Promise<ToolResult> {
    if (this.mode === "mock") {
      // Mock mode: return mock data
      return { success: true, cost_usd: 0, result: { tool: tool.name, mock: true } };
    }

    // Real mode: delegate to MarketDataProvider for data tools
    // Phase 2: implement provider.getKlines() integration here
    return { success: true, cost_usd: 0.01 };
  }

  // ---- onSynthesize ----

  async onSynthesize(ctx: LoopContext, _execResult: ExecResult): Promise<Synthesis> {
    if (this.mode === "mock") {
      // Mock mode: use mockAskResponse
      const answer = mockAskResponse(ctx.query, ctx.intent);
      return { answer };
    }

    // Real mode: validate citations and format answer
    // Phase 2: implement citation validation (ADR-0007) here
    const answer: AskResponse = {
      summary: `Analysis for: ${ctx.query}`,
      numeric_facts: [],
      citations: [],
      confidence: 0.7,
      intent: ctx.intent,
      cost: { credits_used: 1, model: "real" },
    };
    return { answer };
  }

  // ---- onFinalize ----

  async onFinalize(ctx: LoopContext, synthesis: Synthesis): Promise<LoopResult> {
    // Phase 2: save to memory in real mode
    return {
      answer: synthesis.answer,
      trace: ctx.trace,
      total_cost_usd: ctx.accumulated_cost_usd,
      steps_executed: ctx.step_count,
      status: "completed",
    };
  }
}
