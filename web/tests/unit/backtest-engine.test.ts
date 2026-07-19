/**
 * TDD Spec — ADR-0009: Backtest Engine
 *
 * Validates the 8-step pipeline + metrics + trade simulation per:
 *   docs/architecture/adr-0009-backtest-engine.md
 *
 * Test scope (per task plan):
 *   - BacktestEngine constructor validation (initial_capital, date range, fee_bps)
 *   - run(klines) 8-step pipeline (point-in-time, fees, slippage, look-ahead)
 *   - computeMetrics: total_return, max_drawdown, win_rate, profit_factor, sharpe
 *   - Edge cases: empty trades, equity curve endpoints
 *
 * Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
 * This file is written before engine.ts exists; every test must fail (Red)
 * before implementation begins (Green).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Kline } from "@/lib/types";
import type { BacktestConfig, Trade } from "@/lib/backtest/types";
import { BacktestEngine, computeMetrics } from "@/lib/backtest/engine";

// ============ Fixtures ============

/**
 * Build a Kline[] from a list of close prices. Each kline has o=h=l=c=price
 * and v=1000. Dates start at `startDate` (UTC) and increment by 1 day per bar.
 *
 * UTC is used throughout to avoid Asia/Shanghai local-time off-by-one issues
 * when computing date strings.
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

/** Build a BacktestConfig with sensible defaults; override fields via `overrides`. */
function makeConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    strategy: { evaluate: vi.fn(() => "HOLD" as const) },
    start_date: "2025-01-01",
    end_date: "2025-12-31",
    initial_capital: 10_000,
    fee_bps: 0,
    slippage_bps: 0,
    ...overrides,
  };
}

/** Build a Trade with sensible defaults. */
function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    entry_date: "2025-01-01",
    exit_date: "2025-01-05",
    entry_price: 100,
    exit_price: 110,
    qty: 10,
    pnl: 100,
    pnl_pct: 0.1,
    ...overrides,
  };
}

// ============ Tests ============

