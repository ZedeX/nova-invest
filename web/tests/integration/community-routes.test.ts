/**
 * Integration tests for Community API routes (Epic 07, Sprint 8).
 *
 * Tests the route handlers directly by calling them with mock Request
 * objects, verifying request/response contract for:
 *   - GET/POST /api/community/playbook (list + publish)
 *   - POST /api/community/playbook/[id]/install
 *   - POST/GET /api/community/playbook/[id]/rate
 *   - GET/POST/DELETE /api/community/playbook/[id]/comments
 *   - POST/GET /api/community/playbook/[id]/report
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GET as listPackages, POST as publishPackage } from "@/app/api/community/playbook/route";
import { POST as installPackage, GET as listInstalls } from "@/app/api/community/playbook/[id]/install/route";
import { POST as ratePackage, GET as getRating } from "@/app/api/community/playbook/[id]/rate/route";
import { GET as listComments, POST as addComment, DELETE as deleteComment } from "@/app/api/community/playbook/[id]/comments/route";
import { POST as reportPackage, GET as listReports } from "@/app/api/community/playbook/[id]/report/route";
import { _resetStoreForTest } from "@/lib/community/store";
import type { NextRequest } from "next/server";

beforeEach(() => {
  _resetStoreForTest();
});

function makeGetRequest(url: string): NextRequest {
  return new Request(new URL(url, "http://localhost:3000")) as unknown as NextRequest;
}

function makePostRequest(url: string, body: unknown): NextRequest {
  return new Request(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeDeleteRequest(url: string): NextRequest {
  return new Request(new URL(url, "http://localhost:3000"), {
    method: "DELETE",
  }) as unknown as NextRequest;
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function parseRes(res: Response) {
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

// ============ List + Publish ============

describe("GET /api/community/playbook", () => {
  it("returns 10 seed packages", async () => {
    const res = await listPackages(makeGetRequest("/api/community/playbook"));
    const { body } = await parseRes(res);
    expect(body.total).toBe(10);
    expect((body.data as unknown[])).toHaveLength(10);
  });

  it("searches by keyword", async () => {
    const res = await listPackages(makeGetRequest("/api/community/playbook?q=NVDA"));
    const { body } = await parseRes(res);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("filters by tags", async () => {
    const res = await listPackages(makeGetRequest("/api/community/playbook?tags=momentum"));
    const { body } = await parseRes(res);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("sorts by rating", async () => {
    const res = await listPackages(makeGetRequest("/api/community/playbook?sort=rating&limit=3"));
    const { body } = await parseRes(res);
    const pkgs = body.data as { rating_avg: number }[];
    for (let i = 1; i < pkgs.length; i++) {
      expect(pkgs[i - 1].rating_avg).toBeGreaterThanOrEqual(pkgs[i].rating_avg);
    }
  });

  it("paginates with limit+offset", async () => {
    const res = await listPackages(makeGetRequest("/api/community/playbook?limit=3&offset=0"));
    const { body } = await parseRes(res);
    expect(body.count).toBe(3);
    expect(body.total).toBe(10);
  });
});

describe("POST /api/community/playbook", () => {
  it("publishes a new package", async () => {
    const res = await publishPackage(makePostRequest("/api/community/playbook", {
      playbook_id: "pb_test_1",
      title: "Test Strategy",
      description: "A test strategy",
      tags: ["test"],
      version: "1.0.0",
    }));
    const { status, body } = await parseRes(res);
    expect(status).toBe(201);
    const data = body.data as { title: string; moderation_status: string };
    expect(data.title).toBe("Test Strategy");
    expect(data.moderation_status).toBe("approved");
  });

  it("rejects missing required fields", async () => {
    const res = await publishPackage(makePostRequest("/api/community/playbook", {
      title: "No playbook_id",
    }));
    const { status } = await parseRes(res);
    expect(status).toBe(400);
  });

  it("rejects duplicate content", async () => {
    await publishPackage(makePostRequest("/api/community/playbook", {
      playbook_id: "pb_dup1",
      title: "Unique Title",
      description: "Unique desc",
      version: "1.0.0",
    }));
    const res = await publishPackage(makePostRequest("/api/community/playbook", {
      playbook_id: "pb_dup2",
      title: "Unique Title",
      description: "Unique desc",
      version: "1.0.0",
    }));
    const { status } = await parseRes(res);
    expect(status).toBe(422);
  });
});

// ============ Install ============

describe("POST /api/community/playbook/[id]/install", () => {
  it("installs a seed package", async () => {
    const req = makePostRequest("/api/community/playbook/pkg_seed_01/install", {});
    const res = await installPackage(req, makeContext("pkg_seed_01"));
    const { status, body } = await parseRes(res);
    expect(status).toBe(201);
    const data = body.data as { package_id: string };
    expect(data.package_id).toBe("pkg_seed_01");
  });

  it("lists user installs", async () => {
    const postReq = makePostRequest("/api/community/playbook/pkg_seed_01/install", {});
    await installPackage(postReq, makeContext("pkg_seed_01"));
    // GET handler takes no args (DEMO_USER hardcoded)
    const res = await listInstalls();
    const { body } = await parseRes(res);
    expect(body.count).toBeGreaterThanOrEqual(1);
  });
});

// ============ Rate ============

describe("POST /api/community/playbook/[id]/rate", () => {
  it("rates a package 1-5", async () => {
    const req = makePostRequest("/api/community/playbook/pkg_seed_01/rate", { rating: 5 });
    const res = await ratePackage(req, makeContext("pkg_seed_01"));
    const { status, body } = await parseRes(res);
    expect(status).toBe(201);
    const data = body.data as { rating: number };
    expect(data.rating).toBe(5);
  });

  it("rejects invalid rating", async () => {
    const req = makePostRequest("/api/community/playbook/pkg_seed_01/rate", { rating: 6 });
    const res = await ratePackage(req, makeContext("pkg_seed_01"));
    const { status } = await parseRes(res);
    expect(status).toBe(422);
  });

  it("gets user rating", async () => {
    const postReq = makePostRequest("/api/community/playbook/pkg_seed_01/rate", { rating: 4 });
    await ratePackage(postReq, makeContext("pkg_seed_01"));
    const getReq = makeGetRequest("/api/community/playbook/pkg_seed_01/rate");
    const res = await getRating(getReq, makeContext("pkg_seed_01"));
    const { body } = await parseRes(res);
    const data = body.data as { rating: number };
    expect(data.rating).toBe(4);
  });
});

// ============ Comments ============

describe("POST /api/community/playbook/[id]/comments", () => {
  it("adds a top-level comment", async () => {
    const req = makePostRequest("/api/community/playbook/pkg_seed_01/comments", { content: "Great!" });
    const res = await addComment(req, makeContext("pkg_seed_01"));
    const { status, body } = await parseRes(res);
    expect(status).toBe(201);
    const data = body.data as { content: string; parent_id: string | null };
    expect(data.content).toBe("Great!");
    expect(data.parent_id).toBeNull();
  });

  it("lists comments", async () => {
    const postReq = makePostRequest("/api/community/playbook/pkg_seed_01/comments", { content: "Hello" });
    await addComment(postReq, makeContext("pkg_seed_01"));
    const getReq = makeGetRequest("/api/community/playbook/pkg_seed_01/comments");
    const res = await listComments(getReq, makeContext("pkg_seed_01"));
    const { body } = await parseRes(res);
    expect(body.count).toBe(1);
  });

  it("deletes a comment", async () => {
    const postReq = makePostRequest("/api/community/playbook/pkg_seed_01/comments", { content: "To delete" });
    const postRes = await addComment(postReq, makeContext("pkg_seed_01"));
    const postJson = await postRes.json() as { data: { id: string } };
    const delReq = makeDeleteRequest(`/api/community/playbook/pkg_seed_01/comments?comment_id=${postJson.data.id}`);
    const delRes = await deleteComment(delReq, makeContext("pkg_seed_01"));
    const { status } = await parseRes(delRes);
    expect(status).toBe(200);
  });
});

// ============ Report ============

describe("POST /api/community/playbook/[id]/report", () => {
  it("creates a report", async () => {
    const req = makePostRequest("/api/community/playbook/pkg_seed_01/report", {
      reason: "Spam content",
      severity: "low",
    });
    const res = await reportPackage(req, makeContext("pkg_seed_01"));
    const { status, body } = await parseRes(res);
    expect(status).toBe(201);
    const data = body.data as { severity: string; status: string };
    expect(data.severity).toBe("low");
    expect(data.status).toBe("pending");
  });

  it("lists reports for a package", async () => {
    const postReq = makePostRequest("/api/community/playbook/pkg_seed_01/report", {
      reason: "Test report",
      severity: "med",
    });
    await reportPackage(postReq, makeContext("pkg_seed_01"));
    const getReq = makeGetRequest("/api/community/playbook/pkg_seed_01/report");
    const res = await listReports(getReq, makeContext("pkg_seed_01"));
    const { body } = await parseRes(res);
    expect(body.count).toBe(1);
  });
});

// ============ UGC Closed Loop ============

describe("UGC Closed Loop via API", () => {
  it("publish -> install -> rate -> comment -> report", async () => {
    // 1. Publish
    const pubRes = await publishPackage(makePostRequest("/api/community/playbook", {
      playbook_id: "pb_loop_api",
      title: "Loop API Test",
      description: "Closed loop via API",
      tags: ["test"],
      version: "1.0.0",
    }));
    const { status: pubStatus, body: pubBody } = await parseRes(pubRes);
    expect(pubStatus).toBe(201);
    const pkgId = (pubBody.data as { package_id: string }).package_id;

    // 2. Install
    const instRes = await installPackage(
      makePostRequest(`/api/community/playbook/${pkgId}/install`, {}),
      makeContext(pkgId),
    );
    const { status: instStatus } = await parseRes(instRes);
    expect(instStatus).toBe(201);

    // 3. Rate
    const rateRes = await ratePackage(
      makePostRequest(`/api/community/playbook/${pkgId}/rate`, { rating: 4 }),
      makeContext(pkgId),
    );
    const { status: rateStatus } = await parseRes(rateRes);
    expect(rateStatus).toBe(201);

    // 4. Comment
    const cmtRes = await addComment(
      makePostRequest(`/api/community/playbook/${pkgId}/comments`, { content: "Works great!" }),
      makeContext(pkgId),
    );
    const { status: cmtStatus } = await parseRes(cmtRes);
    expect(cmtStatus).toBe(201);

    // 5. Report
    const rptRes = await reportPackage(
      makePostRequest(`/api/community/playbook/${pkgId}/report`, { reason: "Minor issue", severity: "low" }),
      makeContext(pkgId),
    );
    const { status: rptStatus } = await parseRes(rptRes);
    expect(rptStatus).toBe(201);
  });
});
