/**
 * GET /api/credits/balance
 *
 * Returns the user's current credit balance.
 * Phase 1: reads from in-memory store (demo user).
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateBalance } from "@/lib/credit/store";

const DEMO_USER = "demo_user";

export async function GET(_request: NextRequest) {
  const balance = getOrCreateBalance(DEMO_USER);
  return NextResponse.json({ data: balance });
}
