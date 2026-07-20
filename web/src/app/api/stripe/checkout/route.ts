/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for Pro/Team subscription.
 * Returns { sessionId, url } for client-side redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { StripeClient } from "@/lib/stripe/client";

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "Stripe secret key not configured" },
      { status: 500 },
    );
  }

  let body: { plan?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { plan, userId } = body;
  if (!plan || !userId) {
    return NextResponse.json(
      { error: "Missing required fields: plan, userId" },
      { status: 400 },
    );
  }

  if (plan !== "pro" && plan !== "team") {
    return NextResponse.json(
      { error: "Invalid plan. Must be 'pro' or 'team'." },
      { status: 400 },
    );
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const client = new StripeClient(secretKey);

  try {
    const result = await client.createCheckoutSession({
      plan,
      userId,
      successUrl: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/billing?canceled=true`,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout session creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
