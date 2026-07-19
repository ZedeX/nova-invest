/**
 * TDD Spec — ADR-0005: Memory Layer (KV short-term + D1 long-term)
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0005-memory-layer.md
 *
 * Tests the MemoryStore interface (save/retrieve/query/delete) and the
 * MockMemoryStore / D1MemoryStore implementations + getMemoryStore factory.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ADR-0005: Memory Layer", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.USE_MOCK = "true";
    process.env.ENVIRONMENT = "test";
  });

  // ---------- MockMemoryStore.save ----------

  it("MockMemoryStore.save(ref) returns the saved ref with id and created_at", async () => {
    const { MockMemoryStore } = await import("@/lib/memory/store");
    const store = new MockMemoryStore();
    const ref = {
      type: "conversation",
      content: "user asked about AAPL price",
      metadata: { session_id: "sess1", user_id: "user1" },
    };
    const saved = await store.save(ref as any);
    expect(saved.id).toBeTruthy();
    expect(saved.created_at).toBeTruthy();
    expect(saved.content).toBe(ref.content);
    expect(saved.type).toBe(ref.type);
  });

  // ---------- MockMemoryStore.retrieve ----------

  it("MockMemoryStore.retrieve(id) returns the ref or null", async () => {
    const { MockMemoryStore } = await import("@/lib/memory/store");
    const store = new MockMemoryStore();
    const saved = await store.save({
      type: "conversation",
      content: "hello",
      metadata: { user_id: "u1" },
    } as any);
    const got = await store.retrieve(saved.id!);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(saved.id);
    expect(got!.content).toBe("hello");
    // Missing id returns null (does NOT throw).
    const missing = await store.retrieve("does-not-exist");
    expect(missing).toBeNull();
  });

  // ---------- MockMemoryStore.query ----------

  it("MockMemoryStore.query(filter) returns matching refs by type", async () => {
    const { MockMemoryStore } = await import("@/lib/memory/store");
    const store = new MockMemoryStore();
    await store.save({ type: "conversation", content: "msg-1" } as any);
    await store.save({ type: "conversation", content: "msg-2" } as any);
    await store.save({ type: "agent_trace", content: "trace-1" } as any);
    const conversations = await store.query({ type: "conversation" });
    expect(conversations).toHaveLength(2);
    expect(conversations.every((r) => r.type === "conversation")).toBe(true);
    const traces = await store.query({ type: "agent_trace" });
    expect(traces).toHaveLength(1);
    expect(traces[0].content).toBe("trace-1");
    const empty = await store.query({ type: "citation" });
    expect(empty).toHaveLength(0);
  });

  // ---------- MockMemoryStore.delete ----------

  it("MockMemoryStore.delete(id) returns true if deleted, false if not found", async () => {
    const { MockMemoryStore } = await import("@/lib/memory/store");
    const store = new MockMemoryStore();
    const saved = await store.save({
      type: "conversation",
      content: "to-be-deleted",
    } as any);
    const deleted = await store.delete(saved.id!);
    expect(deleted).toBe(true);
    // Second delete on the same id returns false (already gone).
    const again = await store.delete(saved.id!);
    expect(again).toBe(false);
    // Retrieve now returns null.
    const got = await store.retrieve(saved.id!);
    expect(got).toBeNull();
  });

  // ---------- getMemoryStore factory ----------

  it("getMemoryStore() returns MockMemoryStore when USE_MOCK=true", async () => {
    process.env.USE_MOCK = "true";
    const { getMemoryStore, MockMemoryStore } = await import("@/lib/memory/store");
    const store = getMemoryStore();
    expect(store).toBeInstanceOf(MockMemoryStore);
  });

  it("getMemoryStore() returns D1MemoryStore when USE_MOCK=false", async () => {
    process.env.USE_MOCK = "false";
    const { getMemoryStore, D1MemoryStore } = await import("@/lib/memory/store");
    // Provide a stub D1 binding so the factory doesn't fall back to Mock.
    const stubD1 = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ run: vi.fn(), first: vi.fn(), all: vi.fn() })),
      })),
    };
    const store = getMemoryStore({ USE_MOCK: "false", DB: stubD1 });
    expect(store).toBeInstanceOf(D1MemoryStore);
  });

  // ---------- D1MemoryStore.save ----------

  it("D1MemoryStore.save(ref) calls d1.prepare('INSERT INTO ...').bind(...).run()", async () => {
    const { D1MemoryStore } = await import("@/lib/memory/store");
    const runSpy = vi.fn();
    const bindSpy = vi.fn(() => ({ run: runSpy, first: vi.fn(), all: vi.fn() }));
    const prepareSpy = vi.fn((_sql: string) => ({ bind: bindSpy }));
    const d1 = { prepare: prepareSpy };

    const store = new D1MemoryStore(d1);
    const ref = {
      type: "conversation",
      content: "user asked about NVDA earnings",
      metadata: {
        user_id: "user_mock_001",
        session_id: "sess-abc",
        role: "user",
        intent: "deep_research",
      },
    };
    const saved = await store.save(ref as any);

    // prepare() called once with an INSERT statement.
    expect(prepareSpy).toHaveBeenCalledTimes(1);
    const sqlArg = (prepareSpy.mock.calls[0]?.[0] ?? "") as string;

    expect(sqlArg).toMatch(/^INSERT INTO conversation_history/i);
    // bind() called with positional params ending in created_at ISO timestamp.
    expect(bindSpy).toHaveBeenCalledTimes(1);
    // bindSpy.mock.calls[0] is the array of positional args.
    const boundArgs = bindSpy.mock.calls[0] as unknown[];
    expect(boundArgs.length).toBeGreaterThanOrEqual(5);
    // The first bound arg is the generated id (matches saved.id).
    expect(boundArgs[0]).toBe(saved.id);
    // The last bound arg is the ISO created_at (matches saved.created_at).
    expect(boundArgs[boundArgs.length - 1]).toBe(saved.created_at);
    // run() was invoked on the bound statement.
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  // ---------- KV TTL eviction ----------

  it("KV TTL: memory ref with ttl:3600 is evicted after TTL (fake timers)", async () => {
    const { MockMemoryStore } = await import("@/lib/memory/store");
    vi.useFakeTimers();
    const start = new Date("2026-07-19T00:00:00Z").getTime();
    vi.setSystemTime(start);
    try {
      const store = new MockMemoryStore();
      const saved = await store.save({
        type: "conversation",
        content: "ephemeral",
        ttl: 3600, // seconds
      } as any);
      expect(saved.id).toBeTruthy();

      // Immediately retrievable.
      const before = await store.retrieve(saved.id!);
      expect(before).not.toBeNull();
      expect(before!.content).toBe("ephemeral");

      // Advance past TTL (3600s = 3,600,000 ms). Add 1ms to cross boundary.
      vi.advanceTimersByTime(3600 * 1000 + 1);

      // Now retrieve returns null (evicted).
      const after = await store.retrieve(saved.id!);
      expect(after).toBeNull();

      // query() also excludes TTL-expired refs.
      const matches = await store.query({ type: "conversation" });
      expect(matches).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- MemoryRef schema validation ----------

  it("MemoryRef schema validation rejects refs missing required fields", async () => {
    const { validateMemoryRef } = await import("@/lib/memory/store");
    // Valid ref passes.
    const ok = validateMemoryRef({
      type: "conversation",
      content: "hello",
      metadata: { user_id: "u1" },
    });
    expect(ok.valid).toBe(true);
    expect(ok.errors).toEqual([]);

    // Missing `type` is rejected.
    const noType = validateMemoryRef({ content: "hi" });
    expect(noType.valid).toBe(false);
    expect(noType.errors.some((e) => e.includes("type"))).toBe(true);

    // Missing `content` is rejected.
    const noContent = validateMemoryRef({ type: "conversation" });
    expect(noContent.valid).toBe(false);
    expect(noContent.errors.some((e) => e.includes("content"))).toBe(true);

    // Empty `type` is rejected.
    const emptyType = validateMemoryRef({ type: "", content: "hi" });
    expect(emptyType.valid).toBe(false);

    // Non-string content is rejected.
    const badContent = validateMemoryRef({
      type: "conversation",
      content: 42 as any,
    });
    expect(badContent.valid).toBe(false);

    // Non-object ref is rejected.
    const notObj = validateMemoryRef(null);
    expect(notObj.valid).toBe(false);
    expect(notObj.errors[0]).toMatch(/object/);

    // Bad ttl (negative) is rejected.
    const badTtl = validateMemoryRef({
      type: "conversation",
      content: "hi",
      ttl: -1,
    });
    expect(badTtl.valid).toBe(false);
    expect(badTtl.errors.some((e) => e.includes("ttl"))).toBe(true);
  });
});
