# Epic 05: Dashboard

**Epic 编号**: 05
**模块名称**: Dashboard（仪表盘与可视化）
**优先级顺序**: 5（B3 中"4"位置）
**文档性质标签**: [A] + [B] + [C]
**Spec 模板**: to-spec
**最后更新**: 2026-07-19

---

## 1. Problem Statement

### 1.1 用户视角问题 [B]

Prosumer Brenda 想监控自己的 5 个策略 + 10 个标的时：

- **多工具切换**：她在 TradingView 看图、在 Robinhood 看持仓、在自家 Excel 跟踪策略表现——信息分散
- **延迟与限流**：免费行情 API 限流严苛（Alpha Vantage 25 次/天），她写一个简单的"过去 5 年所有财报日次日涨跌"分析就因为限流跑了 3 小时。
- **回测结果难懂**：Sharpe 1.5 是好是坏？最大回撤 12% 在历史中算什么分位？缺乏直观可视化
- **Mock 模式与真实模式切换体验差**：开发用 Mock，上线用真实——但用户视角看不到差异
- **移动端断点**：现有工具大多桌面优先，移动端体验破碎

### 1.2 工程视角问题 [B]

- **TradingView 集成**：用户决策"Next.js + TradingView Charting Library"，需处理 library 加载、license、数据 feed 适配
- **多图表布局**：单一 dashboard 同时显示 K 线 + 指标 + 持仓 + 策略表现，需响应式布局
- **实时 vs Mock 数据流**：图表必须支持静态加载（Mock）与流式更新（Real SSE）双模
- **可观测性**：用户决策"OpenTelemetry + Grafana"，前端必须暴露性能埋点
- **权限与个性化**：免费用户与付费用户 dashboard 不同

### 1.3 反向工程 Alva 现状 [A]

Alva Dashboard 当前呈现 [INFERRED]：
- 单图表主导（TradingView 嵌入）
- 策略表现仅在回测后展示
- 持仓视图与图表分离

**本 Epic 要"做得比 Alva 更好"的关键点 [C]**：
- 多图表同步布局（K 线 + 策略 + 持仓同屏）
- 策略 overlay 直接在 K 线上显示买卖点
- 回测报告分位图（与历史 benchmark 对比）
- 移动端响应式

---

## 2. Solution

### 2.1 总体架构 [B]

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

    subgraph "TradingView Integration"
        W1 --> TV[TradingView Charting Library]
        TV --> DS[Datafeed Adapter<br/>Mock / Real]
        DS --> API[/api/klines<br/>Worker]
    end

    subgraph "Real-time Updates"
        API --> SSE[SSE Stream<br/>生产模式]
        API --> POLL[Polling 30s<br/>Mock 模式]
    end

    subgraph "Widgets Composition"
        W3 --> EPIC4[Epic 04 Strategy DSL]
        W2 --> EPIC6[Epic 06 Broker]
        W6 --> EPIC3[Epic 03 Ask Agent]
    end
```

### 2.2 仪表盘布局设计 [B] - **关键决策**

**用户决策**：仅 Web 形成最小闭环

**默认布局（桌面端 12 列网格）**：

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

**移动端**：
- 单列堆叠
- 默认隐藏 Sidebar（汉堡菜单）
- 图表保持 16:9

### 2.3 TradingView 集成 [B] - **关键决策**

**用户决策**：TradingView Charting Library（免费商用）

```typescript
// src/components/charts/TradingViewChart.tsx
import { createChart, ColorType } from "lightweight-charts";

interface TVChartProps {
  symbol: string;
  data: Kline[];
  markers?: TradeMarker[];  // 策略买卖点
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

    // 添加策略 markers
    if (markers) {
      series.setMarkers(markers.map(m => ({
        time: m.time, position: m.type === "buy" ? "belowBar" : "aboveBar",
        color: m.type === "buy" ? "#22c55e" : "#ef4444",
        shape: m.type === "buy" ? "arrowUp" : "arrowDown",
        text: `${m.type.toUpperCase()} @ ${m.price}`,
      })));
    }

