/**
 * Backtest Engine — 8-step pipeline + metrics + trade simulator (ADR-0009)
 *
 * Pipeline (per ADR-0009 §"Backtest Pipeline"):
 *   1. validate          — constructor rejects invalid config
 *   2. loadData          — klines passed to run()
 *   3. computeIndicators — (Phase 1 simplified: strategy owns indicator logic)
 *   4. generateSignals   — strategy.evaluate(ctx) at each bar, point-in-time
 *   5. simulateTrades    — TradeSimulator applies fee + slippage
 *   6. computeEquityCurve— mark-to-market at each bar
 *   7. computeMetrics    — total_return, sharpe, sortino, max_drawdown, ...
 *   8. validateLookahead — last kline.t <= end_date (no future data)
 *
 * Critical Implementation Rules (ADR-0009 §"Critical Implementation Rules"):
 *   #2 No lookahead bias: ctx.klines = klines[0..i] only.
 *   #5 Commission always applied (even when fee_bps = 0).
 *
 * See: docs/architecture/adr-0009-backtest-engine.md
 */

import type { Kline } from "@/lib/types";
import type {
  BacktestConfig,
  BacktestMetrics,
  BacktestResult,
  EquityPoint,
  StrategyContext,
  Trade,
} from "./types";

// ============ TradeSimulator (shared with PaperBroker per ADR-0009) ============

/**
 * Handles fill price + fee computation. Stateless — given a config, it
 * computes deterministic fill prices and fees. The same instance is used
 * for both backtest and (future) PaperBroker to guarantee identical
 * execution semantics.
 */
export class TradeSimulator {
  constructor(
    private readonly config: { fee_bps: number; slippage_bps: number },
  ) {}

  /**
   * Compute fill price for a given side, applying slippage.
   * BUY: price goes up (pay more). SELL: price goes down (receive less).
   *
   * ADR-0009 §"Trade Simulation Core":
   *   slippage = lastPrice * (slippage_bps / 10000)
   *   fill = side === "buy" ? lastPrice + slippage : lastPrice - slippage
   */
  computeFillPrice(side: "buy" | "sell", lastPrice: number): number {
    const slippage = lastPrice * (this.config.slippage_bps / 10000);
    return side === "buy" ? lastPrice + slippage : lastPrice - slippage;
  }

  /**
   * Compute commission fee for a given notional value.
   * Formula: fee_bps * notional / 10000.
   * Always called — even when fee_bps = 0 (per ADR-0009 rule #5) to prevent
   * commission omission bugs when switching to non-zero commission.
   */
  computeFee(notional: number): number {
    return (this.config.fee_bps * notional) / 10000;
  }
}

// ============ BacktestEngine ============

/**
 * Main engine. Construct with a BacktestConfig, then call `run(klines)`.
 *
 * The constructor performs Step 1 (validate) eagerly so that config errors
 * surface before any data is loaded. `run()` performs Steps 2–8.
 */
export class BacktestEngine {
  constructor(private readonly config: BacktestConfig) {
    // Step 1: Validate config invariants.
    if (config.initial_capital <= 0) {
      throw new Error(
        `BacktestConfig.initial_capital must be > 0 (got ${config.initial_capital})`,
      );
    }
    if (config.start_date >= config.end_date) {
      throw new Error(
        `BacktestConfig.start_date (${config.start_date}) must be < end_date (${config.end_date})`,
      );
    }
    if (config.fee_bps < 0) {
      throw new Error(
        `BacktestConfig.fee_bps must be >= 0 (got ${config.fee_bps})`,
      );
    }
    if (config.slippage_bps < 0) {
      throw new Error(
        `BacktestConfig.slippage_bps must be >= 0 (got ${config.slippage_bps})`,
      );
    }
  }

