/**
 * Mock Mode Badge.
 * Visible at the top of every page when USE_MOCK=true.
 * Per Epic 05 decision: clear visual indication of Mock mode.
 */

import { isMockMode } from "@/lib/env";

export function MockBadge() {
  const isMock = isMockMode();
  if (!isMock) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1 text-xs font-medium text-orange-700 dark:text-orange-300 border border-orange-500/30">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
      MOCK MODE
      <span className="text-orange-500/70 hidden sm:inline">— using pre-generated data</span>
    </div>
  );
}
