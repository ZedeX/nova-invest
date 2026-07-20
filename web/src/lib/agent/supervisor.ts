/**
 * Supervisor — ADR-0004 top-level dispatcher.
 *
 * Routes user queries to the correct Sub-Agent (Ask/Build/Dashboard)
 * based on classified intent. Creates a request-scoped AgentLoop per
 * dispatch — never cached at module level.
 *
 * Reference: docs/architecture/adr-0004-agent-loop-design.md §Supervisor
 */

import type { QueryIntent } from "../types";
import type { LoopContext, LoopResult, StepHandler } from "./types";
import { AgentLoop } from "./loop";
import { classifyIntent } from "../llm/router";
import { startSpan } from "../telemetry";

// ============ Interfaces ============

export interface SupervisorContext {
  query: string;
  user_id: string;
  session_id: string;
}

export type HandlerType = "ask" | "build" | "dashboard";

export interface SupervisorResult extends LoopResult {
  intent: QueryIntent;
  handler_type: HandlerType;
}

// ============ Intent → Handler routing ============

/**
 * Map a classified QueryIntent to a HandlerType.
 *
 * Current routing (Phase 1):
 *   - simple_qa / deep_research / clarify / tool_call → ask
 *   - Future: build → build, dashboard → dashboard
 */
function routeToHandler(intent: QueryIntent): HandlerType {
  switch (intent) {
    case "simple_qa":
    case "deep_research":
    case "tool_call":
    case "clarify":
      return "ask";
    default:
      return "ask";
  }
}

// ============ Supervisor class ============

/**
 * Supervisor: request-scoped dispatcher that routes queries to Sub-Agents.
 *
 * Design rules:
 *   1. Request-scoped — new Supervisor per request, no module-level cache.
 *   2. Falls back to AskHandler for unknown intents.
 *   3. Integrates with telemetry: wraps dispatch in startSpan.
 */
export class Supervisor {
  /**
   * @param handlers - Optional handler registry keyed by HandlerType.
   *                   If omitted, the caller must set handlers before dispatch.
   */
  constructor(private handlers?: Record<string, StepHandler>) {}

  /**
   * Dispatch a user query to the correct Sub-Agent.
   *
   * Steps:
   *   1. Classify intent via classifyIntent()
   *   2. Route intent to HandlerType
   *   3. Select handler from registry (fallback: handlers.ask)
   *   4. Create request-scoped AgentLoop
   *   5. Run loop and return SupervisorResult with intent + handler_type
   */
  async dispatch(ctx: SupervisorContext): Promise<SupervisorResult> {
    const span = startSpan("supervisor.dispatch", {
      query: ctx.query,
      user_id: ctx.user_id,
      session_id: ctx.session_id,
    });

    try {
      // 1. Classify intent
      const intent = classifyIntent(ctx.query);
      span.addEvent("intent_classified", { intent });

      // 2. Route to handler type
      const handlerType = routeToHandler(intent);
      span.addEvent("handler_selected", { handler_type: handlerType });

      // 3. Select handler (fallback to "ask" if unknown)
      const handler = this.handlers?.[handlerType] ?? this.handlers?.["ask"];
      if (!handler) {
        throw new Error(`No handler registered for type "${handlerType}" and no "ask" fallback`);
      }

      // 4. Create request-scoped AgentLoop
      const loopCtx: LoopContext = {
        query: ctx.query,
        user_id: ctx.user_id,
        session_id: ctx.session_id,
        intent,
        accumulated_cost_usd: 0,
        step_count: 0,
        trace: [],
      };

      const loop = new AgentLoop(handler, loopCtx);

      // 5. Run loop
      const loopResult = await loop.run();

      const result: SupervisorResult = {
        ...loopResult,
        intent,
        handler_type: handlerType,
      };

      span.end({
        intent,
        handler_type: handlerType,
        status: result.status,
      });

      return result;
    } catch (e) {
      span.setError({
        error: e instanceof Error ? e.message : String(e),
      });
      span.end({ status: "error" });
      throw e;
    }
  }
}