  /**
   * Run the 8-step backtest pipeline.
   *
   * @param klines OHLCV bars sorted chronologically (oldest first).
   *                The engine sorts defensively; original array is not mutated.
   * @returns BacktestResult with trades, metrics, and equity curve.
   * @throws if last kline timestamp exceeds `config.end_date` (look-ahead bias).
   */
  async run(klines: Kline[]): Promise<BacktestResult> {
    // Step 2: loadData — sort defensively to guarantee chronological order.
    const sorted = [...klines].sort((a, b) =>
      a.t < b.t ? -1 : a.t > b.t ? 1 : 0,
    );

    // Step 8 (early check): validate no look-ahead bias.
    // Per ADR-0009 §"Critical Implementation Rules" #2: signal evaluation at
    // bar N may only use data up to bar N. If the input itself contains bars
    // past end_date, the result would be contaminated — fail fast.
    if (sorted.length > 0) {
      const lastT = sorted[sorted.length - 1].t;
      if (lastT > this.config.end_date) {
        throw new Error(
          `Look-ahead bias detected: last kline timestamp (${lastT}) ` +
            `exceeds end_date (${this.config.end_date})`,
        );
      }
    }

    // Set up simulator + portfolio state.
    const simulator = new TradeSimulator({
      fee_bps: this.config.fee_bps,
      slippage_bps: this.config.slippage_bps,
    });

    let cash = this.config.initial_capital;
    let position: {
      qty: number;
      entry_price: number;
      entry_date: string;
      entry_fee: number;
    } | null = null;

    const trades: Trade[] = [];
    const equity_curve: EquityPoint[] = [];

    // Steps 3–6: iterate bars chronologically, point-in-time.
    for (let i = 0; i < sorted.length; i++) {
      const kline = sorted[i];

      // Step 6 (record BEFORE trade at this bar): mark-to-market the open
      // position at the current close, then snapshot equity. This ensures
      // equity_curve[0] === initial_capital (no trade has executed yet at
      // bar 0, so position_value = 0 and cash = initial_capital).
      const positionValue = position ? position.qty * kline.c : 0;
      equity_curve.push({ date: kline.t, equity: cash + positionValue });

      // Step 3-4: generate signal with point-in-time context.
      // CRITICAL: ctx.klines = sorted[0..i] inclusive — strategy cannot see
      // future bars.
      const ctx: StrategyContext = {
        index: i,
        klines: sorted.slice(0, i + 1),
        close: kline.c,
        open: kline.o,
        high: kline.h,
        low: kline.l,
        volume: kline.v,
        date: kline.t,
      };
      const signal = this.config.strategy.evaluate(ctx);

      // Step 5: simulate trade (BUY opens a long, SELL closes it).
      // Phase 1 simplification: single long position, all-in sizing
      // (qty = cash / entry_price). No short selling, no multi-position.
      //
      // Degenerate-price guard: if kline.c <= 0 (corrupted data, zero-price
      // bar, etc.) the BUY signal is ignored entirely. Opening a position
      // with qty=0 polluted the trades list and broke equity-curve
      // invariants. Skipping the trade is the safe no-op.
      if (signal === "BUY" && !position && kline.c > 0) {
        const entry_price = simulator.computeFillPrice("buy", kline.c);
        // Defensive: slippage can drive fill price to <=0 if lastPrice is
        // extremely small. Skip the trade rather than emit a degenerate
        // position.
        if (entry_price > 0) {
          const qty = cash / entry_price;
          const notional = entry_price * qty;
          const fee = simulator.computeFee(notional);
          cash -= notional + fee;
          position = { qty, entry_price, entry_date: kline.t, entry_fee: fee };
        }
      } else if (signal === "SELL" && position) {
        const exit_price = simulator.computeFillPrice("sell", kline.c);
        const notional = exit_price * position.qty;
        const fee = simulator.computeFee(notional);
        cash += notional - fee;
        const cost_basis = position.entry_price * position.qty;
        const pnl =
          (exit_price - position.entry_price) * position.qty -
          position.entry_fee -
          fee;
        trades.push({
          entry_date: position.entry_date,
          exit_date: kline.t,
          entry_price: position.entry_price,
          exit_price,
          qty: position.qty,
          pnl,
          pnl_pct: cost_basis > 0 ? pnl / cost_basis : 0,
        });
        position = null;
      }
      // HOLD or no-op signal: do nothing.
    }

    // Step 7: compute metrics from trades + equity curve.
    const metrics = computeMetrics(trades, equity_curve);

    return { trades, metrics, equity_curve, config: this.config };
  }
}

// ============ computeMetrics (pure function) ============

/** Trading days per year for annualization (US equity calendar). */
const TRADING_DAYS_PER_YEAR = 252;

