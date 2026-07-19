/**
 * TDD Spec — ADR-0016: Circuit Breaker (in-memory, synchronous)
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0016-circuit-breaker.md
 *
 * Note: This implementation follows the task-spec synchronous in-memory
 * interface (isTripped/recordFailure/recordSuccess/reset/getState are all
 * sync). The ADR-0016 canonical design is KV-backed + async (Cloudflare
 * Workers stateless). The in-memory version is the PRD stub that ADR-0016
 * §Alternative 1 explicitly rejects for production — but it is sufficient
 * for unit-testing the state-machine logic (CLOSED → OPEN → HALF_OPEN).
 *
 * State machine:
 *   CLOSED  --5 failures-->  OPEN
 *   OPEN    --60s cooldown-->  HALF_OPEN
 *   HALF_OPEN --success-->  CLOSED
 *   HALF_OPEN --failure-->  OPEN (fresh cooldown)
 *
 * Default config: threshold=5, cooldownMs=60000, 1 success in HALF_OPEN → CLOSED.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "@/lib/data/circuit-breaker";

describe("ADR-0016: Circuit Breaker (in-memory state machine)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- §Validation Criteria ----------

  it("initial state for any key is CLOSED", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState("yahoo")).toBe("CLOSED");
    expect(cb.getState("alpha_vantage")).toBe("CLOSED");
    expect(cb.getState("anything")).toBe("CLOSED");
  });

  it("recordFailure 5 times → isTripped=true, getState=OPEN", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 5; i++) {
      cb.recordFailure("yahoo");
    }
    expect(cb.getState("yahoo")).toBe("OPEN");
    expect(cb.isTripped("yahoo")).toBe(true);
  });

  it("after 60s cooldown, getState returns HALF_OPEN", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    expect(cb.getState("yahoo")).toBe("OPEN");

    vi.advanceTimersByTime(60_000);
    expect(cb.getState("yahoo")).toBe("HALF_OPEN");
  });

  it("recordSuccess in HALF_OPEN → state becomes CLOSED", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    vi.advanceTimersByTime(60_000);
    expect(cb.getState("yahoo")).toBe("HALF_OPEN");

    cb.recordSuccess("yahoo");
    expect(cb.getState("yahoo")).toBe("CLOSED");
  });

  it("recordFailure in HALF_OPEN → state becomes OPEN again, cooldown resets", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    vi.advanceTimersByTime(60_000);
    expect(cb.getState("yahoo")).toBe("HALF_OPEN");

    cb.recordFailure("yahoo");
    expect(cb.getState("yahoo")).toBe("OPEN");

    // Fresh cooldown: immediately after re-trip, still OPEN (not HALF_OPEN)
    vi.advanceTimersByTime(59_999);
    expect(cb.getState("yahoo")).toBe("OPEN");
    // After full 60s, transitions to HALF_OPEN again
    vi.advanceTimersByTime(1);
    expect(cb.getState("yahoo")).toBe("HALF_OPEN");
  });

  it("reset(key) forces state to CLOSED", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    expect(cb.getState("yahoo")).toBe("OPEN");

    cb.reset("yahoo");
    expect(cb.getState("yahoo")).toBe("CLOSED");
    expect(cb.isTripped("yahoo")).toBe(false);
  });

  it("different keys have independent states", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    expect(cb.getState("yahoo")).toBe("OPEN");
    // alpha_vantage unaffected
    expect(cb.getState("alpha_vantage")).toBe("CLOSED");
    expect(cb.isTripped("alpha_vantage")).toBe(false);

    // Tripping alpha_vantage does not affect yahoo
    for (let i = 0; i < 5; i++) cb.recordFailure("alpha_vantage");
    expect(cb.getState("alpha_vantage")).toBe("OPEN");
    expect(cb.getState("yahoo")).toBe("OPEN");
  });

  it("isTripped: false for CLOSED, true for OPEN, false for HALF_OPEN", () => {
    const cb = new CircuitBreaker();
    // CLOSED
    expect(cb.isTripped("yahoo")).toBe(false);

    // OPEN
    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    expect(cb.isTripped("yahoo")).toBe(true);

    // HALF_OPEN (after cooldown)
    vi.advanceTimersByTime(60_000);
    expect(cb.getState("yahoo")).toBe("HALF_OPEN");
    expect(cb.isTripped("yahoo")).toBe(false);
  });
});
