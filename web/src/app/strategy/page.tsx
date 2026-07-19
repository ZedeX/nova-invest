/**
 * Strategy List Page (Epic 04).
 * Shows all user strategies + new strategy button.
 */

import Link from "next/link";

const STRATEGIES = [
  {
    id: "str_mock_1",
    name: "NVDA MA Cross",
    status: "backtested",
    ret: 18.4,
    sharpe: 1.32,
    mdd: -8.2,
    updated: "2026-07-15",
  },
  {
    id: "str_mock_2",
    name: "RSI Oversold",
    status: "paper",
    ret: 6.7,
    sharpe: 0.89,
    mdd: -4.1,
    updated: "2026-07-12",
  },
  {
    id: "str_mock_3",
    name: "Bollinger Breakout",
    status: "validated",
    ret: null,
    sharpe: null,
    mdd: null,
    updated: "2026-07-18",
  },
  {
    id: "str_mock_4",
    name: "AAPL Momentum",
    status: "draft",
    ret: null,
    sharpe: null,
    mdd: null,
    updated: "2026-07-18",
  },
];

const STATUS_COLORS: Record<string, string> = {
  draft:      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  validated:  "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  backtested: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  paper:      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  live:       "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default function StrategyPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Strategies</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Define, validate, backtest, and deploy trading strategies via YAML DSL.
          </p>
        </div>
        <Link
          href="/strategy/new"
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          + New Strategy
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Name</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Return %</th>
              <th className="px-4 py-3 text-right font-semibold">Sharpe</th>
              <th className="px-4 py-3 text-right font-semibold">Max DD %</th>
              <th className="px-4 py-3 text-left font-semibold">Updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {STRATEGIES.map(s => (
              <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[s.status]}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {s.ret !== null ? `${s.ret > 0 ? "+" : ""}${s.ret.toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {s.sharpe !== null ? s.sharpe.toFixed(2) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {s.mdd !== null ? s.mdd.toFixed(2) : "—"}
                </td>
                <td className="px-4 py-3 text-zinc-500">{s.updated}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/strategy/${s.id}`} className="text-blue-600 hover:underline text-xs">
                    Edit →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
        <h3 className="text-sm font-semibold mb-2">DSL Quick Reference</h3>
        <pre className="text-xs bg-zinc-950 text-zinc-100 p-3 rounded overflow-x-auto"><code>{`version: "1.0"
name: MA Cross
kind: strategy
symbols: ["AAPL"]
indicators:
  - name: sma_short
    type: SMA
    inputs: { symbol: "$self", field: close, period: 20 }
  - name: sma_long
    type: SMA
    inputs: { symbol: "$self", field: close, period: 50 }
rules:
  - when: sma_short > sma_long
    action: buy
    qty: 100
  - when: sma_short < sma_long
    action: sell
    qty: 100
risk:
  stop_loss: 0.05
  take_profit: 0.15
  max_positions: 5`}</code></pre>
      </div>
    </div>
  );
}
