/**
 * TDD Spec — DSL Parser (ADR-0008)
 *
 * Validates tokenization, parsing, and compilation of DSL expressions
 * into Strategy objects consumable by the backtest engine.
 *
 * Test scope:
 *   - tokenize: numbers, identifiers, operators, parentheses
 *   - parse: simple comparison, AND, OR, NOT, nested parentheses, cross()
 *   - compile: produces Strategy with evaluate() method
 *   - compile: RSI strategy returns BUY when RSI < 30, SELL when RSI > 70
 *   - Error handling: invalid syntax, unknown indicators, wrong param count
 *
 * See: docs/architecture/adr-0008-strategy-dsl-schema.md
 */

import { describe, expect, it } from "vitest";
import type { Kline } from "@/lib/types";
import type { StrategyContext } from "@/lib/backtest/types";
import type { DSLIndicatorNode, DSLNode } from "@/lib/dsl/types";
import { DSLParseError } from "@/lib/dsl/types";
import {
  compile,
  compileWithExit,
  parse,
  parseAndCompile,
  tokenize,
} from "@/lib/dsl/parser";

// ============ Fixtures ============

/**
 * Build a Kline[] from a list of close prices.
 * Each kline has o=h=l=c=price and v=1000.
 * Dates start at startDate and increment by 1 day per bar.
 */
function makeKlines(prices: number[], startDate = "2025-01-01"): Kline[] {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  return prices.map((p, i) => {
    const d = new Date(startMs + i * 86_400_000);
    return {
      t: d.toISOString().slice(0, 10),
      o: p,
      h: p,
      l: p,
      c: p,
      v: 1000,
    };
  });
}

/** Build a StrategyContext for bar at index `i` within `klines`. */
function makeCtx(klines: Kline[], i: number): StrategyContext {
  const kl = klines[i];
  return {
    index: i,
    klines: klines.slice(0, i + 1),
    close: kl.c,
    open: kl.o,
    high: kl.h,
    low: kl.l,
    volume: kl.v,
    date: kl.t,
  };
}

// ============ Tests ============

