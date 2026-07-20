/**
 * Unit tests for Epic 08 Playbook System.
 *
 * Covers:
 *   - Validator: SemVer, narrative, composition weights, circular dependency
 *   - Executor: 3 composition types + strategy + narrative skip
 *   - Store: CRUD + version publish + lifecycle + 5 mock seeds
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateSemver,
  isSemverGreater,
  parseSemver,
  validateNarrative,
  validateComposition,
  validatePlaybookYAML,
  detectCircularDependency,
  buildDependencyGraph,
} from "@/lib/playbook/validator";
import { PlaybookExecutor } from "@/lib/playbook/executor";
import {
  _resetStoreForTest,
  listPlaybooks,
  getPlaybook,
  createPlaybook,
  publishVersion,
  deletePlaybook,
  updateLifecycleStatus,
} from "@/lib/playbook/store";
import type {
  Composition,
  ExecutionContext,
  Narrative,
  PlaybookYAML,
} from "@/lib/playbook/types";

// ============ Validator: SemVer ============

describe("Validator: SemVer", () => {
  it("parses valid semver", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("0.0.1")).toEqual([0, 0, 1]);
    expect(parseSemver("10.20.30")).toEqual([10, 20, 30]);
  });

  it("rejects invalid semver", () => {
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("1.2.3.4")).toBeNull();
    expect(parseSemver("v1.2.3")).toBeNull();
    expect(parseSemver("1.2.3-beta")).toBeNull();
  });

  it("compares semver correctly", () => {
    expect(isSemverGreater("1.1.0", "1.0.0")).toBe(true);
    expect(isSemverGreater("2.0.0", "1.9.9")).toBe(true);
    expect(isSemverGreater("1.0.1", "1.0.0")).toBe(true);
    expect(isSemverGreater("1.0.0", "1.0.0")).toBe(false);
    expect(isSemverGreater("0.9.0", "1.0.0")).toBe(false);
  });

  it("validates new version is greater than current", () => {
    expect(validateSemver("1.1.0", "1.0.0").ok).toBe(true);
    expect(validateSemver("0.9.0", "1.0.0").ok).toBe(false);
    expect(validateSemver("invalid", "1.0.0").ok).toBe(false);
    expect(validateSemver("1.0.0").ok).toBe(true); // no current version
  });
});

// ============ Validator: Narrative ============

describe("Validator: Narrative", () => {
  const valid: Narrative = {
    why: "Because of X",
    how: "Do Y",
    risks: ["Risk 1"],
  };

  it("accepts valid narrative", () => {
    expect(validateNarrative(valid).ok).toBe(true);
  });

  it("rejects missing why", () => {
    expect(validateNarrative({ ...valid, why: "" }).ok).toBe(false);
    expect(validateNarrative({ ...valid, why: "" }).reason).toContain("why");
  });

  it("rejects missing how", () => {
    expect(validateNarrative({ ...valid, how: "" }).ok).toBe(false);
  });

  it("rejects empty risks array", () => {
    expect(validateNarrative({ ...valid, risks: [] }).ok).toBe(false);
    expect(validateNarrative({ ...valid, risks: [] }).reason).toContain("risks");
  });
});

// ============ Validator: Composition ============

describe("Validator: Composition", () => {
  it("accepts parallel with weight sum = 1.0", () => {
    const comp: Composition = {
      type: "parallel",
      allocation: [
        { playbook_id: "a", weight: 0.5 },
        { playbook_id: "b", weight: 0.3 },
        { playbook_id: "c", weight: 0.2 },
      ],
    };
    expect(validateComposition(comp).ok).toBe(true);
  });

  it("rejects parallel with weight sum != 1.0", () => {
    const comp: Composition = {
      type: "parallel",
      allocation: [
        { playbook_id: "a", weight: 0.5 },
        { playbook_id: "b", weight: 0.3 },
        { playbook_id: "c", weight: 0.4 }, // sum = 1.2
      ],
    };
    const result = validateComposition(comp);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("1.0");
    expect(result.reason).toContain("1.2");
  });

  it("rejects parallel with weight out of [0,1]", () => {
    const comp: Composition = {
      type: "parallel",
      allocation: [{ playbook_id: "a", weight: 1.5 }],
    };
    expect(validateComposition(comp).ok).toBe(false);
  });

  it("accepts valid sequential", () => {
    const comp: Composition = {
      type: "sequential",
      sequence: [
        { playbook_id: "a" },
        { playbook_id: "b", depends_on: "a" },
        { playbook_id: "c", depends_on: "b" },
      ],
    };
    expect(validateComposition(comp).ok).toBe(true);
  });

  it("rejects sequential with invalid depends_on", () => {
    const comp: Composition = {
      type: "sequential",
      sequence: [
        { playbook_id: "a" },
        { playbook_id: "b", depends_on: "nonexistent" },
      ],
    };
    expect(validateComposition(comp).ok).toBe(false);
  });

  it("accepts valid conditional", () => {
    const comp: Composition = {
      type: "conditional",
      condition: {
        if: { field: "earnings", op: ">", value: 0 },
        then: "pb_buy",
        else: "pb_hold",
      },
    };
    expect(validateComposition(comp).ok).toBe(true);
  });

  it("rejects conditional without then", () => {
    const comp: Composition = {
      type: "conditional",
      condition: {
        if: { field: "x", op: ">", value: 0 },
        then: "",
      },
    };
    expect(validateComposition(comp).ok).toBe(false);
  });
});

// ============ Validator: Circular dependency ============

describe("Validator: Circular dependency", () => {
  it("detects no cycle in DAG", () => {
    const graph = new Map([
      ["A", ["B", "C"]],
      ["B", ["D"]],
      ["C", ["D"]],
      ["D", []],
    ]);
    expect(detectCircularDependency(graph)).toEqual([]);
  });

  it("detects simple cycle A -> B -> A", () => {
    const graph = new Map([
      ["A", ["B"]],
      ["B", ["A"]],
    ]);
    const cycle = detectCircularDependency(graph);
    expect(cycle.length).toBeGreaterThan(0);
    expect(cycle[0]).toBe(cycle[cycle.length - 1]); // starts and ends with same node
  });

  it("detects self-loop", () => {
    const graph = new Map([["A", ["A"]]]);
    const cycle = detectCircularDependency(graph);
    expect(cycle).toEqual(["A", "A"]);
  });

  it("detects longer cycle A -> B -> C -> A", () => {
    const graph = new Map([
      ["A", ["B"]],
      ["B", ["C"]],
      ["C", ["A"]],
    ]);
    const cycle = detectCircularDependency(graph);
    expect(cycle.length).toBe(4); // A, B, C, A
  });

  it("buildDependencyGraph resolves nested composition", () => {
    const resolver = (id: string) => {
      if (id === "root") return { type: "parallel" as const, allocation: [{ playbook_id: "child1", weight: 0.5 }, { playbook_id: "child2", weight: 0.5 }] };
      return undefined;
    };
    const graph = buildDependencyGraph("root", resolver("root"), resolver);
    expect(graph.get("root")).toEqual(["child1", "child2"]);
    expect(graph.has("child1")).toBe(true);
    expect(graph.has("child2")).toBe(true);
  });
});

// ============ Validator: Full PlaybookYAML ============

describe("Validator: Full PlaybookYAML", () => {
  function makeValid(): PlaybookYAML {
    return {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "strategy",
      metadata: {
        id: "pb_test",
        title: "Test",
        description: "Test playbook",
        author: { id: "user1", name: "User" },
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
      versioning: {
        semantic_version: "1.0.0",
        changelog: [{ version: "1.0.0", date: "2025-01-01", changes: "Initial" }],
      },
      narrative: { why: "Because", how: "Do this", risks: ["Risk 1"] },
      strategy: { dsl_ref: "r2://strategies/test.yaml" },
    };
  }

  it("accepts valid playbook", () => {
    expect(validatePlaybookYAML(makeValid()).ok).toBe(true);
  });

  it("rejects invalid api_version", () => {
    const pb = makeValid();
    pb.api_version = "wrong";
    expect(validatePlaybookYAML(pb).ok).toBe(false);
  });

  it("rejects invalid kind", () => {
    const pb = makeValid();
    pb.kind = "invalid" as "strategy";
    expect(validatePlaybookYAML(pb).ok).toBe(false);
  });

  it("rejects strategy kind without strategy field", () => {
    const pb = makeValid();
    delete pb.strategy;
    expect(validatePlaybookYAML(pb).ok).toBe(false);
  });

  it("rejects composite kind without composition", () => {
    const pb = makeValid();
    pb.kind = "composite";
    delete pb.strategy;
    expect(validatePlaybookYAML(pb).ok).toBe(false);
  });

  it("rejects version not greater than current", () => {
    const pb = makeValid();
    pb.versioning.semantic_version = "0.9.0";
    expect(validatePlaybookYAML(pb, "1.0.0").ok).toBe(false);
  });
});

// ============ Executor ============

describe("PlaybookExecutor", () => {
  const loader = vi.fn(async (id: string): Promise<PlaybookYAML | null> => {
    // Return a minimal strategy playbook for any child
    return {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "strategy",
      metadata: {
        id,
        title: `Child ${id}`,
        description: "Child",
        author: { id: "user", name: "User" },
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
      versioning: { semantic_version: "1.0.0", changelog: [] },
      narrative: { why: "x", how: "y", risks: ["r"] },
      strategy: { dsl_ref: "r2://test.yaml" },
    };
  });

  const ctx: ExecutionContext = {
    userId: "test_user",
    capital: 100_000,
    timestamp: "2025-01-01T00:00:00Z",
  };

  beforeEach(() => {
    loader.mockClear();
  });

  it("executes strategy kind", async () => {
    const executor = new PlaybookExecutor(loader);
    const pb: PlaybookYAML = {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "strategy",
      metadata: { id: "pb_strat", title: "S", description: "d", author: { id: "u", name: "n" }, created_at: "", updated_at: "" },
      versioning: { semantic_version: "1.0.0", changelog: [] },
      narrative: { why: "x", how: "y", risks: ["r"] },
      strategy: { dsl_ref: "r2://test.yaml" },
    };
    const result = await executor.execute(pb, ctx);
    expect(result.status).toBe("success");
    expect(result.playbook_id).toBe("pb_strat");
  });

  it("executes parallel composition with capital split", async () => {
    const executor = new PlaybookExecutor(loader);
    const pb: PlaybookYAML = {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "composite",
      metadata: { id: "pb_combo", title: "C", description: "d", author: { id: "u", name: "n" }, created_at: "", updated_at: "" },
      versioning: { semantic_version: "1.0.0", changelog: [] },
      narrative: { why: "x", how: "y", risks: ["r"] },
      composition: {
        type: "parallel",
        allocation: [
          { playbook_id: "child_a", weight: 0.6 },
          { playbook_id: "child_b", weight: 0.4 },
        ],
      },
    };
    const result = await executor.execute(pb, ctx);
    expect(result.status).toBe("success");
    expect(result.children).toBeDefined();
    expect(result.children!.length).toBe(2);
    expect(loader).toHaveBeenCalledWith("child_a");
    expect(loader).toHaveBeenCalledWith("child_b");
  });

  it("executes sequential composition with state passing", async () => {
    const executor = new PlaybookExecutor(loader);
    const pb: PlaybookYAML = {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "composite",
      metadata: { id: "pb_seq", title: "S", description: "d", author: { id: "u", name: "n" }, created_at: "", updated_at: "" },
      versioning: { semantic_version: "1.0.0", changelog: [] },
      narrative: { why: "x", how: "y", risks: ["r"] },
      composition: {
        type: "sequential",
        sequence: [
          { playbook_id: "step1" },
          { playbook_id: "step2", depends_on: "step1" },
        ],
      },
    };
    const result = await executor.execute(pb, ctx);
    expect(result.status).toBe("success");
    expect(result.children!.length).toBe(2);
  });

  it("executes conditional composition - then branch", async () => {
    const executor = new PlaybookExecutor(loader);
    const pb: PlaybookYAML = {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "composite",
      metadata: { id: "pb_cond", title: "C", description: "d", author: { id: "u", name: "n" }, created_at: "", updated_at: "" },
      versioning: { semantic_version: "1.0.0", changelog: [] },
      narrative: { why: "x", how: "y", risks: ["r"] },
      composition: {
        type: "conditional",
        condition: {
          if: { field: "earnings", op: ">", value: 0 },
          then: "pb_buy",
          else: "pb_hold",
        },
      },
    };
    const ctxWithState: ExecutionContext = { ...ctx, state: { earnings: 1.5 } };
    const result = await executor.execute(pb, ctxWithState);
    expect(result.status).toBe("success");
    expect(loader).toHaveBeenCalledWith("pb_buy");
    expect(loader).not.toHaveBeenCalledWith("pb_hold");
  });

  it("executes conditional composition - else branch", async () => {
    const executor = new PlaybookExecutor(loader);
    const pb: PlaybookYAML = {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "composite",
      metadata: { id: "pb_cond", title: "C", description: "d", author: { id: "u", name: "n" }, created_at: "", updated_at: "" },
      versioning: { semantic_version: "1.0.0", changelog: [] },
      narrative: { why: "x", how: "y", risks: ["r"] },
      composition: {
        type: "conditional",
        condition: {
          if: { field: "earnings", op: ">", value: 0 },
          then: "pb_buy",
          else: "pb_hold",
        },
      },
    };
    const ctxWithState: ExecutionContext = { ...ctx, state: { earnings: -0.5 } };
    const result = await executor.execute(pb, ctxWithState);
    expect(result.status).toBe("success");
    expect(loader).toHaveBeenCalledWith("pb_hold");
  });

  it("skips narrative kind (not executable)", async () => {
    const executor = new PlaybookExecutor(loader);
    const pb: PlaybookYAML = {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "narrative",
      metadata: { id: "pb_nar", title: "N", description: "d", author: { id: "u", name: "n" }, created_at: "", updated_at: "" },
      versioning: { semantic_version: "1.0.0", changelog: [] },
      narrative: { why: "x", how: "y", risks: ["r"] },
    };
    const result = await executor.execute(pb, ctx);
    expect(result.status).toBe("skipped");
  });

  it("handles missing child playbook gracefully", async () => {
    const nullLoader = vi.fn(async () => null);
    const executor = new PlaybookExecutor(nullLoader);
    const pb: PlaybookYAML = {
      api_version: "playbook.nova-invest.dev/v1",
      kind: "composite",
      metadata: { id: "pb_missing", title: "M", description: "d", author: { id: "u", name: "n" }, created_at: "", updated_at: "" },
      versioning: { semantic_version: "1.0.0", changelog: [] },
      narrative: { why: "x", how: "y", risks: ["r"] },
      composition: {
        type: "parallel",
        allocation: [{ playbook_id: "missing_child", weight: 1.0 }],
      },
    };
    const result = await executor.execute(pb, ctx);
    expect(result.status).toBe("success");
    expect(result.children![0].status).toBe("failed");
    expect(result.children![0].error).toContain("not found");
  });
});

// ============ Store ============

describe("Playbook Store", () => {
  beforeEach(() => {
    _resetStoreForTest();
  });

  afterEach(() => {
    _resetStoreForTest();
  });

  it("seeds 5 mock playbooks on init", () => {
    const all = listPlaybooks();
    expect(all.length).toBe(5);
    const kinds = all.map((p) => p.kind);
    expect(kinds).toContain("strategy");
    expect(kinds).toContain("composite");
    expect(kinds).toContain("narrative");
  });

  it("filters by kind", () => {
    const strategies = listPlaybooks({ kind: "strategy" });
    expect(strategies.length).toBe(3); // nvda_macross, aapl_rsi, tsla_bollinger
    expect(strategies.every((p) => p.kind === "strategy")).toBe(true);
  });

  it("filters by lifecycle_status", () => {
    const published = listPlaybooks({ lifecycle_status: "published" });
    expect(published.length).toBe(5);
    const drafts = listPlaybooks({ lifecycle_status: "draft" });
    expect(drafts.length).toBe(0);
  });

  it("gets playbook by ID", () => {
    const pb = getPlaybook("pb_nvda_macross");
    expect(pb).not.toBeNull();
    expect(pb!.metadata.title).toContain("NVDA");
    expect(pb!.kind).toBe("strategy");
  });

  it("returns null for nonexistent ID", () => {
    expect(getPlaybook("nonexistent")).toBeNull();
  });

  it("creates a new playbook", () => {
    const result = createPlaybook(
      {
        title: "Test Strategy",
        description: "Test",
        kind: "strategy",
        yaml: JSON.stringify({
          api_version: "playbook.nova-invest.dev/v1",
          kind: "strategy",
          metadata: {
            id: "pb_test_new",
            title: "Test Strategy",
            description: "Test",
            author: { id: "u", name: "U" },
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
          versioning: { semantic_version: "1.0.0", changelog: [] },
          narrative: { why: "x", how: "y", risks: ["r"] },
          strategy: { dsl_ref: "r2://test.yaml" },
        }),
        narrative: { why: "x", how: "y", risks: ["r"] },
      },
      "test_user",
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.record.id).toBe("pb_test_new");
      expect(result.record.lifecycle_status).toBe("draft");
    }
  });

  it("rejects duplicate ID", () => {
    const result = createPlaybook(
      {
        title: "Duplicate",
        description: "d",
        kind: "strategy",
        yaml: JSON.stringify({
          api_version: "playbook.nova-invest.dev/v1",
          kind: "strategy",
          metadata: {
            id: "pb_nvda_macross", // already exists
            title: "Dup",
            description: "d",
            author: { id: "u", name: "U" },
            created_at: "", updated_at: "",
          },
          versioning: { semantic_version: "1.0.0", changelog: [] },
          narrative: { why: "x", how: "y", risks: ["r"] },
          strategy: { dsl_ref: "r2://x.yaml" },
        }),
        narrative: { why: "x", how: "y", risks: ["r"] },
      },
      "test_user",
    );
    expect("error" in result).toBe(true);
  });

  it("publishes new version with valid semver", () => {
    const result = publishVersion(
      "pb_nvda_macross",
      {
        version: "1.3.0",
        changelog: "Added risk management",
        yaml: JSON.stringify({
          api_version: "playbook.nova-invest.dev/v1",
          kind: "strategy",
          metadata: {
            id: "pb_nvda_macross",
            title: "NVDA 双均线金叉策略",
            description: "Updated",
            author: { id: "u", name: "U" },
            created_at: "", updated_at: "",
          },
          versioning: { semantic_version: "1.3.0", changelog: [] },
          narrative: { why: "x", how: "y", risks: ["r"] },
          strategy: { dsl_ref: "r2://test.yaml" },
        }),
      },
      "test_user",
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.record.current_version).toBe("1.3.0");
    }
  });

  it("rejects version not greater than current", () => {
    const result = publishVersion(
      "pb_nvda_macross",
      {
        version: "1.0.0", // current is 1.2.0
        changelog: "x",
        yaml: JSON.stringify({
          api_version: "playbook.nova-invest.dev/v1",
          kind: "strategy",
          metadata: { id: "pb_nvda_macross", title: "x", description: "d", author: { id: "u", name: "U" }, created_at: "", updated_at: "" },
          versioning: { semantic_version: "1.0.0", changelog: [] },
          narrative: { why: "x", how: "y", risks: ["r"] },
          strategy: { dsl_ref: "r2://x.yaml" },
        }),
      },
      "test_user",
    );
    expect("error" in result).toBe(true);
  });

  it("updates lifecycle status", () => {
    const result = updateLifecycleStatus("pb_nvda_macross", "archived");
    expect(result.ok).toBe(true);
    // Record status updated (getPlaybook returns yaml, but record is in store)
    const records = listPlaybooks();
    const record = records.find((r) => r.id === "pb_nvda_macross");
    expect(record!.lifecycle_status).toBe("archived");
  });

  it("deletes playbook", () => {
    expect(deletePlaybook("pb_nvda_macross")).toBe(true);
    expect(getPlaybook("pb_nvda_macross")).toBeNull();
    expect(deletePlaybook("pb_nvda_macross")).toBe(false); // already deleted
  });

  it("retrieves specific version", () => {
    // pb_nvda_macross has 1.2.0 as current; verify version retrieval
    const pb = getPlaybook("pb_nvda_macross", "1.2.0");
    expect(pb).not.toBeNull();
    expect(pb!.versioning.semantic_version).toBe("1.2.0");

    const oldVersion = getPlaybook("pb_nvda_macross", "0.9.0");
    expect(oldVersion).toBeNull();
  });
});
