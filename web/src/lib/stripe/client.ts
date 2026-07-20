/**
 * Low-level Stripe REST API client using native fetch.
 * No external Stripe SDK — Stripe's REST API is simple enough.
 *
 * - Base URL: https://api.stripe.com/v1
 * - Auth: Bearer token
 * - Content-Type: application/x-www-form-urlencoded
 * - Webhook verification: HMAC-SHA256 via crypto.subtle
 */

import type { CheckoutSessionParams, CheckoutSessionResult } from "./types";
import { PLAN_PRICES } from "./types";

const STRIPE_BASE = "https://api.stripe.com/v1";

/** Stripe API error shape */
interface StripeApiError {
  error?: {
    message?: string;
    type?: string;
  };
}

export class StripeClient {
  constructor(private secretKey: string) {}

  /** POST to Stripe API with form-encoded body */
  async post<T>(path: string, body: Record<string, string>): Promise<T> {
    const formBody = Object.entries(body)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const res = await fetch(`${STRIPE_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    if (!res.ok) {
      const err: StripeApiError = await res.json();
      throw new Error(
        `Stripe API error ${res.status}: ${err.error?.message ?? "unknown"}`,
      );
    }

    return res.json() as Promise<T>;
  }

  /** GET from Stripe API */
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${STRIPE_BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
      },
    });

    if (!res.ok) {
      const err: StripeApiError = await res.json();
      throw new Error(
        `Stripe API error ${res.status}: ${err.error?.message ?? "unknown"}`,
      );
    }

    return res.json() as Promise<T>;
  }

  /** Create a Checkout Session for subscription */
  async createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const price = PLAN_PRICES[params.plan];
    if (!price) {
      throw new Error(`Unknown plan: ${params.plan}`);
    }

    // Stripe Checkout Sessions API form fields
    const body: Record<string, string> = {
      "mode": "subscription",
      "line_items[0][price_data][currency]": price.currency,
      "line_items[0][price_data][product_data][name]": price.name,
      "line_items[0][price_data][recurring][interval]": price.interval,
      "line_items[0][price_data][unit_amount]": String(price.amount),
      "line_items[0][quantity]": "1",
      "success_url": params.successUrl,
      "cancel_url": params.cancelUrl,
      "metadata[user_id]": params.userId,
      "metadata[plan]": params.plan,
    };

    const session = await this.post<StripeCheckoutSession>(
      "/checkout/sessions",
      body,
    );

    return {
      sessionId: session.id,
      url: session.url ?? "",
    };
  }

  /**
   * Verify Stripe webhook signature using HMAC-SHA256.
   *
   * Stripe sends: Stripe-Signature: t=<timestamp>,v1=<signature>
   * Signed payload: "<timestamp>.<raw_body>"
   * Compare computed HMAC against provided signature (timing-safe).
   */
  async verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string,
  ): Promise<boolean> {
    // Check timestamp freshness (reject > 5 minutes old)
    const ts = Number(timestamp);
    if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return false;
    }

    const signedPayload = `${timestamp}.${payload}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedPayload),
    );

    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return timingSafeEqual(computed, signature);
  }
}

/** Stripe Checkout Session response (subset of fields) */
interface StripeCheckoutSession {
  id: string;
  url: string | null;
}

/**
 * Timing-safe string comparison.
 * Compares every character regardless of early mismatch to avoid timing leaks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to avoid length-based timing leak
    let _ = 0;
    for (let i = 0; i < a.length; i++) {
      _ |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