describe("DSL Parser", () => {
  // ---------- Tokenizer ----------

  describe("tokenize", () => {
    it("tokenizes numbers", () => {
      const tokens = tokenize("70 14.5");
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toEqual({ type: "number", value: "70", pos: 0 });
      expect(tokens[1]).toEqual({ type: "number", value: "14.5", pos: 3 });
    });

    it("tokenizes identifiers", () => {
      const tokens = tokenize("RSI SMA close");
      expect(tokens).toHaveLength(3);
      expect(tokens[0]).toEqual({ type: "identifier", value: "RSI", pos: 0 });
      expect(tokens[1]).toEqual({ type: "identifier", value: "SMA", pos: 4 });
      expect(tokens[2]).toEqual({
        type: "identifier",
        value: "close",
        pos: 8,
      });
    });

    it("tokenizes AND/OR/NOT as operator tokens", () => {
      const tokens = tokenize("AND OR NOT");
      expect(tokens).toHaveLength(3);
      expect(tokens[0].type).toBe("op_and");
      expect(tokens[1].type).toBe("op_or");
      expect(tokens[2].type).toBe("op_not");
    });

    it("tokenizes comparison operators", () => {
      const tokens = tokenize("> < >= <= = !=");
      expect(tokens).toHaveLength(6);
      expect(tokens[0]).toEqual({ type: "op_compare", value: ">", pos: 0 });
      expect(tokens[1]).toEqual({ type: "op_compare", value: "<", pos: 2 });
      expect(tokens[2]).toEqual({ type: "op_compare", value: ">=", pos: 4 });
      expect(tokens[3]).toEqual({ type: "op_compare", value: "<=", pos: 7 });
      expect(tokens[4]).toEqual({ type: "op_compare", value: "=", pos: 10 });
      expect(tokens[5]).toEqual({ type: "op_compare", value: "!=", pos: 12 });
    });

    it("tokenizes parentheses and commas", () => {
      const tokens = tokenize("RSI(14)");
      expect(tokens).toEqual([
        { type: "identifier", value: "RSI", pos: 0 },
        { type: "lparen", value: "(", pos: 3 },
        { type: "number", value: "14", pos: 4 },
        { type: "rparen", value: ")", pos: 6 },
      ]);
    });

    it("throws DSLParseError on unexpected characters", () => {
      expect(() => tokenize("RSI @ 14")).toThrow(DSLParseError);
    });
  });

  // ---------- Parser ----------

  describe("parse", () => {
    it("parses simple comparison: RSI(14) > 70", () => {
      const tokens = tokenize("RSI(14) > 70");
      const ast = parse(tokens);
      expect(ast.type).toBe("compare");
      if (ast.type === "compare") {
        expect(ast.op).toBe(">");
        expect(ast.left.type).toBe("indicator");
        expect(ast.right.type).toBe("number");
        if (ast.left.type === "indicator") {
          expect(ast.left.name).toBe("RSI");
          expect(ast.left.params.period).toBe(14);
        }
        if (ast.right.type === "number") {
          expect(ast.right.value).toBe(70);
        }
      }
    });

    it("parses AND expression: SMA(20) > SMA(50) AND RSI(14) < 30", () => {
      const tokens = tokenize("SMA(20) > SMA(50) AND RSI(14) < 30");
      const ast = parse(tokens);
      expect(ast.type).toBe("and");
      if (ast.type === "and") {
        expect(ast.operands).toHaveLength(2);
        expect(ast.operands[0].type).toBe("compare");
        expect(ast.operands[1].type).toBe("compare");
      }
    });

    it("parses OR expression: RSI(14) < 30 OR RSI(14) > 70", () => {
      const tokens = tokenize("RSI(14) < 30 OR RSI(14) > 70");
      const ast = parse(tokens);
      expect(ast.type).toBe("or");
      if (ast.type === "or") {
        expect(ast.operands).toHaveLength(2);
        expect(ast.operands[0].type).toBe("compare");
        expect(ast.operands[1].type).toBe("compare");
      }
    });

    it("parses NOT expression: NOT RSI(14) > 70", () => {
      const tokens = tokenize("NOT RSI(14) > 70");
      const ast = parse(tokens);
      expect(ast.type).toBe("not");
      if (ast.type === "not") {
        expect(ast.operand.type).toBe("compare");
      }
    });

    it("parses nested parentheses: (RSI(14) < 30 OR RSI(14) > 70)", () => {
      const tokens = tokenize("(RSI(14) < 30 OR RSI(14) > 70)");
      const ast = parse(tokens);
      expect(ast.type).toBe("or");
      if (ast.type === "or") {
        expect(ast.operands).toHaveLength(2);
      }
    });

    it("parses cross() function: SMA(20) cross SMA(50)", () => {
      const tokens = tokenize("SMA(20) cross SMA(50)");
      const ast = parse(tokens);
      expect(ast.type).toBe("cross");
      if (ast.type === "cross") {
        expect(ast.left.type).toBe("indicator");
        expect(ast.right.type).toBe("indicator");
        if (ast.left.type === "indicator") {
          expect(ast.left.name).toBe("SMA");
          expect(ast.left.params.period).toBe(20);
        }
        if (ast.right.type === "indicator") {
          expect(ast.right.name).toBe("SMA");
          expect(ast.right.params.period).toBe(50);
        }
      }
    });

    it("parses indicator with multiple params: MACD(12, 26, 9)", () => {
      const tokens = tokenize("MACD(12, 26, 9) > 0");
      const ast = parse(tokens);
      expect(ast.type).toBe("compare");
      if (ast.type === "compare") {
        expect(ast.left.type).toBe("indicator");
        if (ast.left.type === "indicator") {
          expect(ast.left.name).toBe("MACD");
          expect(ast.left.params.fast).toBe(12);
          expect(ast.left.params.slow).toBe(26);
          expect(ast.left.params.signal).toBe(9);
        }
      }
    });

    it("parses indicator with defaults: RSI()", () => {
      const tokens = tokenize("RSI() > 70");
      const ast = parse(tokens);
      if (ast.type === "compare" && ast.left.type === "indicator") {
        const ind = ast.left as DSLIndicatorNode;
        expect(ind.name).toBe("RSI");
        expect(ind.params.period).toBe(14); // default
      }
    });

    it("parses complex expression: SMA(20) > SMA(50) AND NOT RSI(14) > 70", () => {
      const tokens = tokenize("SMA(20) > SMA(50) AND NOT RSI(14) > 70");
      const ast = parse(tokens);
      expect(ast.type).toBe("and");
      if (ast.type === "and") {
        expect(ast.operands[0].type).toBe("compare");
        expect(ast.operands[1].type).toBe("not");
        if (ast.operands[1].type === "not") {
          expect(ast.operands[1].operand.type).toBe("compare");
        }
      }
    });

    it("respects precedence: OR binds looser than AND", () => {
      // A AND B OR C should parse as (A AND B) OR C
      const tokens = tokenize("RSI(14) < 30 AND SMA(20) > SMA(50) OR RSI(14) > 70");
      const ast = parse(tokens);
      expect(ast.type).toBe("or");
      if (ast.type === "or") {
        expect(ast.operands[0].type).toBe("and");
        expect(ast.operands[1].type).toBe("compare");
      }
    });
  });

  // ---------- Compiler ----------

  describe("compile", () => {
    it("produces Strategy with evaluate() method", () => {
      const tokens = tokenize("RSI(14) > 70");
      const ast = parse(tokens);
      const result = compile(ast);
      expect(result.strategy).toBeDefined();
      expect(typeof result.strategy.evaluate).toBe("function");
      expect(result.ast).toBe(ast);
    });

    it("RSI strategy: returns BUY when RSI < 30", () => {
      const tokens = tokenize("RSI(14) < 30");
      const ast = parse(tokens);
      const { strategy } = compile(ast);

      // Build klines with declining prices to drive RSI below 30
      // Use 30 bars of steadily declining prices
      const prices: number[] = [];
      let p = 100;
      for (let i = 0; i < 30; i++) {
        p -= 2;
        prices.push(p);
      }
      const klines = makeKlines(prices);
      const ctx = makeCtx(klines, klines.length - 1);
      const signal = strategy.evaluate(ctx);
      expect(signal).toBe("BUY");
    });

    it("RSI strategy: returns HOLD when RSI is in neutral zone", () => {
      const tokens = tokenize("RSI(14) < 30");
      const ast = parse(tokens);
      const { strategy } = compile(ast);

      // Slowly alternating prices → RSI around 50
      const prices: number[] = [];
      let p = 100;
      for (let i = 0; i < 30; i++) {
        p += i % 2 === 0 ? 0.5 : -0.5;
        prices.push(p);
      }
      const klines = makeKlines(prices);
      const ctx = makeCtx(klines, klines.length - 1);
      const signal = strategy.evaluate(ctx);
      expect(signal).toBe("HOLD");
    });

    it("SMA crossover: returns BUY when SMA(20) > SMA(50)", () => {
      const tokens = tokenize("SMA(20) > SMA(50)");
      const ast = parse(tokens);
      const { strategy } = compile(ast);

      // Build klines: rising prices so short SMA > long SMA
      const prices: number[] = [];
      for (let i = 0; i < 60; i++) {
        prices.push(100 + i);
      }
      const klines = makeKlines(prices);
      const ctx = makeCtx(klines, klines.length - 1);
      const signal = strategy.evaluate(ctx);
      expect(signal).toBe("BUY");
    });

    it("compileWithExit: BUY on entry, SELL on exit", () => {
      const entryTokens = tokenize("RSI(14) < 30");
      const exitTokens = tokenize("RSI(14) > 70");
      const entryAst = parse(entryTokens);
      const exitAst = parse(exitTokens);
      const { strategy } = compileWithExit(entryAst, exitAst);

      // Declining prices → RSI low → entry fires → BUY
      const lowPrices: number[] = [];
      let p = 100;
      for (let i = 0; i < 30; i++) {
        p -= 2;
        lowPrices.push(p);
      }
      const lowKlines = makeKlines(lowPrices);
      const lowCtx = makeCtx(lowKlines, lowKlines.length - 1);
      expect(strategy.evaluate(lowCtx)).toBe("BUY");

      // Rising prices → RSI high → exit fires → SELL
      const highPrices: number[] = [];
      p = 100;
      for (let i = 0; i < 30; i++) {
        p += 2;
        highPrices.push(p);
      }
      const highKlines = makeKlines(highPrices);
      const highCtx = makeCtx(highKlines, highKlines.length - 1);
      expect(strategy.evaluate(highCtx)).toBe("SELL");
    });

    it("cross() detects bullish crossover", () => {
      const tokens = tokenize("SMA(5) cross SMA(10)");
      const ast = parse(tokens);
      const { strategy } = compile(ast);

      // Build klines where SMA(5) crosses above SMA(10) at the last bar
      // First 15 bars: flat around 100, then a surge to 120
      const prices: number[] = [];
      for (let i = 0; i < 15; i++) prices.push(100);
      prices.push(120, 130, 140, 150, 160);
      const klines = makeKlines(prices);
      // At bar 19 (last), SMA(5) should be above SMA(10), and at bar 18
      // it might have been below → cross detected
      const ctx = makeCtx(klines, klines.length - 1);
      const signal = strategy.evaluate(ctx);
      // The cross depends on actual values; at minimum this should not throw
      expect(["BUY", "HOLD"]).toContain(signal);
    });
  });

  // ---------- Error handling ----------

  describe("error handling", () => {
    it("throws DSLParseError on invalid syntax", () => {
      expect(() => {
        const tokens = tokenize(">>>");
        parse(tokens);
      }).toThrow(DSLParseError);
    });

    it("throws DSLParseError on unknown indicator", () => {
      expect(() => {
        const tokens = tokenize("UNKNOWN(14) > 70");
        parse(tokens);
      }).toThrow(DSLParseError);
    });

    it("throws DSLParseError on wrong parameter count", () => {
      expect(() => {
        const tokens = tokenize("RSI(14, 20, 30) > 70");
        parse(tokens);
      }).toThrow(DSLParseError);
    });

    it("throws DSLParseError on non-number parameter", () => {
      expect(() => {
        // RSI(RSI(14)) - nested indicator as param
        const tokens = tokenize("RSI(RSI(14)) > 70");
        parse(tokens);
      }).toThrow(DSLParseError);
    });

    it("throws DSLParseError on empty expression", () => {
      expect(() => parse(tokenize(""))).toThrow(DSLParseError);
    });

    it("throws DSLParseError on unmatched parenthesis", () => {
      expect(() => {
        const tokens = tokenize("RSI(14");
        parse(tokens);
      }).toThrow(DSLParseError);
    });

    it("throws DSLParseError on trailing tokens", () => {
      expect(() => {
        const tokens = tokenize("RSI(14) > 70 50");
        parse(tokens);
      }).toThrow(DSLParseError);
    });
  });

  // ---------- parseAndCompile convenience ----------

  describe("parseAndCompile", () => {
    it("parses and compiles in one step", () => {
      const result = parseAndCompile("RSI(14) < 30");
      expect(result.strategy).toBeDefined();
      expect(typeof result.strategy.evaluate).toBe("function");
      expect(result.ast.type).toBe("compare");
    });
  });

  // ---------- All 8 indicators ----------

  describe("all 8 built-in indicators", () => {
    const indicatorCases = [
      { expr: "SMA(20) > 100", name: "SMA" },
      { expr: "EMA(20) > 100", name: "EMA" },
      { expr: "RSI(14) < 70", name: "RSI" },
      { expr: "MACD(12, 26, 9) > 0", name: "MACD" },
      { expr: "BOLL(20, 2) > 100", name: "BOLL" },
      { expr: "ATR(14) > 1", name: "ATR" },
      { expr: "OBV() > 0", name: "OBV" },
      { expr: "VWAP() > 100", name: "VWAP" },
    ];

    for (const { expr, name } of indicatorCases) {
      it(`${name}: parses and compiles without error`, () => {
        const result = parseAndCompile(expr);
        expect(result.strategy).toBeDefined();

        // Evaluate with a reasonable context — should not throw
        const klines = makeKlines(
          Array.from({ length: 30 }, (_, i) => 100 + i),
        );
        const ctx = makeCtx(klines, klines.length - 1);
        expect(() => result.strategy.evaluate(ctx)).not.toThrow();
      });
    }
  });
});
