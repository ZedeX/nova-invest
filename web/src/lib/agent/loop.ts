/**
 * Agent Loop — ADR-0004 canonical implementation.
 *
 * Reference: docs/architecture/adr-0004-agent-loop-design.md
 *
 * Design rules (per ADR §Critical Implementation Rules):
 *   1. Request-scoped only — `new AgentLoop(handlers, ctx)` per user query.
 *   2. Handlers are stateless — all state flows through LoopContext.
 *   3. Per-call cost enforcement is ADR-0003's job; this loop only enforces
 *      the AGGREGATE ceiling.
 *   4. Tool source-switching is tool-internal (EP02 ID-4); loop only retries.
 *   5. Sub-Agent dispatch goes through Supervisor.
 */

import {
  CitationValidationFailed,
  IllegalTransitionError,
  type LoopContext,
  type LoopResult,
  type LoopState,
  type StepHandler,
  type Synthesis,
  type ToolCall,
  type ToolResult,
  type TraceStep,
  type TransitionEvent,
} from "./types";

// ============ Constants — ADR-0004 §反模式 hard limits ============

export const MAX_STEPS = 20;
export const AGGREGATE_COST_CEILING_USD = 5;
export const TOOL_RETRY_LIMIT = 3;

// ============ Pure FSM transition function ============
//
// Extracted from the loop so unit testing is trivial.
// Per docs/tdd/01-unit-tests.md ADR-0004 section.

const TRANSITIONS: Record<LoopState, Partial<Record<TransitionEvent["type"], LoopState>>> = {
  Init: { plan_ready: "Plan" },
  Plan: { execute_start: "Execute" },
  Execute: {
    tool_call: "ToolCall",
    synthesize: "Synthesize",
    max_steps_exceeded: "Aborted",
    cost_exceeded: "Aborted",
  },
  ToolCall: { tool_done: "Execute" },
  Synthesize: {
    final_answer: "FinalAnswer",
    citation_validation_failed: "Aborted",
  },
  FinalAnswer: {},
  CostExceeded: {},
  Degrade: {},
  Aborted: {},
};

export function transition(state: LoopState, event: TransitionEvent): LoopState {
  const next = TRANSITIONS[state]?.[event.type];
  if (!next) {
    throw new IllegalTransitionError(state, event.type);
  }
  return next;
}

// ============ AgentLoop class ============

export class AgentLoop {
  constructor(
    private handlers: StepHandler,
    private ctx: LoopContext,
  ) {}

