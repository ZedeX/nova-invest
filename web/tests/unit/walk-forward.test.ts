/**
 * Unit tests for Walk-Forward Analysis (Phase 2 infrastructure).
 *
 * Covers:
 *   - WFAConfig validation
 *   - Rolling vs Anchored modes
 *   - Window splitting logic
 *   - Degradation ratio computation
 *   - Simple 70/30 split (splitSample)
 *   - Aggregation across windows
 */

import { describe, it, expect } from "vitest";
import { WalkForwardEngine, splitSample } from "@/lib/backtest/walk-forward";
import type { Kline } from "@/lib/types";
import type { Strategy, StrategyContext, SignalType } from "@/lib/backtest/types";

// ============ Mock Data ============

/** Generate N synthetic daily klines with a steady price. */
function generateKlines(count: number, startPrice = 100): Kline[] {
  const klines: Kline[] = [];
  const baseDate = new Date("2024-01-01");
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    // Slight random-ish drift
    price += (Math.sin(i * 0.1) * 2);
    const t = date.toISOString().slice(0, 10);
    klines.push({
      t,
      o: price - 0.5,
      h: price + 1,
      l: price - 1,
      c: price,
      v: 1000000,
    });
  }
  return klines;
}

/** Simple SMA crossover strategy for testing. */
function createSMAStrategy(shortPeriod: number, longPeriod: number): Strategy {
  return {
    evaluate(ctx: StrategyContext): SignalType {
      if (ctx.index < longPeriod) return "HOLD";

      const shortMA = ctx.klines.slice(-shortPeriod).reduce((s, k) => s + k.c, 0) / shortPeriod;
      const longMA = ctx.klines.slice(-longPeriod).reduce((s, k) => s + k.c, 0) / longPeriod;

      if (shortMA > longMA) return "BUY";
      if (shortMA < longMA) return "SELL";
      return "HOLD";
    },
  };
}

/** Always BUY strategy (simplest possible). */
const alwaysBuyStrategy: Strategy = {
  evaluate(_ctx: StrategyContext): SignalType {
    return "BUY";
  },
};

describe("Walk-Forward: Config validation", () => {
  it("rejects trainBars < 10", () => {
    expect(() => new WalkForwardEngine({
      strategy: alwaysBuyStrategy,
      trainBars: 5,
      testBars: 10,
      mode: "rolling",
      initial_capital: 10000,
      fee_bps: 10,
      slippage_bps: 5,
    })).toThrow("trainBars must be >= 10");
  });

  it("rejects testBars < 5", () => {
    expect(() => new WalkForwardEngine({
      strategy: alwaysBuyStrategy,
      trainBars: 20,
      testBars: 2,
      mode: "rolling",
      initial_capital: 10000,
      fee_bps: 10,
      slippage_bps: 5,
    })).toThrow("testBars must be >= 5");
  });

  it("rejects initial_capital <= 0", () => {
    expect(() => new WalkForwardEngine({
      strategy: alwaysBuyStrategy,
      trainBars: 20,
      testBars: 10,
      mode: "rolling",
      initial_capital: 0,
      fee_bps: 10,
      slippage_bps: 5,
    })).toThrow("initial_capital must be > 0");
  });
});

