/**
 * TDD Spec — ADR-0004: Agent Loop State Machine
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0004-agent-loop-design.md
 *
 * Section layout:
 *   1. transition() — pure FSM transition function (per docs/tdd/01-unit-tests.md ADR-0004)
 *   2. AgentLoop class — config + run() behavior + caps + trace
 *
 * Convention: state names use the ADR-0004 canonical LoopState type
 * (capitalized: "Init" | "Plan" | "Execute" | ...).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ADR-0004: Agent Loop state machine", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- §transition() pure FSM function ----------
  //
  // Per docs/tdd/01-unit-tests.md ADR-0004 section:
  // The pure state-transition function `transition(state, event) → state`
  // is extracted from the loop so unit testing is trivial.

  describe("transition() — legal transitions", () => {
    it("transition('Init', { type: 'plan_ready' }) returns 'Plan'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("Init", { type: "plan_ready" })).toBe("Plan");
    });

    it("transition('Plan', { type: 'execute_start' }) returns 'Execute'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("Plan", { type: "execute_start" })).toBe("Execute");
    });

    it("transition('Execute', { type: 'tool_call' }) returns 'ToolCall'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("Execute", { type: "tool_call" })).toBe("ToolCall");
    });

    it("transition('ToolCall', { type: 'tool_done' }) returns 'Execute'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("ToolCall", { type: "tool_done" })).toBe("Execute");
    });

    it("transition('Execute', { type: 'synthesize' }) returns 'Synthesize'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("Execute", { type: "synthesize" })).toBe("Synthesize");
    });

    it("transition('Synthesize', { type: 'final_answer' }) returns 'FinalAnswer'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("Synthesize", { type: "final_answer" })).toBe("FinalAnswer");
    });

    it("transition('Execute', { type: 'max_steps_exceeded' }) returns 'Aborted'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("Execute", { type: "max_steps_exceeded" })).toBe("Aborted");
    });

    it("transition('Execute', { type: 'cost_exceeded' }) returns 'Aborted'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("Execute", { type: "cost_exceeded" })).toBe("Aborted");
    });

    it("transition('Synthesize', { type: 'citation_validation_failed' }) returns 'Aborted'", async () => {
      const { transition } = await import("@/lib/agent/loop");
      expect(transition("Synthesize", { type: "citation_validation_failed" })).toBe("Aborted");
    });
  });

  describe("transition() — illegal transitions", () => {
    it("throws IllegalTransitionError on Init → execute_start (skipping Plan)", async () => {
      const { transition } = await import("@/lib/agent/loop");
      const { IllegalTransitionError } = await import("@/lib/agent/types");
      expect(() => transition("Init", { type: "execute_start" })).toThrow(IllegalTransitionError);
    });
  });

  // ---------- §Constants ----------

  describe("constants — ADR-0004 §反模式 hard limits", () => {
    it("MAX_STEPS === 20", async () => {
      const { MAX_STEPS } = await import("@/lib/agent/loop");
      expect(MAX_STEPS).toBe(20);
    });

    it("AGGREGATE_COST_CEILING_USD === 5", async () => {
      const { AGGREGATE_COST_CEILING_USD } = await import("@/lib/agent/loop");
      expect(AGGREGATE_COST_CEILING_USD).toBe(5);
    });

    it("TOOL_RETRY_LIMIT === 3", async () => {
      const { TOOL_RETRY_LIMIT } = await import("@/lib/agent/loop");
      expect(TOOL_RETRY_LIMIT).toBe(3);
    });
  });

  // ---------- §AgentLoop class ----------

  describe("AgentLoop — constructor", () => {
    it("constructs with handlers + ctx (no module-level cache)", async () => {
      const { AgentLoop } = await import("@/lib/agent/loop");
      const handlers = {
        onInit: vi.fn(async (c: any) => c),
        onPlan: vi.fn(async () => ({})),
        onExecute: vi.fn(async () => ({ cost_usd: 0 })),
        onToolCall: vi.fn(async () => ({ success: true })),
        onSynthesize: vi.fn(async () => ({ answer: {} }) as any),
        onFinalize: vi.fn(async () => ({}) as any),
      };
      const ctx = {
        query: "test",
        user_id: "u1",
        session_id: "s1",
        intent: "simple_qa" as const,
        accumulated_cost_usd: 0,
        step_count: 0,
        trace: [],
      };
      const loop1 = new AgentLoop(handlers, ctx);
      const loop2 = new AgentLoop(handlers, { ...ctx });
      expect(loop1).not.toBe(loop2); // request-scoped, not cached
    });
  });

  describe("AgentLoop.run() — happy path", () => {
    it("returns LoopResult with answer/trace/total_cost_usd/steps_executed/status", async () => {
      const { AgentLoop } = await import("@/lib/agent/loop");
      const mockAnswer = {
        summary: "NVDA earnings strong",
        numeric_facts: [],
        citations: [{ source: "Yahoo", url: "https://yahoo.com", quote: "NVDA beat" }],
        confidence: 0.9,
        intent: "deep_research" as const,
        cost: { credits_used: 1, model: "mock" },
      };
      const handlers = {
        onInit: vi.fn(async (c: any) => c),
        onPlan: vi.fn(async () => ({ steps: [] })),
        onExecute: vi.fn(async () => ({ cost_usd: 0.5, needs_tool: false })),
        onToolCall: vi.fn(),
        onSynthesize: vi.fn(async () => ({ answer: mockAnswer })),
        onFinalize: vi.fn(async (_c: any, s: any) => ({
          answer: s.answer,
          trace: _c.trace,
          total_cost_usd: _c.accumulated_cost_usd,
          steps_executed: _c.step_count,
          status: "completed" as const,
        })),
      };
      const ctx = {
        query: "analyze NVDA earnings",
        user_id: "u1",
        session_id: "s1",
        intent: "deep_research" as const,
        accumulated_cost_usd: 0,
        step_count: 0,
        trace: [],
      };
      const loop = new AgentLoop(handlers as any, ctx);
      const result = await loop.run();
      expect(result.status).toBe("completed");
      expect(result.abort_reason).toBeUndefined();
      expect(result.answer).toEqual(mockAnswer);
      expect(result.trace.length).toBeGreaterThanOrEqual(2);
      expect(result.total_cost_usd).toBe(0.5);
      expect(result.steps_executed).toBeGreaterThan(0);
    });
  });

  describe("AgentLoop.run() — max_steps cap", () => {
    it("aborts with max_steps_exceeded when step_count reaches MAX_STEPS=20", async () => {
      const { AgentLoop, MAX_STEPS } = await import("@/lib/agent/loop");
      // Force an infinite tool_call loop: execute always needs_tool, tool always succeeds
      let toolCalls = 0;
      const handlers = {
        onInit: vi.fn(async (c: any) => c),
        onPlan: vi.fn(async () => ({ steps: [] })),
        onExecute: vi.fn(async () => ({
          cost_usd: 0.01,
          needs_tool: true,
          next_tool: { name: "search", parameters: {} },
        })),
        onToolCall: vi.fn(async () => {
          toolCalls++;
          return { success: true, cost_usd: 0.01 };
        }),
        onSynthesize: vi.fn(),
        onFinalize: vi.fn(),
      };
      const ctx = {
        query: "infinite loop test",
        user_id: "u1",
        session_id: "s1",
        intent: "tool_call" as const,
        accumulated_cost_usd: 0,
        step_count: 0,
        trace: [],
      };
      const loop = new AgentLoop(handlers as any, ctx);
      const result = await loop.run();
      expect(result.status).toBe("aborted");
      expect(result.abort_reason).toBe("max_steps_exceeded");
      expect(result.steps_executed).toBeLessThanOrEqual(MAX_STEPS);
      expect(toolCalls).toBeGreaterThan(0);
    });
  });

  describe("AgentLoop.run() — aggregate cost cap", () => {
    it("aborts with cost_exceeded when accumulated_cost_usd >= $5", async () => {
      const { AgentLoop, AGGREGATE_COST_CEILING_USD } = await import("@/lib/agent/loop");
      expect(AGGREGATE_COST_CEILING_USD).toBe(5);
      // Each Execute step costs $2; tool call costs $2; loop should hit $5 cap
      const handlers = {
        onInit: vi.fn(async (c: any) => c),
        onPlan: vi.fn(async () => ({ steps: [] })),
        onExecute: vi.fn(async () => ({
          cost_usd: 2,
          needs_tool: true,
          next_tool: { name: "search", parameters: {} },
        })),
        onToolCall: vi.fn(async () => ({ success: true, cost_usd: 2 })),
        onSynthesize: vi.fn(),
        onFinalize: vi.fn(),
      };
      const ctx = {
        query: "cost cap test",
        user_id: "u1",
        session_id: "s1",
        intent: "deep_research" as const,
        accumulated_cost_usd: 0,
        step_count: 0,
        trace: [],
      };
      const loop = new AgentLoop(handlers as any, ctx);
      const result = await loop.run();
      expect(result.status).toBe("aborted");
      expect(result.abort_reason).toBe("cost_exceeded");
      expect(result.total_cost_usd).toBeGreaterThanOrEqual(AGGREGATE_COST_CEILING_USD);
    });
  });

  describe("AgentLoop.run() — trace emission", () => {
    it("emits one TraceStep per state transition with parent_id chain + state field", async () => {
      const { AgentLoop } = await import("@/lib/agent/loop");
      const mockAnswer = {
        summary: "ok",
        numeric_facts: [],
        citations: [],
        confidence: 1,
        intent: "simple_qa" as const,
      };
      const handlers = {
        onInit: vi.fn(async (c: any) => c),
        onPlan: vi.fn(async () => ({ steps: [] })),
        onExecute: vi.fn(async () => ({ cost_usd: 0.1, needs_tool: false })),
        onToolCall: vi.fn(),
        onSynthesize: vi.fn(async () => ({ answer: mockAnswer })),
        onFinalize: vi.fn(async (c: any, s: any) => ({
          answer: s.answer,
          trace: c.trace,
          total_cost_usd: c.accumulated_cost_usd,
          steps_executed: c.step_count,
          status: "completed" as const,
        })),
      };
      const ctx = {
        query: "trace test",
        user_id: "u1",
        session_id: "s1",
        intent: "simple_qa" as const,
        accumulated_cost_usd: 0,
        step_count: 0,
        trace: [],
      };
      const loop = new AgentLoop(handlers as any, ctx);
      const result = await loop.run();
      // Each TraceStep must have required fields
      for (const step of result.trace) {
        expect(step.step_id).toEqual(expect.any(String));
        expect(step.timestamp).toEqual(expect.any(String));
        expect(step.state).toEqual(expect.any(String));
        expect(step.type).toEqual(expect.any(String));
        expect(step.duration_ms).toEqual(expect.any(Number));
        expect(step.cost_usd).toEqual(expect.any(Number));
      }
      // parent_id chain: first is null, others chain to previous step_id
      expect(result.trace[0].parent_id).toBeNull();
      for (let i = 1; i < result.trace.length; i++) {
        expect(result.trace[i].parent_id).toBe(result.trace[i - 1].step_id);
      }
      // cost_usd accumulates across steps (at least one step has cost > 0)
      const totalCost = result.trace.reduce((sum, s) => sum + s.cost_usd, 0);
      expect(totalCost).toBe(result.total_cost_usd);
    });
  });
});
