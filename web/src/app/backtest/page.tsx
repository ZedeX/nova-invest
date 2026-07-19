/**
 * Backtest Runner Page (Epic 04).
 * Configure + run backtest + show results.
 */

import Link from "next/link";

const RESULT = {
  strategy: "NVDA MA Cross",
  period: "2024-01-01 → 2025-12-31",
  initial_capital: 100000,
  final_equity: 118400,
  total_return: 18.4,
  cagr: 9.1,
  sharpe: 1.32,
  sortino: 1.78,
  max_drawdown: -8.2,
  win_rate: 0.571,
  total_trades: 42,
  avg_hold_days: 11.3,
};

const EQUITY_CURVE = [100, 102, 99, 105, 108, 104, 110, 115, 112, 118, 116, 118.4];

export default function BacktestPage() {
  const eqMin = Math.min(...EQUITY_CURVE);
  const eqMax = Math.max(...EQUITY_CURVE);
  const eqRange = eqMax - eqMin;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Backtest</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Run strategy against historical data. Mock mode uses pre-generated K-line JSON.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-3">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Configuration</h3>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Strategy</label>
              <select className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm">
                <option>NVDA MA Cross</option>
                <option>RSI Oversold</option>
                <option>Bollinger Breakout</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Symbol</label>
              <select className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm">
                <option>NVDA</option>
                <option>AAPL</option>
                <option>MSFT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Start Date</label>
              <input type="date" defaultValue="2024-01-01" className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">End Date</label>
              <input type="date" defaultValue="2025-12-31" className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Initial Capital</label>
              <input type="number" defaultValue={100000} className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Split (In/Out)</label>
              <select className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm">
                <option>70 / 30</option>
                <option>80 / 20</option>
                <option>100 / 0 (no OOS)</option>
              </select>
            </div>
            <button className="w-full px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium">
              Run Backtest
            </button>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-6">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold">Equity Curve</h3>
              <span className="text-xs text-zinc-500">{RESULT.period}</span>
            </div>
            <svg viewBox="0 0 400 120" className="w-full h-32">
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline
                points={EQUITY_CURVE.map((v, i) => {
                  const x = (i / (EQUITY_CURVE.length - 1)) * 400;
                  const y = 110 - ((v - eqMin) / eqRange) * 100;
                  return `${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
              />
              <polygon
                points={`0,110 ${EQUITY_CURVE.map((v, i) => {
                  const x = (i / (EQUITY_CURVE.length - 1)) * 400;
                  const y = 110 - ((v - eqMin) / eqRange) * 100;
                  return `${x},${y}`;
                }).join(" ")} 400,110`}
                fill="url(#eqGrad)"
              />
            </svg>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Return", value: `+${RESULT.total_return}%`, color: "text-green-600" },
              { label: "CAGR", value: `${RESULT.cagr}%`, color: "text-green-600" },
              { label: "Sharpe", value: RESULT.sharpe.toFixed(2), color: "" },
              { label: "Sortino", value: RESULT.sortino.toFixed(2), color: "" },
              { label: "Max Drawdown", value: `${RESULT.max_drawdown}%`, color: "text-red-600" },
              { label: "Win Rate", value: `${(RESULT.win_rate * 100).toFixed(1)}%`, color: "" },
              { label: "Trades", value: RESULT.total_trades, color: "" },
              { label: "Avg Hold", value: `${RESULT.avg_hold_days}d`, color: "" },
            ].map(m => (
              <div key={m.label} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">{m.label}</div>
                <div className={`text-lg font-mono font-semibold ${m.color}`}>{m.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold">Trade Log (last 5)</h3>
              <Link href="#" className="text-xs text-blue-600 hover:underline">Export CSV</Link>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                  <th className="text-left py-2">#</th>
                  <th className="text-left">Date</th>
                  <th className="text-left">Side</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { d: "2025-11-12", s: "SELL", q: 100, p: 145.32, pnl: 1230 },
                  { d: "2025-10-28", s: "BUY",  q: 100, p: 132.88, pnl: null },
                  { d: "2025-09-15", s: "SELL", q: 100, p: 128.44, pnl: -410 },
                  { d: "2025-08-30", s: "BUY",  q: 100, p: 132.55, pnl: null },
                  { d: "2025-07-18", s: "SELL", q: 100, p: 130.12, pnl: 870 },
                ].map((t, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2">{42 - i}</td>
                    <td>{t.d}</td>
                    <td className={t.s === "BUY" ? "text-green-600" : "text-red-600"}>{t.s}</td>
                    <td className="text-right font-mono">{t.q}</td>
                    <td className="text-right font-mono">${t.p.toFixed(2)}</td>
                    <td className={`text-right font-mono ${t.pnl === null ? "text-zinc-500" : t.pnl > 0 ? "text-green-600" : "text-red-600"}`}>
                      {t.pnl === null ? "—" : `${t.pnl > 0 ? "+" : ""}$${t.pnl}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
