/**
 * AlpacaBrokerAdapter - Alpaca Paper Trading broker (Epic 06 §Phase 2).
 *
 * Implements BrokerAdapter by delegating to Alpaca REST API
 * via the low-level AlpacaClient.
 *
 * Trading API: https://paper-api.alpaca.markets/v2
 * Data API:    https://data.alpaca.markets/v2
 */

import type {
  BrokerAdapter,
  BrokerAccount,
  BrokerMode,
  BrokerName,
  Order,
  OrderRequest,
  OrderResult,
  OrderSide,
  OrderStatus,
  OrderType,
  Position,
  Quote,
  Trade,
} from "./types";
import { AlpacaClient, type AlpacaConfig } from "./alpaca-client";

// ============ Alpaca response shapes ============

interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  cash: string;
  equity: string;
  currency: string;
  created_at: string;
}

interface AlpacaOrder {
  id: string;
  client_order_id?: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  qty: string;
  filled_qty: string;
  filled_avg_price?: string | null;
  limit_price?: string | null;
  stop_price?: string | null;
  status: "new" | "partially_filled" | "filled" | "canceled" | "expired" | "rejected" | "pending_replace";
  submitted_at: string;
  updated_at: string;
}

interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price?: string | null;
  unrealized_pl?: string | null;
}

interface AlpacaTrade {
  id: string;
  order_id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  price: string;
  timestamp: string;
}

interface AlpacaQuote {
  bid_price: number;
  bid_size: number;
  ask_price: number;
  ask_size: number;
  last_price: number;
  timestamp: string;
}

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ============ Status / side / type mappers ============

function mapOrderStatus(s: AlpacaOrder["status"]): OrderStatus {
  switch (s) {
    case "new":
    case "pending_replace":
      return "pending";
    case "partially_filled":
      return "partial";
    case "filled":
      return "filled";
    case "canceled":
    case "expired":
      return "cancelled";
    case "rejected":
      return "rejected";
    default:
      return "rejected";
  }
}

function mapOrderSide(s: AlpacaOrder["side"]): OrderSide {
  return s === "buy" ? "buy" : "sell";
}

function mapOrderType(t: AlpacaOrder["type"]): OrderType {
  return t === "stop_limit" ? "stop_limit" : t;
}

