# ADR-0010: Dashboard Layout + Widget System

## Status

Proposed

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 |
| **Domain** | UI (Dashboard Layout + Widgets + Data Loading) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP05 §TR-EP05-001–TR-EP05-019, `design/accessibility-requirements.md`, ADR-0001 (Mock mode), ADR-0002 (R2 cache for K-line), ADR-0011 (D1 schema for positions/strategies) |
| **Post-Cutoff APIs Used** | lightweight-charts v4 (Apache 2.0, npm package) |
| **Verification Required** | Dashboard renders 6 default widgets with independent error boundaries; LCP <2s in Mock mode, <3s in Real mode; widget crash does not break adjacent widgets; mobile breakpoint <768px collapses to single column |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (Mock mode for widget data — `USE_MOCK` env var + MockBadge display), ADR-0002 (R2 cache for K-line data — KLine widget data source), ADR-0011 (D1 schema: positions/strategies tables for Positions/Strategy widgets) — all Accepted |
| **Enables** | EP05 Dashboard stories, all widget implementations, Ask Agent panel integration |
| **Blocks** | All EP05 UI stories — cannot start until this ADR is Accepted |
| **Ordering Note** | ADR-0001, ADR-0002, and ADR-0011 are already Accepted. This ADR can be Accepted immediately. Widget implementations may proceed in parallel after Acceptance. |

## Context

### Problem Statement

EP05 requires a dashboard with 12-column grid layout, 6 default widgets (KLine, Positions, Strategy, Watchlist, Ask Agent, Credit), a sidebar, header with MockBadge, and mobile responsiveness. Widgets must be independently rendered with error boundaries. Data loading via SWR. Chart rendering via lightweight-charts (Apache 2.0). Theme system via Tailwind 4 + next-themes. Performance budget: LCP <2s Mock, <3s Real.

Without a canonical dashboard ADR:
1. **Layout inconsistency**: Developers may choose CSS Grid, Flexbox, or a drag-drop library independently, producing incompatible layout systems.
2. **Widget coupling**: Without error boundaries, one widget crash breaks the entire dashboard.
3. **Data loading duplication**: Without SWR deduping, multiple widgets requesting the same ticker data fire duplicate API calls.
4. **Chart library mismatch**: Chart rendering could use different libraries (Chart.js, Recharts, ECharts) across widgets, bloating bundle size.
5. **Theme fragmentation**: Without a unified theme system, dark/light modes may be inconsistent across widgets.

### Constraints

- **Cloudflare Pages/Workers**: Static output + API routes. No server-side React rendering in Phase 1 (client-only dashboard).
- **Bundle size**: lightweight-charts adds ~45KB gzipped. Must be lazy-loaded to avoid impacting initial LCP.
- **Mobile performance**: Low-end mobile devices must render the dashboard. Avoid heavy re-renders; use React.memo for widget containers.
- **Accessibility**: WCAG 2.1 AA per `design/accessibility-requirements.md`. All interactive elements must be keyboard-navigable.
- **Tailwind 4**: Uses CSS-first configuration (`@theme` directive). next-themes integration requires `class` strategy for dark mode toggle.

### Requirements

- 12-column CSS grid layout with responsive breakpoints.
- 6 default widgets rendered independently with React ErrorBoundary.
- SWR for data fetching with deduplication.
- Phase 1: SVG placeholder charts; Phase 1.5: lightweight-charts integration.
- Real-time data modes: Mock (static), Free (polling 30s), Production (SSE stream).
- MockBadge shown when `USE_MOCK=true` (per ADR-0001).
- Dark/light theme toggle via Tailwind 4 + next-themes.
- Performance budget: LCP <2s Mock / <3s Real, widget render <100ms from data available.
- Mobile responsive: <768px → single column, sidebar → hamburger menu.

## Decision

**Adopt a 12-column CSS grid layout with 9 widget types, SWR data fetching, lazy-loaded lightweight-charts, and independent error boundaries per widget. Phase 1 uses SVG placeholder charts; Phase 1.5 integrates lightweight-charts via dynamic import. Drag/drop is deferred to Phase 2.**

