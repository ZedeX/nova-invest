# ADR-0009: Backtest Engine (8-Step Pipeline + Metrics + PaperBroker)

## Status

Accepted

## Phase-1 Simplified Variants Accepted (2026-07-20)

- **Phase-1 Accepted Variant**: 8 basic metrics only (total_return, cagr, sharpe, max_drawdown, win_rate, profit_factor, sortino, calmar) in `web/src/lib/backtest/engine.ts`. No benchmark_return, alpha, beta, sample_split.
- **profit_factor JSON Safety**: When `grossLoss=0 && grossProfit>0`, returns `Number.MAX_SAFE_INTEGER` (not `Infinity`) to stay JSON-serializable. ADR-0009 §Backtest Metrics range [0, ∞) is amended to [0, Number.MAX_SAFE_INTEGER] for JSON compatibility.
- **Phase-1 Compliance**: ACCEPTED. Benchmark/alpha/beta require SPY data feed (EP02 ID-5 mock only) + CAPM regression. Sample_split requires dataset partitioning logic. Both deferred to Phase-2.
- **Migration Trigger**: When SPY benchmark data is wired (Phase-2 EP02 data provider upgrade), add benchmark_return + alpha + beta in one PR. Sample_split can ship independently.

## Phase-2 Deferral Notes

- **Status**: Phase-1 implements 8 basic metrics; benchmark/alpha/beta and sample_split deferred.
- **Current Implementation**: `web/src/lib/backtest/engine.ts` (total_return, cagr, sharpe, max_drawdown, win_rate, profit_factor, sortino, calmar)
- **Phase-2 Deferrals**:
  - `benchmark_return` + `alpha` + `beta` computation (Step 8 loadBenchmark)
  - In-sample/out-of-sample sample_split (70/30 chronological split, run pipeline twice)
  - Hourly timeframe support (may need streaming/chunking for Worker CPU limit)
  - Durable Objects or Queue for long-running backtests (hourly × 5 years)

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + D1 |
| **Domain** | Strategy (Backtest Execution + Metrics) + Broker (PaperBroker) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP04 §ID-4/ID-5/ID-6, EP06 §ID-1–ID-9, `docs/spec/strategy_dsl_spec.md`, ADR-0008 (Strategy DSL Schema), ADR-0001 (Mock Mode), ADR-0011 (D1 schema: strategies/backtest_results/broker_accounts/orders/positions/trades) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Backtest of 3 example strategies produces deterministic results (fixed seed); 70/30 split yields in-sample + out-of-sample metrics; PaperBroker MARKET order fills at last_price × (1 + 5bps); all 4 order types lifecycle correct |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0008 (Strategy DSL Schema — provides ValidatedStrategy + indicator registry), ADR-0001 (Mock K-line data source), ADR-0011 (D1 tables: strategies, backtest_results, broker_accounts, orders, positions, trades) — all Accepted |
| **Enables** | EP04 backtest stories, EP06 PaperBroker stories, Build Agent `run_backtest` tool, Dashboard Agent strategy monitoring |
| **Blocks** | EP04 strategy validation flow (Validated → Backtested transition requires runBacktest() result); EP06 paper trading mode |
| **Ordering Note** | Must be Accepted after ADR-0008. runBacktest() takes ValidatedStrategy from ADR-0008.validateStrategy(). PaperBroker (EP06) is defined here because it shares the trade simulation core with backtest. |

## Context

### Problem Statement

EP04 §ID-4 specifies an 8-step backtest pipeline: validate → loadData → computeIndicators → generateSignals → simulateTrades → computeEquityCurve → computeMetrics → loadBenchmark. EP04 §ID-5 requires ≥8 metrics. EP06 requires a PaperBroker simulator with 5bps slippage and 4 order types.