function toNumber(v: string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ============ Adapter ============

export class AlpacaBrokerAdapter implements BrokerAdapter {
  name: BrokerName = "alpaca";
  mode: BrokerMode = "paper";

  private client: AlpacaClient;
  private accountCache = new Map<string, AlpacaAccount>();

  constructor(config: AlpacaConfig) {
    this.client = new AlpacaClient(config);
  }

  // ============ Account ============

  async getAccount(userId: string): Promise<BrokerAccount> {
    const acct = await this.client.get<AlpacaAccount>("/account");
    this.accountCache.set(userId, acct);

    return {
      id: acct.id,
      user_id: userId,
      broker_name: "alpaca",
      mode: "paper",
      balance: toNumber(acct.cash),
      currency: acct.currency || "USD",
      created_at: acct.created_at,
    };
  }

  async getBalance(userId: string): Promise<number> {
    const acct = await this.client.get<AlpacaAccount>("/account");
    this.accountCache.set(userId, acct);
    return toNumber(acct.cash);
  }

  // ============ Orders ============

  async placeOrder(userId: string, req: OrderRequest): Promise<OrderResult> {
    const body: Record<string, unknown> = {
      symbol: req.ticker.toUpperCase(),
      side: req.side,
      type: req.type,
      qty: String(req.quantity),
      time_in_force: "day",
    };

    if (req.type === "limit" || req.type === "stop_limit") {
      if (req.limit_price != null) body.limit_price = String(req.limit_price);
    }
    if (req.type === "stop" || req.type === "stop_limit") {
      if (req.stop_price != null) body.stop_price = String(req.stop_price);
    }

    const alpacaOrder = await this.client.post<AlpacaOrder>("/orders", body);

    return {
      order_id: alpacaOrder.id,
      status: mapOrderStatus(alpacaOrder.status),
      filled_price: alpacaOrder.filled_avg_price ? toNumber(alpacaOrder.filled_avg_price) : undefined,
      filled_qty: toNumber(alpacaOrder.filled_qty),
    };
  }

  async cancelOrder(_userId: string, orderId: string): Promise<boolean> {
    try {
      await this.client.delete(`/orders/${orderId}`);
      return true;
    } catch {
      return false;
    }
  }

  async getOrder(userId: string, orderId: string): Promise<Order | null> {
    try {
      const ao = await this.client.get<AlpacaOrder>(`/orders/${orderId}`);
      return this.mapOrder(ao, userId);
    } catch {
      return null;
    }
  }

  async listOrders(userId: string, status?: OrderStatus): Promise<Order[]> {
    const params = new URLSearchParams();
    params.set("status", "all");
    params.set("direction", "desc");
    params.set("limit", "500");

    const alpacaOrders = await this.client.get<AlpacaOrder[]>(`/orders?${params.toString()}`);
    const orders = alpacaOrders.map((ao) => this.mapOrder(ao, userId));

    if (status) {
      return orders.filter((o) => o.order_status === status);
    }
    return orders;
  }

  // ============ Positions ============

  async getPosition(userId: string, ticker: string): Promise<Position | null> {
    try {
      const ap = await this.client.get<AlpacaPosition>(`/positions/${ticker.toUpperCase()}`);
      return this.mapPosition(ap, userId);
    } catch {
      return null;
    }
  }

  async listPositions(userId: string): Promise<Position[]> {
    const alpacaPositions = await this.client.get<AlpacaPosition[]>("/positions");
    return alpacaPositions.map((ap) => this.mapPosition(ap, userId));
  }

  // ============ Trades ============

  async listTrades(userId: string, from?: Date, to?: Date): Promise<Trade[]> {
    const acct = this.accountCache.get(userId) ?? (await this.client.get<AlpacaAccount>("/account"));
    this.accountCache.set(userId, acct);

    const params = new URLSearchParams();
    if (from) params.set("after", from.toISOString());
    if (to) params.set("until", to.toISOString());
    params.set("direction", "desc");
    params.set("limit", "500");

    const qs = params.toString() ? `?${params.toString()}` : "";
    const alpacaTrades = await this.client.get<AlpacaTrade[]>(
      `/accounts/${acct.id}/trades${qs}`,
    );
    return alpacaTrades.map((t) => this.mapTrade(t, userId));
  }

  // ============ Market Data (extra methods) ============

  async getQuote(symbol: string): Promise<Quote> {
    const aq = await this.client.get<AlpacaQuote>(
      `/stocks/${symbol.toUpperCase()}/quotes/latest`,
      "data",
    );
    return {
      ticker: symbol.toUpperCase(),
      bid: aq.bid_price,
      ask: aq.ask_price,
      last: aq.last_price ?? (aq.bid_price + aq.ask_price) / 2,
      timestamp: aq.timestamp,
    };
  }

  async getBars(symbol: string, timeframe: string, start: string, end: string): Promise<AlpacaBar[]> {
    const params = new URLSearchParams();
    params.set("start", start);
    params.set("end", end);
    params.set("timeframe", timeframe);
    params.set("limit", "10000");

    const res = await this.client.get<{ bars: AlpacaBar[]; symbol: string }>(
      `/stocks/${symbol.toUpperCase()}/bars?${params.toString()}`,
      "data",
    );
    return res.bars ?? [];
  }

  // ============ Close position (convenience) ============

  async closePosition(symbol: string): Promise<OrderResult> {
    const ao = await this.client.delete<AlpacaOrder>(`/positions/${symbol.toUpperCase()}`);
    return {
      order_id: ao.id,
      status: mapOrderStatus(ao.status),
      filled_price: ao.filled_avg_price ? toNumber(ao.filled_avg_price) : undefined,
      filled_qty: toNumber(ao.filled_qty),
    };
  }

  // ============ Mappers ============

  private mapOrder(ao: AlpacaOrder, userId: string): Order {
    const acct = this.accountCache.get(userId);
    return {
      id: ao.id,
      user_id: userId,
      account_id: acct?.id ?? "",
      ticker: ao.symbol,
      side: mapOrderSide(ao.side),
      type: mapOrderType(ao.type),
      quantity: toNumber(ao.qty),
      limit_price: ao.limit_price ? toNumber(ao.limit_price) : undefined,
      stop_price: ao.stop_price ? toNumber(ao.stop_price) : undefined,
      order_status: mapOrderStatus(ao.status),
      filled_qty: toNumber(ao.filled_qty),
      filled_price: ao.filled_avg_price ? toNumber(ao.filled_avg_price) : undefined,
      created_at: ao.submitted_at,
      updated_at: ao.updated_at,
    };
  }

  private mapPosition(ap: AlpacaPosition, userId: string): Position {
    const acct = this.accountCache.get(userId);
    return {
      id: ap.asset_id,
      user_id: userId,
      account_id: acct?.id ?? "",
      ticker: ap.symbol,
      quantity: toNumber(ap.qty),
      avg_price: toNumber(ap.avg_entry_price),
      current_price: ap.current_price ? toNumber(ap.current_price) : undefined,
      unrealized_pnl: ap.unrealized_pl ? toNumber(ap.unrealized_pl) : undefined,
      updated_at: new Date().toISOString(),
    };
  }

  private mapTrade(at: AlpacaTrade, _userId: string): Trade {
    return {
      id: at.id,
      order_id: at.order_id,
      ticker: at.symbol,
      side: at.side === "buy" ? "buy" : "sell",
      quantity: toNumber(at.qty),
      price: toNumber(at.price),
      commission: 0, // Alpaca equity trades are commission-free
      executed_at: at.timestamp,
    };
  }
}
