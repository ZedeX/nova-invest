/**
 * GET /api/credits/transactions
 *
 * Returns the user's credit transaction history.
 * Query params: from, to, limit, offset
 */

import { NextRequest, NextResponse } from "next/server";
import { listTransactions } from "@/lib/credit/store";

const DEMO_USER = "demo_user";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const result = listTransactions(DEMO_USER, from, to, limit, offset);
  return NextResponse.json({
    data: result.transactions,
    total: result.total,
    limit,
    offset,
  });
}