  async run(): Promise<LoopResult> {
    let state: LoopState = "Init";
    let plan: import("./types").Plan | null = null;
    let execResult: import("./types").ExecResult | null = null;
    let lastSynthesis: Synthesis | null = null;
    // Tracks why we transitioned to "Aborted" (transition() loses the reason).
    let pendingAbortReason: LoopResult["abort_reason"] | null = null;

    while (state !== "FinalAnswer" && state !== "Aborted") {
      // Hard cap: max_steps (checked before next handler call)
      if (this.ctx.step_count >= MAX_STEPS) {
        return this.abort("max_steps_exceeded");
      }

      const stepStart = Date.now();

      try {
        switch (state) {
          case "Init": {
            this.ctx = await this.handlers.onInit(this.ctx);
            state = transition("Init", { type: "plan_ready" });
            break;
          }
          case "Plan": {
            plan = await this.handlers.onPlan(this.ctx);
            this.emitTrace("plan", null, plan, stepStart, 0, "Plan");
            state = transition("Plan", { type: "execute_start" });
            break;
          }
          case "Execute": {
            if (!plan) {
              return this.abort("internal_error");
            }
            execResult = await this.handlers.onExecute(this.ctx, plan);
            this.emitTrace(
              "plan",
              plan,
              execResult,
              stepStart,
              execResult.cost_usd ?? 0,
              "Execute",
            );
            this.ctx.accumulated_cost_usd += execResult.cost_usd ?? 0;
            if (this.ctx.accumulated_cost_usd >= AGGREGATE_COST_CEILING_USD) {
              pendingAbortReason = "cost_exceeded";
              state = transition("Execute", { type: "cost_exceeded" });
            } else if (execResult.needs_tool && execResult.next_tool) {
              state = transition("Execute", { type: "tool_call" });
            } else {
              state = transition("Execute", { type: "synthesize" });
            }
            break;
          }
          case "ToolCall": {
            if (!execResult?.next_tool) {
              return this.abort("internal_error");
            }
            const toolResult = await this.executeWithFallback(execResult.next_tool);
            this.emitTrace(
              "tool_call",
              execResult.next_tool,
              toolResult,
              stepStart,
              toolResult.cost_usd ?? 0,
              "ToolCall",
            );
            this.ctx.accumulated_cost_usd += toolResult.cost_usd ?? 0;
            if (this.ctx.accumulated_cost_usd >= AGGREGATE_COST_CEILING_USD) {
              pendingAbortReason = "cost_exceeded";
              state = transition("Execute", { type: "cost_exceeded" });
            } else if (toolResult.success) {
              state = transition("ToolCall", { type: "tool_done" });
            } else {
              // All tool retries failed — partial result via synthesize
              state = transition("Execute", { type: "synthesize" });
            }
            break;
          }
          case "Synthesize": {
            if (!execResult) {
              return this.abort("internal_error");
            }
            try {
              lastSynthesis = await this.handlers.onSynthesize(this.ctx, execResult);
            } catch (e) {
              // ADR-0004 §Risks: emit TraceStep with error before transitioning.
              this.emitTrace(
                "synthesize",
                execResult,
                { error: e instanceof Error ? e.message : String(e) },
                stepStart,
                0,
                "Synthesize",
              );
              // ADR-0004 Amendment 2026-07-19 (C15): onSynthesize handler
              // throws CitationValidationFailed when ADR-0007 validation fails.
              if (e instanceof CitationValidationFailed || (e instanceof Error && e.name === "CitationValidationFailed")) {
                pendingAbortReason = "citation_validation_failed";
                state = transition("Synthesize", { type: "citation_validation_failed" });
                break;
              }
              throw e;
            }
            this.emitTrace(
              "synthesize",
              execResult,
              lastSynthesis,
              stepStart,
              0,
              "Synthesize",
            );
            state = transition("Synthesize", { type: "final_answer" });
            break;
          }
          default:
            return this.abort("internal_error");
        }
      } catch (e) {
        // ADR-0004 §Risks: uncaught handler exception → Aborted
        if (e instanceof IllegalTransitionError) {
          throw e;
        }
        return this.abort("internal_error");
      }

      this.ctx.step_count++;
    }

    if (state === "Aborted") {
      return this.abort(pendingAbortReason ?? "internal_error");
    }

    // FinalAnswer
    if (!lastSynthesis) {
      // Defensive: synthesize was never run (e.g., direct transition). Synthesize now.
      if (!execResult) {
        return this.abort("internal_error");
      }
      lastSynthesis = await this.handlers.onSynthesize(this.ctx, execResult);
    }
    return this.handlers.onFinalize(this.ctx, lastSynthesis);
  }

  private async executeWithFallback(tool: ToolCall): Promise<ToolResult> {
    let lastResult: ToolResult = { success: false, error: "no_attempts" };
    for (let attempt = 1; attempt <= TOOL_RETRY_LIMIT; attempt++) {
      try {
        const result = await this.handlers.onToolCall(this.ctx, tool);
        if (result.success) return result;
        lastResult = result;
      } catch (e) {
        lastResult = {
          success: false,
          error: `attempt_${attempt}_threw: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
    return lastResult;
  }

  private emitTrace(
    type: TraceStep["type"],
    input: unknown,
    output: unknown,
    startMs: number,
    costUsd: number,
    state: LoopState,
  ): void {
    const lastStep = this.ctx.trace[this.ctx.trace.length - 1];
    this.ctx.trace.push({
      step_id: crypto.randomUUID(),
      parent_id: lastStep?.step_id ?? null,
      type,
      input,
      output,
      duration_ms: Date.now() - startMs,
      cost_usd: costUsd,
      state,
      timestamp: new Date().toISOString(),
    });
  }

  private abort(reason: LoopResult["abort_reason"]): LoopResult {
    return {
      answer: {
        summary: `Query aborted: ${reason}`,
        numeric_facts: [],
        citations: [],
        confidence: 0,
        intent: this.ctx.intent,
        cost: { credits_used: 0, model: "aborted" },
      },
      trace: this.ctx.trace,
      total_cost_usd: this.ctx.accumulated_cost_usd,
      steps_executed: this.ctx.step_count,
      status: "aborted",
      abort_reason: reason,
    };
  }
}
