# Epic 05: Dashboard

**Epic Number**: 05
**Module Name**: Dashboard (Dashboard & Visualization)
**Priority Order**: 5 (position "4" in B3)
**Document Nature Tag**: [A] + [B] + [C]
**Spec Template**: to-spec
**Last Updated**: 2026-07-19

---

## 1. Problem Statement

### 1.1 User Perspective Problems [B]

When Prosumer Brenda wants to monitor her 5 strategies + 10 tickers:

- **Multi-tool switching**: She views charts in TradingView, checks positions in Robinhood, and tracks strategy performance in her own Excel—information is scattered
- **Latency and rate limits**: Free market data APIs have strict rate limits (Alpha Vantage 25 calls/day). A simple "next-day price change on all earnings days over the past 5 years" analysis took 3 hours due to rate limits.
- **Backtest results hard to understand**: Is Sharpe 1.5 good or bad? What percentile does a 12% max drawdown sit at historically? Lacks intuitive visualization
- **Poor Mock/Real mode switching experience**: Development uses Mock, production uses Real—but users can't see the difference
- **Mobile breakpoints**: Most existing tools are desktop-first, mobile experience is broken

### 1.2 Engineering Perspective Problems [B]

- **Chart library integration**: User decided "Next.js + lightweight-charts (Apache 2.0)", needs to handle library loading, data feed adaptation; Phase 1 uses SVG placeholder
- **Multi-chart layout**: A single dashboard must simultaneously display K-line + indicators + positions + strategy performance, requires responsive layout
- **Real-time vs Mock data flow**: Charts must support both static loading (Mock) and streaming updates (Real SSE) dual modes
- **Observability**: User decided "OpenTelemetry + Grafana", frontend must expose performance instrumentation
- **Permissions and personalization**: Free users and paid users have different dashboards

### 1.3 Competitor Status Analysis [A]

Competitor Dashboard currently shows [INFERRED]:
- Single-chart dominant (TradingView embed)
- Strategy performance only shown after backtest
- Position view separated from chart

**This Epic's core differentiating features [C]**:
- Multi-chart synchronized layout (K-line + strategy + position on same screen)
- Strategy overlay directly displays buy/sell points on K-line
- Backtest report percentile chart (compared with historical benchmark)
- Mobile responsive

---

## 2. Solution

### 2.1 Overall Architecture [B]

```mermaid
flowchart TB
    subgraph "Frontend (Next.js)"
        L[Layout<br/>app/router] --> D[Dashboard Page]
        D --> W1[Widget: KLine Chart]
        D --> W2[Widget: Positions Table]
        D --> W3[Widget: Strategy Performance]
        D --> W4[Widget: Watchlist]
        D --> W5[Widget: Backtest Report]
        D --> W6[Widget: Ask Agent Panel]
    end

    subgraph "Charting Integration"
        W1 --> TV[lightweight-charts<br/>Phase 1: SVG placeholder]
        TV --> DS[Datafeed Adapter<br/>Mock / Real]
        DS --> API[/api/klines<br/>Worker]
    end

    subgraph "Real-time Updates"
        API --> SSE[SSE Stream<br/>production mode]
        API --> POLL[Polling 30s<br/>Mock mode]
    end

    subgraph "Widgets Composition"
        W3 --> EPIC4[Epic 04 Strategy DSL]
        W2 --> EPIC6[Epic 06 Broker]
        W6 --> EPIC3[Epic 03 Ask Agent]
    end
```

### 2.2 Dashboard Layout Design [B] - **Key Decision**

**User decision**: Only Web forms the minimum closed loop

**Default layout (desktop 12-column grid)**:

```
+---------------------------------------------------------------+
|  Header: Logo | Search | Mock Badge | User Menu               |
+---------------+----------------+------------------------------+
| Sidebar       | Main Chart (8 cols)                          |
| - Watchlist   | TradingView K-line                           |
|   AAPL        | + Indicator overlays                         |
|   NVDA  ▶     | + Strategy entry/exit markers                |
|   TSLA        |                                              |
| - Strategies  +----------------+-----------------------------+
|   MA Cross ▶  | Positions Table (4 cols)                    |
|   RSI Ovs     | Ticker | Qty | P&L | Allocation             |
| - News        +----------------+-----------------------------+
|   NVDA earn   | Strategy Performance (4 cols)                |
|               | Equity Curve | Metrics | Benchmark           |
+---------------+----------------+-----------------------------+
|  Footer: Mock Mode Toggle | Theme | Settings                  |
+---------------------------------------------------------------+
```

