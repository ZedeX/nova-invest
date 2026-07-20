/**
 * Stripe integration types and plan pricing.
 * No external Stripe SDK — native fetch to REST API.
 */

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
}

export interface CheckoutSessionParams {
  plan: "pro" | "team";
  userId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface SubscriptionEvent {
  type: "checkout.completed" | "subscription.active" | "subscription.canceled" | "payment.failed";
  userId: string;
  plan: "pro" | "team";
  subscriptionId?: string;
}

/** Plan pricing (matching ADR-0017) */
export const PLAN_PRICES: Record<string, { amount: number; currency: string; interval: string; name: string }> = {
  pro: { amount: 2900, currency: "usd", interval: "month", name: "Pro Plan" },
  team: { amount: 9900, currency: "usd", interval: "month", name: "Team Plan" },
};
