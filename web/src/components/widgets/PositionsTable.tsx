"use client";

/**
 * Positions Table Widget (Epic 06 + Epic 05, Sprint 6).
 *
 * Loads positions from /api/broker/positions.
 * Falls back to Mock defaults when API returns empty (no trades yet).
 */

import { useEffect, useState } from "react";

interface Position {
  ticker: string;
  quantity: number;
  avg_price: number;
  current_price?: number;
  unrealized_pnl?: number;
}

const DEFAULT_POSITIONS: Position[] = [
  { ticker: "AAPL", quantity: 100, avg_price: 175.50, current_price: 187.31, unrealized_pnl: 1181.00 },
  { ticker: "NVDA", quantity: 50,  avg_price: 110.20, current_price: 130.45, unrealized_pnl: 1012.50 },
  { ticker: "MSFT", quantity: 30,  avg_price: 410.00, current_price: 420.15, unrealized_pnl: 304.50 },
  { ticker: "TSLA", quantity: 20,  avg_price: 245.00, current_price: 250.30,  unrealized_pnl: 106.00 },
  { ticker: "AMZN", quantity: 25,  avg_price: 180.00, current_price: 185.20,  unrealized_pnl: 130.00 },
];

export function PositionsTable() {
  const [positions, setPositions] = useState<Position[]>(DEFAULT_POSITIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/broker/positions");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Position[] };
        if (json.data && json.data.length > 0) {
          setPositions(json.data);
        }
      } catch {
        // Fall back to defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
              <th className="text-right py-2 font-medium">P&amp;L</th>
              <th className="text-right py-2 font-medium">Return</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const pnl = (p.current_price ?? p.avg_price) - p.avg_price;
              const totalPnl = pnl * p.quantity;
              const pnlPct = (pnl / p.avg_price) * 100;
              return (
                <tr key={p.ticker} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 font-medium text-zinc-900 dark:text-zinc-50">
                    <a href={`/chart/${p.ticker}`} className="hover:underline">{p.ticker}</a>
                  </td>
                  <td className="text-right py-2 font-mono text-zinc-700 dark:text-zinc-300">{p.quantity}</td>
                  <td className="text-right py-2 font-mono text-zinc-500">${p.avg_price.toFixed(2)}</td>
                  <td className="text-right py-2 font-mono text-zinc-900 dark:text-zinc-50">
                    ${(p.current_price ?? p.avg_price).toFixed(2)}
                  </td>
                  <td className={`text-right py-2 font-mono ${totalPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                  </td>
                  <td className={`text-right py-2 font-mono ${pnlPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
            {positions.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-xs text-zinc-500">
                  No open positions. Place an order on the Broker page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
