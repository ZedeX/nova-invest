/**
 * Symbol Detail Page (Epic 02 + 05).
 * Shows full K-line chart + fundamentals + ask agent context.
 */

import { KlineChart } from "@/components/widgets/KlineChart";
import { AskAgentPanel } from "@/components/widgets/AskAgentPanel";
import { R2_CACHE_SYMBOLS } from "@/lib/env";

interface PageProps {
  params: Promise<{ symbol: string }>;
}

const SYMBOL_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  NVDA: "NVIDIA Corp.",
  GOOG: "Alphabet Inc.",
  META: "Meta Platforms, Inc.",
  AMZN: "Amazon.com, Inc.",
  TSLA: "Tesla, Inc.",
  NFLX: "Netflix, Inc.",
  AMD:  "Advanced Micro Devices, Inc.",
  INTC: "Intel Corp.",
};

export default async function SymbolPage({ params }: PageProps) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();
  const name = SYMBOL_NAMES[sym] ?? sym;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="font-mono">{sym}</span>
            <span className="text-zinc-500 font-normal text-lg ml-3">{name}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Symbol view · Mock data source ·{" "}
            {R2_CACHE_SYMBOLS.has(sym)
              ? "Cached in R2"
              : "Not in R2 cache (Mock only)"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
          <KlineChart symbol={sym} />
        </div>
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold mb-3">Fundamentals (Mock)</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-zinc-500">Market Cap</dt><dd className="font-mono">$2.83T</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">P/E Ratio</dt><dd className="font-mono">29.4</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">52w High</dt><dd className="font-mono">$237.49</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">52w Low</dt><dd className="font-mono">$164.08</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Dividend Yield</dt><dd className="font-mono">0.44%</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Beta</dt><dd className="font-mono">1.24</dd></div>
            </dl>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold mb-3">Recent News (Mock)</h3>
            <ul className="space-y-2 text-xs">
              <li className="border-l-2 border-blue-500 pl-2">
                <div className="font-medium">Q3 Earnings Beat Estimates</div>
                <div className="text-zinc-500">2h ago · Reuters</div>
              </li>
              <li className="border-l-2 border-green-500 pl-2">
                <div className="font-medium">Product Launch Event Scheduled</div>
                <div className="text-zinc-500">1d ago · Bloomberg</div>
              </li>
              <li className="border-l-2 border-amber-500 pl-2">
                <div className="font-medium">Analyst Upgrades Price Target</div>
                <div className="text-zinc-500">3d ago · MarketWatch</div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <AskAgentPanel defaultQuery={`Analyze ${sym} fundamentals and recent price action`} />
      </div>
    </div>
  );
}
