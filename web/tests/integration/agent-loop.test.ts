// Integration test: Agent Loop end-to-end with Mock providers
//
// This test validates the full Agent Loop flow (ADR-0004) using MockLLM
// (from ADR-0003 router.ts) and a TestAskHandler, ensuring:
// 1. Loop completes all states Init→Plan→Execute→Synthesize→FinalAnswer
// 2. Aggregate cost stays under AGGREGATE_COST_CEILING_USD ($5)
// 3. TraceStep emitted for every state transition
// 4. LoopResult.abort_reason is undefined on normal completion
// 5. citation_validation_failed aborts the loop (ADR-0004 C15 amendment)
//
// Integration scope: loop + handlers + MockLLM (no HTTP, no D1/KV/R2)
// Per ADR-0001: USE_MOCK=true must produce zero external HTTP requests.
//
// Covers: ADR-0004 (Agent Loop), ADR-0003 (LLM Routing)
// TR-IDs: TR-EP01-002, TR-EP01-003, TR-EP01-004, TR-EP01-005, TR-EP01-006, TR-EP01-009

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskResponse, QueryIntent } from "@/lib/types";
import type {
  ExecResult,
  LoopContext,
  LoopResult,
  Plan,
  StepHandler,
  Synthesis,
  ToolCall,
  ToolResult,
} from "@/lib/agent/types";
import { CitationValidationFailed } from "@/lib/agent/types";

/**
 * Build a StepHandler that integrates with MockLLM (ADR-0003) via dynamic
 * import. Each handler method is a vi.fn so tests can assert call counts.
 *
 * The handler mimics Ask Agent behavior (EP03 §2.7) at a coarse grain:
 *   - onExecute: calls llm.complete() and packages the response
 *   - onToolCall: returns a mock tool result (no real provider call needed
 *     for these ADR-0004 integration tests; provider integration is covered
 *     by ADR-0006/0016 scenarios).
 *   - onSynthesize: returns the LLM response as the synthesis answer
 */
