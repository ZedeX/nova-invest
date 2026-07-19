/**
 * Positions Table Widget (Epic 06 / Epic 05).
 * Phase 1: Shows pre-seeded Mock positions.
 */

const MOCK_POSITIONS = [
  { symbol: "AAPL", qty: 100, avg_price: 175.50, current_price: 187.31, allocation: 18.7 },
  { symbol: "NVDA", qty: 50,  avg_price: 110.20, current_price: 130.45, allocation: 6.5 },
  { symbol: "MSFT", qty: 30,  avg_price: 410.00, current_price: 420.15, allocation: 12.6 },
  { symbol: "TSLA", qty: 20,  avg_price: 245.00, current_price: 250.30,  allocation: 5.0 },
  { symbol: "AMZN", qty: 25,  avg_price: 180.00, current_price: 185.20,  allocation: 4.6 },
];

export function PositionsTable() {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Positions</h3>
        <span className="text-xs text-zinc-500">Paper Account · $100,000</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
              <th className="text-left py-2 font-medium">Symbol</th>
              <th className="text-right py-2 font-medium">Qty</th>
              <th className="text-right py-2 font-medium">Avg</th>
              <th className="text-right py-2 font-medium">Last</th>
              <th className="text-right py-2 font-medium">P&L</th>
              <th className="text-right py-2 font-medium">Alloc</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_POSITIONS.map(p => {
              const pnl = (p.current_price - p.avg_price) * p.qty;
              const pnlPct = (p.current_price / p.avg_price - 1) * 100;
              return (
                <tr key={p.symbol} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 font-medium text-zinc-900 dark:text-zinc-50">
                    <a href={`/chart/${p.symbol}`} className="hover:underline">{p.symbol}</a>
                  </td>
                  <td className="text-right py-2 font-mono text-zinc-700 dark:text-zinc-300">{p.qty}</td>
                  <td className="text-right py-2 font-mono text-zinc-500">${p.avg_price.toFixed(2)}</td>
                  <td className="text-right py-2 font-mono text-zinc-900 dark:text-zinc-50">${p.current_price.toFixed(2)}</td>
                  <td className={`text-right py-2 font-mono ${pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                    <div className="text-xs text-zinc-500">
                      {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                    </div>
                  </td>
                  <td className="text-right py-2 font-mono text-zinc-700 dark:text-zinc-300">{p.allocation.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
