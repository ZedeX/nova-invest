/**
 * Broker Integration Type Definitions (Epic 06, ADR-0011 §Master Schema).
 *
 * Phase 1: PaperBroker only (in-memory store, no real broker connections).
 * Phase 2: AlpacaBroker + IBKRBroker via MCP server.
 *
 * See: docs/prd/epic/06_Broker_Integration.md
 */

// ============ Enums ============

export type OrderType = "market" | "limit" | "stop" | "stop_limit";

export type OrderSide = "buy" | "sell";

export type OrderStatus = "pending" | "partial" | "filled" | "cancelled" | "rejected";

export type BrokerMode = "paper" | "live";

export type BrokerName = "paper" | "alpaca" | "ibkr";

// ============ Entities ============

export interface BrokerAccount {
  id: string;
  user_id: string;
  broker_name: BrokerName;
  mode: BrokerMode;
  balance: number;
  currency: string;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  account_id: string;
  ticker: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limit_price?: number;
  stop_price?: number;
  order_status: OrderStatus;
  filled_qty: number;
  filled_price?: number;
  created_at: string;
  updated_at: string;
  strategy_id?: string;
}

export interface Position {
  id: string;
  user_id: string;
  account_id: string;
  ticker: string;
  quantity: number;
  avg_price: number;
  current_price?: number;
  unrealized_pnl?: number;
  updated_at: string;
}

export interface Trade {
  id: string;
  order_id: string;
  ticker: string;
  side: OrderSide;
  quantity: number;
  price: number;
  commission: number;
  executed_at: string;
}

// ============ Order Request / Result ============

export interface OrderRequest {
  ticker: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limit_price?: number;
  stop_price?: number;
  strategy_id?: string;
}

export interface OrderResult {
  order_id: string;
  status: OrderStatus;
  filled_price?: number;
  filled_qty: number;
  reason?: string;
}

// ============ Validation ============

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

// ============ Quote (for fill price computation) ============

export interface Quote {
  ticker: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: string;
}

// ============ BrokerAdapter Interface ============

export interface BrokerAdapter {
  name: BrokerName;
  mode: BrokerMode;

  // Account
  getAccount(userId: string): Promise<BrokerAccount>;
  getBalance(userId: string): Promise<number>;

  // Orders
  placeOrder(userId: string, order: OrderRequest): Promise<OrderResult>;
  cancelOrder(userId: string, orderId: string): Promise<boolean>;
  getOrder(userId: string, orderId: string): Promise<Order | null>;
  listOrders(userId: string, status?: OrderStatus): Promise<Order[]>;

  // Positions
  getPosition(userId: string, ticker: string): Promise<Position | null>;
  listPositions(userId: string): Promise<Position[]>;

  // Trades
  listTrades(userId: string, from?: Date, to?: Date): Promise<Trade[]>;
}
