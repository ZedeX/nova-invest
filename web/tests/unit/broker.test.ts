/**
 * Unit tests for Epic 06 Broker Integration.
 *
 * Covers:
 *   - BrokerRiskManager: 5 validation rules
 *   - PaperBroker: 4 order types + slippage + dual ledger
 *   - Order lifecycle: pending -> filled / rejected
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrokerRiskManager } from "@/lib/broker/risk-manager";
import { PaperBroker } from "@/lib/broker/paper-broker";
import type { BrokerAccount, OrderRequest, Position } from "@/lib/broker/types";
import { setBrokerForTest } from "@/lib/broker";

const DEMO_USER = "test_user";

function makeAccount(balance = 100_000): BrokerAccount {
  return {
    id: "acc_test",
    user_id: DEMO_USER,
    broker_name: "paper",
    mode: "paper",
    balance,
    currency: "USD",
    created_at: new Date().toISOString(),
  };
}

describe("BrokerRiskManager", () => {
  const rm = new BrokerRiskManager();

  it("Rule 1: rejects order exceeding max value ($50,000)", () => {
    const order: OrderRequest = {
      ticker: "AAPL", side: "buy", type: "market", quantity: 500, // 500 * 200 = 100,000
    };
    const result = rm.validateOrder(order, makeAccount(), [], 0, 200);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("max value");
  });

  it("Rule 2: rejects when daily trade limit reached (100)", () => {
    const order: OrderRequest = {
      ticker: "AAPL", side: "buy", type: "market", quantity: 10,
    };
    const result = rm.validateOrder(order, makeAccount(), [], 100, 200);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Daily trade limit");
  });

  it("Rule 3: rejects buy when position would exceed 30% of equity", () => {
    const account = makeAccount(10_000); // small account
    const order: OrderRequest = {
      ticker: "AAPL", side: "buy", type: "market", quantity: 20, // 20 * 200 = 4,000 = 40%
    };
    const result = rm.validateOrder(order, account, [], 0, 200);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("30%");
  });

  it("Rule 4: rejects buy with insufficient funds", () => {
    const account = makeAccount(1_000); // not enough
    const order: OrderRequest = {
      ticker: "AAPL", side: "buy", type: "market", quantity: 10, // 10 * 200 = 2,000
    };
    const result = rm.validateOrder(order, account, [], 0, 200);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Insufficient funds");
  });

  it("Rule 5: rejects sell with insufficient shares", () => {
    const order: OrderRequest = {
      ticker: "AAPL", side: "sell", type: "market", quantity: 100,
    };
    const result = rm.validateOrder(order, makeAccount(), [], 0, 200);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Insufficient shares");
  });

  it("accepts valid buy order within all limits", () => {
    const order: OrderRequest = {
      ticker: "AAPL", side: "buy", type: "market", quantity: 10,
    };
    const result = rm.validateOrder(order, makeAccount(), [], 0, 200);
    expect(result.ok).toBe(true);
  });

  it("accepts valid sell order when shares are held", () => {
    const positions: Position[] = [
      { id: "p1", user_id: DEMO_USER, account_id: "acc_test", ticker: "AAPL", quantity: 100, avg_price: 200, updated_at: new Date().toISOString() },
    ];
    const order: OrderRequest = {
      ticker: "AAPL", side: "sell", type: "market", quantity: 50,
    };
    const result = rm.validateOrder(order, makeAccount(), positions, 0, 200);
    expect(result.ok).toBe(true);
  });
});

describe("PaperBroker", () => {
  let broker: PaperBroker;

  beforeEach(() => {
    broker = new PaperBroker(5, 0); // 5 bps slippage, 0 commission
    setBrokerForTest(null);
    // Stub fetch to return mock kline data
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/mock/klines/AAPL_1d.json")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { t: "2024-01-01", o: 100, h: 105, l: 99, c: 100, v: 1000 },
              { t: "2024-01-02", o: 100, h: 106, l: 100, c: 187.31, v: 2000 },
            ],
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setBrokerForTest(null);
  });

  // ============ Market orders ============

  it("fills market buy order with slippage", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "market", quantity: 100,
    });
    expect(result.status).toBe("filled");
    expect(result.filled_price).toBeDefined();
    // Fill price = last (187.31) + 5bps = 187.31 * 1.0005 ≈ 187.40
    expect(result.filled_price!).toBeCloseTo(187.40, 1);
    expect(result.filled_qty).toBe(100);
  });

  it("fills market sell order after establishing position", async () => {
    // Buy first
    await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "market", quantity: 100,
    });
    // Sell
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "sell", type: "market", quantity: 50,
    });
    expect(result.status).toBe("filled");
    expect(result.filled_price).toBeDefined();
    // Sell price = last - slippage = 187.31 - 0.094 ≈ 187.22
    expect(result.filled_price!).toBeCloseTo(187.22, 1);
  });

  // ============ Limit orders ============

  it("fills buy limit order when last <= limit_price", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "limit", quantity: 100, limit_price: 200,
    });
    expect(result.status).toBe("filled");
    // Last = 187.31, limit = 200, fill = min(200 + slippage, 187.31 + slippage) = 187.40
    expect(result.filled_price!).toBeCloseTo(187.40, 1);
  });

  it("keeps buy limit order pending when last > limit_price", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "limit", quantity: 100, limit_price: 150,
    });
    expect(result.status).toBe("pending");
    expect(result.filled_qty).toBe(0);
  });

  // ============ Stop orders ============

  it("fills buy stop order when last >= stop_price", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "stop", quantity: 100, stop_price: 180,
    });
    expect(result.status).toBe("filled");
    // Last = 187.31 >= 180, fill at market = 187.31 + slippage
    expect(result.filled_price!).toBeCloseTo(187.40, 1);
  });

  it("keeps buy stop order pending when last < stop_price", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "stop", quantity: 100, stop_price: 200,
    });
    expect(result.status).toBe("pending");
  });

  // ============ Stop-limit orders ============

  it("fills buy stop_limit when stop triggered and limit fillable", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "stop_limit", quantity: 100,
      stop_price: 180, limit_price: 200,
    });
    expect(result.status).toBe("filled");
    // Stop triggered (187.31 >= 180), limit fillable (187.31 <= 200), fill at 200 + slippage
    // slippage = 187.31 * 5bps = 0.093655, so fill = 200.093655
    expect(result.filled_price).toBeCloseTo(200.094, 1);
  });

  it("keeps stop_limit pending when stop not triggered", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "stop_limit", quantity: 100,
      stop_price: 200, limit_price: 210,
    });
    expect(result.status).toBe("pending");
  });

  // ============ Risk validation ============

  it("rejects buy order exceeding max value", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "market", quantity: 500, // 500 * 187.31 ≈ 93,655
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("max value");
  });

  it("rejects sell with insufficient shares", async () => {
    const result = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "sell", type: "market", quantity: 100,
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("Insufficient shares");
  });

  // ============ Dual ledger ============

  it("updates balance and position synchronously on buy", async () => {
    const balanceBefore = await broker.getBalance(DEMO_USER);
    await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "market", quantity: 100,
    });
    const balanceAfter = await broker.getBalance(DEMO_USER);
    const position = await broker.getPosition(DEMO_USER, "AAPL");

    expect(balanceAfter).toBeLessThan(balanceBefore);
    expect(balanceBefore - balanceAfter).toBeCloseTo(187.40 * 100, 0);
    expect(position).not.toBeNull();
    expect(position!.quantity).toBe(100);
    expect(position!.avg_price).toBeCloseTo(187.40, 1);
  });

  it("removes position when quantity reaches zero after sell", async () => {
    // Buy 100
    await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "market", quantity: 100,
    });
    // Sell all 100
    await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "sell", type: "market", quantity: 100,
    });
    const position = await broker.getPosition(DEMO_USER, "AAPL");
    expect(position).toBeNull();
  });

  // ============ Cancel order ============

  it("cancels pending limit order", async () => {
    const placeResult = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "limit", quantity: 100, limit_price: 150,
    });
    expect(placeResult.status).toBe("pending");

    const cancelResult = await broker.cancelOrder(DEMO_USER, placeResult.order_id);
    expect(cancelResult).toBe(true);

    const order = await broker.getOrder(DEMO_USER, placeResult.order_id);
    expect(order!.order_status).toBe("cancelled");
  });

  it("cannot cancel already filled order", async () => {
    const placeResult = await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "market", quantity: 100,
    });
    expect(placeResult.status).toBe("filled");

    const cancelResult = await broker.cancelOrder(DEMO_USER, placeResult.order_id);
    expect(cancelResult).toBe(false);
  });

  // ============ List operations ============

  it("lists orders and trades", async () => {
    await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "market", quantity: 100,
    });
    await broker.placeOrder(DEMO_USER, {
      ticker: "AAPL", side: "buy", type: "limit", quantity: 50, limit_price: 150,
    });

    const orders = await broker.listOrders(DEMO_USER);
    expect(orders.length).toBe(2);

    const filledOrders = await broker.listOrders(DEMO_USER, "filled");
    expect(filledOrders.length).toBe(1);

    const trades = await broker.listTrades(DEMO_USER);
    expect(trades.length).toBe(1);
    expect(trades[0].ticker).toBe("AAPL");
    expect(trades[0].quantity).toBe(100);
  });

  // ============ Account ============

  it("initializes account with $100,000 default balance", async () => {
    const account = await broker.getAccount(DEMO_USER);
    expect(account.balance).toBe(100_000);
    expect(account.broker_name).toBe("paper");
    expect(account.mode).toBe("paper");
  });
});