**Mobile**:
- Single-column stack
- Sidebar hidden by default (hamburger menu)
- Chart maintains 16:9

### 2.3 Chart Library Integration [B] - **Key Decision**

**User decision**: lightweight-charts (Apache 2.0); Phase 1 uses self-developed SVG placeholder, Phase 1.5 integrates lightweight-charts

```typescript
// src/components/charts/TradingViewChart.tsx
import { createChart, ColorType } from "lightweight-charts";

interface TVChartProps {
  symbol: string;
  data: Kline[];
  markers?: TradeMarker[];  // strategy buy/sell points
  indicators?: IndicatorOverlay[];
}

export function TradingViewChart({ symbol, data, markers, indicators }: TVChartProps) {
  const chartRef = useRef<IChartApi>();

  useEffect(() => {
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: "#0a0a0a" },
                textColor: "#d4d4d4" },
      grid: { vertLines: { color: "#1a1a1a" },
              horzLines: { color: "#1a1a1a" } },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    series.setData(data.map(k => ({
      time: k.t, open: k.o, high: k.h, low: k.l, close: k.c,
    })));

    // Add strategy markers
    if (markers) {
      series.setMarkers(markers.map(m => ({
        time: m.time, position: m.type === "buy" ? "belowBar" : "aboveBar",
        color: m.type === "buy" ? "#22c55e" : "#ef4444",
        shape: m.type === "buy" ? "arrowUp" : "arrowDown",
        text: `${m.type.toUpperCase()} @ ${m.price}`,
      })));
    }

    // Add indicator overlay
    if (indicators) {
      for (const ind of indicators) {
        const line = chart.addLineSeries({ color: ind.color, lineWidth: 1 });
        line.setData(ind.data);
      }
    }

    return () => chart.remove();
  }, [symbol, data, markers, indicators]);

  return <div ref={containerRef} />;
}
```

**Datafeed Adapter (Mock/Real adapter)**:

```typescript
// src/lib/chart/datafeed.ts
class NovaDatafeed implements IDatafeedChartingLibraryAdapter {
  constructor(private provider: MarketDataProvider) {}

  async getBars(symbol, resolution, from, to): Promise<Bar[]> {
    const tf = this.mapResolution(resolution);  // "D" → "1d"
    const klines = await this.provider.getKlines(symbol, tf, new Date(from * 1000), new Date(to * 1000));
    return klines.map(k => ({ time: new Date(k.t).getTime() / 1000,
                              open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v }));
  }

  async subscribeBars(symbol, resolution, onTick) {
    // Mock mode: do not subscribe
    if (this.provider instanceof MockProvider) return;
    // Real mode: SSE subscribe
    const es = new EventSource(`/api/stream/${symbol}?tf=${resolution}`);
    es.onmessage = (e) => onTick(JSON.parse(e.data));
    return () => es.close();
  }
}
```

### 2.4 Widget System [B]

```typescript
// src/components/widgets/types.ts
interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  size: { w: number; h: number };  // grid units
  config: WidgetConfig;
  dataSource: "mock" | "real" | "auto";
}

type WidgetType =
  | "kline_chart"          // TradingView K-line
  | "positions_table"      // positions table
  | "strategy_equity"      // strategy equity curve
  | "strategy_metrics"     // strategy metrics card
  | "watchlist"             // watchlist
  | "news_feed"             // news feed
  | "ask_agent_panel"       // Ask Agent dialog
  | "backtest_report"       // backtest report
  | "credit_balance";      // Credit balance
```

### 2.5 Backtest Report Visualization [B] - **Key Decision**

**Key design**: Backtest metrics must include percentile chart (compared with historical benchmark)