async function buildMockHandler(opts: {
  intent: QueryIntent;
  // Per-call LLM cost (USD). MockLLM returns credits_used=0 by default;
  // this overrides the cost recorded in ExecResult.cost_usd.
  costPerCall?: number;
  // If true, onExecute sets needs_tool=true to drive a ToolCall transition.
  needsTool?: boolean;
  // If provided, onSynthesize throws CitationValidationFailed (simulates
  // ADR-0007 strict_reject mode failing on a bad citation).
  failCitations?: boolean;
  // If true, onExecute always returns needs_tool=true (infinite loop).
  infiniteToolLoop?: boolean;
  // Number of citations in the synthesized answer
  citationCount?: number;
}): Promise<{
  handler: StepHandler;
  // Tracks LLM complete() calls (mocked, not real)
  llmComplete: ReturnType<typeof vi.fn>;
}> {
  const { MockLLM } = await import("@/lib/llm/router");
  const mockLLM = new MockLLM();
  // Stub complete() to avoid hitting fetch (MockLLM.findMatchingSample
  // calls fetch for /mock/qa_samples/*.json; setup.ts stubs fetch to reject).
  const llmComplete = vi.fn(async (_query: string, intent: QueryIntent): Promise<AskResponse> => {
    const citations = Array.from({ length: opts.citationCount ?? 1 }, (_, i) => ({
      source: `Source ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      quote: `quoted fact ${i + 1}`,
    }));
    return {
      summary: `Mock answer for "${_query}" (${intent})`,
      numeric_facts: [],
      citations,
      confidence: 0.85,
      intent,
      cost: { credits_used: 0, model: "mock-qa-sample" },
    };
  });
  (mockLLM as unknown as { complete: typeof llmComplete }).complete = llmComplete;

  let callCount = 0;

  const handler: StepHandler = {
    async onInit(ctx: LoopContext): Promise<LoopContext> {
      return ctx;
    },
    async onPlan(_ctx: LoopContext): Promise<Plan> {
      return { steps: [{ intent: opts.intent }] };
    },
    async onExecute(ctx: LoopContext, _plan: Plan): Promise<ExecResult> {
      callCount++;
      const response = await mockLLM.complete(ctx.query, ctx.intent);
      const cost = opts.costPerCall ?? 0.001;
      const needsTool = opts.infiniteToolLoop || (opts.needsTool && callCount === 1);
      return {
        cost_usd: cost,
        needs_tool: needsTool,
        next_tool: needsTool
          ? { name: "search_news", parameters: { q: ctx.query } }
          : undefined,
        response,
      };
    },
    async onToolCall(_ctx: LoopContext, tool: ToolCall): Promise<ToolResult> {
      return {
        success: true,
        cost_usd: 0.001,
        result: { tool, hits: 3 },
      };
    },
    async onSynthesize(ctx: LoopContext, execResult: ExecResult): Promise<Synthesis> {
      if (opts.failCitations) {
        throw new CitationValidationFailed(
          `strict_reject: citation quote not in source document (query: "${ctx.query}")`,
        );
      }
      const response = (execResult as { response?: AskResponse }).response ?? {
        summary: "fallback",
        numeric_facts: [],
        citations: [],
        confidence: 0.5,
        intent: ctx.intent,
      };
      return { answer: response };
    },
    async onFinalize(ctx: LoopContext, synthesis: Synthesis): Promise<LoopResult> {
      return {
        answer: synthesis.answer,
        trace: ctx.trace,
        total_cost_usd: ctx.accumulated_cost_usd,
        steps_executed: ctx.step_count,
        status: "completed",
      };
    },
  };

  return { handler, llmComplete };
}

function makeCtx(query: string, intent: QueryIntent): LoopContext {
  return {
    query,
    user_id: "u1",
    session_id: "s1",
    intent,
    accumulated_cost_usd: 0,
    step_count: 0,
    trace: [],
  };
}

describe("Agent Loop integration (Mock mode)", () => {
  /**
   * Covers: ADR-0004 (Agent Loop), ADR-0003 (LLM Routing)
   * TR-IDs: TR-EP01-002, TR-EP01-003, TR-EP01-004, TR-EP01-005, TR-EP01-006, TR-EP01-009
   */
  beforeEach(() => {
    vi.resetModules();
    process.env.USE_MOCK = "true";
    process.env.ENVIRONMENT = "test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should complete full loop for simple_qa intent", async () => {
    const { AgentLoop } = await import("@/lib/agent/loop");
    const { handler, llmComplete } = await buildMockHandler({
      intent: "simple_qa",
      citationCount: 1,
    });

    const ctx = makeCtx("what is NVDA's current price?", "simple_qa");
    const loop = new AgentLoop(handler, ctx);
    const result = await loop.run();

    // Per ADR-0004 §Validation Criteria #1 — full loop completion
    expect(result.status).toBe("completed");
    expect(result.abort_reason).toBeUndefined();
    // Per ADR-0004 §反模式: aggregate cost must stay < $5
    expect(result.total_cost_usd).toBeLessThan(5);
    // Loop transitions: Init → Plan → Execute → Synthesize → FinalAnswer
    // TraceStep emitted for at least Plan, Execute, Synthesize (3+)
    expect(result.trace.length).toBeGreaterThanOrEqual(3);
    // First trace step's state should be Plan (Init doesn't emit trace)
    expect(result.trace[0].state).toBe("Plan");
    // Last trace step's state should be Synthesize (FinalAnswer doesn't emit trace)
    expect(result.trace[result.trace.length - 1].state).toBe("Synthesize");
    // Answer should have at least one citation (per EP03 §2.7 contract)
    expect(result.answer.citations.length).toBeGreaterThanOrEqual(1);
    // LLM was actually invoked (proves ADR-0003 integration)
    expect(llmComplete).toHaveBeenCalledTimes(1);
  });

  it("should abort with cost_exceeded when aggregate cost exceeds $5", async () => {
    const { AgentLoop, AGGREGATE_COST_CEILING_USD } = await import("@/lib/agent/loop");
    expect(AGGREGATE_COST_CEILING_USD).toBe(5);
    // 3 LLM calls × $2 each = $6 → exceeds $5 cap on 3rd call
    // Loop structure: Execute($2) → ToolCall($2) → Execute($2) → cost_exceeded
    const { handler, llmComplete } = await buildMockHandler({
      intent: "deep_research",
      costPerCall: 2,
      infiniteToolLoop: true, // forces continuous Execute→ToolCall→Execute→...
    });

    const ctx = makeCtx("analyze NVDA earnings trend", "deep_research");
    const loop = new AgentLoop(handler, ctx);
    const result = await loop.run();

    // Per ADR-0004 §Validation Criteria #3 — $5 ceiling
    expect(result.status).toBe("aborted");
    expect(result.abort_reason).toBe("cost_exceeded");
    expect(result.total_cost_usd).toBeGreaterThanOrEqual(AGGREGATE_COST_CEILING_USD);
    // LLM was called at least twice before hitting cap
    expect(llmComplete.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("should abort with max_steps_exceeded when steps exceed 20", async () => {
    const { AgentLoop, MAX_STEPS } = await import("@/lib/agent/loop");
    expect(MAX_STEPS).toBe(20);
    // Each cycle: Execute($0.01) → ToolCall($0.01) = $0.02 per cycle.
    // After 10 cycles (20 steps), total cost = $0.20 (well below $5 cap),
    // so max_steps fires first.
    const { handler } = await buildMockHandler({
      intent: "tool_call",
      costPerCall: 0.01,
      infiniteToolLoop: true,
    });

    const ctx = makeCtx("search for TSLA news", "tool_call");
    const loop = new AgentLoop(handler, ctx);
    const result = await loop.run();

    // Per ADR-0004 §Validation Criteria #2 — MAX_STEPS=20 hard cap
    expect(result.status).toBe("aborted");
    expect(result.abort_reason).toBe("max_steps_exceeded");
    expect(result.steps_executed).toBeLessThanOrEqual(MAX_STEPS);
    // Trace should have at least one entry per Execute and ToolCall iteration
    expect(result.trace.length).toBeGreaterThan(0);
  });

  it("should emit TraceStep for every state transition", async () => {
    const { AgentLoop } = await import("@/lib/agent/loop");
    const { handler } = await buildMockHandler({
      intent: "simple_qa",
      costPerCall: 0.001,
      citationCount: 2,
    });

    const ctx = makeCtx("what is AAPL's current price?", "simple_qa");
    const loop = new AgentLoop(handler, ctx);
    const result = await loop.run();

    // Per ADR-0004 §Validation Criteria #5 — trace aggregation
    expect(result.status).toBe("completed");

    // Each TraceStep must have required fields per EP01 ID-7 schema
    for (const step of result.trace) {
      expect(step.step_id).toEqual(expect.any(String));
      expect(typeof step.step_id).toBe("string");
      expect(step.step_id.length).toBeGreaterThan(0);
      expect(step.parent_id === null || typeof step.parent_id === "string").toBe(true);
      expect(["plan", "tool_call", "llm_call", "synthesize"]).toContain(step.type);
      expect(step.duration_ms).toBeGreaterThanOrEqual(0);
      expect(step.cost_usd).toBeGreaterThanOrEqual(0);
      expect(step.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
      expect([
        "Init", "Plan", "Execute", "ToolCall",
        "Synthesize", "FinalAnswer", "CostExceeded", "Degrade", "Aborted",
      ]).toContain(step.state);
    }

    // step_id values must be unique
    const ids = new Set(result.trace.map(s => s.step_id));
    expect(ids.size).toBe(result.trace.length);

    // parent_id chain: first is null, others chain to previous step_id
    expect(result.trace[0].parent_id).toBeNull();
    for (let i = 1; i < result.trace.length; i++) {
      expect(result.trace[i].parent_id).toBe(result.trace[i - 1].step_id);
    }

    // Cost accumulates across steps; sum of trace cost_usd == total_cost_usd
    const traceCost = result.trace.reduce((sum, s) => sum + s.cost_usd, 0);
    expect(traceCost).toBeCloseTo(result.total_cost_usd, 6);
  });

  it("should abort with citation_validation_failed when citations invalid", async () => {
    const { AgentLoop } = await import("@/lib/agent/loop");
    // Simulate ADR-0007 strict_reject mode: onSynthesize throws
    // CitationValidationFailed because a citation quote is not in the
    // source document.
    const { handler } = await buildMockHandler({
      intent: "deep_research",
      costPerCall: 0.05,
      failCitations: true,
    });

    const ctx = makeCtx("analyze NVDA earnings", "deep_research");
    const loop = new AgentLoop(handler, ctx);
    const result = await loop.run();

    // Per ADR-0004 Amendment 2026-07-19 (C15 resolution):
    // citation_validation_failed aborts the loop with status="aborted"
    expect(result.status).toBe("aborted");
    expect(result.abort_reason).toBe("citation_validation_failed");
    // Trace should show at least Plan + Execute + Synthesize transitions
    // before the abort.
    const states = result.trace.map(s => s.state);
    expect(states).toContain("Plan");
    expect(states).toContain("Execute");
    expect(states).toContain("Synthesize");
    // Answer is a placeholder per ADR-0004 §abort()
    expect(result.answer.summary).toMatch(/aborted/);
    expect(result.answer.confidence).toBe(0);
  });
});
