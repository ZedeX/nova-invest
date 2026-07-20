"use client";

/**
 * Strategy List Widget (Epic 04 + Epic 05, Sprint 5).
 *
 * Loads from /api/strategy in Real mode, falls back to defaults in Mock mode.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

interface Strategy {
  id: string;
  name: string;
  lifecycle_status: "draft" | "active" | "archived";
  return_pct?: number;
  sharpe?: number;
  max_drawdown?: number;
}

const DEFAULT_STRATEGIES: Strategy[] = [
  { id: "str_mock_1", name: "NVDA MA Cross",      lifecycle_status: "active",  return_pct: 28.5, sharpe: 1.62, max_drawdown: 8.3 },
  { id: "str_mock_2", name: "RSI Oversold",       lifecycle_status: "draft",   return_pct: 15.3, sharpe: 1.05, max_drawdown: 5.8 },
  { id: "str_mock_3", name: "Bollinger Breakout", lifecycle_status: "active",  return_pct: 19.7, sharpe: 1.18, max_drawdown: 7.2 },
];

const STATUS_COLORS: Record<string, string> = {
  draft:      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  active:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  archived:   "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

export function StrategyList() {
  const [strategies, setStrategies] = useState<Strategy[]>(DEFAULT_STRATEGIES);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/strategy");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Array<{ id: string; name: string; lifecycle_status: "draft" | "active" | "archived" }> };
        if (json.data && json.data.length > 0) {
          setStrategies(json.data.map((s) => ({
            id: s.id,
            name: s.name,
            lifecycle_status: s.lifecycle_status,
          })));
        }
      } catch {
        // Fall back to defaults on error
      }
    }
    load();
  }, []);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Strategies</h3>
        <Link href="/strategy" className="text-xs text-blue-600 hover:underline">+ New</Link>
      </div>
      <ul className="space-y-2">
        {strategies.map((s) => (
          <li key={s.id}>
            <Link
              href={`/strategy/${s.id}`}
              className="block p-3 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{s.name}</div>
                <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${STATUS_COLORS[s.lifecycle_status] ?? STATUS_COLORS.draft}`}>
                  {s.lifecycle_status}
                </span>
              </div>
              {s.return_pct !== undefined && (
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  <span className={s.return_pct >= 0 ? "text-green-600" : "text-red-600"}>
                    {s.return_pct >= 0 ? "+" : ""}{s.return_pct.toFixed(1)}%
                  </span>
                  {s.sharpe !== undefined && <span>Sharpe: {s.sharpe.toFixed(2)}</span>}
                  {s.max_drawdown !== undefined && <span>MDD: {s.max_drawdown.toFixed(1)}%</span>}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
