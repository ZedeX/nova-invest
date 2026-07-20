/**
 * Walk-Forward Analysis (WFA) — Phase 2 infrastructure.
 *
 * Per Roadmap.md §3.2 Sprint 13-15: Walk-forward backtest.
 *
 * Walk-Forward Analysis validates strategy robustness by:
 *   1. Splitting historical data into N windows
 *   2. Each window has a training period (in-sample) + test period (out-of-sample)
 *   3. Running the strategy on each test period
 *   4. Aggregating results across all windows
 *
 * This prevents overfitting: a strategy that only works on in-sample data
 * but fails out-of-sample is not robust.
 *
 * Two modes:
 *   - Anchored: training period starts from the beginning, grows each window
 *   - Rolling: training window is fixed size, slides forward each step
 *
 * See: ADR-0009 §"Phase 1 Deferrals" — sample_split (70/30) deferred to Phase 2.
 * This module implements the deferred feature as Phase 1.5 infrastructure.
 */

import type { Kline } from "@/lib/types";
import { BacktestEngine, computeMetrics } from "./engine";
import type {
  BacktestConfig,
  BacktestMetrics,
  BacktestResult,
  EquityPoint,
  Trade,
} from "./types";

// ============ Types ============

export type WFAMode = "rolling" | "anchored";

export interface WFAConfig {
  /** Strategy to evaluate at each bar. */
  strategy: BacktestConfig["strategy"];
  /** Number of training bars per window. */
  trainBars: number;
  /** Number of test bars per window. */
  testBars: number;
  /** Walk-forward mode: rolling (fixed train) or anchored (expanding train). */
  mode: WFAMode;
  /** Starting cash. Must be > 0. */
  initial_capital: number;
  /** Commission per side in basis points. */
  fee_bps: number;
  /** Slippage per side in basis points. */
  slippage_bps: number;
}

export interface WFAWindowResult {
  /** Window index (0-based). */
  windowIndex: number;
  /** In-sample (training) backtest result. */
  inSample: BacktestResult;
  /** Out-of-sample (test) backtest result. */
  outOfSample: BacktestResult;
}

export interface WFAResult {
  /** Individual window results. */
  windows: WFAWindowResult[];
  /** Aggregated out-of-sample metrics across all windows. */
  aggregatedOOS: BacktestMetrics;
  /** Aggregated in-sample metrics across all windows. */
  aggregatedIS: BacktestMetrics;
  /** Degradation ratio: OOS return / IS return. < 0.5 suggests overfitting. */
  degradationRatio: number;
  /** Total number of windows. */
  totalWindows: number;
}

// ============ Walk-Forward Engine ============

export class WalkForwardEngine {
  constructor(private readonly config: WFAConfig) {
    if (config.trainBars < 10) {
      throw new Error(`trainBars must be >= 10 (got ${config.trainBars})`);
    }
    if (config.testBars < 5) {
      throw new Error(`testBars must be >= 5 (got ${config.testBars})`);
    }
    if (config.initial_capital <= 0) {
      throw new Error(`initial_capital must be > 0 (got ${config.initial_capital})`);
    }
  }

  /**
   * Run walk-forward analysis on sorted klines.
   *
   * The data is split into windows of (trainBars + testBars) each.
   * For rolling mode, the training window slides forward.
   * For anchored mode, the training window grows from the start.
   */
  async run(klines: Kline[]): Promise<WFAResult> {
    const sorted = [...klines].sort((a, b) =>
      a.t < b.t ? -1 : a.t > b.t ? 1 : 0,
    );

    const windows: WFAWindowResult[] = [];
    const { trainBars, testBars, mode } = this.config;
    const windowSize = trainBars + testBars;

    // Calculate number of windows
    let windowStart = 0;
    let windowIndex = 0;

    while (windowStart + windowSize <= sorted.length) {
      const trainStart = mode === "anchored" ? 0 : windowStart;
      const trainEnd = windowStart + trainBars;
      const testStart = trainEnd;
      const testEnd = testStart + testBars;

      const trainKlines = sorted.slice(trainStart, trainEnd);
      const testKlines = sorted.slice(testStart, testEnd);

      // Build configs for in-sample and out-of-sample runs
      const isConfig: BacktestConfig = {
        strategy: this.config.strategy,
        start_date: trainKlines[0]?.t ?? "1970-01-01",
        end_date: trainKlines[trainKlines.length - 1]?.t ?? "1970-01-01",
        initial_capital: this.config.initial_capital,
        fee_bps: this.config.fee_bps,
        slippage_bps: this.config.slippage_bps,
      };

      const oosConfig: BacktestConfig = {
        strategy: this.config.strategy,
        start_date: testKlines[0]?.t ?? "1970-01-01",
        end_date: testKlines[testKlines.length - 1]?.t ?? "1970-01-01",
        initial_capital: this.config.initial_capital,
        fee_bps: this.config.fee_bps,
        slippage_bps: this.config.slippage_bps,
      };

      const isEngine = new BacktestEngine(isConfig);
      const oosEngine = new BacktestEngine(oosConfig);

      const [isResult, oosResult] = await Promise.all([
        isEngine.run(trainKlines),
        oosEngine.run(testKlines),
      ]);

      windows.push({
        windowIndex,
        inSample: isResult,
        outOfSample: oosResult,
      });

      windowIndex++;
      windowStart += testBars; // Slide by test period
    }

    // Aggregate metrics
    const aggregatedIS = aggregateMetrics(windows.map((w) => w.inSample));
    const aggregatedOOS = aggregateMetrics(windows.map((w) => w.outOfSample));

    // Degradation ratio: OOS return / IS return
    // If IS return is 0 or negative, ratio is meaningless → use 0
    const degradationRatio =
      aggregatedIS.total_return > 0
        ? aggregatedOOS.total_return / aggregatedIS.total_return
        : 0;

    return {
      windows,
      aggregatedOOS,
      aggregatedIS,
      degradationRatio,
      totalWindows: windows.length,
    };
  }
}

// ============ Aggregation ============

/**
 * Aggregate backtest results across multiple windows.
 * Merges trades and equity curves, then recomputes metrics.
 */
function aggregateMetrics(results: BacktestResult[]): BacktestMetrics {
  const allTrades: Trade[] = [];
  const allEquity: EquityPoint[] = [];

  for (const result of results) {
    allTrades.push(...result.trades);
    allEquity.push(...result.equity_curve);
  }

  return computeMetrics(allTrades, allEquity);
}

// ============ Simple 70/30 Split ============

/**
 * Simple in-sample / out-of-sample split (70/30).
 * Per ADR-0009 §"Phase 1 Deferrals" — now implemented as Phase 1.5.
 *
 * @param klines - Sorted OHLCV bars
 * @param splitRatio - Training fraction (default 0.7 = 70%)
 * @returns { inSample, outOfSample } kline arrays
 */
export function splitSample(
  klines: Kline[],
  splitRatio = 0.7,
): { inSample: Kline[]; outOfSample: Kline[] } {
  if (splitRatio <= 0 || splitRatio >= 1) {
    throw new Error(`splitRatio must be in (0, 1), got ${splitRatio}`);
  }

  const sorted = [...klines].sort((a, b) =>
    a.t < b.t ? -1 : a.t > b.t ? 1 : 0,
  );

  const splitIndex = Math.floor(sorted.length * splitRatio);
  return {
    inSample: sorted.slice(0, splitIndex),
    outOfSample: sorted.slice(splitIndex),
  };
}
