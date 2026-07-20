/**
 * TDD Spec — Supervisor: top-level dispatcher (ADR-0004).
 *
 * Validates:
 *   - Intent routing: simple_qa/deep_research/tool_call/clarify → AskHandler
 *   - Unknown intent fallback → AskHandler
 *   - Request-scoped AgentLoop creation per dispatch
 *   - SupervisorResult includes intent and handler_type
 *   - Mock mode: full dispatch returns valid LoopResult without external calls
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoopContext, LoopResult, Plan, StepHandler, Synthesis, ExecResult, ToolCall, ToolResult } from "@/lib/agent/types";
import type { SupervisorContext, SupervisorResult } from "@/lib/agent/supervisor";
import { Supervisor } from "@/lib/agent/supervisor";
import { AskHandler } from "@/lib/agent/ask-handler";

function makeMockAnswer(intent: string) {
  return {
    summary: `Mock answer for ${intent}`,
    numeric_facts: [],
    citations: [],
    confidence: 0.85,
    intent: intent as any,
    cost: { credits_used: 0, model: "mock" },
  };
}

function makeMockHandlers(): StepHandler {
  return {
    onInit: vi.fn(async (c: LoopContext) => c),
    onPlan: vi.fn(async () => ({ steps: [] })),
    onExecute: vi.fn(async () => ({ cost_usd: 0, mock: true })),
    onToolCall: vi.fn(async (_c: LoopContext, tool: ToolCall) => ({ success: true, cost_usd: 0, result: { tool: tool.name, mock: true } })),
    onSynthesize: vi.fn(async (ctx: LoopContext, _execResult: ExecResult) => ({
      answer: makeMockAnswer(ctx.intent),
    })),
    onFinalize: vi.fn(async (ctx: LoopContext, synthesis: Synthesis) => ({
      answer: synthesis.answer,
      trace: ctx.trace,
      total_cost_usd: ctx.accumulated_cost_usd,
      steps_executed: ctx.step_count,
      status: "completed" as const,
    })),
  };
}

describe("Supervisor — intent routing", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches simple_qa to AskHandler", async () => {
    const handlers = { ask: makeMockHandlers() };
    const supervisor = new Supervisor(handlers);
    const result = await supervisor.dispatch({
      query: "AAPL current price",
      user_id: "u1",
      session_id: "s1",
    });
    expect(result.intent).toBe("simple_qa");
    expect(result.handler_type).toBe("ask");
  });

  it("dispatches deep_research to AskHandler", async () => {
    const handlers = { ask: makeMockHandlers() };
    const supervisor = new Supervisor(handlers);
    const result = await supervisor.dispatch({
      query: "analyze NVDA earnings trend",
      user_id: "u1",
      session_id: "s1",
    });
    expect(result.intent).toBe("deep_research");
    expect(result.handler_type).toBe("ask");
  });

  it("dispatches tool_call to AskHandler", async () => {
    const handlers = { ask: makeMockHandlers() };
    const supervisor = new Supervisor(handlers);
    const result = await supervisor.dispatch({
      query: "search TSLA news",
      user_id: "u1",
      session_id: "s1",
    });
    expect(result.intent).toBe("tool_call");
    expect(result.handler_type).toBe("ask");
  });

  it("dispatches clarify to AskHandler", async () => {
    const handlers = { ask: makeMockHandlers() };
    const supervisor = new Supervisor(handlers);
    const result = await supervisor.dispatch({
      query: "hello world",
      user_id: "u1",
      session_id: "s1",
    });
    expect(result.intent).toBe("clarify");
    expect(result.handler_type).toBe("ask");
  });

  it("dispatches unknown intent to AskHandler (fallback)", async () => {
    // "unknown" queries that don't match any pattern → clarify → ask
    const handlers = { ask: makeMockHandlers() };
    const supervisor = new Supervisor(handlers);
    const result = await supervisor.dispatch({
      query: "random text with no pattern",
      user_id: "u1",
      session_id: "s1",
    });
    // clarify is the fallback intent; handler is always "ask"
    expect(result.handler_type).toBe("ask");
  });
});

describe("Supervisor — request scoping", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates request-scoped AgentLoop per dispatch (no shared state)", async () => {
    const handlers = { ask: makeMockHandlers() };
    const supervisor1 = new Supervisor(handlers);
    const supervisor2 = new Supervisor(handlers);
    // Different Supervisor instances → different AgentLoop instances
    const result1 = await supervisor1.dispatch({
      query: "AAPL current price",
      user_id: "u1",
      session_id: "s1",
    });
    const result2 = await supervisor2.dispatch({
      query: "MSFT current price",
      user_id: "u1",
      session_id: "s2",
    });
    // Results are independent
    expect(result1).not.toBe(result2);
    expect(result1.answer.intent).toBe("simple_qa");
    expect(result2.answer.intent).toBe("simple_qa");
  });
});

describe("Supervisor — result shape", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes intent and handler_type in result", async () => {
    const handlers = { ask: makeMockHandlers() };
    const supervisor = new Supervisor(handlers);
    const result = await supervisor.dispatch({
      query: "analyze NVDA earnings",
      user_id: "u1",
      session_id: "s1",
    });
    expect(result).toHaveProperty("intent");
    expect(result).toHaveProperty("handler_type");
    expect(typeof result.intent).toBe("string");
    expect(typeof result.handler_type).toBe("string");
  });

  it("returns valid LoopResult fields", async () => {
    const handlers = { ask: makeMockHandlers() };
    const supervisor = new Supervisor(handlers);
    const result = await supervisor.dispatch({
      query: "AAPL current price",
      user_id: "u1",
      session_id: "s1",
    });
    expect(result).toHaveProperty("answer");
    expect(result).toHaveProperty("trace");
    expect(result).toHaveProperty("total_cost_usd");
    expect(result).toHaveProperty("steps_executed");
    expect(result).toHaveProperty("status");
  });
});

describe("Supervisor — mock mode full dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns valid LoopResult without external calls using AskHandler", async () => {
    const askHandler = new AskHandler("mock");
    const supervisor = new Supervisor({ ask: askHandler });
    const result = await supervisor.dispatch({
      query: "AAPL current price",
      user_id: "u1",
      session_id: "s1",
    });
    expect(result.status).toBe("completed");
    expect(result.intent).toBe("simple_qa");
    expect(result.handler_type).toBe("ask");
    expect(result.answer).toBeDefined();
    expect(result.answer.summary).toContain("AAPL");
    expect(result.total_cost_usd).toBe(0);
    expect(result.steps_executed).toBeGreaterThan(0);
  });

  it("returns valid LoopResult for deep_research in mock mode", async () => {
    const askHandler = new AskHandler("mock");
    const supervisor = new Supervisor({ ask: askHandler });
    const result = await supervisor.dispatch({
      query: "analyze NVDA earnings trend",
      user_id: "u1",
      session_id: "s1",
    });
    expect(result.status).toBe("completed");
    expect(result.intent).toBe("deep_research");
    expect(result.handler_type).toBe("ask");
    expect(result.answer).toBeDefined();
    expect(result.answer.summary).toContain("NVDA");
  });
});