Without a canonical backtest ADR:
1. **Trade simulation divergence**: BacktestEngine's trade simulation and PaperBroker's order execution could use different fill price logic, producing inconsistent results.
2. **Indicator computation inconsistency**: BacktestEngine must compute indicators identically to how a live strategy would compute them (ta-lib consistency per TR-EP04-013).
3. **In/out-of-sample split**: Without canonical split logic, different UIs could show different overfitting assessments for the same backtest.
4. **Non-deterministic results**: Without seed control, backtests produce different results per run — untestable and unreproducible.

### Constraints

- **Cloudflare Workers CPU limit**: 30s per request (paid plan). Backtest of 1-year daily data (~252 bars) with 8 indicators should complete in <5s. Hourly data (~6000 bars) may need streaming/chunking.
- **D1 row limits**: backtest_results stores metrics as JSON TEXT column. Trade log (potentially 1000+ trades) stored separately or paginated from D1.
- **No external compute**: Backtest runs on-Worker (Phase 1). No external backtest service. Durable Objects or Queue for long-running backtests (Phase 2).
- **Determinism required**: Fixed random seed for any randomized logic (position sizing, slippage noise). Same input → same output always.
- **ADR-0001 Mock mode**: When `data.source = "mock"`, load from `/mock/klines/*.json` instead of real API.

## Decision

**Adopt an 8-step backtest pipeline with deterministic trade simulation. PaperBroker shares the same trade simulation core. In/out-of-sample split is 70/30 by default, computed chronologically (not randomly).**

### Backtest Pipeline (8 steps)

```
ValidatedStrategy (from ADR-0008)
        │
        ▼  Step 1: validate ──────────── already done by ADR-0008, re-verify invariants
        │
        ▼  Step 2: loadData ──────────── MarketDataProvider.getOHLCV() via ADR-0001
        │                                Returns OHLCVBar[] sorted by timestamp
        │
        ▼  Step 3: computeIndicators ──── Apply indicator registry (ADR-0008 §8 indicators)
        │                                to each bar, producing IndicatorValues{}
        │
        ▼  Step 4: generateSignals ────── Evaluate signal expressions (jsep AST from ADR-0008)
        │                                at each bar, producing Signal[] {timestamp, type, bar}
        │
        ▼  Step 5: simulateTrades ─────── Process signals through TradeSimulator
        │                                (shared with PaperBroker)
        │                                Produces Trade[] + Position[]
        │
        ▼  Step 6: computeEquityCurve ─── From Trade[] + initial_capital
        │                                Produces EquityPoint[] {date, equity, cash, positions_value}
        │
        ▼  Step 7: computeMetrics ─────── From EquityPoint[] + Trade[]
        │                                Produces BacktestMetrics (≥8 metrics)
        │
        ▼  Step 8: loadBenchmark ──────── Load benchmark OHLCV, compute benchmark metrics
        │                                Produces alpha, beta, information_ratio
        │
        ▼
BacktestResult
```

### In/Out-of-Sample Split

- Default split: 70% in-sample (first 70% chronologically), 30% out-of-sample (last 30%).
- Configurable via `backtest.sample_split` (0–1, default 0.7).
- **Chronological, not random**: Avoids lookahead bias. In-sample is always the earlier period.
- Pipeline runs **twice**: once for in-sample, once for out-of-sample. Both results stored in `BacktestResult`.

### Backtest Metrics (≥10)

| # | Metric | Formula | Range |
|---|--------|---------|-------|
| 1 | total_return | `(final_equity - initial_capital) / initial_capital` | (−1, ∞) |
| 2 | cagr | `(final/initial)^(1/years) - 1` | (−1, ∞) |
| 3 | sharpe_ratio | `mean(excess_return) / std(excess_return)` | (−∞, ∞) |
| 4 | sortino_ratio | `mean(excess_return) / std(downside_return)` | (−∞, ∞) |
| 5 | max_drawdown | `max(1 - equity / peak_equity)` | [0, 1] |
| 6 | calmar_ratio | `cagr / max_drawdown` | (−∞, ∞) |
| 7 | win_rate | `winning_trades / total_trades` | [0, 1] |
| 8 | profit_factor | `sum(wins) / abs(sum(losses))` | [0, ∞) |
| 9 | avg_hold_period | `mean(trade.duration)` | ≥ 0 bars |
| 10 | total_trades | `count(trades)` | ≥ 0 |
| 11 | alpha | `strategy_return - (rf + beta × (benchmark_return - rf))` | (−∞, ∞) |
| 12 | beta | `cov(strategy, benchmark) / var(benchmark)` | (−∞, ∞) |

