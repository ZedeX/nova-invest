/**
 * Dashboard Home (Epic 05, Sprint 5).
 *
 * Drag-and-drop widget grid with 7 default widgets.
 * Layout persists to localStorage per user.
 */

import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardGrid } from "@/components/layout/DashboardGrid";

export default function DashboardPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Welcome back, Brenda. Drag widgets to rearrange. Layout saves automatically.
          </p>
        </div>

        <DashboardGrid />

        <footer className="text-center text-xs text-zinc-500 py-6 border-t border-zinc-200 dark:border-zinc-800">
          <div>nova-invest · Phase 1 MVP · <a href="/legal/terms" className="hover:underline">Terms</a> · <a href="/legal/ai-disclaimer" className="hover:underline">AI Disclaimer</a> · Not Investment Advice</div>
        </footer>
      </div>
    </div>
  );
}