describe("ADR-0009: Backtest Engine", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ---------- Constructor validation (Tests 1-4) ----------

  it("BacktestEngine constructs with a valid config", () => {
    const config = makeConfig();
    const engine = new BacktestEngine(config);
    expect(engine).toBeInstanceOf(BacktestEngine);
  });

  it("constructor rejects initial_capital <= 0", () => {
    expect(() => new BacktestEngine(makeConfig({ initial_capital: 0 }))).toThrow();
    expect(() => new BacktestEngine(makeConfig({ initial_capital: -100 }))).toThrow();
  });

  it("constructor rejects start_date >= end_date", () => {
    expect(() =>
      new BacktestEngine(makeConfig({ start_date: "2025-06-01", end_date: "2025-06-01" })),
    ).toThrow();
    expect(() =>
      new BacktestEngine(makeConfig({ start_date: "2025-06-02", end_date: "2025-06-01" })),
    ).toThrow();
  });

  it("constructor rejects fee_bps < 0", () => {
    expect(() => new BacktestEngine(makeConfig({ fee_bps: -1 }))).toThrow();
    expect(() => new BacktestEngine(makeConfig({ fee_bps: -10 }))).toThrow();
  });

  // ---------- run(klines) pipeline (Tests 5-8, 17) ----------

  it("run(klines) returns BacktestResult with trades + metrics + equity_curve", async () => {
    const klines = makeKlines([100, 105, 110]);
    const strategy = {
      evaluate: vi.fn((ctx) => {
        if (ctx.index === 0) return "BUY" as const;
        if (ctx.index === ctx.klines.length - 1) return "SELL" as const;
        return "HOLD" as const;
      }),
    };
    const config = makeConfig({ strategy });
    const engine = new BacktestEngine(config);

    const result = await engine.run(klines);

    expect(result).toBeDefined();
    expect(Array.isArray(result.trades)).toBe(true);
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.metrics).toBeDefined();
    expect(typeof result.metrics.total_return).toBe("number");
    expect(Array.isArray(result.equity_curve)).toBe(true);
    expect(result.equity_curve.length).toBeGreaterThan(0);
    expect(result.config).toBeDefined();
    expect(result.config.initial_capital).toBe(config.initial_capital);
  });

  it("point-in-time: signal at index i only sees klines[0..i]", async () => {
    const klines = makeKlines([100, 102, 104, 106, 108]);
    const captured: { index: number; seenKlinesLength: number; lastSeenDate: string }[] = [];
    const strategy = {
      evaluate: vi.fn((ctx) => {
        captured.push({
          index: ctx.index,
          seenKlinesLength: ctx.klines.length,
          lastSeenDate: ctx.klines[ctx.klines.length - 1].t,
        });
        return "HOLD" as const;
      }),
    };
    const engine = new BacktestEngine(makeConfig({ strategy }));

    await engine.run(klines);

    // Engine must call evaluate exactly once per bar
    expect(captured.length).toBe(klines.length);
    // At index i, ctx.klines must contain exactly klines[0..i] (i+1 bars)
    for (let i = 0; i < klines.length; i++) {
      expect(captured[i].index).toBe(i);
      expect(captured[i].seenKlinesLength).toBe(i + 1);
      expect(captured[i].lastSeenDate).toBe(klines[i].t);
    }
  });

  it("fee model: buy trade deducts fee_bps * notional / 10000 (and sell side too)", async () => {
    // One BUY at bar 0, one SELL at bar 1. close: 100 → 110.
    // qty = initial_capital / entry_price = 10000 / 100 = 100
    // notional_buy = 100 * 100 = 10000 → fee_buy = 10 * 10000 / 10000 = 10
    // notional_sell = 110 * 100 = 11000 → fee_sell = 10 * 11000 / 10000 = 11
    // pnl_no_fee = (110 - 100) * 100 = 1000
    // pnl_with_fee = 1000 - 10 - 11 = 979
    const klines = makeKlines([100, 110]);
    const strategy = {
      evaluate: vi.fn((ctx) => {
        if (ctx.index === 0) return "BUY" as const;
        return "SELL" as const;
      }),
    };
    const config = makeConfig({
      strategy,
      initial_capital: 10_000,
      fee_bps: 10,
      slippage_bps: 0,
    });
    const engine = new BacktestEngine(config);

    const result = await engine.run(klines);

    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.qty).toBeCloseTo(100, 6);
    // Fee deducted from pnl: 1000 - 10 - 11 = 979
    expect(trade.pnl).toBeCloseTo(979, 6);
  });

  it("slippage model: entry_price = kline.close * (1 + slippage_bps/10000)", async () => {
    // BUY at bar 0 (close=100), slippage_bps=5 → entry_price = 100 * (1 + 5/10000) = 100.05
    // SELL at bar 1 (close=110), slippage_bps=5 → exit_price = 110 * (1 - 5/10000) = 109.945
    const klines = makeKlines([100, 110]);
    const strategy = {
      evaluate: vi.fn((ctx) => {
        if (ctx.index === 0) return "BUY" as const;
        return "SELL" as const;
      }),
    };
    const config = makeConfig({
      strategy,
      slippage_bps: 5,
      fee_bps: 0,
    });
    const engine = new BacktestEngine(config);

    const result = await engine.run(klines);

    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.entry_price).toBeCloseTo(100.05, 6);
    expect(trade.exit_price).toBeCloseTo(109.945, 6);
  });

  // ---------- computeMetrics (Tests 9-14) ----------

  it("computeMetrics calculates total_return = (final - initial) / initial", () => {
    const equityCurve = [
      { date: "2025-01-01", equity: 100 },
      { date: "2025-01-02", equity: 110 },
    ];
    const metrics = computeMetrics([], equityCurve);
    expect(metrics.total_return).toBeCloseTo(0.1, 6);
  });

  it("computeMetrics calculates max_drawdown = max((peak - equity) / peak)", () => {
    // Equity: 100 → 120 (peak) → 90 (25% drawdown from peak) → 95
    // max_drawdown = (120 - 90) / 120 = 0.25
    const equityCurve = [
      { date: "2025-01-01", equity: 100 },
      { date: "2025-01-02", equity: 120 },
      { date: "2025-01-03", equity: 90 },
      { date: "2025-01-04", equity: 95 },
    ];
    const metrics = computeMetrics([], equityCurve);
    expect(metrics.max_drawdown).toBeCloseTo(0.25, 6);
  });

  it("computeMetrics calculates win_rate = winning_trades / total_trades", () => {
    const trades: Trade[] = [
      makeTrade({ pnl: 10 }),
      makeTrade({ pnl: -10 }),
      makeTrade({ pnl: 5 }),
    ];
    const metrics = computeMetrics(trades, []);
    expect(metrics.win_rate).toBeCloseTo(2 / 3, 6);
  });

  it("computeMetrics calculates profit_factor = gross_profit / gross_loss", () => {
    // gross_profit = 10 + 5 = 15; gross_loss = abs(-10) = 10
    // profit_factor = 15 / 10 = 1.5
    const trades: Trade[] = [
      makeTrade({ pnl: 10 }),
      makeTrade({ pnl: -10 }),
      makeTrade({ pnl: 5 }),
    ];
    const metrics = computeMetrics(trades, []);
    expect(metrics.profit_factor).toBeCloseTo(1.5, 6);
  });

  it("computeMetrics calculates annualized sharpe = daily_sharpe * sqrt(252)", () => {
    // Build a known equity curve and compute expected sharpe manually.
    const equities = [100, 101, 102, 103, 104];
    const equityCurve = equities.map((eq, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, "0")}`,
      equity: eq,
    }));

    // Manual computation of daily sharpe (population std, risk-free=0):
    const dailyReturns: number[] = [];
    for (let i = 1; i < equities.length; i++) {
      dailyReturns.push((equities[i] - equities[i - 1]) / equities[i - 1]);
    }
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance =
      dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
    const std = Math.sqrt(variance);
    const expectedDailySharpe = std === 0 ? 0 : mean / std;
    const expectedAnnualSharpe = expectedDailySharpe * Math.sqrt(252);

    const metrics = computeMetrics([], equityCurve);
    expect(metrics.sharpe).toBeCloseTo(expectedAnnualSharpe, 6);
    // Sanity: annualized sharpe must differ from daily sharpe by factor sqrt(252)
    expect(metrics.sharpe / expectedDailySharpe).toBeCloseTo(Math.sqrt(252), 6);
  });

  it("computeMetrics handles empty trades and single-point equity curve (no NaN)", () => {
    const metrics = computeMetrics([], [{ date: "2025-01-01", equity: 10_000 }]);
    expect(Number.isNaN(metrics.total_return)).toBe(false);
    expect(Number.isNaN(metrics.sharpe)).toBe(false);
    expect(Number.isNaN(metrics.sortino)).toBe(false);
    expect(Number.isNaN(metrics.max_drawdown)).toBe(false);
    expect(Number.isNaN(metrics.win_rate)).toBe(false);
    expect(Number.isNaN(metrics.profit_factor)).toBe(false);
    expect(Number.isNaN(metrics.avg_hold_days)).toBe(false);
    expect(metrics.total_return).toBe(0);
    expect(metrics.sharpe).toBe(0);
    expect(metrics.sortino).toBe(0);
    expect(metrics.max_drawdown).toBe(0);
    expect(metrics.win_rate).toBe(0);
    expect(metrics.profit_factor).toBe(0);
    expect(metrics.total_trades).toBe(0);
    expect(metrics.avg_hold_days).toBe(0);
  });

  // ---------- Equity curve invariants (Tests 15-16) ----------

  it("equity curve starts at initial_capital", async () => {
    const klines = makeKlines([100, 105, 110]);
    const strategy = {
      evaluate: vi.fn((ctx) => {
        if (ctx.index === 0) return "BUY" as const;
        if (ctx.index === ctx.klines.length - 1) return "SELL" as const;
        return "HOLD" as const;
      }),
    };
    const config = makeConfig({ strategy, initial_capital: 5_000 });
    const engine = new BacktestEngine(config);

    const result = await engine.run(klines);

    expect(result.equity_curve.length).toBeGreaterThan(0);
    expect(result.equity_curve[0].equity).toBe(config.initial_capital);
  });

  it("equity curve ends at final equity = initial_capital + sum(pnl)", async () => {
    // Strategy closes all positions before the last bar so final equity is
    // purely cash = initial_capital + sum(realized pnl).
    const klines = makeKlines([100, 110, 105]);
    const strategy = {
      evaluate: vi.fn((ctx) => {
        if (ctx.index === 0) return "BUY" as const;
        if (ctx.index === 1) return "SELL" as const;
        return "HOLD" as const; // bar 2: flat, equity = cash only
      }),
    };
    const config = makeConfig({ strategy, initial_capital: 10_000, fee_bps: 0, slippage_bps: 0 });
    const engine = new BacktestEngine(config);

    const result = await engine.run(klines);

    const sumPnl = result.trades.reduce((acc, t) => acc + t.pnl, 0);
    const expectedFinalEquity = config.initial_capital + sumPnl;
    const lastEquity = result.equity_curve[result.equity_curve.length - 1].equity;
    expect(lastEquity).toBeCloseTo(expectedFinalEquity, 6);
  });

  // ---------- Look-ahead bias guard (Test 17) ----------

  it("look-ahead bias: run rejects klines whose last timestamp exceeds end_date", async () => {
    const klines = makeKlines([100, 100, 100, 100]); // dates 2025-01-01 .. 2025-01-04
    const config = makeConfig({
      start_date: "2025-01-01",
      end_date: "2025-01-03", // last kline (2025-01-04) violates
    });
    const engine = new BacktestEngine(config);

    await expect(engine.run(klines)).rejects.toThrow(/look.?ahead|end_date|future/i);
  });
});
