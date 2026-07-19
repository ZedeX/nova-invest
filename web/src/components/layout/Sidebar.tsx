/**
 * Sidebar with Watchlist and quick navigation.
 * Used on Dashboard page.
 */

import { R2_CACHE_SYMBOLS } from "@/lib/env";

const WATCHLIST = [
  { ticker: "AAPL", name: "Apple Inc.",       change:  0.45 },
  { ticker: "NVDA", name: "NVIDIA Corp.",     change:  2.18 },
  { ticker: "TSLA", name: "Tesla, Inc.",      change: -1.32 },
  { ticker: "MSFT", name: "Microsoft Corp.",  change:  0.22 },
  { ticker: "AMZN", name: "Amazon.com, Inc.", change:  0.78 },
];

const STRATEGIES = [
  { id: "str_mock_1", name: "NVDA MA Cross",      status: "backtested" },
  { id: "str_mock_2", name: "RSI Oversold",       status: "paper" },
  { id: "str_mock_3", name: "Bollinger Breakout", status: "validated" },
];

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col gap-6 w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-4">
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
          Watchlist
        </h3>
        <ul className="space-y-1">
          {WATCHLIST.map(item => (
            <li key={item.ticker}>
              <a
                href={`/chart/${item.ticker}`}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {item.ticker}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[140px]">
                    {item.name}
                  </div>
                </div>
                <div className={`text-xs font-mono ${item.change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
          Strategies
        </h3>
        <ul className="space-y-1">
          {STRATEGIES.map(s => (
            <li key={s.id}>
              <a
                href={`/strategy/${s.id}`}
                className="block px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                  {s.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                  {s.status}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
          Mockup Pool
        </h3>
        <div className="flex flex-wrap gap-1">
          {Array.from(R2_CACHE_SYMBOLS).map(sym => (
            <a
              key={sym}
              href={`/chart/${sym}`}
              className="px-1.5 py-0.5 text-xs rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              {sym}
            </a>
          ))}
        </div>
      </section>
    </aside>
  );
}