### Trade Simulation Core (shared with PaperBroker)

The trade simulation logic is a shared module used by both BacktestEngine and PaperBroker:

```typescript
// web/src/lib/strategy/trade-simulator.ts

export interface TradeSimulatorConfig {
  initial_capital: number;
  slippage_bps: number;      // default 5
  commission_bps: number;    // default 0
  position_sizing: PositionSizingConfig;
  risk_management: RiskManagementConfig;
  max_positions: number;
}

export interface SimulatedTrade {
  trade_id: string;
  timestamp: string;         // ISO 8601
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  fill_price: number;        // actual fill including slippage
  commission: number;
  pnl: number;               // realized P&L (for sells)
  signal_type: "entry" | "exit" | "stop_loss" | "take_profit";
}

export interface SimulatedPosition {
  ticker: string;
  side: "long" | "short";
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  entry_timestamp: string;
}

export class TradeSimulator {
  constructor(private config: TradeSimulatorConfig) {}

  /** Process a signal against current positions + bar data */
  processSignal(
    signal: Signal,
    bar: OHLCVBar,
    positions: Map<string, SimulatedPosition>,
    equity: number,
  ): { trades: SimulatedTrade[]; positions: Map<string, SimulatedPosition> };

  /** Compute fill price with slippage */
  computeFillPrice(side: "buy" | "sell", lastPrice: number): number {
    const slippage = lastPrice * (this.config.slippage_bps / 10000);
    return side === "buy" ? lastPrice + slippage : lastPrice - slippage;
  }
}
```

### PaperBroker (EP06 Phase 1)

PaperBroker uses the same `TradeSimulator` core but operates in real-time (driven by live/mocked quotes) instead of historical bars:

```typescript
// web/src/lib/broker/paper-broker.ts

export class PaperBroker implements BrokerAdapter {
  constructor(
    private simulator: TradeSimulator,
    private riskManager: BrokerRiskManager,
    private dataProvider: MarketDataProvider,  // from ADR-0001
  ) {}

  // BrokerAdapter interface (TR-EP06-001)
  async getAccount(): Promise<BrokerAccount>;
  async getBalance(): Promise<number>;
  async placeOrder(order: OrderRequest): Promise<Order>;
  async cancelOrder(orderId: string): Promise<void>;
  async getOrder(orderId: string): Promise<Order>;
  async listOrders(filter?: OrderFilter): Promise<Order[]>;
  async getPosition(ticker: string): Promise<Position | null>;
  async listPositions(): Promise<Position[]>;
  async listTrades(filter?: TradeFilter): Promise<SimulatedTrade[]>;
  async subscribeQuotes(ticker: string): AsyncIterable<Quote>;
}
```

#### Order Lifecycle (TR-EP06-003/004)

```
                    ┌──────────┐
  [*] ──► PENDING ──┤          ├──► FILLED
              │      │ validate │     │
              │      └──────────┘     │
              │                       │
              ├──► REJECTED           ├──► PARTIAL (for LIMIT with partial fill)
              │                       │
              └──► CANCELLED          └──► CANCELLED (before full fill)
```