    // 添加指标 overlay
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

**Datafeed Adapter（Mock/Real 适配器）**：

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
    // Mock 模式：不订阅
    if (this.provider instanceof MockProvider) return;
    // Real 模式：SSE 订阅
    const es = new EventSource(`/api/stream/${symbol}?tf=${resolution}`);
    es.onmessage = (e) => onTick(JSON.parse(e.data));
    return () => es.close();
  }
}
```

### 2.4 Widget 系统 [B]

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
  | "kline_chart"          // TradingView K 线
  | "positions_table"      // 持仓表
  | "strategy_equity"      // 策略 equity curve
  | "strategy_metrics"     // 策略指标卡片
  | "watchlist"             // 关注列表
  | "news_feed"             // 新闻流
  | "ask_agent_panel"       // Ask Agent 对话框
  | "backtest_report"       // 回测报告
  | "credit_balance";      // Credit 余额
```

### 2.5 回测报告可视化 [B] - **关键决策**

**关键设计**：回测指标必须包含分位图（与历史 benchmark 对比）

```typescript
// src/components/widgets/BacktestReport.tsx
interface BacktestReportProps {
  result: BacktestResult;
  benchmark: { name: string; return: number; sharpe: number; mdd: number };
  history_quantiles: {
    sharpe: { p10: number; p50: number; p90: number };  // 历史策略分位
    mdd:    { p10: number; p50: number; p90: number };
  };
}

// 渲染：
// 1. Equity Curve 与 SPY benchmark 对比折线图
// 2. 关键指标卡片（Sharpe 1.5 ↑ vs SPY 0.8）
// 3. 分位图：你的策略 Sharpe 在历史 100 个策略中排名 75 分位
// 4. 交易明细表（可展开）
```

### 2.6 Mock 模式视觉标识 [B]

**关键设计**：Mock 模式下顶部始终显示橙色 Badge

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

### 2.7 实时更新策略 [B]

| 模式 | 更新方式 | 频率 |
|---|---|---|
| Mock | 不更新 | 静态 |
| Real (免费层) | 轮询 | 30s |
| Real (付费层) | SSE 流 | 实时 |

### 2.8 路由结构 [B]

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

### 2.9 可观测性埋点 [B]

**用户决策**：OpenTelemetry + Grafana

