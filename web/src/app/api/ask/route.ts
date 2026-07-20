import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "@/lib/env";
import { classifyIntent, getLLM } from "@/lib/llm/router";
import { chargeCredit } from "@/lib/credit/store";
import type { CreditAction } from "@/lib/credit/types";
import type { AskResponse, QueryIntent } from "@/lib/types";
import { startSpan, recordMetric } from "@/lib/telemetry";
import { mockAskResponse } from "@/lib/agent/ask-handler";

const DEMO_USER = "demo_user";

/**
 * Map QueryIntent to CreditAction for billing.
 * Per billing_credit_system.md §3.1:
 *   - simple_qa → ask_simple (1 Credit)
 *   - deep_research → ask_deep (5 Credit)
 *   - tool_call → ask_tool_call (2 Credit)
 *   - clarify → ask_simple (1 Credit, cheapest)
 */
function intentToCreditAction(intent: QueryIntent): CreditAction {
  switch (intent) {
    case "deep_research": return "ask_deep";
    case "tool_call": return "ask_tool_call";
    case "simple_qa":
    case "clarify":
    default: return "ask_simple";
  }
}

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

export async function POST(request: NextRequest) {
  const trace_id = makeTraceId();
  const span = startSpan("api.ask", { trace_id });

  try {
    const body = (await request.json()) as AskRequest;

    if (!body.query) {
      span.end({ status_code: 400 });
      return NextResponse.json(
        { error: "Missing required field: query", trace_id },
        { status: 400 },
      );
    }

    // Classify intent (shared between Mock and Real modes)
    const intent = classifyIntent(body.query);
    span.addEvent("intent_classified", { intent });

    // Charge credits per billing_credit_system.md §3.1
    // Mock mode → 0 charge; Real mode → per action cost
    const mock = isMockMode();
    const creditAction = intentToCreditAction(intent);
    const chargeResult = chargeCredit(DEMO_USER, creditAction, mock, {
      query: body.query,
      session_id: body.session_id,
    });

    // Record credit metric
    recordMetric("credits.charged", chargeResult.amount, "counter", {
      action: creditAction,
      degraded: String(chargeResult.degraded),
      degradation_level: chargeResult.degradation_level,
    });

    if (!chargeResult.ok) {
      span.setError({ reason: "credit_exhausted" });
      span.end({ status_code: 402 });
      return NextResponse.json(
        {
          error: chargeResult.reason ?? "Credit exhausted",
          trace_id,
          degraded: true,
          degradation_level: chargeResult.degradation_level,
        },
        { status: 402 },
      );
    }

    let answer: AskResponse;

    if (isMockMode()) {
      // Mock mode: return pre-written responses (no LLM call)
      answer = mockAskResponse(body.query, intent);
    } else {
      // Real mode: route through LLM (ADR-0003)
      // Phase 1.5: pass degradation_level from credit billing to LLM router
      // When degraded → pro→lite model swap; when mock_only → force MockLLM
      try {
        const llmSpan = startSpan("llm.complete", { intent, degradation_level: chargeResult.degradation_level }, span);
        const llm = getLLM(intent, undefined, chargeResult.degradation_level);
        answer = await llm.complete(body.query, intent);
        llmSpan.end({
          model: answer.cost?.model ?? "unknown",
          credits_used: answer.cost?.credits_used ?? 0,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        span.setError({ error: message });
        span.end({ status_code: 502 });
        return NextResponse.json(
          {
            error: `LLM call failed: ${message}`,
            trace_id,
          },
          { status: 502 },
        );
      }
    }

    span.end({
      intent,
      mock_mode: String(mock),
      credits_used: answer.cost?.credits_used ?? 0,
      degradation_level: chargeResult.degradation_level,
    });

    return NextResponse.json({
      data: { answer },
      trace_id,
      credits: {
        charged: chargeResult.amount,
        remaining: chargeResult.remaining,
        degraded: chargeResult.degraded,
        degradation_level: chargeResult.degradation_level,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    span.setError({ error: message });
    span.end({ status_code: 500 });
    return NextResponse.json(
      { error: message, trace_id },
      { status: 500 },
    );
  }
}
