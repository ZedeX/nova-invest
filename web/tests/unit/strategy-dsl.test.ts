/**
 * TDD Spec — ADR-0008: Strategy DSL Schema
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0008-strategy-dsl-schema.md
 *
 * Test scope (per task plan):
 *   - parseStrategy: minimal jsep-compatible recursive descent parser
 *   - validateStrategy: identifier allowlist + Function/eval ban + param ranges
 *   - evaluateStrategy: recursive AST evaluator
 *
 * jsep is NOT installed (per task constraints). A minimal custom parser
 * produces AST nodes matching the jsep-compatible shape defined in
 * `web/src/lib/strategy/types.ts`.
 *
 * Allowed identifiers (closed set): close, open, high, low, volume, sma, ema, rsi
 * Disallowed identifiers (security): eval, Function, window, global, process
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateStrategy,
  parseStrategy,
  validateStrategy,
} from "@/lib/strategy/dsl";
import type { Expression, Strategy } from "@/lib/strategy/types";

// Helper: build a strategy fixture with a given expression
function makeStrategy(expr: Expression, overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "s-test",
    name: "Test Strategy",
    expression: expr,
    created_at: "2026-07-19T00:00:00Z",
    ...overrides,
  };
}

describe("ADR-0008: Strategy DSL", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ---------- parseStrategy: AST node types ----------

  describe("parseStrategy", () => {
    it("parseStrategy('close > 100') returns BinaryExpression AST", () => {
      const ast = parseStrategy("close > 100");
      expect(ast.type).toBe("BinaryExpression");
      if (ast.type === "BinaryExpression") {
        expect(ast.operator).toBe(">");
        expect(ast.left).toEqual({ type: "Identifier", name: "close" });
        expect(ast.right).toEqual({ type: "Literal", value: 100 });
      }
    });

    it("parseStrategy('sma(close, 14)') returns CallExpression", () => {
      const ast = parseStrategy("sma(close, 14)");
      expect(ast.type).toBe("CallExpression");
      if (ast.type === "CallExpression") {
        expect(ast.callee).toEqual({ type: "Identifier", name: "sma" });
        expect(ast.args).toHaveLength(2);
        expect(ast.args[0]).toEqual({ type: "Identifier", name: "close" });
        expect(ast.args[1]).toEqual({ type: "Literal", value: 14 });
      }
    });

    it("parseStrategy('close') returns Identifier", () => {
      const ast = parseStrategy("close");
      expect(ast).toEqual({ type: "Identifier", name: "close" });
    });

    it("parseStrategy('100') returns Literal", () => {
      const ast = parseStrategy("100");
      expect(ast).toEqual({ type: "Literal", value: 100 });
    });
  });

  // ---------- validateStrategy: identifier + security checks ----------

  describe("validateStrategy", () => {
    it("accepts a valid strategy with allowed identifiers", () => {
      const strategy = makeStrategy({
        type: "BinaryExpression",
        operator: ">",
        left: { type: "Identifier", name: "close" },
        right: { type: "Literal", value: 100 },
      });
      const result = validateStrategy(strategy);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects strategy using eval", () => {
      const strategy = makeStrategy({
        type: "CallExpression",
        callee: { type: "Identifier", name: "eval" },
        args: [{ type: "Literal", value: "malicious" }],
      });
      const result = validateStrategy(strategy);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects strategy using Function", () => {
      const strategy = makeStrategy({
        type: "CallExpression",
        callee: { type: "Identifier", name: "Function" },
        args: [{ type: "Literal", value: "return this" }],
      });
      const result = validateStrategy(strategy);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects strategy using window", () => {
      const strategy = makeStrategy({
        type: "MemberExpression",
        object: { type: "Identifier", name: "window" },
        property: { type: "Identifier", name: "location" },
      });
      const result = validateStrategy(strategy);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects strategy using process", () => {
      const strategy = makeStrategy({
        type: "MemberExpression",
        object: { type: "Identifier", name: "process" },
        property: { type: "Identifier", name: "env" },
      });
      const result = validateStrategy(strategy);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects strategy with unknown identifier (e.g., foo)", () => {
      const strategy = makeStrategy({
        type: "Identifier",
        name: "foo",
      });
      const result = validateStrategy(strategy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("foo"))).toBe(true);
    });
  });

  // ---------- evaluateStrategy: recursive AST evaluator ----------

  describe("evaluateStrategy", () => {
    it("evaluates BinaryExpression close > 100 with close=150 → true", () => {
      const expr: Expression = {
        type: "BinaryExpression",
        operator: ">",
        left: { type: "Identifier", name: "close" },
        right: { type: "Literal", value: 100 },
      };
      expect(evaluateStrategy(expr, { close: 150 })).toBe(true);
    });

    it("evaluates CallExpression sma(close, 14) with mock sma function", () => {
      const expr: Expression = {
        type: "CallExpression",
        callee: { type: "Identifier", name: "sma" },
        args: [
          { type: "Identifier", name: "close" },
          { type: "Literal", value: 14 },
        ],
      };
      const mockSma = vi.fn((values: number[], period: number) => {
        const slice = values.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
      });
      const ctx = { close: [10, 20, 30, 40, 50], sma: mockSma };
      const result = evaluateStrategy(expr, ctx);
      expect(mockSma).toHaveBeenCalledWith([10, 20, 30, 40, 50], 14);
      expect(result).toBe(30); // mean of all 5 values when period 14 > length 5
    });

    it("evaluates nested expressions: (close + open) / 2", () => {
      const expr: Expression = {
        type: "BinaryExpression",
        operator: "/",
        left: {
          type: "BinaryExpression",
          operator: "+",
          left: { type: "Identifier", name: "close" },
          right: { type: "Identifier", name: "open" },
        },
        right: { type: "Literal", value: 2 },
      };
      expect(evaluateStrategy(expr, { close: 110, open: 90 })).toBe(100);
    });
  });

  // ---------- Param range validation ----------

  describe("param validation", () => {
    it("rejects sma(close, -1) (negative period)", () => {
      const strategy = makeStrategy({
        type: "CallExpression",
        callee: { type: "Identifier", name: "sma" },
        args: [
          { type: "Identifier", name: "close" },
          { type: "Literal", value: -1 },
        ],
      });
      const result = validateStrategy(strategy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /period/i.test(e))).toBe(true);
    });

    it("rejects sma(close, 0) (zero period)", () => {
      const strategy = makeStrategy({
        type: "CallExpression",
        callee: { type: "Identifier", name: "sma" },
        args: [
          { type: "Identifier", name: "close" },
          { type: "Literal", value: 0 },
        ],
      });
      const result = validateStrategy(strategy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /period/i.test(e))).toBe(true);
    });
  });
});
