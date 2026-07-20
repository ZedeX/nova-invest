import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import type { OrderRequest, OrderStatus, OrderType, OrderSide } from "@/lib/broker/types";

/**
 * /api/broker/orders
 * - GET  : list orders (optional ?status=pending|filled|cancelled|rejected)
 * - POST : place a new order
 */

const DEMO_USER_ID = "demo_user";

export async function GET(request: NextRequest) {
  try {
    const broker = getBroker();
    const status = request.nextUrl.searchParams.get("status") as OrderStatus | null;
    const orders = await broker.listOrders(DEMO_USER_ID, status ?? undefined);
    return NextResponse.json({ count: orders.length, data: orders });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<OrderRequest>;

    // Validate required fields
    if (!body.ticker || !body.side || !body.type || body.quantity === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: ticker, side, type, quantity" },
        { status: 400 },
      );
    }

    // Validate enums
    const validSides: OrderSide[] = ["buy", "sell"];
    const validTypes: OrderType[] = ["market", "limit", "stop", "stop_limit"];
    if (!validSides.includes(body.side)) {
      return NextResponse.json({ error: `Invalid side: ${body.side}` }, { status: 400 });
    }
    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: `Invalid type: ${body.type}` }, { status: 400 });
    }
    if (body.quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be > 0" }, { status: 400 });
    }

    // Validate limit/stop prices
    if ((body.type === "limit" || body.type === "stop_limit") && body.limit_price === undefined) {
      return NextResponse.json({ error: "limit_price required for limit/stop_limit orders" }, { status: 400 });
    }
    if ((body.type === "stop" || body.type === "stop_limit") && body.stop_price === undefined) {
      return NextResponse.json({ error: "stop_price required for stop/stop_limit orders" }, { status: 400 });
    }

    const broker = getBroker();
    const result = await broker.placeOrder(DEMO_USER_ID, {
      ticker: body.ticker,
      side: body.side,
      type: body.type,
      quantity: body.quantity,
      limit_price: body.limit_price,
      stop_price: body.stop_price,
      strategy_id: body.strategy_id,
    });

    const statusCode = result.status === "rejected" ? 422 : 201;
    return NextResponse.json({ data: result }, { status: statusCode });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