| Order Type | Fill Logic |
|-----------|------------|
| MARKET | Instant fill at `last_price × (1 + slippage_bps/10000)` |
| LIMIT (buy) | Fill when `market_price ≤ limit_price` |
| LIMIT (sell) | Fill when `market_price ≥ limit_price` |
| STOP (buy) | Trigger when `market_price ≥ stop_price`, then execute as MARKET |
| STOP (sell) | Trigger when `market_price ≤ stop_price`, then execute as MARKET |
| STOP_LIMIT | Trigger on stop price, then place LIMIT at limit_price |

#### Broker Risk Manager (TR-EP06-007)

| Rule | Limit | Check |
|------|-------|-------|
| Max order value | $50,000 | `order.quantity × price ≤ $50K` |
| Max daily trades | 100 | `count(today's trades) < 100` |
| Max position % | 30% | `position_value / account_value ≤ 30%` |
| Insufficient funds | — | `available_cash ≥ order_value` |
| Insufficient shares | — | `position.quantity ≥ sell_quantity` |

### Key Interfaces

```typescript
// web/src/lib/strategy/backtest.ts

export interface BacktestResult {
  strategy_id: number;
  strategy_version: number;
  in_sample: BacktestMetrics;   // first 70% of data
  out_sample: BacktestMetrics;  // last 30% of data
  equity_curve: EquityPoint[];
  trades: SimulatedTrade[];
  benchmark_metrics: BenchmarkMetrics;
  run_config: BacktestConfig;   // from DSL
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

export interface BacktestMetrics {
  total_return: number;
  cagr: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  calmar_ratio: number;
  win_rate: number;
  profit_factor: number;
  avg_hold_period: number;    // in bars
  total_trades: number;
  alpha: number;
  beta: number;
}

export interface EquityPoint {
  date: string;               // ISO 8601
  equity: number;             // total portfolio value
  cash: number;               // cash portion
  positions_value: number;    // holdings portion
  drawdown: number;           // current drawdown from peak
}

/** Main entry point — called by Build Agent's run_backtest tool */
export async function runBacktest(
  strategy: ValidatedStrategy,  // from ADR-0008
  provider: MarketDataProvider, // from ADR-0001
  seed?: number,               // for deterministic results (TR-EP04-014)
): Promise<BacktestResult>;
```

### Performance Budget

| Scenario | Bars | Indicators | Target |
|----------|------|-----------|--------|
| Daily, 1 year, single ticker | ~252 | 3 | < 500ms |
| Daily, 5 years, single ticker | ~1260 | 5 | < 2s |
| Hourly, 1 year, single ticker | ~6000 | 3 | < 5s |
| Daily, 1 year, 10 tickers (multi) | ~2520 | 3 | < 3s |

If a backtest exceeds 10s, log a warning and continue. If it exceeds 25s (approaching Worker CPU limit), abort and return partial result with `status: "timeout"`.

### Critical Implementation Rules

1. **Deterministic results**: `runBacktest()` must accept an optional `seed` parameter. When provided, all random operations (position sizing noise, slippage jitter) use a seeded PRNG. Default seed: `42`. Same strategy + same data + same seed → identical BacktestResult.
2. **No lookahead bias**: Signal evaluation at bar N may only use indicator values computed from bars [0, N]. In-sample/out-sample split is chronological, never random.
3. **Indicator consistency with ta-lib**: SMA/EMA/MACD/Bollinger computations must match ta-lib output within floating-point epsilon (1e-10). Use warmup periods (e.g., EMA needs `period` bars before first output).
4. **Trade simulator is shared**: BacktestEngine and PaperBroker use the same `TradeSimulator` class. Fill price logic, position sizing, and risk management must be identical in both contexts.
5. **Commission is always applied**: Even zero-commission strategies must go through the commission calculation path (commission_bps = 0). This prevents commission omission bugs when switching to non-zero commission.
6. **Backtest result is immutable**: Once stored in D1 `backtest_results`, the result JSON is never modified. If strategy YAML changes, a new backtest must be run (new row).
7. **PaperBroker fills are synchronous**: No async settlement. MARKET orders fill immediately. LIMIT/STOP fills are checked on each quote update (polling or WebSocket push).
8. **T+1 settlement (TR-EP06-009)**: Cash from sell trades is available next business day. Buy trades deduct cash immediately. Track `settled_cash` vs `unsettled_cash` separately.