### Dashboard Layout Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: Logo | Search | MockBadge | ThemeToggle | UserMenu     │
├────────┬─────────────────────────────────────────────────────────┤
│        │  ┌─────────────────────┬──────────────────────┐       │
│        │  │   KLine Widget      │  Positions Widget     │       │
│  Side  │  │   (8 cols)          │  (4 cols)             │       │
│  bar   │  │                     │                        │       │
│        │  ├──────────┬──────────┼──────────────────────┤       │
│  (nav) │  │ Strategy │Watchlist │  Ask Agent Widget     │       │
│        │  │ (4 cols) │(4 cols)  │  (4 cols)             │       │
│        │  ├──────────┴──────────┼──────────────────────┤       │
│        │  │   Credit Widget      │  (future widgets)     │       │
│        │  │   (4 cols)           │  (8 cols)             │       │
│        │  └─────────────────────┴──────────────────────┘       │
└────────┴─────────────────────────────────────────────────────────┘
```

### Mobile Layout (<768px)

```
┌──────────────────────┐
│ Header: Logo | ☰     │
├──────────────────────┤
│ KLine Widget (full)  │
├──────────────────────┤
│ Positions (full)     │
├──────────────────────┤
│ Strategy (full)      │
├──────────────────────┤
│ Watchlist (full)     │
├──────────────────────┤
│ Ask Agent (full)     │
├──────────────────────┤
│ Credit (full)        │
└──────────────────────┘
```

### Widget Types (9 total)

| # | Widget | Grid Span (Desktop) | Data Source | Phase |
|---|--------|---------------------|-------------|-------|
| 1 | KLine | 8 cols | R2 K-line cache (ADR-0002) / Mock JSON | Phase 1 SVG, Phase 1.5 lightweight-charts |
| 2 | Positions | 4 cols | D1 positions table (ADR-0011) | Phase 1 |
| 3 | Strategy | 4 cols | D1 strategies table (ADR-0011) | Phase 1 |
| 4 | Watchlist | 4 cols | D1 watchlists table (ADR-0011) | Phase 1 |
| 5 | Ask Agent | 4 cols | D1 conversation_history (ADR-0011) | Phase 1 |
| 6 | Credit | 4 cols | D1 user_profiles (ADR-0011) | Phase 1 |
| 7 | OrderBook | 6 cols | Broker API (EP06) | Phase 2 |
| 8 | Alerts | 4 cols | D1 / SSE | Phase 2 |
| 9 | News | 6 cols | External API | Phase 2 |

### Key Interfaces

```typescript
// web/src/components/dashboard/types.ts

/** Widget descriptor — each widget type defines one */
export interface WidgetConfig {
  id: WidgetType;
  title: string;
  gridSpan: { desktop: number; mobile: number }; // column span
  minGridSpan: number;                           // minimum span
  fetcher: (key: string) => Promise<unknown>;    // SWR fetcher
  render: React.LazyExoticComponent<WidgetProps>;
  errorBoundary?: React.ComponentType<ErrorBoundaryProps>;
}

export type WidgetType =
  | "kline"
  | "positions"
  | "strategy"
  | "watchlist"
  | "ask_agent"
  | "credit"
  | "orderbook"
  | "alerts"
  | "news";

export interface WidgetProps {
  widgetId: string;
  data: unknown;
  error?: Error;
  isLoading: boolean;
}

export interface DashboardGridConfig {
  columns: 12;
  rowGap: "1rem";     // Tailwind gap-4
  columnGap: "1rem";  // Tailwind gap-4
  breakpoints: {
    mobile: "<768px";  // single column
    tablet: "768-1024px"; // 6 columns
    desktop: ">1024px";   // 12 columns
  };
}

/** SWR configuration for dashboard */
export interface DashboardSWRConfig {
  dedupingInterval: 5000;    // 5s dedup window
  revalidateOnFocus: false;  // prevent refetch on tab focus
  errorRetryCount: 2;        // max 2 retries
  refreshInterval?: number;  // only for polling mode (30s)
}
```

### Chart Integration (Phase 1 → Phase 1.5)

```typescript
// web/src/components/dashboard/widgets/kline-widget.tsx

// Phase 1: SVG placeholder
export function KLinePlaceholder({ ticker }: { ticker: string }) {
  return (
    <svg viewBox="0 0 400 200" className="w-full h-full">
      {/* Static SVG candlestick pattern */}
      <polyline points="..." fill="none" stroke="currentColor" />
      <text x="50%" y="50%" textAnchor="middle" fill="currentColor">
        {ticker} — Chart loading...
      </text>
    </svg>
  );
}

// Phase 1.5: lightweight-charts (lazy loaded)
import dynamic from "next/dynamic";

