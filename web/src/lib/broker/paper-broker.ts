/**
 * PaperBroker - Phase 1 模拟交易模拟器 (Epic 06 §2.3).
 *
 * In-memory implementation (D1 persistence deferred to Phase 2).
 * Supports 4 order types: market / limit / stop / stop_limit.
 * Slippage model: 5 bps default (configurable).
 * Dual ledger: positions + balance updated synchronously on each fill.
 *
 * Mock mode: fill price derived from Mock K-line last close.
 * Real mode: fill price derived from MarketDataProvider quote.
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
  ValidationResult,
} from "./types";
import { BrokerRiskManager, type RiskConfig } from "./risk-manager";

// ============ In-memory stores ============

interface AccountStore {
  account: BrokerAccount;
  orders: Map<string, Order>;
  positions: Map<string, Position>; // keyed by ticker
  trades: Trade[];
  dailyTradeCount: number;
  dailyTradeDate: string; // YYYY-MM-DD
}

const DEFAULT_INITIAL_BALANCE = 100_000;
const DEFAULT_SLIPPAGE_BPS = 5;
const DEFAULT_COMMISSION_BPS = 0;

function genOrderId(): string {
  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function genTradeId(): string {
  return `trd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============ PaperBroker ============

export class PaperBroker implements BrokerAdapter {
  name: BrokerName = "paper";
  mode: BrokerMode = "paper";

  private store = new Map<string, AccountStore>();
  private riskManager: BrokerRiskManager;
  private quoteProvider?: () => Promise<Map<string, Quote>>;

  constructor(
    private slippageBps: number = DEFAULT_SLIPPAGE_BPS,
    private commissionBps: number = DEFAULT_COMMISSION_BPS,
    riskConfig?: RiskConfig,
  ) {
    this.riskManager = new BrokerRiskManager(riskConfig);
  }

  /**
   * Inject a quote provider for real-mode price discovery.
   * Mock mode uses the last K-line close from mock JSON.
   */
  setQuoteProvider(provider: () => Promise<Map<string, Quote>>): void {
    this.quoteProvider = provider;
  }

  // ============ Account ============

  async getAccount(userId: string): Promise<BrokerAccount> {
    return this.ensureAccount(userId).account;
  }

  async getBalance(userId: string): Promise<number> {
    return this.ensureAccount(userId).account.balance;
  }

  // ============ Orders ============

  async placeOrder(userId: string, req: OrderRequest): Promise<OrderResult> {
    const store = this.ensureAccount(userId);
    const now = new Date().toISOString();

    // Reset daily count if new day
    if (store.dailyTradeDate !== todayStr()) {
      store.dailyTradeDate = todayStr();
      store.dailyTradeCount = 0;
    }

    // Get estimated price for risk check
    const quote = await this.getQuote(req.ticker);
    const estimatedPrice = quote.last;

    // Risk validation
    const positions = Array.from(store.positions.values());
    const validation = this.riskManager.validateOrder(
      req,
      store.account,
      positions,
      store.dailyTradeCount,
      estimatedPrice,
    );
    if (!validation.ok) {
      return {
        order_id: genOrderId(),
        status: "rejected",
        filled_qty: 0,
        reason: validation.reason,
      };
    }

    // Create order record
    const order: Order = {
      id: genOrderId(),
      user_id: userId,
      account_id: store.account.id,
      ticker: req.ticker.toUpperCase(),
      side: req.side,
      type: req.type,
      quantity: req.quantity,
      limit_price: req.limit_price,
      stop_price: req.stop_price,
      order_status: "pending",
      filled_qty: 0,
      created_at: now,
      updated_at: now,
      strategy_id: req.strategy_id,
    };
    store.orders.set(order.id, order);

    // Attempt fill based on order type
    const fillResult = this.tryFill(order, quote);
    if (fillResult.canFill) {
      order.order_status = "filled";
      order.filled_qty = order.quantity;
      order.filled_price = fillResult.fillPrice!;
      order.updated_at = new Date().toISOString();

      // Create trade record
      const trade: Trade = {
        id: genTradeId(),
        order_id: order.id,
        ticker: order.ticker,
        side: order.side,
        quantity: order.quantity,
        price: fillResult.fillPrice!,
        commission: (fillResult.fillPrice! * order.quantity * this.commissionBps) / 10000,
        executed_at: new Date().toISOString(),
      };
      store.trades.push(trade);

      // Update dual ledger (position + balance)
      this.applyFillToLedger(store, order, trade);

      // Increment daily trade count
      store.dailyTradeCount++;
    } else if (fillResult.reason) {
      // Limit/stop not triggered: keep as pending
      // (no state change needed, order_status already "pending")
    }

    return {
      order_id: order.id,
      status: order.order_status,
      filled_price: order.filled_price,
      filled_qty: order.filled_qty,
      reason: fillResult.reason,
    };
  }

  async cancelOrder(userId: string, orderId: string): Promise<boolean> {
    const store = this.ensureAccount(userId);
    const order = store.orders.get(orderId);
    if (!order) return false;
    if (order.order_status !== "pending" && order.order_status !== "partial") return false;
    order.order_status = "cancelled";
    order.updated_at = new Date().toISOString();
    return true;
  }

  async getOrder(userId: string, orderId: string): Promise<Order | null> {
    return this.ensureAccount(userId).orders.get(orderId) ?? null;
  }

  async listOrders(userId: string, status?: OrderStatus): Promise<Order[]> {
    const orders = Array.from(this.ensureAccount(userId).orders.values());
    if (status) return orders.filter((o) => o.order_status === status);
    return orders;
  }

  // ============ Positions ============

  async getPosition(userId: string, ticker: string): Promise<Position | null> {
    return this.ensureAccount(userId).positions.get(ticker.toUpperCase()) ?? null;
  }

  async listPositions(userId: string): Promise<Position[]> {
    return Array.from(this.ensureAccount(userId).positions.values());
  }

  // ============ Trades ============

  async listTrades(userId: string, from?: Date, to?: Date): Promise<Trade[]> {
    let trades = this.ensureAccount(userId).trades;
    if (from) {
      trades = trades.filter((t) => new Date(t.executed_at) >= from);
    }
    if (to) {
      trades = trades.filter((t) => new Date(t.executed_at) <= to);
    }
    return trades;
  }

  // ============ Fill logic ============

  private tryFill(
    order: Order,
    quote: Quote,
  ): { canFill: boolean; fillPrice?: number; reason?: string } {
    const slippage = (quote.last * this.slippageBps) / 10000;

    switch (order.type) {
      case "market": {
        // Market order fills immediately at last + slippage
        const fillPrice =
          order.side === "buy" ? quote.last + slippage : quote.last - slippage;
        return { canFill: true, fillPrice };
      }

      case "limit": {
        // Buy limit: fill if last <= limit_price
        // Sell limit: fill if last >= limit_price
        const lp = order.limit_price;
        if (lp === undefined) return { canFill: false, reason: "limit_price required" };
        if (order.side === "buy" && quote.last <= lp) {
          return { canFill: true, fillPrice: Math.min(lp + slippage, quote.last + slippage) };
        }
        if (order.side === "sell" && quote.last >= lp) {
          return { canFill: true, fillPrice: Math.max(lp - slippage, quote.last - slippage) };
        }
        return { canFill: false, reason: "Limit price not triggered" };
      }

      case "stop": {
        // Buy stop: trigger when last >= stop_price, fill at market (last + slippage)
        // Sell stop: trigger when last <= stop_price, fill at market (last - slippage)
        const sp = order.stop_price;
        if (sp === undefined) return { canFill: false, reason: "stop_price required" };
        if (order.side === "buy" && quote.last >= sp) {
          return { canFill: true, fillPrice: quote.last + slippage };
        }
        if (order.side === "sell" && quote.last <= sp) {
          return { canFill: true, fillPrice: quote.last - slippage };
        }
        return { canFill: false, reason: "Stop price not triggered" };
      }

      case "stop_limit": {
        // Buy stop_limit: trigger when last >= stop_price, fill at limit_price
        // Sell stop_limit: trigger when last <= stop_price, fill at limit_price
        const sp = order.stop_price;
        const lp = order.limit_price;
        if (sp === undefined || lp === undefined) {
          return { canFill: false, reason: "stop_price and limit_price required" };
        }
        if (order.side === "buy" && quote.last >= sp) {
          if (quote.last <= lp) {
            return { canFill: true, fillPrice: lp + slippage };
          }
          return { canFill: false, reason: "Stop triggered but limit not fillable" };
        }
        if (order.side === "sell" && quote.last <= sp) {
          if (quote.last >= lp) {
            return { canFill: true, fillPrice: lp - slippage };
          }
          return { canFill: false, reason: "Stop triggered but limit not fillable" };
        }
        return { canFill: false, reason: "Stop price not triggered" };
      }

      default:
        return { canFill: false, reason: `Unknown order type: ${order.type}` };
    }
  }

  // ============ Ledger update ============

  private applyFillToLedger(store: AccountStore, order: Order, trade: Trade): void {
    const ticker = order.ticker;
    const qty = order.quantity;
    const price = trade.price;
    const commission = trade.commission;

    // Update position
    let pos = store.positions.get(ticker);
    if (order.side === "buy") {
      if (!pos) {
        pos = {
          id: `pos_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          user_id: store.account.user_id,
          account_id: store.account.id,
          ticker,
          quantity: qty,
          avg_price: price,
          current_price: price,
          unrealized_pnl: 0,
          updated_at: new Date().toISOString(),
        };
        store.positions.set(ticker, pos);
      } else {
        const newQty = pos.quantity + qty;
        const newAvg = (pos.quantity * pos.avg_price + qty * price) / newQty;
        pos.quantity = newQty;
        pos.avg_price = newAvg;
        pos.current_price = price;
        pos.updated_at = new Date().toISOString();
      }
    } else {
      // sell
      if (!pos) {
        // Shouldn't happen (risk check blocks), but guard anyway
        return;
      }
      pos.quantity -= qty;
      pos.current_price = price;
      pos.unrealized_pnl = (price - pos.avg_price) * pos.quantity;
      pos.updated_at = new Date().toISOString();
      if (pos.quantity <= 0.0001) {
        // Position closed
        store.positions.delete(ticker);
      }
    }

    // Update balance
    const notional = qty * price;
    if (order.side === "buy") {
      store.account.balance -= notional + commission;
    } else {
      store.account.balance += notional - commission;
    }
  }

  // ============ Quote provider ============

  private async getQuote(ticker: string): Promise<Quote> {
    const sym = ticker.toUpperCase();

    // Try external quote provider first (real mode)
    if (this.quoteProvider) {
      const quotes = await this.quoteProvider();
      const q = quotes.get(sym);
      if (q) return q;
    }

    // Fallback: fetch mock K-line last close
    try {
      const res = await fetch(`/mock/klines/${sym}_1d.json`);
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ c: number; t: string }> };
        const klines = json.data ?? [];
        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          return {
            ticker: sym,
            bid: last.c * 0.999,
            ask: last.c * 1.001,
            last: last.c,
            timestamp: last.t,
          };
        }
      }
    } catch {
      // ignore fetch errors
    }

    // Last resort: default price
    return {
      ticker: sym,
      bid: 100,
      ask: 100.1,
      last: 100,
      timestamp: new Date().toISOString(),
    };
  }

  // ============ Account init ============

  private ensureAccount(userId: string): AccountStore {
    let store = this.store.get(userId);
    if (!store) {
      const account: BrokerAccount = {
        id: `acc_${userId}_paper`,
        user_id: userId,
        broker_name: "paper",
        mode: "paper",
        balance: DEFAULT_INITIAL_BALANCE,
        currency: "USD",
        created_at: new Date().toISOString(),
      };
      store = {
        account,
        orders: new Map(),
        positions: new Map(),
        trades: [],
        dailyTradeCount: 0,
        dailyTradeDate: todayStr(),
      };
      this.store.set(userId, store);
    }
    return store;
  }
}