```typescript
// src/lib/otel.ts
import { trace, context } from "@opentelemetry/api";

const tracer = trace.getTracer("nova-invest-frontend");

export function traceWidgetRender(name: string) {
  return tracer.startSpan(`widget.${name}.render`);
}

// 在每个 widget 内：
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

1. **When** Brenda 打开 nova-invest，**I want to** 在 1 秒内看到默认 dashboard（图表 + 持仓 + 策略），**so that** 不需要点击多个 tab。
2. **When** Brenda 切换 Mock/Real 模式，**I want to** 顶部 Badge 清晰提示当前模式，**so that** 不会混淆。
3. **When** Brenda 选中一个策略，**I want to** 在 K 线图上看到买卖点 markers，**so that** 直观理解策略行为。
4. **When** Brenda 看回测报告，**I want to** 看到 Sharpe 在历史分位图中的位置，**so that** 知道策略相对水平。
5. **When** Brenda 在移动端打开，**I want to** 布局自动适配，**so that** 不需要横向滚动。
6. **When** Brenda 等待数据加载，**I want to** 看到 skeleton placeholder 而非空白，**so that** 知道系统在工作。
7. **When** Brenda 拖动 widget 调整布局，**I want to** 布局自动保存，**so that** 下次打开一致。
8. **When** Brenda 在 Real 模式下看 NVDA 价格，**I want to** 每 30 秒自动刷新，**so that** 看到相对实时数据。

### As-a Stories [B]

1. As a Prosumer, I want to 同屏看到 K 线 + 持仓 + 策略表现，so that 全局掌控。
2. As a Prosumer, I want to 在 K 线上叠加 SMA/EMA/RSI 等指标，so that 做技术分析。
3. As a Prosumer, I want to 看到策略买卖点 markers，so that 直观理解。
4. As a Prosumer, I want to 回测报告包含分位图，so that 知道策略水平。
5. As a Free-tier User, I want to 即使免费也能看 dashboard，so that 不强制付费。
6. As a Developer, I want to 通过 Widget 系统 扩展，so that 可以加新组件。
7. As an Interviewer, I want to 看到完整的可观测性埋点，so that 评估工程严谨性。
8. As a Prosumer, I want to 暗黑模式，so that 长时间使用不刺眼。

### BDD Gherkin [B]

```gherkin
Feature: Dashboard 加载与交互

  Scenario: 默认 dashboard 加载
    Given 用户访问 /
    When 页面加载完成
    Then 显示 6 个默认 widget（K 线 + 持仓 + 策略 + watchlist + Ask + Credit）
    And 加载时间 < 2s（Mock 模式）
    And Mock 模式下顶部显示橙色 Badge

  Scenario: 策略 markers 叠加
    Given 用户选中策略 MA Cross
    When K 线图渲染
    Then 图表上显示绿色↑（买入点）和红色↓（卖出点）markers
    And 每个 marker 标注价格

  Scenario: 指标 overlay
    Given 用户添加 SMA 50 指标
    When K 线图渲染
    Then 图表上叠加一条蓝色 SMA 50 折线
    And 折线数据来自 Epic 02 Provider

  Scenario: 回测报告分位图
    Given 用户打开回测报告
    When 报告渲染
    Then 显示策略 Sharpe = 1.5
    And 显示历史 100 个策略分位：你的策略排第 75 分位
    And 显示 SPY benchmark Sharpe = 0.8 对比

  Scenario: 移动端响应式
    Given 视口宽度 < 768px
    When dashboard 渲染
    Then 单列布局
    And Sidebar 折叠为汉堡菜单

  Scenario: Real 模式 SSE 流
    Given USE_MOCK=false
    When 用户打开 AAPL K 线
    Then 订阅 /api/stream/AAPL SSE
    And 每 30s 收到一次价格更新
    And 图表自动追加最新 bar

  Scenario: Mock 模式静态加载
    Given USE_MOCK=true
    When 用户打开 AAPL K 线
    Then 直接加载 mock_data/klines/AAPL_1d.json
    And 不订阅 SSE
    And 不轮询
```

---

## 4. Implementation Decisions

### ID-1: lightweight-charts vs TradingView Charting Library Full [B]

**决策**：用 lightweight-charts（开源 Apache 2.0）
- TradingView Charting Library Full 需要申请 license 且有商业限制
- lightweight-charts 满足所有 Phase 1 需求（K 线 + markers + line overlay）
- 体积小（45KB gzip），加载快

### ID-2: Widget 网格系统 [B]

用 `react-grid-layout`（MIT 协议）实现可拖拽 widget 布局

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
  md: [/* 适配中等屏幕 */],
  sm: [/* 单列堆叠 */],
};
```

### ID-3: 主题系统 [B]

```typescript
// Tailwind 4 + next-themes
export const themes = {
  dark:  { bg: "#0a0a0a", surface: "#171717", primary: "#3b82f6", ... },
  light: { bg: "#fafafa", surface: "#ffffff", primary: "#2563eb", ... },
};
```

### ID-4: 性能预算 [B]

- 首屏 LCP < 2s（Mock 模式）
- 首屏 LCP < 3s（Real 模式）
- 单 widget 渲染 < 100ms
- K 线图加载 500 条数据 < 500ms

### ID-5: 可访问性 [B]

- 所有交互元素支持键盘导航
- 颜色对比度 ≥ AA（WCAG 2.1）
- 图表提供文本替代

### ID-6: 错误边界 [B]

每个 widget 独立错误边界，单个 widget 崩溃不影响整体

```typescript
<ErrorBoundary fallback={<WidgetError widget={name} />}>
  <Widget {...props} />
</ErrorBoundary>
```

### ID-7: 数据加载状态 [B]

