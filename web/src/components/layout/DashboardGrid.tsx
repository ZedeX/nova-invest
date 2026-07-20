"use client";

/**
 * Dashboard Grid (Epic 05, Sprint 5).
 *
 * Drag-and-drop widget grid powered by react-grid-layout.
 * Widgets can be rearranged, resized, and the layout persists to localStorage.
 *
 * Per ADR-0010 Dashboard Layout: 12-column grid, 6 default widgets.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Layout, ResponsiveLayouts } from "react-grid-layout";
import { KlineChart } from "@/components/widgets/KlineChart";
import { PositionsTable } from "@/components/widgets/PositionsTable";
import { Watchlist } from "@/components/widgets/Watchlist";
import { AskAgentPanel } from "@/components/widgets/AskAgentPanel";
import { CreditBalance } from "@/components/widgets/CreditBalance";
import { StrategyList } from "@/components/widgets/StrategyList";
import { CommunityFeed } from "@/components/widgets/CommunityFeed";

// react-grid-layout needs window; load only on client.
// v2.x: WidthProvider is in the legacy export path.
const ResponsiveGridLayout = dynamic(
  () => import("react-grid-layout/legacy").then((m) => m.WidthProvider(m.ResponsiveReactGridLayout)),
  { ssr: false },
);

const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };

const DEFAULT_LAYOUTS: ResponsiveLayouts = {
  lg: [
    { i: "chart",       x: 0, y: 0,  w: 8, h: 14, minW: 6, minH: 10 },
    { i: "watchlist",   x: 8, y: 0,  w: 4, h: 14, minW: 3, minH: 8 },
    { i: "positions",   x: 0, y: 14, w: 8, h: 10, minW: 6, minH: 6 },
    { i: "credits",     x: 8, y: 14, w: 4, h: 10, minW: 3, minH: 6 },
    { i: "ask",         x: 0, y: 24, w: 8, h: 12, minW: 6, minH: 8 },
    { i: "strategies",  x: 8, y: 24, w: 4, h: 12, minW: 3, minH: 6 },
    { i: "community",   x: 0, y: 36, w: 12, h: 10, minW: 6, minH: 6 },
  ],
  md: [
    { i: "chart",       x: 0, y: 0,  w: 7, h: 14 },
    { i: "watchlist",   x: 7, y: 0,  w: 3, h: 14 },
    { i: "positions",   x: 0, y: 14, w: 7, h: 10 },
    { i: "credits",     x: 7, y: 14, w: 3, h: 10 },
    { i: "ask",         x: 0, y: 24, w: 7, h: 12 },
    { i: "strategies",  x: 7, y: 24, w: 3, h: 12 },
    { i: "community",   x: 0, y: 36, w: 10, h: 10 },
  ],
  sm: [
    { i: "chart",       x: 0, y: 0,  w: 6, h: 14 },
    { i: "watchlist",   x: 0, y: 14, w: 6, h: 10 },
    { i: "positions",   x: 0, y: 24, w: 6, h: 10 },
    { i: "credits",     x: 0, y: 34, w: 6, h: 8 },
    { i: "ask",         x: 0, y: 42, w: 6, h: 12 },
    { i: "strategies",  x: 0, y: 54, w: 6, h: 10 },
    { i: "community",   x: 0, y: 64, w: 6, h: 10 },
  ],
  xs: [
    { i: "chart",       x: 0, y: 0,  w: 4, h: 14 },
    { i: "watchlist",   x: 0, y: 14, w: 4, h: 10 },
    { i: "positions",   x: 0, y: 24, w: 4, h: 10 },
    { i: "credits",     x: 0, y: 34, w: 4, h: 8 },
    { i: "ask",         x: 0, y: 42, w: 4, h: 12 },
    { i: "strategies",  x: 0, y: 54, w: 4, h: 10 },
    { i: "community",   x: 0, y: 64, w: 4, h: 10 },
  ],
  xxs: [
    { i: "chart",       x: 0, y: 0,  w: 2, h: 14 },
    { i: "watchlist",   x: 0, y: 14, w: 2, h: 10 },
    { i: "positions",   x: 0, y: 24, w: 2, h: 10 },
    { i: "credits",     x: 0, y: 34, w: 2, h: 8 },
    { i: "ask",         x: 0, y: 42, w: 2, h: 12 },
    { i: "strategies",  x: 0, y: 54, w: 2, h: 10 },
    { i: "community",   x: 0, y: 64, w: 2, h: 10 },
  ],
};

const STORAGE_KEY = "nova-invest-dashboard-layout";

function loadLayouts(): ResponsiveLayouts {
  if (typeof window === "undefined") return DEFAULT_LAYOUTS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        return parsed as ResponsiveLayouts;
      }
    }
  } catch {
    // Ignore parse errors, use defaults
  }
  return DEFAULT_LAYOUTS;
}

export function DashboardGrid() {
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(loadLayouts);
  const [mounted, setMounted] = useState(false);

  // Mark mounted on client (single render after hydration)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  function onLayoutChange(_current: Layout, allLayouts: ResponsiveLayouts) {
    setLayouts(allLayouts);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allLayouts));
    } catch {
      // localStorage may be unavailable (private mode)
    }
  }

  function resetLayout() {
    setLayouts(DEFAULT_LAYOUTS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  if (!mounted) {
    // Server-side placeholder
    return (
      <div className="space-y-4">
        <div className="h-96 rounded-lg border border-zinc-200 dark:border-zinc-800 animate-pulse" />
        <div className="h-64 rounded-lg border border-zinc-200 dark:border-zinc-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={resetLayout}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
        >
          Reset Layout
        </button>
      </div>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={30}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        onLayoutChange={onLayoutChange}
      >
        <div key="chart" className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 overflow-hidden">
          <div className="drag-handle mb-2 cursor-move text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">⋮⋮ Drag</div>
          <KlineChart symbol="AAPL" height={350} />
        </div>
        <div key="watchlist" className="overflow-auto">
          <Watchlist />
        </div>
        <div key="positions" className="overflow-auto">
          <PositionsTable />
        </div>
        <div key="credits">
          <CreditBalance />
        </div>
        <div key="ask" className="overflow-auto">
          <AskAgentPanel />
        </div>
        <div key="strategies" className="overflow-auto">
          <StrategyList />
        </div>
        <div key="community" className="overflow-auto">
          <CommunityFeed />
        </div>
      </ResponsiveGridLayout>
    </div>
  );
}