```typescript
// src/components/widgets/BacktestReport.tsx
interface BacktestReportProps {
  result: BacktestResult;
  benchmark: { name: string; return: number; sharpe: number; mdd: number };
  history_quantiles: {
    sharpe: { p10: number; p50: number; p90: number };  // historical strategy percentiles
    mdd:    { p10: number; p50: number; p90: number };
  };
}

// Render:
// 1. Equity Curve vs SPY benchmark comparison line chart
// 2. Key metrics card (Sharpe 1.5 ↑ vs SPY 0.8)
// 3. Percentile chart: your strategy Sharpe ranks 75th percentile among historical 100 strategies
// 4. Trade detail table (expandable)
```

### 2.6 Mock Mode Visual Identification [B]

**Key design**: Mock mode always shows orange Badge at top

```tsx
export function MockBadge() {
  const isMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
  if (!isMock) return null;
  return (
    <div className="bg-orange-500 text-white px-3 py-1 text-xs rounded-full">
      MOCK MODE — using pre-generated data
    </div>
  );
}
```

### 2.7 Real-time Update Strategy [B]

| Mode | Update Method | Frequency |
|---|---|---|
| Mock | No update | Static |
| Real (free tier) | Polling | 30s |
| Real (paid tier) | SSE stream | Real-time |

### 2.8 Route Structure [B]

```typescript
// src/app/router.ts
const ROUTES = {
  "/":                    "Dashboard",
  "/chart/[symbol]":      "Single Symbol View",
  "/strategy/[id]":      "Strategy Detail",
  "/backtest/[id]":      "Backtest Report",
  "/ask":                 "Ask Agent Full Screen",
  "/watchlists":          "Watchlist Management",
  "/settings":            "Settings + Mock Toggle",
};
```

### 2.9 Observability Instrumentation [B]

**User decision**: OpenTelemetry + Grafana

```typescript
// src/lib/otel.ts
import { trace, context } from "@opentelemetry/api";

const tracer = trace.getTracer("nova-invest-frontend");

export function traceWidgetRender(name: string) {
  return tracer.startSpan(`widget.${name}.render`);
}

// Inside each widget:
const span = traceWidgetRender("kline_chart");
try {
  // render
} finally {
  span.end();
}
```

---

## 3. User Stories

### Job Stories [B]

1. **When** Brenda opens nova-invest, **I want to** see the default dashboard (chart + positions + strategy) within 1 second, **so that** I don't need to click multiple tabs.
2. **When** Brenda switches Mock/Real mode, **I want to** have the top Badge clearly indicate the current mode, **so that** I don't get confused.
3. **When** Brenda selects a strategy, **I want to** see buy/sell point markers on the K-line chart, **so that** I can intuitively understand strategy behavior.
4. **When** Brenda views the backtest report, **I want to** see where Sharpe sits in the historical percentile chart, **so that** I know the strategy's relative level.
5. **When** Brenda opens on mobile, **I want to** have the layout auto-adapt, **so that** I don't need horizontal scrolling.
6. **When** Brenda waits for data to load, **I want to** see skeleton placeholders instead of blank space, **so that** I know the system is working.
7. **When** Brenda drags widgets to adjust layout, **I want to** have the layout auto-save, **so that** it's consistent next time I open.
8. **When** Brenda views NVDA price in Real mode, **I want to** have it auto-refresh every 30 seconds, **so that** I see relatively real-time data.

### As-a Stories [B]

1. As a Prosumer, I want to see K-line + positions + strategy performance on the same screen, so that I have global control.
2. As a Prosumer, I want to overlay SMA/EMA/RSI and other indicators on the K-line, so that I can do technical analysis.
3. As a Prosumer, I want to see strategy buy/sell point markers, so that I can intuitively understand.
4. As a Prosumer, I want to have the backtest report include a percentile chart, so that I know the strategy's level.
5. As a Free-tier User, I want to be able to view the dashboard even for free, so that I'm not forced to pay.
6. As a Developer, I want to extend via the Widget system, so that I can add new components.
7. As an Interviewer, I want to see complete observability instrumentation, so that I can evaluate engineering rigor.
8. As a Prosumer, I want dark mode, so that long usage doesn't strain my eyes.

