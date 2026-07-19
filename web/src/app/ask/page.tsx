/**
 * Full-screen Ask Agent Page (Epic 03).
 * Deep Q&A with citations + history.
 */

import { AskAgentPanel } from "@/components/widgets/AskAgentPanel";

const HISTORY = [
  { q: "Compare AAPL vs MSFT P/E ratios", time: "2h ago" },
  { q: "What drove NVDA's Q3 earnings beat?", time: "5h ago" },
  { q: "Summarize TSLA's risk factors from 10-K", time: "1d ago" },
  { q: "Show me semiconductor sector exposure", time: "2d ago" },
];

const SUGGESTED = [
  "Analyze my portfolio risk concentration",
  "What are the top catalysts for NVDA next quarter?",
  "Compare AAPL buyback history vs peers",
  "Explain the Fed's latest rate decision impact on tech",
];

export default function AskPage() {
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      <aside className="lg:col-span-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
          <h3 className="text-sm font-semibold mb-3">History</h3>
          <ul className="space-y-2">
            {HISTORY.map((h, i) => (
              <li key={i} className="text-sm">
                <a href="#" className="block px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <div className="text-zinc-900 dark:text-zinc-50 truncate">{h.q}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{h.time}</div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="lg:col-span-9 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Ask Agent</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Multi-step reasoning with citations. Mock mode returns pre-generated answers; Real mode routes to Claude Sonnet / Volcano Ark.
          </p>
        </div>
        <AskAgentPanel defaultQuery="" />
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <h3 className="text-sm font-semibold mb-2">Suggested questions</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {SUGGESTED.map(s => (
              <li key={s} className="text-sm px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
