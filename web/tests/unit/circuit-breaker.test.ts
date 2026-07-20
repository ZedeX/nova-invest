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
import {
  CircuitBreaker,
  CircuitBreakerStore,
  KVCircuitBreakerStore,
  MemoryCircuitBreakerStore,
} from "@/lib/data/circuit-breaker";

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

// ============ Store Abstraction Tests ============

describe("MemoryCircuitBreakerStore", () => {
  it("get returns null for missing key", async () => {
    const store = new MemoryCircuitBreakerStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("set/get round-trip", async () => {
    const store = new MemoryCircuitBreakerStore();
    await store.set("key1", "value1");
    expect(await store.get("key1")).toBe("value1");
  });

  it("set with TTL: value available before expiry, null after", async () => {
    vi.useFakeTimers();
    const store = new MemoryCircuitBreakerStore();
    await store.set("ttl_key", "ttl_value", 1000);
    expect(await store.get("ttl_key")).toBe("ttl_value");

    vi.advanceTimersByTime(999);
    expect(await store.get("ttl_key")).toBe("ttl_value");

    vi.advanceTimersByTime(1);
    expect(await store.get("ttl_key")).toBeNull();
    vi.useRealTimers();
  });

  it("set without TTL: value persists indefinitely", async () => {
    vi.useFakeTimers();
    const store = new MemoryCircuitBreakerStore();
    await store.set("no_ttl", "permanent");
    vi.advanceTimersByTime(999_999_999);
    expect(await store.get("no_ttl")).toBe("permanent");
    vi.useRealTimers();
  });

  it("delete removes a key", async () => {
    const store = new MemoryCircuitBreakerStore();
    await store.set("del_key", "value");
    expect(await store.get("del_key")).toBe("value");
    await store.delete("del_key");
    expect(await store.get("del_key")).toBeNull();
  });

  it("implements CircuitBreakerStore interface", () => {
    const store: CircuitBreakerStore = new MemoryCircuitBreakerStore();
    expect(typeof store.get).toBe("function");
    expect(typeof store.set).toBe("function");
    expect(typeof store.delete).toBe("function");
  });
});

describe("KVCircuitBreakerStore", () => {
  /** Create a mock KVNamespace for testing. */
  function createMockKV(): KVNamespace {
    const data = new Map<string, string>();
    return {
      get: vi.fn(async (key: string) => data.get(key) ?? null),
      put: vi.fn(async (key: string, value: string, _opts?: { expirationTtl?: number }) => {
        data.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        data.delete(key);
      }),
    } as unknown as KVNamespace;
  }

  it("get returns null for missing key", async () => {
    const kv = createMockKV();
    const store = new KVCircuitBreakerStore(kv);
    expect(await store.get("missing")).toBeNull();
  });

  it("set/get round-trip", async () => {
    const kv = createMockKV();
    const store = new KVCircuitBreakerStore(kv);
    await store.set("key1", "value1");
    expect(await store.get("key1")).toBe("value1");
  });

  it("set with ttlMs passes expirationTtl in seconds (ceiling)", async () => {
    const kv = createMockKV();
    const store = new KVCircuitBreakerStore(kv);
    await store.set("key1", "value1", 2500); // 2500ms → 3 seconds
    expect(kv.put).toHaveBeenCalledWith("key1", "value1", { expirationTtl: 3 });
  });

  it("set without ttlMs passes undefined expirationTtl", async () => {
    const kv = createMockKV();
    const store = new KVCircuitBreakerStore(kv);
    await store.set("key1", "value1");
    expect(kv.put).toHaveBeenCalledWith("key1", "value1", { expirationTtl: undefined });
  });

  it("delete delegates to kv.delete", async () => {
    const kv = createMockKV();
    const store = new KVCircuitBreakerStore(kv);
    await store.set("key1", "value1");
    await store.delete("key1");
    expect(kv.delete).toHaveBeenCalledWith("key1");
    expect(await store.get("key1")).toBeNull();
  });

  it("implements CircuitBreakerStore interface", () => {
    const kv = createMockKV();
    const store: CircuitBreakerStore = new KVCircuitBreakerStore(kv);
    expect(typeof store.get).toBe("function");
    expect(typeof store.set).toBe("function");
    expect(typeof store.delete).toBe("function");
  });
});

// ============ CircuitBreaker with injected store ============

describe("CircuitBreaker with injected store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("CircuitBreaker without store works the same as before (backward compat)", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState("yahoo")).toBe("CLOSED");

    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    expect(cb.getState("yahoo")).toBe("OPEN");
    expect(cb.isTripped("yahoo")).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(cb.getState("yahoo")).toBe("HALF_OPEN");

    cb.recordSuccess("yahoo");
    expect(cb.getState("yahoo")).toBe("CLOSED");
  });

  it("CircuitBreaker with MemoryCircuitBreakerStore works the same", () => {
    const store = new MemoryCircuitBreakerStore();
    const cb = new CircuitBreaker({}, store);
    expect(cb.getState("yahoo")).toBe("CLOSED");

    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    expect(cb.getState("yahoo")).toBe("OPEN");
    expect(cb.isTripped("yahoo")).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(cb.getState("yahoo")).toBe("HALF_OPEN");

    cb.recordSuccess("yahoo");
    expect(cb.getState("yahoo")).toBe("CLOSED");
  });

  it("hydrate restores state from the store", async () => {
    const store = new MemoryCircuitBreakerStore();
    const cb1 = new CircuitBreaker({}, store);

    // Trip the breaker
    for (let i = 0; i < 5; i++) cb1.recordFailure("yahoo");

    // Wait for persist to settle (fire-and-forget uses microtask)
    await vi.advanceTimersByTimeAsync(0);

    // Create a new breaker with the same store and hydrate
    const cb2 = new CircuitBreaker({}, store);
    expect(cb2.getState("yahoo")).toBe("CLOSED"); // Not yet hydrated

    await cb2.hydrate("yahoo");
    expect(cb2.getState("yahoo")).toBe("OPEN"); // Restored from store
  });

  it("reset deletes from both in-memory and store", async () => {
    const store = new MemoryCircuitBreakerStore();
    const cb = new CircuitBreaker({}, store);

    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    expect(cb.getState("yahoo")).toBe("OPEN");

    cb.reset("yahoo");
    expect(cb.getState("yahoo")).toBe("CLOSED");

    // Wait for delete to settle
    await vi.advanceTimersByTimeAsync(0);

    // Hydrate should find nothing in the store
    const cb2 = new CircuitBreaker({}, store);
    await cb2.hydrate("yahoo");
    expect(cb2.getState("yahoo")).toBe("CLOSED");
  });

  it("CircuitBreaker with KVCircuitBreakerStore works via hydrate", async () => {
    const kvData = new Map<string, string>();
    const mockKV = {
      get: vi.fn(async (key: string) => kvData.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => { kvData.set(key, value); }),
      delete: vi.fn(async (key: string) => { kvData.delete(key); }),
    } as unknown as KVNamespace;

    const store = new KVCircuitBreakerStore(mockKV);
    const cb = new CircuitBreaker({}, store);

    for (let i = 0; i < 5; i++) cb.recordFailure("yahoo");
    expect(cb.getState("yahoo")).toBe("OPEN");

    // Allow fire-and-forget persist to complete
    await vi.advanceTimersByTimeAsync(0);

    // Verify data was written to KV
    expect(kvData.has("cb:yahoo")).toBe(true);

    // Hydrate a fresh breaker from the same KV
    const cb2 = new CircuitBreaker({}, store);
    await cb2.hydrate("yahoo");
    expect(cb2.getState("yahoo")).toBe("OPEN");
  });
});
