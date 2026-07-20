/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events:
 *   - checkout.session.completed → upgrade user plan
 *   - customer.subscription.updated → update plan
 *   - customer.subscription.deleted → downgrade to free
 *   - invoice.payment_failed → flag account
 */

import { NextRequest, NextResponse } from "next/server";
import { StripeClient } from "@/lib/stripe/client";
import { changePlan } from "@/lib/credit/store";

/** Subset of Stripe event fields we need */
interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: {
      metadata?: {
        user_id?: string;
        plan?: string;
      };
      subscription?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 500 },
    );
  }

  const payload = await request.text();
  const sigHeader = request.headers.get("Stripe-Signature") ?? "";

  // Parse v1 signature and timestamp from header
  const signaturePart = sigHeader.split(",").find((p) => p.startsWith("v1="));
  const timestampPart = sigHeader.split(",").find((p) => p.startsWith("t="));

  if (!signaturePart || !timestampPart) {
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 },
    );
  }

  const signature = signaturePart.slice(3);
  const timestamp = timestampPart.slice(2);

  // Verify webhook signature using webhook secret (not secretKey)
  const client = new StripeClient(webhookSecret);
  const isValid = await client.verifyWebhookSignature(payload, signature, timestamp);

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 },
    );
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 },
    );
  }

  const metadata = event.data.object.metadata;
  const userId = metadata?.user_id;
  const plan = metadata?.plan;

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.updated": {
      if (!userId || !plan) break;
      changePlan(userId, plan as "pro" | "team");
      break;
    }
    case "customer.subscription.deleted": {
      if (!userId) break;
      changePlan(userId, "free");
      break;
    }
    case "invoice.payment_failed": {
      // Log but don't change plan — Stripe will retry per schedule
      console.warn(`Payment failed for user ${userId ?? "unknown"}, subscription ${event.data.object.subscription ?? "unknown"}`);
      break;
    }
    default:
      // Unhandled event type — acknowledge but ignore
      break;
  }

  return NextResponse.json({ received: true });
}