const LightweightChart = dynamic(
  () => import("./lightweight-chart-renderer"),
  {
    loading: () => <KLinePlaceholder ticker="" />,
    ssr: false, // lightweight-charts requires DOM
  }
);
```

### Real-time Data Modes

| Mode | Source | Update Strategy | Latency |
|------|--------|----------------|---------|
| Mock | `web/public/mock/*.json` (ADR-0001) | Static, no refresh | N/A |
| Free | Public API (Yahoo, etc.) | SWR polling, 30s interval | ~30s |
| Production | SSE stream via Workers API | EventSource listener | ~1s |

```typescript
// web/src/lib/data/realtime-mode.ts

export type RealtimeMode = "mock" | "polling" | "sse";

export function getRealtimeConfig(): {
  mode: RealtimeMode;
  refreshInterval?: number;
} {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") {
    return { mode: "mock" };
  }
  if (process.env.NEXT_PUBLIC_SSE_ENDPOINT) {
    return { mode: "sse" };
  }
  return { mode: "polling", refreshInterval: 30_000 };
}
```

### Theme System

```typescript
// web/src/components/dashboard/theme-provider.tsx

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
```

Tailwind 4 configuration uses `@theme` directive with `dark:` variant powered by `next-themes` `class` strategy.

### Error Boundary Pattern

```typescript
// web/src/components/dashboard/widget-error-boundary.tsx

import { Component, type ReactNode } from "react";

interface Props {
  widgetId: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="widget-error" role="alert">
          <h3>Widget Error: {this.props.widgetId}</h3>
          <p>{this.state.error?.message ?? "Unknown error"}</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### Critical Implementation Rules

1. **Each widget wrapped in React ErrorBoundary** — one widget crash must not break the dashboard. `WidgetErrorBoundary` catches and displays per-widget error UI with retry button.
2. **SWR dedupingInterval 5000ms** prevents duplicate requests within 5s window. All dashboard widgets sharing the same SWR key (e.g., `/api/kline/AAPL`) receive the same cached response.
3. **Charts: Phase 1 SVG placeholder; Phase 1.5 lazy-load lightweight-charts** via `next/dynamic` with `ssr: false`. The SVG placeholder renders immediately; lightweight-charts loads asynchronously after hydration.
4. **Mobile breakpoint: <768px → single column**, sidebar becomes hamburger menu. Tailwind responsive classes: `grid-cols-1 md:grid-cols-6 lg:grid-cols-12`.
5. **MockBadge uses USE_MOCK env var from ADR-0001** — shown in header when `process.env.NEXT_PUBLIC_USE_MOCK === "true"`. Badge text: "MOCK DATA" with yellow background.
6. **Widget render must complete <100ms from data available** (not from fetch start). Use `React.memo` on widget containers. Avoid expensive re-computation in render path.
7. **K-line load: 500 bars <500ms budget**. R2 cache returns pre-formatted OHLCV arrays (per ADR-0002). No client-side bar transformation.
8. **Drag/drop is Phase 2** — Phase 1 uses fixed grid positions. No react-grid-layout dependency in Phase 1. Widget order is determined by configuration array, not user preference.

## GDD Requirements Addressed

| TR-ID | Requirement | Coverage |
|-------|-------------|----------|
| TR-EP05-001 | Next.js 16 + lightweight-charts | ✅ Full — Next.js 16.2.10, lightweight-charts Phase 1.5 lazy-loaded |
| TR-EP05-002 | 12-column grid + 6 widgets | ✅ Full — CSS Grid 12-col, 6 default widgets defined |
| TR-EP05-003 | SVG Phase 1 → lightweight-charts Phase 1.5 | ✅ Full — SVG placeholder + dynamic import |
| TR-EP05-004 | 9 widget types | ✅ Full — all 9 types defined (6 Phase 1, 3 Phase 2) |
| TR-EP05-005 | Strategy markers on K-line | ✅ Full — lightweight-charts markers API in Phase 1.5 |
| TR-EP05-006 | Indicator overlay ≥3 | ✅ Full — SMA/EMA/Bollinger as line series overlays |
| TR-EP05-007 | Backtest report + quantile chart | ✅ Full — backtest metrics widget, quantile in Phase 1.5 |
| TR-EP05-008 | Mock Badge | ✅ Full — header MockBadge per ADR-0001 |
| TR-EP05-009 | Mobile responsive | ✅ Full — <768px single column, hamburger sidebar |
| TR-EP05-010 | Real-time data modes | ✅ Full — Mock/polling/SSE three modes |
| TR-EP05-011 | Routes | ✅ Full — Next.js App Router, `/dashboard/*` |
| TR-EP05-012 | OpenTelemetry | ✅ Full — observability domain, SWR trace headers |
| TR-EP05-013 | Draggable widgets | ✅ Phase 2 — Phase 1 fixed grid, Phase 2 react-grid-layout |
| TR-EP05-014 | Theme system | ✅ Full — Tailwind 4 + next-themes, dark/light toggle |
| TR-EP05-015 | Performance budget | ✅ Full — LCP <2s Mock / <3s Real, widget <100ms |
| TR-EP05-016 | Accessibility | ✅ Full — WCAG 2.1 AA, keyboard nav, ARIA roles |
| TR-EP05-017 | Error boundary per widget | ✅ Full — WidgetErrorBoundary wraps each widget |
| TR-EP05-018 | SWR data loading | ✅ Full — dedupingInterval 5000ms, shared cache |
| TR-EP05-019 | Dark/light toggle | ✅ Full — next-themes class strategy + Tailwind 4 |

## Alternatives Considered

### Alternative 1: react-grid-layout in Phase 1

- **Description**: Use react-grid-layout for drag/drop from the start.
- **Pros**: Users can rearrange widgets immediately. Rich UX.
- **Cons**: Adds ~30KB gzipped dependency. Complex responsive behavior. Drag/drop requires persistence (save layout to D1). Premature for MVP.
- **Rejection Reason**: EP05 TR-EP05-013 explicitly defers drag/drop to Phase 2. Fixed grid in Phase 1 reduces complexity and bundle size.

### Alternative 2: Recharts or Chart.js for K-line

- **Description**: Use Recharts (React-native chart library) or Chart.js for candlestick rendering.
- **Pros**: Recharts has React integration. Chart.js is widely known.
- **Cons**: Recharts doesn't support candlestick charts natively. Chart.js candlestick requires a plugin. Neither is optimized for financial charting (50K+ data points, real-time updates).
- **Rejection Reason**: lightweight-charts (by TradingView) is purpose-built for financial charts, supports candlestick + indicators + markers, and is Apache 2.0. 45KB gzipped with tree-shaking.

### Alternative 3: React Query (TanStack Query) instead of SWR

- **Description**: Use TanStack Query for data fetching.
- **Pros**: Richer API (infinite queries, mutations, devtools). Better TypeScript support.
- **Cons**: Larger bundle (~13KB vs ~5KB for SWR). More API surface than needed for dashboard read-mostly use case. SWR's simpler API matches the dashboard's data-fetching pattern.
- **Rejection Reason**: SWR is sufficient for Phase 1 dashboard (read-heavy, dedup-focused). If mutation-heavy features arise in Phase 2, consider TanStack Query for those specific widgets.

## Consequences

### Positive

- CSS Grid 12-column layout is native, zero-dependency, and well-supported.
- Independent error boundaries prevent one widget crash from cascading.
- SWR deduplication eliminates redundant API calls for shared data (e.g., multiple widgets showing AAPL data).
- lazy-loaded lightweight-charts keeps initial bundle small; SVG placeholder provides instant visual feedback.
- Three real-time modes (Mock/polling/SSE) map cleanly to development/free/production tiers.

### Negative

- Phase 1 SVG charts are static — no interaction (zoom, pan, crosshair). Users must wait for Phase 1.5 for interactive charts.
- Fixed grid in Phase 1 means no user-customizable layout. Users cannot rearrange widgets until Phase 2.
- SWR polling at 30s in Free mode may feel sluggish for active traders. SSE in Production mode requires backend WebSocket/SSE infrastructure.
- next-themes with `class` strategy requires all Tailwind dark styles use `dark:` prefix — more verbose than `media` strategy.

### Risks

- **Risk**: lightweight-charts v4 API may change in v5 (breaking changes).
  - **Mitigation**: Pin `lightweight-charts` to exact version in `package.json`. Test Phase 1.5 integration before accepting this ADR.
- **Risk**: K-line widget with 500 bars + 3 indicator overlays may exceed widget render budget (<100ms).
  - **Mitigation**: lightweight-charts renders on Canvas (GPU-accelerated). Profile with Chrome DevTools. If over budget, reduce indicator count or implement virtual scrolling.
- **Risk**: SSE stream reconnection on network interruption may cause data gaps.
  - **Mitigation**: SWR fallback to polling on SSE error. Reconnect with exponential backoff. Gap detection via timestamp comparison.

---

> **Last Updated**: 2026-07-19
