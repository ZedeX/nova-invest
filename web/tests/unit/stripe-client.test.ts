/**
 * Unit tests for Stripe client and types.
 * Uses mocked fetch — no real HTTP calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { StripeClient } from "@/lib/stripe/client";
import { PLAN_PRICES } from "@/lib/stripe/types";

describe("StripeClient", () => {
  let client: StripeClient;

  beforeEach(() => {
    client = new StripeClient("sk_test_123");
  });

  describe("post", () => {
    it("creates correct form-encoded body with auth header", async () => {
      vi.unstubAllGlobals();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "test" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.post("/test", { foo: "bar", baz: "hello world" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.stripe.com/v1/test");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer sk_test_123");
      expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(init.body).toBe("foo=bar&baz=hello%20world");
      expect(result).toEqual({ id: "test" });
    });

    it("throws on non-ok response", async () => {
      vi.unstubAllGlobals();

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: () => Promise.resolve({ error: { message: "Card declined" } }),
      }));

      await expect(client.post("/charge", { amount: "100" }))
        .rejects.toThrow("Stripe API error 402: Card declined");
    });
  });

  describe("get", () => {
    it("sends GET with auth header", async () => {
      vi.unstubAllGlobals();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "sess_123" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get<{ id: string }>("/checkout/sessions/sess_123");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.stripe.com/v1/checkout/sessions/sess_123");
      expect(init.method).toBe("GET");
      expect(init.headers.Authorization).toBe("Bearer sk_test_123");
      expect(result).toEqual({ id: "sess_123" });
    });
  });

  describe("createCheckoutSession", () => {
    it("returns session URL", async () => {
      vi.unstubAllGlobals();

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: "cs_test_abc",
          url: "https://checkout.stripe.com/c/pay/cs_test_abc",
        }),
      }));

      const result = await client.createCheckoutSession({
        plan: "pro",
        userId: "user_123",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(result).toEqual({
        sessionId: "cs_test_abc",
        url: "https://checkout.stripe.com/c/pay/cs_test_abc",
      });

      // Verify the body includes plan pricing
      const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = callArgs[1]!.body as string;
      expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=2900");
      expect(body).toContain("mode=subscription");
    });

    it("throws for unknown plan", async () => {
      vi.unstubAllGlobals();

      // fetch shouldn't be called, but unstub to avoid setup.ts rejection
      vi.stubGlobal("fetch", vi.fn());

      await expect(
        client.createCheckoutSession({
          plan: "enterprise" as "pro",
          userId: "user_123",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        }),
      ).rejects.toThrow("Unknown plan: enterprise");
    });
  });

  describe("verifyWebhookSignature", () => {
    /** Helper: compute HMAC-SHA256 hex digest using Web Crypto API */
    async function computeHmac(key: string, payload: string): Promise<string> {
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(key),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        new TextEncoder().encode(payload),
      );
      return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    it("valid signature passes", async () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = '{"id":"evt_test","type":"checkout.session.completed"}';
      const signedPayload = `${timestamp}.${rawBody}`;

      const signature = await computeHmac("sk_test_123", signedPayload);

      const result = await client.verifyWebhookSignature(rawBody, signature, timestamp);
      expect(result).toBe(true);
    });

    it("invalid signature fails", async () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = '{"id":"evt_test","type":"checkout.session.completed"}';

      const result = await client.verifyWebhookSignature(rawBody, "deadbeef", timestamp);
      expect(result).toBe(false);
    });

    it("expired timestamp fails", async () => {
      // 10 minutes ago (tolerance is 5 min)
      const timestamp = String(Math.floor(Date.now() / 1000) - 600);
      const rawBody = '{"id":"evt_test"}';
      const signedPayload = `${timestamp}.${rawBody}`;

      const signature = await computeHmac("sk_test_123", signedPayload);

      const result = await client.verifyWebhookSignature(rawBody, signature, timestamp);
      expect(result).toBe(false);
    });
  });
});

describe("PLAN_PRICES", () => {
  it("has correct amounts for pro and team", () => {
    expect(PLAN_PRICES.pro).toEqual({
      amount: 2900,
      currency: "usd",
      interval: "month",
      name: "Pro Plan",
    });
    expect(PLAN_PRICES.team).toEqual({
      amount: 9900,
      currency: "usd",
      interval: "month",
      name: "Team Plan",
    });
  });
});