/**
 * Compute BacktestMetrics from a trade list and equity curve.
 *
 * Pure: no I/O, no side effects. Deterministic: same inputs → same outputs.
 *
 * Edge cases:
 *   - Empty equity curve → all metrics 0 (no NaN).
 *   - Single-point equity curve → total_return=0, sharpe=0 (no returns to average).
 *   - Zero std / zero downside dev → sharpe/sortino = 0 (not Infinity).
 *   - Empty trades → win_rate=0, profit_factor=0, total_trades=0, avg_hold_days=0.
 *   - No losing trades but has winning trades → profit_factor = Infinity
 *     (mathematically correct; not NaN).
 */
export function computeMetrics(
  trades: Trade[],
  equityCurve: EquityPoint[],
): BacktestMetrics {
  // --- total_return ---
  const initial = equityCurve.length > 0 ? equityCurve[0].equity : 0;
  const final =
    equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : 0;
  const total_return = initial > 0 ? (final - initial) / initial : 0;

  // --- daily returns from equity curve (for sharpe / sortino) ---
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev !== 0) {
      dailyReturns.push((equityCurve[i].equity - prev) / prev);
    }
  }

  const sharpe = computeAnnualizedSharpe(dailyReturns);
  const sortino = computeAnnualizedSortino(dailyReturns);

  // --- max_drawdown ---
  // Walk the equity curve tracking the running peak; maxDD is the largest
  // (peak - equity) / peak observed.
  let peak = -Infinity;
  let max_drawdown = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    if (peak > 0) {
      const dd = (peak - point.equity) / peak;
      if (dd > max_drawdown) max_drawdown = dd;
    }
  }

  // --- trade-based metrics ---
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let holdDaysSum = 0;
  for (const t of trades) {
    if (t.pnl > 0) {
      wins++;
      grossProfit += t.pnl;
    } else if (t.pnl < 0) {
      grossLoss += Math.abs(t.pnl);
    }
    const entryMs = Date.parse(`${t.entry_date}T00:00:00Z`);
    const exitMs = Date.parse(`${t.exit_date}T00:00:00Z`);
    if (!Number.isNaN(entryMs) && !Number.isNaN(exitMs)) {
      holdDaysSum += Math.max(0, (exitMs - entryMs) / 86_400_000);
    }
  }

  const win_rate = trades.length > 0 ? wins / trades.length : 0;
  // profit_factor: when no losses, return MAX_SAFE_INTEGER (not Infinity).
  // JSON.stringify(Infinity) produces `null`, which silently loses the signal
  // downstream. MAX_SAFE_INTEGER preserves "essentially unbounded upside"
  // while staying JSON-serializable. ADR-0009 §Backtest Metrics declares the
  // range as [0, ∞); MAX_SAFE_INTEGER is the closest finite approximation
  // representable in JSON.
  const profit_factor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? Number.MAX_SAFE_INTEGER
        : 0;
  const total_trades = trades.length;
  const avg_hold_days = trades.length > 0 ? holdDaysSum / trades.length : 0;

  return {
    total_return,
    sharpe,
    sortino,
    max_drawdown,
    win_rate,
    profit_factor,
    total_trades,
    avg_hold_days,
  };
}

// ============ Internal metric helpers ============

/**
 * Annualized Sharpe ratio.
 * Formula: (mean(excess_return) / std(excess_return)) * sqrt(252)
 * Risk-free rate assumed 0 (Phase 1 simplification).
 * Uses population std (divide by N, not N-1).
 * Returns 0 when std = 0 or returns list is empty.
 */
function computeAnnualizedSharpe(returns: number[]): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Annualized Sortino ratio.
 * Formula: (mean(excess_return) / downside_deviation) * sqrt(252)
 * Downside deviation = sqrt(mean(min(r, 0)^2)) — only negative returns
 * contribute (treated as 0 when positive).
 * Returns 0 when there are no negative returns or returns list is empty.
 */
function computeAnnualizedSortino(returns: number[]): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  // Downside variance: average of squared negative returns (zeros for positive).
  const downsideVariance =
    returns.reduce((a, b) => a + (b < 0 ? b * b : 0), 0) / returns.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return 0;
  return (mean / downsideDev) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}
