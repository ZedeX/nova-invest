/**
 * TDD Spec — ADR-0013: Playbook System
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0013-playbook-system.md
 *
 * Test scope (per task plan):
 *   - PlaybookValidator: 6-stage validation pipeline
 *       Stage 1: schema (required fields)
 *       Stage 2: strategy (delegates to validateStrategy)
 *       Stage 3: dependency graph (no cycles)
 *       Stage 4: Function()/eval ban
 *       Stage 5: identifier allowlist
 *       Stage 6: param range
 *   - detectCycles: topological cycle detection on dependency edges
 *   - installPlaybook: D1 INSERT (mocked)
 *
 * The Playbook shape used here is the task's simplified interface
 * `{ id, name, version, description, strategy, dependencies, created_at }`,
 * not the full ADR-0013 PlaybookYAML schema. The 6-stage pipeline and
 * cycle detection logic are identical regardless of which shape wraps them.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlaybookValidator,
  detectCycles,
  installPlaybook,
} from "@/lib/playbook/system";
import type { Playbook, PlaybookDependency } from "@/lib/playbook/types";
import type { Strategy } from "@/lib/strategy/types";

// ---------- Fixtures ----------

function validStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "s-1",
    name: "SMA cross",
    expression: {
      type: "BinaryExpression",
      operator: ">",
      left: { type: "Identifier", name: "close" },
      right: { type: "Literal", value: 100 },
    },
    created_at: "2026-07-19T00:00:00Z",
    ...overrides,
  };
}

function validPlaybook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    id: "pb-1",
    name: "Momentum Composite",
    version: "1.0.0",
    description: "Long-only momentum strategy",
    strategy: validStrategy(),
    dependencies: [],
    created_at: "2026-07-19T00:00:00Z",
    ...overrides,
  };
}

/** Build a mock D1 binding per the task's test pattern. */
function mockD1() {
  const run = vi.fn();
  const bind = vi.fn(() => ({ run }));
  const prepare = vi.fn((_sql: string) => ({ bind }));
  return { prepare, bind, run };
}

describe("ADR-0013: Playbook System", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ---------- Stage 1: PlaybookValidator.validate happy path ----------

  describe("PlaybookValidator", () => {
    const validator = new PlaybookValidator();

    it("returns success for a valid playbook", () => {
      const result = validator.validate(validPlaybook());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    // ---------- Stage 1: Schema ----------

    it("Stage 1: rejects playbook missing required fields", () => {
      // Missing name + version + description
      const broken = {
        ...validPlaybook(),
        name: "",
        version: "",
        description: "",
      } as Playbook;
      const result = validator.validate(broken);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    // ---------- Stage 2: Strategy delegation ----------

    it("Stage 2: rejects playbook with invalid strategy (delegates to validateStrategy)", () => {
      const pb = validPlaybook({
        strategy: validStrategy({
          expression: { type: "Identifier", name: "foo" },
        }),
      });
      const result = validator.validate(pb);
      expect(result.valid).toBe(false);
      // validateStrategy surfaces the unknown-identifier error
      expect(result.errors.some((e) => e.includes("foo"))).toBe(true);
    });

    // ---------- Stage 3: Dependency cycles ----------

    it("Stage 3: detects cycle A→B→A and returns cycle path", () => {
      const deps: PlaybookDependency[] = [
        { parent_id: "A", child_id: "B" },
        { parent_id: "B", child_id: "A" },
      ];
      const cycle = detectCycles(deps);
      expect(cycle.length).toBeGreaterThan(0);
      // Cycle starts and ends at the same node
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    });

    it("Stage 3: returns empty for acyclic A→B→C", () => {
      const deps: PlaybookDependency[] = [
        { parent_id: "A", child_id: "B" },
        { parent_id: "B", child_id: "C" },
      ];
      expect(detectCycles(deps)).toEqual([]);
    });

    // ---------- Stage 4: Function()/eval ban ----------

    it("Stage 4: rejects strategy containing Function(\"return this\")()", () => {
      const pb = validPlaybook({
        strategy: validStrategy({
          expression: {
            type: "CallExpression",
            callee: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "Function" },
              args: [{ type: "Literal", value: "return this" }],
            },
            args: [],
          },
        }),
      });
      const result = validator.validate(pb);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /function/i.test(e))).toBe(true);
    });

    it("Stage 4: rejects strategy containing eval(\"...\")", () => {
      const pb = validPlaybook({
        strategy: validStrategy({
          expression: {
            type: "CallExpression",
            callee: { type: "Identifier", name: "eval" },
            args: [{ type: "Literal", value: "malicious code" }],
          },
        }),
      });
      const result = validator.validate(pb);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /eval/i.test(e))).toBe(true);
    });

    // ---------- Stage 5: Identifier allowlist ----------

    it("Stage 5: rejects strategy referencing window.location", () => {
      const pb = validPlaybook({
        strategy: validStrategy({
          expression: {
            type: "MemberExpression",
            object: { type: "Identifier", name: "window" },
            property: { type: "Identifier", name: "location" },
          },
        }),
      });
      const result = validator.validate(pb);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /window/i.test(e))).toBe(true);
    });

    // ---------- Stage 6: Param range ----------

    it("Stage 6: rejects sma(close, 1000) (exceeds max period)", () => {
      const pb = validPlaybook({
        strategy: validStrategy({
          expression: {
            type: "CallExpression",
            callee: { type: "Identifier", name: "sma" },
            args: [
              { type: "Identifier", name: "close" },
              { type: "Literal", value: 1000 },
            ],
          },
        }),
      });
      const result = validator.validate(pb);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /period/i.test(e))).toBe(true);
    });
  });

  // ---------- installPlaybook ----------

  describe("installPlaybook", () => {
    it("calls D1 INSERT for a valid playbook (mock)", async () => {
      const d1 = mockD1();
      const result = await installPlaybook(validPlaybook(), d1 as any);
      expect(result.success).toBe(true);
      expect(d1.prepare).toHaveBeenCalled();
      // Verify an INSERT statement was prepared
      const sql = (d1.prepare.mock.calls[0]?.[0] ?? "") as string;

      expect(/INSERT\s+INTO\s+playbooks/i.test(String(sql))).toBe(true);
    });

    it("returns success:true for a valid playbook", async () => {
      const d1 = mockD1();
      const result = await installPlaybook(validPlaybook(), d1);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns success:false with error for an invalid playbook", async () => {
      const d1 = mockD1();
      const broken = validPlaybook({
        strategy: validStrategy({
          expression: { type: "Identifier", name: "eval" },
        }),
      });
      const result = await installPlaybook(broken, d1);
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe("string");
      expect(result.error!.length).toBeGreaterThan(0);
      // D1 must NOT be touched when validation fails
      expect(d1.prepare).not.toHaveBeenCalled();
    });
  });

  // ---------- detectCycles edge cases ----------

  describe("detectCycles edge cases", () => {
    it("handles self-dependency A→A", () => {
      const deps: PlaybookDependency[] = [
        { parent_id: "A", child_id: "A" },
      ];
      const cycle = detectCycles(deps);
      expect(cycle).toEqual(["A", "A"]);
    });

    it("handles complex cycle A→B→C→A", () => {
      const deps: PlaybookDependency[] = [
        { parent_id: "A", child_id: "B" },
        { parent_id: "B", child_id: "C" },
        { parent_id: "C", child_id: "A" },
      ];
      const cycle = detectCycles(deps);
      expect(cycle).toEqual(["A", "B", "C", "A"]);
    });
  });
});
