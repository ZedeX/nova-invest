import { NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";

/**
 * GET /api/broker/account
 * Returns the current user's paper trading account (balance, equity).
 */

const DEMO_USER_ID = "demo_user";

export async function GET() {
  try {
    const broker = getBroker();
    const account = await broker.getAccount(DEMO_USER_ID);
    const positions = await broker.listPositions(DEMO_USER_ID);
    const positionsValue = positions.reduce(
      (sum, p) => sum + p.quantity * (p.current_price ?? p.avg_price),
      0,
    );
    return NextResponse.json({
      data: {
        ...account,
        equity: account.balance + positionsValue,
        positions_value: positionsValue,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
