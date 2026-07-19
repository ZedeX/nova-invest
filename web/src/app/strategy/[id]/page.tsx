/**
 * Strategy Detail / Editor Page (Epic 04).
 * YAML DSL editor + validation + backtest trigger.
 */

import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

const SAMPLE_DSL = `version: "1.0"
name: NVDA MA Cross
kind: strategy
symbols: ["NVDA"]
timeframe: "1d"

indicators:
  - name: sma_short
    type: SMA
    inputs: { symbol: "$self", field: close, period: 20 }
  - name: sma_long
    type: SMA
    inputs: { symbol: "$self", field: close, period: 50 }
  - name: rsi
    type: RSI
    inputs: { symbol: "$self", field: close, period: 14 }

rules:
  - when: sma_short > sma_long AND rsi < 70
    action: buy
    qty: 100
  - when: sma_short < sma_long
    action: sell
    qty: 100

risk:
  stop_loss: 0.05
  take_profit: 0.15
  max_positions: 5

narrative:
  why: "Trend following with momentum filter"
  how: "Long when fast SMA above slow SMA and RSI not overbought"
  risks: ["Whipsaw in sideways markets", "Late entry on trend reversal"]
`;

export default async function StrategyDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <Link href="/strategy" className="text-xs text-zinc-500 hover:underline">← Strategies</Link>
          <h1 className="text-2xl font-bold mt-1">Edit Strategy</h1>
          <p className="text-xs text-zinc-500 mt-1">ID: <code className="font-mono">{id}</code></p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 rounded text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Validate
          </button>
          <Link
            href={`/backtest?strategy=${id}`}
            className="px-3 py-1.5 rounded text-sm bg-amber-600 hover:bg-amber-700 text-white"
          >
            Run Backtest
          </Link>
          <button className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white">
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <label className="block text-sm font-semibold mb-2">DSL (YAML)</label>
          <textarea
            defaultValue={SAMPLE_DSL}
            className="w-full h-[600px] p-3 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-950 text-zinc-100 font-mono text-xs"
            spellCheck={false}
          />
        </div>
        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold mb-2">Validation</h3>
            <ul className="space-y-1 text-xs">
              <li className="text-green-600 dark:text-green-400">✓ version: &quot;1.0&quot; matches schema</li>
              <li className="text-green-600 dark:text-green-400">✓ all indicators registered</li>
              <li className="text-green-600 dark:text-green-400">✓ rules reference valid indicators</li>
              <li className="text-green-600 dark:text-green-400">✓ risk.stop_loss in [0, 1]</li>
              <li className="text-amber-600 dark:text-amber-400">⚠ narrative.risks should list ≥ 2 items</li>
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold mb-2">Lifecycle</h3>
            <ol className="text-xs space-y-1">
              <li className="text-blue-600">1. Draft</li>
              <li className="text-blue-600">2. Validated ✓</li>
              <li className="text-zinc-500">3. Backtested</li>
              <li className="text-zinc-500">4. Paper</li>
              <li className="text-zinc-500">5. Live</li>
            </ol>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold mb-2">Last Backtest</h3>
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between"><dt className="text-zinc-500">Period</dt><dd>2024-01-01 to 2025-12-31</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Return</dt><dd className="font-mono text-green-600">+18.40%</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Sharpe</dt><dd className="font-mono">1.32</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Max DD</dt><dd className="font-mono text-red-600">-8.20%</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Trades</dt><dd className="font-mono">42</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
