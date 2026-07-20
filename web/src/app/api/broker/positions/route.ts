import { NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";

/**
 * GET /api/broker/positions
 * Returns all open positions for the current user.
 */

const DEMO_USER_ID = "demo_user";

export async function GET() {
  try {
    const broker = getBroker();
    const positions = await broker.listPositions(DEMO_USER_ID);
    return NextResponse.json({ count: positions.length, data: positions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
