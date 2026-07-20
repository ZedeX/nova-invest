/**
 * TDD Spec — ADR-0016: ProviderRouter integration with CircuitBreaker
 *
 * Validates the ProviderRouter integration criteria in:
 *   docs/architecture/adr-0016-circuit-breaker.md §ProviderRouter Integration
 *
 * ProviderRouter tries providers in declared order, skips tripped ones
 * (via CircuitBreaker.isTripped), records failures/successes to the breaker,
 * and throws when all providers fail (per task spec: "throws or returns mock").
 *
 * Test mocks use a minimal provider shape: { name, getKlines(symbol, timeframe) }.
 * The existing MarketDataProvider structurally satisfies this via Pick.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "@/lib/data/circuit-breaker";
import { ProviderRouter } from "@/lib/data/router";
import type { KlineResponse } from "@/lib/types";

function mockKlineResponse(symbol: string): KlineResponse {
  return {
    ticker: symbol,
    timeframe: "1d",
    source: "mock",
    data: [{ t: "2024-01-02", o: 1, h: 1, l: 1, c: 1, v: 1 }],
  };
}

describe("ADR-0016: ProviderRouter (circuit-breaker fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- §Validation Criteria ----------

  it("select returns first provider's response when healthy", async () => {
    const first = {
      name: "yahoo",
      getKlines: vi.fn().mockResolvedValue(mockKlineResponse("AAPL")),
    };
    const second = {
      name: "alpha_vantage",
      getKlines: vi.fn().mockResolvedValue(mockKlineResponse("AAPL")),
    };
    const breaker = new CircuitBreaker();
    const router = new ProviderRouter([first, second], breaker);

    const result = await router.select("AAPL", "1d");
    expect(result.ticker).toBe("AAPL");
    expect(first.getKlines).toHaveBeenCalledTimes(1);
    expect(second.getKlines).not.toHaveBeenCalled();
    // success recorded → still CLOSED
    expect(breaker.getState("yahoo")).toBe("CLOSED");
  });

  it("first provider fails 5 times → breaker opens → router skips to second provider", async () => {
    const failing = {
      name: "yahoo",
      getKlines: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const healthy = {
      name: "alpha_vantage",
      getKlines: vi.fn().mockResolvedValue(mockKlineResponse("AAPL")),
    };
    const breaker = new CircuitBreaker();
    const router = new ProviderRouter([failing, healthy], breaker);

    // First 5 calls: failing provider attempts + fails, router falls back to healthy
    for (let i = 0; i < 5; i++) {
      await router.select("AAPL", "1d");
    }
    // After 5 consecutive failures, breaker for "yahoo" is OPEN
    expect(breaker.getState("yahoo")).toBe("OPEN");
    expect(breaker.isTripped("yahoo")).toBe(true);

    // 6th call: yahoo is tripped → skipped entirely; alpha_vantage serves
    failing.getKlines.mockClear();
    healthy.getKlines.mockClear();
    await router.select("AAPL", "1d");
    expect(failing.getKlines).not.toHaveBeenCalled();
    expect(healthy.getKlines).toHaveBeenCalledTimes(1);
  });

  it("all providers fail → throws (no healthy fallback)", async () => {
    const a = { name: "yahoo", getKlines: vi.fn().mockRejectedValue(new Error("a-fail")) };
    const b = { name: "alpha_vantage", getKlines: vi.fn().mockRejectedValue(new Error("b-fail")) };
    const breaker = new CircuitBreaker();
    const router = new ProviderRouter([a, b], breaker);

    await expect(router.select("AAPL", "1d")).rejects.toThrow();
    // Both providers were attempted (neither tripped at call time)
    expect(a.getKlines).toHaveBeenCalledTimes(1);
    expect(b.getKlines).toHaveBeenCalledTimes(1);
    // Failures recorded
    expect(breaker.getState("yahoo")).toBe("CLOSED"); // only 1 failure
    expect(breaker.getState("alpha_vantage")).toBe("CLOSED");
  });

  it("after cooldown, HALF_OPEN provider is retried", async () => {
    const initiallyFailing = {
      name: "yahoo",
      getKlines: vi.fn(),
    };
    // First 5 calls fail, then it recovers
    initiallyFailing.getKlines
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(mockKlineResponse("AAPL")); // 6th call (probe) succeeds

    const healthy = {
      name: "alpha_vantage",
      getKlines: vi.fn().mockResolvedValue(mockKlineResponse("AAPL")),
    };
    const breaker = new CircuitBreaker();
    const router = new ProviderRouter([initiallyFailing, healthy], breaker);

    // 5 failures → yahoo is OPEN
    for (let i = 0; i < 5; i++) {
      await router.select("AAPL", "1d");
    }
    expect(breaker.getState("yahoo")).toBe("OPEN");

    // After cooldown, yahoo transitions to HALF_OPEN on next isTripped check
    vi.advanceTimersByTime(60_000);
    expect(breaker.getState("yahoo")).toBe("HALF_OPEN");

    // Next select: yahoo is HALF_OPEN (not tripped) → retried → succeeds → CLOSED
    initiallyFailing.getKlines.mockClear();
    healthy.getKlines.mockClear();
    // Re-mock since we cleared
    initiallyFailing.getKlines.mockResolvedValueOnce(mockKlineResponse("AAPL"));

    await router.select("AAPL", "1d");
    expect(initiallyFailing.getKlines).toHaveBeenCalledTimes(1);
    expect(healthy.getKlines).not.toHaveBeenCalled();
    expect(breaker.getState("yahoo")).toBe("CLOSED");
  });

  it("ProviderRouter records failures to breaker on provider errors", async () => {
    const failing = {
      name: "yahoo",
      getKlines: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const healthy = {
      name: "alpha_vantage",
      getKlines: vi.fn().mockResolvedValue(mockKlineResponse("AAPL")),
    };
    const breaker = new CircuitBreaker();
    const router = new ProviderRouter([failing, healthy], breaker);

    // Spy on breaker.recordFailure to verify it's called
    const recordFailureSpy = vi.spyOn(breaker, "recordFailure");
    const recordSuccessSpy = vi.spyOn(breaker, "recordSuccess");

    await router.select("AAPL", "1d");

    expect(recordFailureSpy).toHaveBeenCalledWith("yahoo");
    expect(recordSuccessSpy).toHaveBeenCalledWith("alpha_vantage");
  });
});
