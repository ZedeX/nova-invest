/**
 * POST /api/credits/charge
 *
 * Charge credits for an action.
 * Mock mode: 0 credit consumption.
 * Degradation chain: normal → degraded → mock_only.
 *
 * Request body: { action: CreditAction, metadata?: object }
 */

import { NextRequest, NextResponse } from "next/server";
import { chargeCredit } from "@/lib/credit/store";
import { isMockMode } from "@/lib/env";
import type { CreditAction } from "@/lib/credit/types";
import { ACTION_COSTS } from "@/lib/credit/types";

const DEMO_USER = "demo_user";

export async function POST(request: NextRequest) {
  let body: { action?: string; metadata?: object };
  try {
    body = await request.json() as { action?: string; metadata?: object };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, metadata } = body;

  if (!action) {
    return NextResponse.json({ error: "Missing required field: action" }, { status: 400 });
  }

  // Validate action
  if (!(action in ACTION_COSTS)) {
    return NextResponse.json(
      { error: `Unknown action: ${action}. Valid: ${Object.keys(ACTION_COSTS).join(", ")}` },
      { status: 400 },
    );
  }

  const mock = isMockMode();
  const result = chargeCredit(DEMO_USER, action as CreditAction, mock, metadata);

  if (!result.ok) {
    return NextResponse.json(
      {
        data: {
          ok: false,
          amount: result.amount,
          remaining: result.remaining,
          degraded: result.degraded,
          degradation_level: result.degradation_level,
          reason: result.reason,
        },
      },
      { status: 402 }, // Payment Required
    );
  }

  return NextResponse.json({ data: result }, { status: 200 });
}
