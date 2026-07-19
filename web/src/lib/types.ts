/**
 * Shared TypeScript types for nova-invest.
 */

// ===== Data Layer (Epic 02) =====

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "1d" | "1w";

export interface Kline {
  t: string; // ISO date "2024-01-02"
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface KlineResponse {
  ticker: string;
  timeframe: Timeframe;
  source: "mock" | "yahoo" | "alpha" | "polygon" | "r2_cache";
  generated_at?: string;
  data: Kline[];
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  change: number;
  change_percent: number;
  volume: number;
  timestamp: string;
}

export interface SymbolInfo {
  ticker: string;
  name: string;
  exchange: string;
  sector?: string;
  industry?: string;
  market_cap?: number;
  is_mockup: boolean;
}

// ===== Ask Agent (Epic 03) =====

export type QueryIntent = "simple_qa" | "deep_research" | "tool_call" | "clarify";

export interface Citation {
  source: string;
  url: string;
  quote: string;
}

export interface NumericFact {
  value: number;
  unit: string;
  source: Citation;
  confidence: number;
}

export interface AskResponse {
  summary: string;
  numeric_facts: NumericFact[];
  citations: Citation[];
  confidence: number;
  intent: QueryIntent;
  cost?: { credits_used: number; model: string };
}

// ===== Strategy DSL (Epic 04) =====

export type StrategyStatus = "draft" | "validated" | "backtested" | "paper" | "live";

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  dsl_yaml: string;
  status: StrategyStatus;
  created_at: string;
  updated_at: string;
}

export interface BacktestResult {
  trades: Trade[];
  equity_curve: { date: string; equity: number }[];
  metrics: {
    total_return: number;
    cagr: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    sortino_ratio: number;
    calmar_ratio: number;
  };
  benchmark_return: number;
  alpha: number;
  beta: number;
  sample_split?: {
    in_sample: { period: string; sharpe: number };
    out_of_sample: { period: string; sharpe: number };
  };
}

export interface Trade {
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  return: number;
  return_pct: number;
}

// ===== Broker (Epic 06) =====

export type OrderSide = "buy" | "sell" | "sell_short" | "buy_to_cover";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type OrderStatus = "pending" | "partial" | "filled" | "cancelled" | "rejected";

export interface Order {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limit_price?: number;
  stop_price?: number;
  status: OrderStatus;
  filled_qty: number;
  filled_price?: number;
  strategy_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface Position {
  id: number;
  user_id: string;
  account_id: string;
  symbol: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  unrealized_pnl: number;
  updated_at: string;
}

export interface BrokerAccount {
  id: string;
  user_id: string;
  broker_name: string;
  mode: "paper" | "live";
  balance: number;
  currency: string;
  created_at: string;
}

// ===== Playbook (Epic 08) =====

export type PlaybookKind =
  | "strategy"
  | "composite"
  | "data_fetcher"
  | "risk_manager"
  | "alert"
  | "narrative";

export type PlaybookStatus = "draft" | "published" | "archived" | "deprecated";

export interface Playbook {
  id: string;
  title: string;
  description?: string;
  author_id: string;
  kind: PlaybookKind;
  current_version: string;
  status: PlaybookStatus;
  created_at: string;
  updated_at: string;
}

export type CompositionType = "parallel" | "sequential" | "conditional";

export interface Composition {
  type: CompositionType;
  allocation?: { playbook_id: string; weight: number }[];
  sequence?: { playbook_id: string; depends_on?: string }[];
  condition?: { if: object; then: string; else: string };
}

// ===== Community (Epic 07) =====

export interface CommunityPlaybook {
  package_id: string;
  playbook_id: string;
  author: { id: string; name: string; avatar?: string };
  title: string;
  description: string;
  tags: string[];
  version: string;
  status: "active" | "removed" | "banned";
  installed_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  performance?: {
    total_return: number;
    sharpe: number;
    max_drawdown: number;
    win_rate: number;
  };
}

// ===== Billing (Appendix A) =====

export interface CreditBalance {
  user_id: string;
  period: string;
  plan: "free" | "pro" | "team" | "enterprise";
  granted: number;
  used: number;
  topped_up: number;
  carried_over: number;
  remaining: number;
  forecast_burn_rate: number;
}

export interface CreditTransaction {
  id: number;
  user_id: string;
  action: string;
  amount: number;
  balance_after: number;
  metadata?: object;
  created_at: string;
}
