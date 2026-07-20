/**
 * TDD Spec — AskHandler: StepHandler for the Ask Sub-Agent (EP03 §2.7).
 *
 * Validates:
 *   - onInit sets intent correctly in context
 *   - onPlan returns empty plan for simple_qa
 *   - onPlan returns multi-step plan for deep_research
 *   - Mock mode: onSynthesize returns mock answer
 *   - Mock mode: full AskHandler loop completes without external calls
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoopContext, Plan, ExecResult, ToolCall, Synthesis } from "@/lib/agent/types";
import { AskHandler, mockAskResponse } from "@/lib/agent/ask-handler";
import { AgentLoop } from "@/lib/agent/loop";

function makeLoopCtx(overrides?: Partial<LoopContext>): LoopContext {
  return {
    query: "AAPL current price",
    user_id: "u1",
    session_id: "s1",
    intent: "simple_qa",
    accumulated_cost_usd: 0,
    step_count: 0,
    trace: [],
    ...overrides,
  };
}

describe("AskHandler — onInit", () => {
  it("sets intent correctly in context (simple_qa)", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "simple_qa" });
    const result = await handler.onInit(ctx);
    expect(result.intent).toBe("simple_qa");
  });

  it("sets intent correctly in context (deep_research)", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "deep_research", query: "analyze NVDA" });
    const result = await handler.onInit(ctx);
    expect(result.intent).toBe("deep_research");
  });

  it("preserves context fields through onInit", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx();
    const result = await handler.onInit(ctx);
    expect(result.query).toBe(ctx.query);
    expect(result.user_id).toBe(ctx.user_id);
    expect(result.session_id).toBe(ctx.session_id);
  });
});

describe("AskHandler — onPlan", () => {
  it("returns empty plan for simple_qa in mock mode", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "simple_qa" });
    const plan = await handler.onPlan(ctx);
    expect(plan.steps).toEqual([]);
  });

  it("returns empty plan for simple_qa in real mode", async () => {
    const handler = new AskHandler("real");
    const ctx = makeLoopCtx({ intent: "simple_qa" });
    const plan = await handler.onPlan(ctx);
    expect(plan.steps).toEqual([]);
  });

  it("returns multi-step plan for deep_research in real mode", async () => {
    const handler = new AskHandler("real");
    const ctx = makeLoopCtx({ intent: "deep_research", query: "analyze NVDA" });
    const plan = await handler.onPlan(ctx);
    expect(plan.steps).toBeDefined();
    expect((plan.steps as unknown[]).length).toBeGreaterThan(1);
  });

  it("returns empty plan for deep_research in mock mode (skips planning)", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "deep_research", query: "analyze NVDA" });
    const plan = await handler.onPlan(ctx);
    // Mock mode always returns empty plan
    expect(plan.steps).toEqual([]);
  });
});

describe("AskHandler — onExecute (mock mode)", () => {
  it("returns immediately with mock flag, no LLM call", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "simple_qa" });
    const plan = await handler.onPlan(ctx);
    const result = await handler.onExecute(ctx, plan);
    expect(result.cost_usd).toBe(0);
    expect(result.mock).toBe(true);
  });
});

describe("AskHandler — onToolCall (mock mode)", () => {
  it("returns mock data", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "tool_call" });
    const tool: ToolCall = { name: "get_klines", parameters: { symbol: "AAPL" } };
    const result = await handler.onToolCall(ctx, tool);
    expect(result.success).toBe(true);
    expect(result.cost_usd).toBe(0);
    expect(result.result).toEqual({ tool: "get_klines", mock: true });
  });
});

describe("AskHandler — onSynthesize (mock mode)", () => {
  it("returns mock answer using mockAskResponse", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "simple_qa", query: "AAPL current price" });
    const execResult: ExecResult = { cost_usd: 0, mock: true };
    const synthesis = await handler.onSynthesize(ctx, execResult);
    expect(synthesis.answer).toBeDefined();
    expect(synthesis.answer.summary).toContain("AAPL");
    expect(synthesis.answer.confidence).toBeGreaterThan(0);
  });

  it("mockAskResponse returns fallback for non-matching query", () => {
    const response = mockAskResponse("what is the meaning of life", "clarify");
    expect(response.confidence).toBeLessThan(0.5);
    expect(response.numeric_facts).toEqual([]);
  });

  it("mockAskResponse returns data for known symbol", () => {
    const response = mockAskResponse("NVDA current price", "simple_qa");
    expect(response.summary).toContain("NVDA");
    expect(response.numeric_facts.length).toBeGreaterThan(0);
    expect(response.citations.length).toBeGreaterThan(0);
  });
});

describe("AskHandler — onFinalize", () => {
  it("returns LoopResult with status completed", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "simple_qa" });
    const synthesis: Synthesis = {
      answer: {
        summary: "Test answer",
        numeric_facts: [],
        citations: [],
        confidence: 0.85,
        intent: "simple_qa",
        cost: { credits_used: 0, model: "mock" },
      },
    };
    const result = await handler.onFinalize(ctx, synthesis);
    expect(result.status).toBe("completed");
    expect(result.answer).toEqual(synthesis.answer);
    expect(result.trace).toEqual(ctx.trace);
    expect(result.total_cost_usd).toBe(ctx.accumulated_cost_usd);
    expect(result.steps_executed).toBe(ctx.step_count);
  });
});

describe("AskHandler — full loop in mock mode", () => {
  it("completes the full AgentLoop without external calls", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "simple_qa", query: "AAPL current price" });
    const loop = new AgentLoop(handler, ctx);
    const result = await loop.run();
    expect(result.status).toBe("completed");
    expect(result.answer).toBeDefined();
    expect(result.answer.summary).toContain("AAPL");
    expect(result.total_cost_usd).toBe(0);
    expect(result.steps_executed).toBeGreaterThan(0);
  });

  it("completes deep_research loop in mock mode", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "deep_research", query: "analyze NVDA earnings" });
    const loop = new AgentLoop(handler, ctx);
    const result = await loop.run();
    expect(result.status).toBe("completed");
    expect(result.answer).toBeDefined();
    expect(result.answer.summary).toContain("NVDA");
  });

  it("completes tool_call loop in mock mode", async () => {
    const handler = new AskHandler("mock");
    const ctx = makeLoopCtx({ intent: "tool_call", query: "search TSLA news" });
    const loop = new AgentLoop(handler, ctx);
    const result = await loop.run();
    expect(result.status).toBe("completed");
    expect(result.answer).toBeDefined();
  });
});
