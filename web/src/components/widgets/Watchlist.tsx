/**
 * Watchlist Widget (Epic 02 + Epic 05).
 */

const WATCHLIST = [
  { ticker: "AAPL", name: "Apple Inc.",       change:  0.45, last: 187.31 },
  { ticker: "NVDA", name: "NVIDIA Corp.",     change:  2.18, last: 130.45 },
  { ticker: "TSLA", name: "Tesla, Inc.",      change: -1.32, last: 250.30 },
  { ticker: "MSFT", name: "Microsoft Corp.",  change:  0.22, last: 420.15 },
  { ticker: "AMZN", name: "Amazon.com, Inc.", change:  0.78, last: 185.20 },
  { ticker: "GOOG", name: "Alphabet Inc.",    change:  0.15, last: 175.40 },
  { ticker: "META", name: "Meta Platforms",   change:  1.05, last: 580.50 },
];

export function Watchlist() {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Watchlist</h3>
        <button className="text-xs text-blue-600 hover:underline">+ Add</button>
      </div>
      <ul className="space-y-1">
        {WATCHLIST.map(item => (
          <li key={item.ticker}>
            <a
              href={`/chart/${item.ticker}`}
              className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {item.ticker}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {item.name}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono text-zinc-900 dark:text-zinc-50">
                  ${item.last.toFixed(2)}
                </div>
                <div className={`text-xs font-mono ${item.change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