### BDD Gherkin [B]

```gherkin
Feature: Dashboard loading and interaction

  Scenario: Default dashboard load
    Given user visits /
    When page finishes loading
    Then display 6 default widgets (K-line + positions + strategy + watchlist + Ask + Credit)
    And load time < 2s (Mock mode)
    And Mock mode shows orange Badge at top

  Scenario: Strategy markers overlay
    Given user selects strategy MA Cross
    When K-line chart renders
    Then chart shows green ↑ (buy point) and red ↓ (sell point) markers
    And each marker is annotated with price

  Scenario: Indicator overlay
    Given user adds SMA 50 indicator
    When K-line chart renders
    Then chart overlays a blue SMA 50 line
    And line data comes from Epic 02 Provider

  Scenario: Backtest report percentile chart
    Given user opens backtest report
    When report renders
    Then display strategy Sharpe = 1.5
    And display historical 100-strategy percentile: your strategy ranks 75th percentile
    And display SPY benchmark Sharpe = 0.8 for comparison

  Scenario: Mobile responsive
    Given viewport width < 768px
    When dashboard renders
    Then single-column layout
    And Sidebar collapses to hamburger menu

  Scenario: Real mode SSE stream
    Given USE_MOCK=false
    When user opens AAPL K-line
    Then subscribe to /api/stream/AAPL SSE
    And receive price updates every 30s
    And chart auto-appends latest bar

  Scenario: Mock mode static load
    Given USE_MOCK=true
    When user opens AAPL K-line
    Then directly load web/public/mock/klines/AAPL_1d.json
    And do not subscribe to SSE
    And do not poll
```

---

## 4. Implementation Decisions

### ID-1: lightweight-charts vs TradingView Charting Library Full [B]

**Decision**: Use lightweight-charts (open source Apache 2.0)
- TradingView Charting Library Full requires license application and has commercial restrictions
- lightweight-charts meets all Phase 1 requirements (K-line + markers + line overlay)
- Small size (45KB gzip), fast loading

### ID-2: Widget Grid System [B]

Use `react-grid-layout` (MIT license) to implement draggable widget layout

```typescript
import { Responsive, WidthProvider } from "react-grid-layout";
const ResponsiveGridLayout = WidthProvider(Responsive);

const DEFAULT_LAYOUT = {
  lg: [
    { i: "kline",        x: 0, y: 0, w: 8, h: 12 },
    { i: "watchlist",    x: 8, y: 0, w: 4, h: 6 },
    { i: "positions",    x: 8, y: 6, w: 4, h: 6 },
    { i: "strategy_eq",  x: 0, y: 12, w: 6, h: 8 },
    { i: "strategy_met", x: 6, y: 12, w: 6, h: 8 },
    { i: "ask_panel",    x: 0, y: 20, w: 12, h: 6 },
  ],
  md: [/* adapt to medium screens */],
  sm: [/* single-column stack */],
};
```

### ID-3: Theme System [B]

```typescript
// Tailwind 4 + next-themes
export const themes = {
  dark:  { bg: "#0a0a0a", surface: "#171717", primary: "#3b82f6", ... },
  light: { bg: "#fafafa", surface: "#ffffff", primary: "#2563eb", ... },
};
```

### ID-4: Performance Budget [B]

- First screen LCP < 2s (Mock mode)
- First screen LCP < 3s (Real mode)
- Single widget render < 100ms
- K-line chart loading 500 bars < 500ms

### ID-5: Accessibility [B]

- All interactive elements support keyboard navigation
- Color contrast ≥ AA (WCAG 2.1)
- Charts provide text alternatives

### ID-6: Error Boundaries [B]

Each widget has an independent error boundary; a single widget crash doesn't affect the whole

```typescript
<ErrorBoundary fallback={<WidgetError widget={name} />}>
  <Widget {...props} />
</ErrorBoundary>
```

### ID-7: Data Loading State [B]

```typescript
// Use SWR for unified data loading
function useWidgetData<T>(key: string): { data: T; error: Error; isLoading: boolean } {
  const { data, error, isLoading } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
  return { data, error, isLoading };
}
```

---

## 5. Testing Decisions