```typescript
// 使用 SWR 统一数据加载
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

### 5.1 Test Seams 表 [B]

| Seam | 类型 | 测试内容 |
|---|---|---|
| TS-1 | Unit | 单个 widget 渲染（snapshot） |
| TS-2 | Unit | TradingView datafeed adapter 转换 |
| TS-3 | Integration | Dashboard 整体布局响应式 |
| TS-4 | E2E | Playwright 跑完整 dashboard 流程 |
| TS-5 | Visual | Mock vs Real 模式下视觉回归 |

### 5.2 Golden Set [B]

```typescript
describe("Dashboard Golden Set", () => {
  it("Mock 模式 dashboard 加载所有 widget", async () => {
    render(<Dashboard mode="mock" />);
    await waitFor(() => {
      expect(screen.getByTestId("widget-kline")).toBeInTheDocument();
      expect(screen.getByTestId("widget-positions")).toBeInTheDocument();
      expect(screen.getByTestId("widget-strategy")).toBeInTheDocument();
    });
  });

  it("TradingView chart 渲染 AAPL 500 条 K 线", async () => {
    const data = await loadMockKlines("AAPL");
    render(<TradingViewChart data={data} />);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });
});
```

### 5.3 测试策略 [B]

- **Unit**：组件渲染 + datafeed adapter
- **Visual Regression**：Playwright + 主题切换截图
- **E2E**：完整用户流程（登录 → 加载 → 切换标的 → 看回测）
- **Performance**：Lighthouse CI 检查 LCP/FCP

---

## 6. Out of Scope

### 6.1 模块级非目标 [B]

- **自定义 widget 开发**：Phase 2 开放 widget SDK
- **多 dashboard 切换**：Phase 2
- **复杂图表类型（renko/point&figure）**：Phase 2
- **3D 可视化**：Phase 3
- **协作 dashboard（多用户同屏）**：Phase 3

### 6.2 模块级反模式 [B]

- ❌ **客户端轮询行情**：必须走 SSE 或 SWR dedupingInterval
- ❌ **K 线数据存 React Context**：用 SWR 缓存避免重渲染
- ❌ **图表组件每次重渲染都重新初始化**：用 `useMemo` + stable refs
- ❌ **widget 崩溃导致整页白屏**：必须独立错误边界
- ❌ **Mock 模式无视觉提示**：必须 Badge 标识

---

## 7. Further Notes

### 7.1 参考 [KNOWN]

- TradingView lightweight-charts: https://tradingview.github.io/lightweight-charts/
- react-grid-layout: https://github.com/react-grid-layout/react-grid-layout
- SWR: https://swr.vercel.app/
- Tailwind CSS 4: https://tailwindcss.com/

### 7.2 待解问题 [B]

- Q1: 是否需要支持图表截图导出？→ Phase 1.5
- Q2: 是否需要 widget 市场分享？→ Phase 2

### 7.3 依赖 [B]

- **上游**：Epic 01 AgentHarness、Epic 02 DataLayer（K 线）、Epic 04 Strategy DSL（回测报告）
- **下游**：用户交互入口（所有 Epic 的可视化层）

---

## 8. Acceptance Criteria

- [ ] Next.js 16 项目骨架创建
- [ ] 默认 dashboard 含 6 个 widget
- [ ] TradingView lightweight-charts 集成 K 线
- [ ] 支持指标 overlay（SMA/EMA/RSI 至少 3 个）
- [ ] 支持策略 markers（买卖点）
- [ ] 持仓表 widget（从 Epic 06 取数据）
- [ ] 策略 equity curve widget（从 Epic 04 取数据）
- [ ] 回测报告 widget 含分位图
- [ ] Watchlist widget
- [ ] Ask Agent panel widget（嵌入 Epic 03）
- [ ] Credit 余额 widget
- [ ] Mock Badge 显示
- [ ] 暗黑/明亮主题切换
- [ ] 响应式（桌面 / 平板 / 移动）
- [ ] react-grid-layout 可拖拽布局
- [ ] 错误边界独立
- [ ] SWR 数据加载
- [ ] OpenTelemetry 埋点
- [ ] Lighthouse LCP < 2s（Mock 模式）

---

## 9. 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1 | 2026-07-19 | 初稿，含布局、TradingView 集成、Widget 系统、回测报告可视化 |
