/**
 * TDD Spec — ADR-0012: Community UGC + Moderation
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0012-community-ugc.md
 *
 * Test scope (per task plan):
 *   - SharePackage interface shape (NO signature, NO license per ADR-0012 Phase 1 scope)
 *   - ModerationQueue.submit() runs 4 anti-abuse checks
 *   - ModerationQueue.processQueue() batch-processes pending packages
 *   - computeRating / computeTrendingScore / computeContentHash pure functions
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ModerationQueue,
  computeContentHash,
  computeRating,
  computeTrendingScore,
} from "@/lib/community/ugc";
import type { CommunityPlaybook, SharePackage } from "@/lib/community/types";

// Helper: build a valid SharePackage fixture
function makePackage(overrides: Partial<SharePackage> = {}): SharePackage {
  return {
    id: "pkg-001",
    author_id: "user-001",
    playbook_id: "pb-001",
    title: "Momentum Strategy v1",
    description: "A simple momentum strategy based on RSI divergence.",
    tags: ["momentum", "rsi"],
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

// Helper: build a CommunityPlaybook fixture
function makePlaybook(overrides: Partial<CommunityPlaybook> = {}): CommunityPlaybook {
  return {
    id: "cp-001",
    share_package_id: "pkg-001",
    fork_count: 10,
    rating_sum: 40,
    rating_count: 10,
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("ADR-0012: Community UGC + Moderation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ---------- SharePackage interface shape ----------

  it("SharePackage has id, author_id, playbook_id, title, description, tags, created_at fields", () => {
    const pkg = makePackage();
    expect(pkg).toHaveProperty("id");
    expect(pkg).toHaveProperty("author_id");
    expect(pkg).toHaveProperty("playbook_id");
    expect(pkg).toHaveProperty("title");
    expect(pkg).toHaveProperty("description");
    expect(pkg).toHaveProperty("tags");
    expect(pkg).toHaveProperty("created_at");
  });

  it("SharePackage does NOT have a 'signature' field (per ADR-0012 Phase 1 scope)", () => {
    const pkg = makePackage();
    expect("signature" in pkg).toBe(false);
  });

  it("SharePackage does NOT have a 'license' field (per ADR-0012 Phase 1 scope)", () => {
    const pkg = makePackage();
    expect("license" in pkg).toBe(false);
  });

  // ---------- ModerationQueue.submit (4 anti-abuse checks) ----------

  it("ModerationQueue.submit approves a valid package", async () => {
    const queue = new ModerationQueue();
    const result = await queue.submit(makePackage());
    expect(result.action).toBe("approve");
    expect(result.id).toBe("pkg-001");
  });

  it("ModerationQueue.submit rejects package with title > 100 chars", async () => {
    const queue = new ModerationQueue();
    const longTitle = "x".repeat(101);
    const result = await queue.submit(makePackage({ title: longTitle }));
    expect(result.action).toBe("reject");
    expect(result.reason).toMatch(/title/i);
  });

  it("ModerationQueue.submit rejects package with description > 500 chars", async () => {
    const queue = new ModerationQueue();
    const longDesc = "y".repeat(501);
    const result = await queue.submit(makePackage({ description: longDesc }));
    expect(result.action).toBe("reject");
    expect(result.reason).toMatch(/description/i);
  });

  it("ModerationQueue.submit rejects package with > 5 tags", async () => {
    const queue = new ModerationQueue();
    const tooManyTags = ["a", "b", "c", "d", "e", "f"];
    const result = await queue.submit(makePackage({ tags: tooManyTags }));
    expect(result.action).toBe("reject");
    expect(result.reason).toMatch(/tag/i);
  });

  it("ModerationQueue.submit flags package with banned words in title", async () => {
    const queue = new ModerationQueue();
    const result = await queue.submit(
      makePackage({ title: "Guaranteed PUMP AND DUMP scheme" }),
    );
    expect(result.action).toBe("flag");
    expect(result.severity).toBe("high");
  });

  // ---------- ModerationQueue.processQueue ----------

  it("ModerationQueue.processQueue processes all pending packages", async () => {
    const queue = new ModerationQueue();
    queue.enqueue(makePackage({ id: "p1" }));
    queue.enqueue(makePackage({ id: "p2" }));
    queue.enqueue(makePackage({ id: "p3" }));

    const results = await queue.processQueue();
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.id).sort()).toEqual(["p1", "p2", "p3"]);
    // All three should be approved (valid packages)
    expect(results.every((r) => r.action === "approve")).toBe(true);
  });

  // ---------- computeRating ----------

  it("computeRating returns 0 when rating_count = 0", () => {
    expect(computeRating(0, 0)).toBe(0);
    // Even non-zero sum with zero count returns 0 (avoids div-by-zero)
    expect(computeRating(50, 0)).toBe(0);
  });

  it("computeRating returns rating_sum / rating_count when rating_count > 0", () => {
    expect(computeRating(40, 10)).toBe(4);
    expect(computeRating(45, 10)).toBe(4.5);
    expect(computeRating(13, 5)).toBeCloseTo(2.6, 6);
  });

  // ---------- computeTrendingScore ----------

  it("computeTrendingScore returns higher score for recently created packages", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00Z"));

    try {
      const recent = makePlaybook({
        id: "recent",
        rating_sum: 40,
        rating_count: 10,
        fork_count: 5,
        created_at: "2026-07-19T00:00:00Z", // 1 day ago
      });
      const old = makePlaybook({
        id: "old",
        rating_sum: 40,
        rating_count: 10,
        fork_count: 5,
        created_at: "2026-06-01T00:00:00Z", // ~49 days ago
      });

      const recentScore = computeTrendingScore(recent, new Date("2026-07-20T00:00:00Z"));
      const oldScore = computeTrendingScore(old, new Date("2026-07-20T00:00:00Z"));

      expect(recentScore).toBeGreaterThan(oldScore);
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------- computeContentHash ----------

  it("computeContentHash returns same hash for identical packages", () => {
    const pkg1 = makePackage();
    const pkg2 = makePackage();
    expect(computeContentHash(pkg1)).toBe(computeContentHash(pkg2));
  });

  it("computeContentHash returns different hash for different packages", () => {
    const pkg1 = makePackage({ title: "Strategy A" });
    const pkg2 = makePackage({ title: "Strategy B" });
    expect(computeContentHash(pkg1)).not.toBe(computeContentHash(pkg2));
  });
});
