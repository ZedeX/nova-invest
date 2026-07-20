/**
 * Unit tests for Epic 07 Community UGC (Sprint 8).
 *
 * Covers:
 *   - Store: 10 mock seeds, search, sort, publish, install, rate, comment, report
 *   - Anti-abuse: rate limit, duplicate content, rating dedup, comment depth, report dedup
 *   - UGC closed loop: publish -> install -> rate -> comment -> report
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetStoreForTest,
  listPackages,
  getPackage,
  publishPackage,
  installPackage,
  listInstalls,
  ratePackage,
  getRating,
  addComment,
  listComments,
  deleteComment,
  reportPackage,
  listReports,
  resolveReport,
  updateModerationStatus,
} from "@/lib/community/store";

const USER_A = "user_a@example.com";
const USER_A_NAME = "User A";
const USER_B = "user_b@example.com";
const USER_B_NAME = "User B";

beforeEach(() => {
  _resetStoreForTest();
});

afterEach(() => {
  _resetStoreForTest();
});

// ============ Seed data ============

describe("Community Store: Seed data", () => {
  it("seeds 10 mock packages on init", () => {
    const { packages, total } = listPackages();
    expect(total).toBe(10);
    expect(packages.length).toBe(10);
  });

  it("all seeds are approved", () => {
    const { packages } = listPackages();
    expect(packages.every((p) => p.moderation_status === "approved")).toBe(true);
  });

  it("seeds have valid ratings", () => {
    const { packages } = listPackages();
    for (const p of packages) {
      expect(p.rating_avg).toBeGreaterThan(0);
      expect(p.rating_avg).toBeLessThanOrEqual(5);
      expect(p.rating_count).toBeGreaterThan(0);
    }
  });
});

// ============ Search & Sort ============

describe("Community Store: Search", () => {
  it("searches by title keyword", () => {
    const { packages, total } = listPackages({ q: "NVDA" });
    expect(total).toBe(2); // "NVDA 双均线金叉策略" + "NVDA Investment Thesis"
    expect(packages.every((p) => p.title.includes("NVDA"))).toBe(true);
  });

  it("searches by description keyword", () => {
    const { packages, total } = listPackages({ q: "DCA" });
    expect(total).toBeGreaterThanOrEqual(2); // MSFT DCA + BTC DCA
  });

  it("filters by tag", () => {
    const { packages, total } = listPackages({ tags: ["momentum"] });
    expect(total).toBeGreaterThanOrEqual(2);
    expect(packages.every((p) => p.tags.includes("momentum"))).toBe(true);
  });

  it("filters by author", () => {
    const { packages, total } = listPackages({ author: "brenda" });
    expect(total).toBeGreaterThanOrEqual(3); // brenda published 5 playbooks
    expect(packages.every((p) => p.author_name.includes("Brenda"))).toBe(true);
  });

  it("sorts by rating (highest first)", () => {
    const { packages } = listPackages({ sort: "rating" });
    for (let i = 1; i < packages.length; i++) {
      expect(packages[i - 1].rating_avg).toBeGreaterThanOrEqual(packages[i].rating_avg);
    }
  });

  it("sorts by installed count (highest first)", () => {
    const { packages } = listPackages({ sort: "installed" });
    for (let i = 1; i < packages.length; i++) {
      expect(packages[i - 1].installed_count).toBeGreaterThanOrEqual(packages[i].installed_count);
    }
  });

  it("paginates with limit + offset", () => {
    const page1 = listPackages({ limit: 3, offset: 0 });
    const page2 = listPackages({ limit: 3, offset: 3 });
    expect(page1.packages.length).toBe(3);
    expect(page2.packages.length).toBe(3);
    expect(page1.packages[0].package_id).not.toBe(page2.packages[0].package_id);
  });
});

// ============ Publish ============

describe("Community Store: Publish", () => {
  it("publishes a new package", () => {
    const result = publishPackage(
      { playbook_id: "pb_test", title: "Test Strategy", description: "Test", tags: ["test"], version: "1.0.0" },
      USER_A, USER_A_NAME,
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.package.title).toBe("Test Strategy");
      expect(result.package.moderation_status).toBe("approved");
      expect(result.package.installed_count).toBe(0);
    }
  });

  it("rejects empty title", () => {
    const result = publishPackage(
      { playbook_id: "pb", title: "", description: "d", version: "1.0.0" },
      USER_A, USER_A_NAME,
    );
    expect("error" in result).toBe(true);
  });

  it("rejects title > 100 chars", () => {
    const result = publishPackage(
      { playbook_id: "pb", title: "x".repeat(101), description: "d", version: "1.0.0" },
      USER_A, USER_A_NAME,
    );
    expect("error" in result).toBe(true);
  });

  it("rejects > 5 tags", () => {
    const result = publishPackage(
      { playbook_id: "pb", title: "T", description: "d", tags: ["a", "b", "c", "d", "e", "f"], version: "1.0.0" },
      USER_A, USER_A_NAME,
    );
    expect("error" in result).toBe(true);
  });

  it("rejects duplicate content", () => {
    publishPackage(
      { playbook_id: "pb", title: "Unique Title", description: "Unique desc", version: "1.0.0" },
      USER_A, USER_A_NAME,
    );
    const dup = publishPackage(
      { playbook_id: "pb2", title: "Unique Title", description: "Unique desc", version: "1.0.0" },
      USER_A, USER_A_NAME,
    );
    expect("error" in dup).toBe(true);
  });

  it("enforces rate limit (5/hour)", () => {
    // Publish 5 packages (should succeed)
    for (let i = 0; i < 5; i++) {
      const r = publishPackage(
        { playbook_id: `pb_${i}`, title: `Title ${i}`, description: `Desc ${i}`, version: "1.0.0" },
        USER_A, USER_A_NAME,
      );
      expect("error" in r).toBe(false);
    }
    // 6th should fail
    const r6 = publishPackage(
      { playbook_id: "pb_6", title: "Title 6", description: "Desc 6", version: "1.0.0" },
      USER_A, USER_A_NAME,
    );
    expect("error" in r6).toBe(true);
  });
});

// ============ Install ============

describe("Community Store: Install", () => {
  it("installs a package (creates reference)", () => {
    const result = installPackage("pkg_seed_01", USER_A);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.install.package_id).toBe("pkg_seed_01");
      expect(result.install.user_id).toBe(USER_A);
    }
  });

  it("increments installed_count", () => {
    // Seed pb_nvda_macross has installed_count=42
    const before = getPackage("pkg_seed_01");
    const seedCount = before ? before.installed_count : 0;
    installPackage("pkg_seed_01", USER_A);
    const after = getPackage("pkg_seed_01")!;
    expect(after.installed_count).toBe(seedCount + 1);
  });

  it("is idempotent (same user reinstalling)", () => {
    installPackage("pkg_seed_01", USER_A);
    const before = getPackage("pkg_seed_01")!;
    installPackage("pkg_seed_01", USER_A); // second install
    const after = getPackage("pkg_seed_01")!;
    expect(after.installed_count).toBe(before.installed_count); // no double count
  });

  it("lists user installs", () => {
    installPackage("pkg_seed_01", USER_A);
    installPackage("pkg_seed_02", USER_A);
    const installs = listInstalls(USER_A);
    expect(installs.length).toBe(2);
  });
});

// ============ Rate ============

describe("Community Store: Rate", () => {
  it("adds a new rating", () => {
    const result = ratePackage("pkg_seed_01", USER_A, 5);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.rating.rating).toBe(5);
    }
    const pkg = getPackage("pkg_seed_01")!;
    expect(pkg.rating_count).toBeGreaterThan(0);
  });

  it("updates existing rating (dedup: 1 per user)", () => {
    ratePackage("pkg_seed_01", USER_A, 3);
    const before = getPackage("pkg_seed_01")!;
    const beforeSum = before.rating_sum;
    const beforeCount = before.rating_count;
    ratePackage("pkg_seed_01", USER_A, 5); // change to 5
    const after = getPackage("pkg_seed_01")!;
    expect(after.rating_count).toBe(beforeCount); // no new count
    expect(after.rating_sum).toBe(beforeSum - 3 + 5); // sum adjusted
  });

  it("rejects rating < 1", () => {
    const result = ratePackage("pkg_seed_01", USER_A, 0);
    expect("error" in result).toBe(true);
  });

  it("rejects rating > 5", () => {
    const result = ratePackage("pkg_seed_01", USER_A, 6);
    expect("error" in result).toBe(true);
  });

  it("rejects non-integer rating", () => {
    const result = ratePackage("pkg_seed_01", USER_A, 3.5);
    expect("error" in result).toBe(true);
  });

  it("allows multiple users to rate", () => {
    ratePackage("pkg_seed_01", USER_A, 4);
    ratePackage("pkg_seed_01", USER_B, 5);
    const pkg = getPackage("pkg_seed_01")!;
    // Original count + 2 new ratings
    expect(pkg.rating_count).toBeGreaterThanOrEqual(2);
  });

  it("retrieves user's rating", () => {
    ratePackage("pkg_seed_01", USER_A, 4);
    const rating = getRating("pkg_seed_01", USER_A);
    expect(rating).not.toBeNull();
    expect(rating!.rating).toBe(4);
  });
});

// ============ Comments ============

describe("Community Store: Comments", () => {
  it("adds a top-level comment", () => {
    const result = addComment("pkg_seed_01", USER_A, USER_A_NAME, "Great strategy!");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.comment.content).toBe("Great strategy!");
      expect(result.comment.parent_id).toBeNull();
    }
  });

  it("adds a reply (2-level nesting)", () => {
    const parent = addComment("pkg_seed_01", USER_A, USER_A_NAME, "Parent comment");
    if ("error" in parent) throw new Error("parent failed");
    const reply = addComment("pkg_seed_01", USER_B, USER_B_NAME, "Reply", parent.comment.id);
    expect("error" in reply).toBe(false);
    if (!("error" in reply)) {
      expect(reply.comment.parent_id).toBe(parent.comment.id);
    }
  });

  it("rejects 3rd-level nesting (depth > 2)", () => {
    const parent = addComment("pkg_seed_01", USER_A, USER_A_NAME, "Parent");
    if ("error" in parent) throw new Error("parent failed");
    const reply = addComment("pkg_seed_01", USER_B, USER_B_NAME, "Reply", parent.comment.id);
    if ("error" in reply) throw new Error("reply failed");
    // Try to reply to reply (3rd level) - should fail
    const deep = addComment("pkg_seed_01", USER_A, USER_A_NAME, "Deep", reply.comment.id);
    expect("error" in deep).toBe(true);
  });

  it("rejects empty comment", () => {
    const result = addComment("pkg_seed_01", USER_A, USER_A_NAME, "");
    expect("error" in result).toBe(true);
  });

  it("rejects comment > 1000 chars", () => {
    const result = addComment("pkg_seed_01", USER_A, USER_A_NAME, "x".repeat(1001));
    expect("error" in result).toBe(true);
  });

  it("lists comments sorted oldest first", () => {
    addComment("pkg_seed_01", USER_A, USER_A_NAME, "First");
    addComment("pkg_seed_01", USER_B, USER_B_NAME, "Second");
    const comments = listComments("pkg_seed_01");
    expect(comments.length).toBe(2);
    expect(comments[0].content).toBe("First");
    expect(comments[1].content).toBe("Second");
  });

  it("deletes comment by author", () => {
    const cmt = addComment("pkg_seed_01", USER_A, USER_A_NAME, "To delete");
    if ("error" in cmt) throw new Error("add failed");
    const ok = deleteComment(cmt.comment.id, USER_A);
    expect(ok).toBe(true);
    expect(listComments("pkg_seed_01").length).toBe(0);
  });

  it("cannot delete others' comments", () => {
    const cmt = addComment("pkg_seed_01", USER_A, USER_A_NAME, "Mine");
    if ("error" in cmt) throw new Error("add failed");
    const ok = deleteComment(cmt.comment.id, USER_B);
    expect(ok).toBe(false);
  });

  it("deletes child replies when parent is deleted", () => {
    const parent = addComment("pkg_seed_01", USER_A, USER_A_NAME, "Parent");
    if ("error" in parent) throw new Error("parent failed");
    addComment("pkg_seed_01", USER_B, USER_B_NAME, "Reply", parent.comment.id);
    deleteComment(parent.comment.id, USER_A);
    expect(listComments("pkg_seed_01").length).toBe(0);
  });
});

// ============ Reports ============

describe("Community Store: Reports", () => {
  it("creates a report", () => {
    const result = reportPackage("pkg_seed_01", USER_A, "Spam content", "low");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.report.severity).toBe("low");
      expect(result.report.status).toBe("pending");
    }
  });

  it("rejects duplicate report by same user", () => {
    reportPackage("pkg_seed_01", USER_A, "First report", "low");
    const dup = reportPackage("pkg_seed_01", USER_A, "Second report", "med");
    expect("error" in dup).toBe(true);
  });

  it("auto-flags package on high severity", () => {
    reportPackage("pkg_seed_01", USER_A, "Malicious content", "high");
    const pkg = getPackage("pkg_seed_01")!;
    expect(pkg.moderation_status).toBe("flagged");
  });

  it("auto-flags package after 3 reports", () => {
    reportPackage("pkg_seed_01", USER_A, "Report 1", "low");
    reportPackage("pkg_seed_01", USER_B, "Report 2", "low");
    // Need a 3rd user
    reportPackage("pkg_seed_01", "user_c@example.com", "Report 3", "low");
    const pkg = getPackage("pkg_seed_01")!;
    expect(pkg.moderation_status).toBe("flagged");
  });

  it("lists reports by package", () => {
    reportPackage("pkg_seed_01", USER_A, "R1", "low");
    reportPackage("pkg_seed_02", USER_A, "R2", "med");
    const reports = listReports({ packageId: "pkg_seed_01" });
    expect(reports.length).toBe(1);
    expect(reports[0].package_id).toBe("pkg_seed_01");
  });

  it("resolves a report", () => {
    const r = reportPackage("pkg_seed_01", USER_A, "R", "low");
    if ("error" in r) throw new Error("report failed");
    const result = resolveReport(r.report.id, "resolved");
    expect(result.ok).toBe(true);
    const reports = listReports();
    expect(reports[0].status).toBe("resolved");
    expect(reports[0].resolved_at).not.toBeNull();
  });
});

// ============ UGC Closed Loop ============

describe("UGC Closed Loop", () => {
  it("publish -> install -> rate -> comment -> report", () => {
    // 1. Publish
    const pub = publishPackage(
      { playbook_id: "pb_loop", title: "Loop Test", description: "Closed loop", tags: ["test"], version: "1.0.0" },
      USER_A, USER_A_NAME,
    );
    expect("error" in pub).toBe(false);
    if ("error" in pub) return;
    const pkgId = pub.package.package_id;

    // 2. Install
    const inst = installPackage(pkgId, USER_B);
    expect("error" in inst).toBe(false);

    // 3. Rate
    const rate = ratePackage(pkgId, USER_B, 4);
    expect("error" in rate).toBe(false);

    // 4. Comment
    const cmt = addComment(pkgId, USER_B, USER_B_NAME, "Works as expected");
    expect("error" in cmt).toBe(false);

    // 5. Report (different user)
    const rpt = reportPackage(pkgId, "user_c@example.com", "Minor issue", "low");
    expect("error" in rpt).toBe(false);

    // Verify state
    const pkg = getPackage(pkgId)!;
    expect(pkg.installed_count).toBe(1);
    expect(pkg.rating_count).toBe(1);
    expect(pkg.rating_avg).toBe(4);
    expect(listComments(pkgId).length).toBe(1);
    expect(listReports({ packageId: pkgId }).length).toBe(1);
  });
});
