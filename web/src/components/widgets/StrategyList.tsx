/**
 * Strategy List Widget (Epic 04 + Epic 05).
 */

const STRATEGIES = [
  { id: "str_mock_1", name: "NVDA MA Cross",      status: "backtested", return: 28.5, sharpe: 1.62, mdd: 8.3 },
  { id: "str_mock_2", name: "RSI Oversold",       status: "paper",      return: 15.3, sharpe: 1.05, mdd: 5.8 },
  { id: "str_mock_3", name: "Bollinger Breakout", status: "validated",  return: 19.7, sharpe: 1.18, mdd: 7.2 },
];

const STATUS_COLORS: Record<string, string> = {
  draft:      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  validated:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  backtested: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  paper:      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  live:       "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

export function StrategyList() {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Strategies</h3>
        <a href="/strategy" className="text-xs text-blue-600 hover:underline">+ New</a>
      </div>
      <ul className="space-y-2">
        {STRATEGIES.map(s => (
          <li key={s.id}>
            <a
              href={`/strategy/${s.id}`}
              className="block p-3 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{s.name}</div>
                <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${STATUS_COLORS[s.status]}`}>
                  {s.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                <span className={s.return >= 0 ? "text-green-600" : "text-red-600"}>
                  {s.return >= 0 ? "+" : ""}{s.return.toFixed(1)}%
                </span>
                <span>Sharpe: {s.sharpe.toFixed(2)}</span>
                <span>MDD: {s.mdd.toFixed(1)}%</span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