describe("Walk-Forward: Rolling mode", () => {
  it("produces multiple windows with rolling train", async () => {
    const engine = new WalkForwardEngine({
      strategy: createSMAStrategy(5, 10),
      trainBars: 20,
      testBars: 10,
      mode: "rolling",
      initial_capital: 10000,
      fee_bps: 10,
      slippage_bps: 5,
    });

    const klines = generateKlines(100);
    const result = await engine.run(klines);

    // 100 bars, window = 30 (20 train + 10 test), slide by 10
    // Window 0: bars 0-29 (train 0-19, test 20-29)
    // Window 1: bars 10-39 (train 10-29, test 30-39)
    // ... etc → (100 - 30) / 10 + 1 = 8 windows
    expect(result.totalWindows).toBeGreaterThanOrEqual(2);
    expect(result.windows).toHaveLength(result.totalWindows);
    expect(result.aggregatedOOS).toBeDefined();
    expect(result.aggregatedIS).toBeDefined();
  });

  it("each window has both inSample and outOfSample results", async () => {
    const engine = new WalkForwardEngine({
      strategy: alwaysBuyStrategy,
      trainBars: 15,
      testBars: 5,
      mode: "rolling",
      initial_capital: 10000,
      fee_bps: 0,
      slippage_bps: 0,
    });

    const klines = generateKlines(60);
    const result = await engine.run(klines);

    for (const window of result.windows) {
      expect(window.inSample.trades).toBeDefined();
      expect(window.inSample.metrics).toBeDefined();
      expect(window.outOfSample.trades).toBeDefined();
      expect(window.outOfSample.metrics).toBeDefined();
      expect(window.windowIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Walk-Forward: Anchored mode", () => {
  it("anchored mode starts training from bar 0", async () => {
    const engine = new WalkForwardEngine({
      strategy: alwaysBuyStrategy,
      trainBars: 20,
      testBars: 10,
      mode: "anchored",
      initial_capital: 10000,
      fee_bps: 10,
      slippage_bps: 5,
    });

    const klines = generateKlines(80);
    const result = await engine.run(klines);

    // Anchored: first window train = bars 0-19, test = bars 20-29
    // Second window train = bars 0-29, test = bars 30-39
    // Training grows from the start
    expect(result.totalWindows).toBeGreaterThanOrEqual(2);

    const firstWindow = result.windows[0];
    // First window start_date should be the earliest kline date
    expect(firstWindow.inSample.config.start_date).toBe(klines[0].t);
  });
});

describe("Walk-Forward: Degradation ratio", () => {
  it("degradationRatio is computed when IS return > 0", async () => {
    const engine = new WalkForwardEngine({
      strategy: alwaysBuyStrategy,
      trainBars: 20,
      testBars: 10,
      mode: "rolling",
      initial_capital: 10000,
      fee_bps: 0,
      slippage_bps: 0,
    });

    // Generate uptrending data
    const klines = generateKlines(80, 100);
    const result = await engine.run(klines);

    // Degradation ratio should be a finite number
    expect(isFinite(result.degradationRatio)).toBe(true);
  });

  it("degradationRatio = 0 when IS return <= 0", async () => {
    const engine = new WalkForwardEngine({
      strategy: { evaluate: () => "HOLD" as SignalType }, // Never trades
      trainBars: 20,
      testBars: 10,
      mode: "rolling",
      initial_capital: 10000,
      fee_bps: 0,
      slippage_bps: 0,
    });

    const klines = generateKlines(80);
    const result = await engine.run(klines);

    // With HOLD strategy, total_return = 0, so degradationRatio = 0
    expect(result.degradationRatio).toBe(0);
  });
});

describe("Walk-Forward: splitSample (70/30)", () => {
  it("splits 100 klines into 70/30", () => {
    const klines = generateKlines(100);
    const { inSample, outOfSample } = splitSample(klines);

    expect(inSample).toHaveLength(70);
    expect(outOfSample).toHaveLength(30);
  });

  it("inSample dates are all before outOfSample dates", () => {
    const klines = generateKlines(100);
    const { inSample, outOfSample } = splitSample(klines);

    const lastISDate = inSample[inSample.length - 1].t;
    const firstOOSDate = outOfSample[0].t;
    expect(lastISDate <= firstOOSDate).toBe(true);
  });

  it("respects custom split ratio", () => {
    const klines = generateKlines(200);
    const { inSample, outOfSample } = splitSample(klines, 0.8);

    expect(inSample).toHaveLength(160);
    expect(outOfSample).toHaveLength(40);
  });

  it("rejects invalid split ratios", () => {
    const klines = generateKlines(100);
    expect(() => splitSample(klines, 0)).toThrow("splitRatio must be in (0, 1)");
    expect(() => splitSample(klines, 1)).toThrow("splitRatio must be in (0, 1)");
    expect(() => splitSample(klines, -0.5)).toThrow("splitRatio must be in (0, 1)");
  });

  it("handles small datasets", () => {
    const klines = generateKlines(15);
    const { inSample, outOfSample } = splitSample(klines, 0.7);

    expect(inSample.length + outOfSample.length).toBe(15);
    expect(inSample.length).toBe(10);
    expect(outOfSample.length).toBe(5);
  });
});

describe("Walk-Forward: Empty edge cases", () => {
  it("returns 0 windows when data is too short", async () => {
    const engine = new WalkForwardEngine({
      strategy: alwaysBuyStrategy,
      trainBars: 20,
      testBars: 10,
      mode: "rolling",
      initial_capital: 10000,
      fee_bps: 0,
      slippage_bps: 0,
    });

    // Only 15 bars — not enough for even one window (needs 30)
    const klines = generateKlines(15);
    const result = await engine.run(klines);

    expect(result.totalWindows).toBe(0);
    expect(result.windows).toHaveLength(0);
    expect(result.degradationRatio).toBe(0);
  });
});
