/**
 * Dashboard Home (Epic 05).
 * Default landing page with 6 widgets.
 */

import { Sidebar } from "@/components/layout/Sidebar";
import { KlineChart } from "@/components/widgets/KlineChart";
import { PositionsTable } from "@/components/widgets/PositionsTable";
import { Watchlist } from "@/components/widgets/Watchlist";
import { AskAgentPanel } from "@/components/widgets/AskAgentPanel";
import { CreditBalance } from "@/components/widgets/CreditBalance";
import { StrategyList } from "@/components/widgets/StrategyList";
import { CommunityFeed } from "@/components/widgets/CommunityFeed";

export default function DashboardPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Welcome back, Brenda. Here&apos;s your portfolio overview.
          </p>
        </div>

        {/* Top row: Chart (8 cols) + Watchlist (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
            <KlineChart symbol="AAPL" />
          </div>
          <div className="lg:col-span-4">
            <Watchlist />
          </div>
        </div>

        {/* Middle row: Positions (8 cols) + Credit (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <PositionsTable />
          </div>
          <div className="lg:col-span-4">
            <CreditBalance />
          </div>
        </div>

        {/* Bottom row: Ask Agent (8 cols) + Strategy List (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <AskAgentPanel />
          </div>
          <div className="lg:col-span-4">
            <StrategyList />
          </div>
        </div>

        {/* Community feed */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-12">
            <CommunityFeed />
          </div>
        </div>

        <footer className="text-center text-xs text-zinc-500 py-6 border-t border-zinc-200 dark:border-zinc-800">
          <div>nova-invest · Phase 1 MVP · <a href="/legal/terms" className="hover:underline">Terms</a> · <a href="/legal/ai-disclaimer" className="hover:underline">AI Disclaimer</a> · Not Investment Advice</div>
        </footer>
      </div>
    </div>
  );
}