## GDD Requirements Addressed

| TR-ID | Requirement | Coverage |
|-------|-------------|----------|
| TR-EP04-004 | BacktestEngine 8-step pipeline | ✅ Full — all 8 steps defined |
| TR-EP04-005 | BacktestResult ≥8 metrics + alpha/beta | ✅ Full — 12 metrics defined |
| TR-EP04-012 | In/out-of-sample 70/30 split | ✅ Full — chronological split, configurable |
| TR-EP04-013 | Indicator computation consistent with ta-lib | ✅ Full — rule #3, warmup periods |
| TR-EP04-014 | Deterministic backtest results | ✅ Full — seeded PRNG, rule #1 |
| TR-EP04-017 | BacktestEngine uses EP02 MarketDataProvider | ✅ Full — via ADR-0001 getProvider() |
| TR-EP04-011 | Mock mode backtest data | ✅ Covered by ADR-0001 |
| TR-EP04-010 | D1 schema: strategies + backtest_results | ✅ Covered by ADR-0011 |
| TR-EP06-001 | BrokerAdapter interface | ✅ Full — PaperBroker implements BrokerAdapter |
| TR-EP06-002 | PaperBroker implementation | ✅ Full — shares TradeSimulator with backtest |
| TR-EP06-003 | 4 order types | ✅ Full — MARKET/LIMIT/STOP/STOP_LIMIT |
| TR-EP06-004 | Order lifecycle state machine | ✅ Full — PENDING→FILLED/REJECTED/CANCELLED/PARTIAL |
| TR-EP06-005 | D1 schema: broker 4 tables | ✅ Covered by ADR-0011 |
| TR-EP06-006 | Slippage model 5bps | ✅ Full — configurable via slippage_bps |
| TR-EP06-007 | BrokerRiskManager 5 rules | ✅ Full — all 5 rules |
| TR-EP06-008 | Order ID generation | ✅ Covered by ADR-0011 |
| TR-EP06-009 | T+1 settlement simulation | ✅ Full — settled_cash vs unsettled_cash |
| TR-EP06-010 | Strategy auto-order via strategy_id | ✅ Full — strategy_id linkage in orders table |
| TR-EP06-012 | Mock mode fill price | ✅ Covered by ADR-0001 |
| TR-EP06-013 | Cancel order functionality | ✅ Full — cancelOrder() in BrokerAdapter |

## Consequences

### Positive

- Shared TradeSimulator eliminates backtest/PaperBroker fill logic divergence.
- Deterministic results enable reproducible testing and debugging.
- In/out-of-sample split provides overfitting detection without additional tools.
- 12 metrics exceed the ≥8 requirement, providing deeper strategy assessment.

### Negative

- Backtest of long timeframes (hourly × 5 years) may approach Worker CPU limit (30s). Mitigation: chunk processing with progress reporting, or Durable Objects for long backtests (Phase 2).
- PaperBroker T+1 settlement adds complexity to cash tracking. Mitigation: clear separation of settled_cash vs unsettled_cash in BrokerAccount interface.
- PaperBroker Phase 1 has no real market data feed — relies on polling or manual quote refresh. Phase 2 adds WebSocket.

### Risks

- **Indicator warmup periods**: If lookback_days is insufficient for indicator warmup (e.g., EMA-200 needs 200 bars), early signals are unreliable. Mitigation: reject strategies where `lookback_days < max(indicator.period)`, or emit warning and skip warmup bars.
- **Multi-ticker backtest**: Synchronizing bars across multiple tickers (different trading calendars) is complex. Mitigation: Phase 1 requires same exchange for all tickers in universe; Phase 2 adds calendar alignment.

---

> **Last Updated**: 2026-07-19
