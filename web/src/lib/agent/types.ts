/**
 * Agent Loop types — ADR-0004 canonical interfaces.
 *
 * This file is the single source of truth for agent-loop types.
 * Do NOT modify web/src/lib/types.ts (per task constraint); agent-specific
 * types live here and re-export shared types as needed.
 *
 * Reference: docs/architecture/adr-0004-agent-loop-design.md §Key Interfaces
 */

import type { AskResponse, QueryIntent } from "../types";

// ============ Loop State Machine ============

/**
 * Canonical state names per ADR-0004 §State Machine.
 * Capitalization matches the ADR's LoopState type exactly (GDD sync).
 */
export type LoopState =
  | "Init"
  | "Plan"
  | "Execute"
  | "ToolCall"
  | "Synthesize"
  | "FinalAnswer"
  | "CostExceeded"
  | "Degrade"
  | "Aborted";

/**
 * Discriminated event union driving the FSM.
 * Event types align with ADR-0004 §Validation Criteria (max_steps_exceeded,
 * cost_exceeded, citation_validation_failed) and the natural transition
 * names (plan_ready, execute_start, tool_call, tool_done, synthesize,
 * final_answer).
 */
export type TransitionEvent =
  | { type: "plan_ready" }
  | { type: "execute_start" }
  | { type: "tool_call" }
  | { type: "tool_done" }
  | { type: "synthesize" }
  | { type: "final_answer" }
  | { type: "max_steps_exceeded" }
  | { type: "cost_exceeded" }
  | { type: "citation_validation_failed" };

// ============ Loop Context & Result ============

/**
 * Per-step trace entry. Shape per ADR-0004 §Key Interfaces (EP01 ID-7).
 */
export interface TraceStep {
  step_id: string;
  parent_id: string | null;
  type: "plan" | "tool_call" | "llm_call" | "synthesize";
  input: unknown;
  output: unknown;
  duration_ms: number;
  cost_usd: number;
  state: LoopState;
  timestamp: string;
}

/**
 * Request-scoped loop state. NEVER cached at module level (ADR-0001 FP-0001).
 */
export interface LoopContext {
  query: string;
  user_id: string;
  session_id: string;
  intent: QueryIntent;
  accumulated_cost_usd: number;
  step_count: number;
  trace: TraceStep[];
}

/**
 * Result returned by AgentLoop.run().
 * Per ADR-0004 §Key Interfaces (LoopResult).
 */
export interface LoopResult {
  answer: AskResponse;
  trace: TraceStep[];
  total_cost_usd: number;
  steps_executed: number;
  status: "completed" | "aborted" | "partial";
  abort_reason?:
    | "max_steps_exceeded"
    | "cost_exceeded"
    | "all_tools_failed"
    | "internal_error"
    | "citation_validation_failed";
}

// ============ Step Handler (injected by Sub-Agent) ============

export interface Plan {
  steps?: unknown[];
  [k: string]: unknown;
}

export interface ExecResult {
  cost_usd: number;
  needs_tool?: boolean;
  next_tool?: ToolCall;
  [k: string]: unknown;
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  cost_usd?: number;
  result?: unknown;
  error?: string;
  [k: string]: unknown;
}

export interface Synthesis {
  answer: AskResponse;
  [k: string]: unknown;
}

/**
 * StepHandler — injected by Sub-Agent (Ask/Build/Dashboard).
 * Per ADR-0004 §Critical Implementation Rules #2: handlers are stateless.
 */
export interface StepHandler {
  onInit(ctx: LoopContext): Promise<LoopContext>;
  onPlan(ctx: LoopContext): Promise<Plan>;
  onExecute(ctx: LoopContext, plan: Plan): Promise<ExecResult>;
  onToolCall(ctx: LoopContext, tool: ToolCall): Promise<ToolResult>;
  onSynthesize(ctx: LoopContext, execResult: ExecResult): Promise<Synthesis>;
  onFinalize(ctx: LoopContext, synthesis: Synthesis): Promise<LoopResult>;
}

// ============ Errors ============

/**
 * Thrown by transition() when an event is not valid for the current state.
 * Per docs/tdd/01-unit-tests.md ADR-0004 §10.
 */
export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: LoopState,
    public readonly eventType: string,
  ) {
    super(`Illegal transition: state="${from}", event="${eventType}"`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Thrown by citation validation (ADR-0007 §Citation Validation Pipeline).
 * Per ADR-0004 Amendment 2026-07-19 (C15): the loop's onSynthesize handler
 * catches this and converts it via abort("citation_validation_failed").
 *
 * Placeholder until ADR-0007 ships; the loop catches by `name` to stay
 * decoupled from ADR-0007's exact implementation.
 */
export class CitationValidationFailed extends Error {
  constructor(message = "citation validation failed") {
    super(message);
    this.name = "CitationValidationFailed";
  }
}