### 5.1 Test Seams Table [B]

| Seam | Type | Test Content |
|---|---|---|
| TS-1 | Unit | Single widget render (snapshot) |
| TS-2 | Unit | TradingView datafeed adapter conversion |
| TS-3 | Integration | Dashboard overall layout responsiveness |
| TS-4 | E2E | Playwright runs full dashboard flow |
| TS-5 | Visual | Visual regression under Mock vs Real modes |

### 5.2 Golden Set [B]

```typescript
describe("Dashboard Golden Set", () => {
  it("Mock mode dashboard loads all widgets", async () => {
    render(<Dashboard mode="mock" />);
    await waitFor(() => {
      expect(screen.getByTestId("widget-kline")).toBeInTheDocument();
      expect(screen.getByTestId("widget-positions")).toBeInTheDocument();
      expect(screen.getByTestId("widget-strategy")).toBeInTheDocument();
    });
  });

  it("TradingView chart renders AAPL 500 K-lines", async () => {
    const data = await loadMockKlines("AAPL");
    render(<TradingViewChart data={data} />);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });
});
```

### 5.3 Testing Strategy [B]

- **Unit**: Component render + datafeed adapter
- **Visual Regression**: Playwright + theme switch screenshots
- **E2E**: Full user flow (login → load → switch ticker → view backtest)
- **Performance**: Lighthouse CI checks LCP/FCP

---

## 6. Out of Scope

### 6.1 Module-level Non-goals [B]

- **Custom widget development**: Phase 2 opens widget SDK
- **Multi-dashboard switching**: Phase 2
- **Complex chart types (renko/point&figure)**: Phase 2
- **3D visualization**: Phase 3
- **Collaborative dashboard (multi-user same screen)**: Phase 3

### 6.2 Module-level Anti-patterns [B]

- ❌ **Client-side polling for market data**: Must use SSE or SWR dedupingInterval
- ❌ **K-line data stored in React Context**: Use SWR cache to avoid re-renders
- ❌ **Chart component re-initializes on every re-render**: Use `useMemo` + stable refs
- ❌ **Widget crash causes full-page white screen**: Must have independent error boundaries
- ❌ **Mock mode without visual indicator**: Must have Badge marker

---

## 7. Further Notes

### 7.1 References [KNOWN]

- TradingView lightweight-charts: https://tradingview.github.io/lightweight-charts/
- react-grid-layout: https://github.com/react-grid-layout/react-grid-layout
- SWR: https://swr.vercel.app/
- Tailwind CSS 4: https://tailwindcss.com/

### 7.2 Open Questions [B]

- Q1: Need to support chart screenshot export? → Phase 1.5
- Q2: Need a widget marketplace sharing? → Phase 2

### 7.3 Dependencies [B]

- **Upstream**: Epic 01 AgentHarness, Epic 02 DataLayer (K-line), Epic 04 Strategy DSL (backtest report)
- **Downstream**: User interaction entry (visualization layer for all Epics)

---

## 8. Acceptance Criteria

- [ ] Next.js 16 project skeleton created
- [ ] Default dashboard contains 6 widgets
- [ ] TradingView lightweight-charts integrates K-line
- [ ] Supports indicator overlay (at least 3 of SMA/EMA/RSI)
- [ ] Supports strategy markers (buy/sell points)
- [ ] Positions table widget (fetches data from Epic 06)
- [ ] Strategy equity curve widget (fetches data from Epic 04)
- [ ] Backtest report widget with percentile chart
- [ ] Watchlist widget
- [ ] Ask Agent panel widget (embeds Epic 03)
- [ ] Credit balance widget
- [ ] Mock Badge display
- [ ] Dark/light theme switch
- [ ] Responsive (desktop / tablet / mobile)
- [ ] react-grid-layout draggable layout
- [ ] Independent error boundaries
- [ ] SWR data loading
- [ ] OpenTelemetry instrumentation
- [ ] Lighthouse LCP < 2s (Mock mode)

---

## 9. Version History

| Version | Date | Changes |
|---|---|---|
| 0.1 | 2026-07-19 | Initial draft, including layout, TradingView integration, Widget system, backtest report visualization |
