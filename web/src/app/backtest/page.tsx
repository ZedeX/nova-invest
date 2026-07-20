"use client";

/**
 * Backtest Runner Page (Epic 04, Sprint 5).
 *
 * Phase 1: Calls /api/backtest with strategy_name + symbol + date range.
 * Renders:
 *   - Equity curve (SVG)
 *   - Metrics grid (8 cards)
 *   - Returns distribution histogram (quantile chart)
 *   - Trade log table
 */

import { useState } from "react";
import Link from "next/link";

interface Trade {
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  qty: number;
  pnl: number;
  pnl_pct: number;
}

interface Metrics {
  total_return: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  avg_hold_days: number;
}

interface EquityPoint {
  date: string;
  equity: number;
}

interface BacktestResult {
  symbol: string;
  trades: Trade[];
  metrics: Metrics;
  equity_curve: EquityPoint[];
}

const STRATEGIES = [
  { id: "sma20_crossover", name: "SMA(20) Crossover" },
  { id: "rsi_oversold", name: "RSI(14) Oversold" },
  { id: "bollinger_breakout", name: "Bollinger Breakout" },
];

const SYMBOLS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOG", "META"];

export default function BacktestPage() {
  const [strategy, setStrategy] = useState(STRATEGIES[0].id);
  const [symbol, setSymbol] = useState("NVDA");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2025-12-31");
  const [capital, setCapital] = useState(100000);
  const [feeBps, setFeeBps] = useState(5);
  const [slippageBps, setSlippageBps] = useState(5);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runBacktest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy_name: strategy,
          symbol,
          start_date: startDate,
          end_date: endDate,
          initial_capital: capital,
          fee_bps: feeBps,
          slippage_bps: slippageBps,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as BacktestResult;
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // ---- Equity curve SVG ----
  function renderEquityCurve() {
    if (!result || result.equity_curve.length === 0) return null;
    const eq = result.equity_curve;
    const values = eq.map((p) => p.equity);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 800;
    const height = 140;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36">
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={eq
            .map((p, i) => {
              const x = (i / (eq.length - 1)) * width;
              const y = height - 20 - ((p.equity - min) / range) * (height - 30);
              return `${x},${y}`;
            })
            .join(" ")}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
        />
        <polygon
          points={`0,${height - 20} ${eq
            .map((p, i) => {
              const x = (i / (eq.length - 1)) * width;
              const y = height - 20 - ((p.equity - min) / range) * (height - 30);
              return `${x},${y}`;
            })
            .join(" ")} ${width},${height - 20}`}
          fill="url(#eqGrad)"
        />
        <text x={5} y={15} className="text-xs fill-zinc-500">
          ${max.toFixed(0)}
        </text>
        <text x={5} y={height - 5} className="text-xs fill-zinc-500">
          ${min.toFixed(0)}
        </text>
      </svg>
    );
  }

  // ---- Returns distribution histogram (quantile chart) ----
  function renderReturnsHistogram() {
    if (!result || result.trades.length === 0) return null;
    const returns = result.trades.map((t) => t.pnl_pct * 100);
    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const range = max - min || 1;
    const buckets = 10;
    const bucketSize = range / buckets;
    const histogram = new Array(buckets).fill(0);
    for (const r of returns) {
      const idx = Math.min(buckets - 1, Math.floor((r - min) / bucketSize));
      histogram[idx]++;
    }
    const maxCount = Math.max(...histogram) || 1;
    const width = 800;
    const height = 100;
    const barWidth = (width - 20) / buckets;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28">
        {histogram.map((count, i) => {
          const barHeight = (count / maxCount) * (height - 20);
          const x = 10 + i * barWidth;
          const y = height - 20 - barHeight;
          const bucketMin = min + i * bucketSize;
          const isPositive = bucketMin >= 0;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth - 2}
                height={barHeight}
                fill={isPositive ? "#22c55e" : "#ef4444"}
                opacity={0.7}
              />
              <text
                x={x + barWidth / 2}
                y={height - 5}
                textAnchor="middle"
                className="text-[8px] fill-zinc-500"
              >
                {bucketMin.toFixed(1)}%
              </text>
            </g>
          );
        })}
        <line
          x1={10 + ((0 - min) / bucketSize) * barWidth}
          x2={10 + ((0 - min) / bucketSize) * barWidth}
          y1={0}
          y2={height - 20}
          stroke="#71717a"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      </svg>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Backtest</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Run strategy against historical data. Calls /api/backtest with the configured parameters.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-3">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Configuration</h3>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Strategy</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm text-zinc-900 dark:text-zinc-50"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm text-zinc-900 dark:text-zinc-50"
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm text-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm text-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Initial Capital ($)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono text-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Fee (bps)</label>
                <input
                  type="number"
                  value={feeBps}
                  onChange={(e) => setFeeBps(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono text-zinc-900 dark:text-zinc-50"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Slippage (bps)</label>
                <input
                  type="number"
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono text-zinc-900 dark:text-zinc-50"
                />
              </div>
            </div>
            <button
              onClick={runBacktest}
              disabled={loading}
              className="w-full px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/50 text-white text-sm font-medium transition-colors"
            >
              {loading ? "Running..." : "Run Backtest"}
            </button>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
              <strong>Error:</strong> {error}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-12 text-center text-sm text-zinc-500">
              Configure parameters on the left and click &quot;Run Backtest&quot; to see results.
            </div>
          )}

          {result && (
            <>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Equity Curve</h3>
                  <span className="text-xs text-zinc-500">
                    {result.symbol} · {startDate} → {endDate}
                  </span>
                </div>
                {renderEquityCurve()}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Return", value: `${(result.metrics.total_return * 100).toFixed(2)}%`, color: result.metrics.total_return >= 0 ? "text-green-600" : "text-red-600" },
                  { label: "Sharpe", value: result.metrics.sharpe.toFixed(2), color: "" },
                  { label: "Sortino", value: result.metrics.sortino.toFixed(2), color: "" },
                  { label: "Max Drawdown", value: `${(result.metrics.max_drawdown * 100).toFixed(2)}%`, color: "text-red-600" },
                  { label: "Win Rate", value: `${(result.metrics.win_rate * 100).toFixed(1)}%`, color: "" },
                  { label: "Profit Factor", value: result.metrics.profit_factor === Number.MAX_SAFE_INTEGER ? "∞" : result.metrics.profit_factor.toFixed(2), color: "" },
                  { label: "Trades", value: result.metrics.total_trades, color: "" },
                  { label: "Avg Hold", value: `${result.metrics.avg_hold_days.toFixed(1)}d`, color: "" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
                    <div className="text-xs text-zinc-500">{m.label}</div>
                    <div className={`text-lg font-mono font-semibold text-zinc-900 dark:text-zinc-50 ${m.color}`}>{m.value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Returns Distribution</h3>
                  <span className="text-xs text-zinc-500">Per-trade return %</span>
                </div>
                {renderReturnsHistogram()}
              </div>

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Trade Log ({result.trades.length})
                  </h3>
                  <Link href="#" className="text-xs text-blue-600 hover:underline">Export CSV</Link>
                </div>
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white dark:bg-zinc-950">
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                        <th className="text-left py-2">#</th>
                        <th className="text-left">Entry</th>
                        <th className="text-left">Exit</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Entry</th>
                        <th className="text-right">Exit</th>
                        <th className="text-right">P&amp;L</th>
                        <th className="text-right">Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.slice().reverse().map((t, i) => (
                        <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                          <td className="py-2 text-zinc-500">{result.trades.length - i}</td>
                          <td className="text-zinc-700 dark:text-zinc-300">{t.entry_date}</td>
                          <td className="text-zinc-700 dark:text-zinc-300">{t.exit_date}</td>
                          <td className="text-right font-mono text-zinc-700 dark:text-zinc-300">{t.qty}</td>
                          <td className="text-right font-mono text-zinc-500">${t.entry_price.toFixed(2)}</td>
                          <td className="text-right font-mono text-zinc-500">${t.exit_price.toFixed(2)}</td>
                          <td className={`text-right font-mono ${t.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                          </td>
                          <td className={`text-right font-mono ${t.pnl_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {t.pnl_pct >= 0 ? "+" : ""}{(t.pnl_pct * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
