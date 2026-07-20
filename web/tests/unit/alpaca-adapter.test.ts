/**
 * Unit tests for AlpacaBrokerAdapter (Epic 06 Phase 2).
 *
 * Mocks global fetch to avoid real API calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlpacaBrokerAdapter } from "@/lib/broker/alpaca-adapter";
import { AlpacaClient, AlpacaApiError } from "@/lib/broker/alpaca-client";
import { createBrokerAdapter } from "@/lib/broker";
import type { Env } from "@/lib/env";

const BASE_URL = "https://paper-api.alpaca.markets/v2";
const DATA_URL = "https://data.alpaca.markets/v2";
const API_KEY = "test-key";
const SECRET_KEY = "test-secret";
const USER_ID = "user_001";

function makeConfig() {
  return { apiKey: API_KEY, secretKey: SECRET_KEY, baseUrl: BASE_URL };
}

function mockFetch(response: { ok: boolean; status?: number; json?: () => Promise<unknown>; statusText?: string; text?: () => Promise<string> }) {
  return vi.fn(async () => ({
    ...response,
    text: response.text ?? (async () => ""),
  }) as Response);
}

/** Type-safe access to mock fetch calls. */
function getCall(spy: ReturnType<typeof vi.fn>, index: number): [string, RequestInit] {
  return spy.mock.calls[index] as unknown as [string, RequestInit];
}

let adapter: AlpacaBrokerAdapter;

beforeEach(() => {
  adapter = new AlpacaBrokerAdapter(makeConfig());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============ getAccount ============

describe("AlpacaBrokerAdapter.getAccount", () => {
  it("returns mapped AccountInfo", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        id: "acc-123",
        account_number: "PA12345",
        status: "ACTIVE",
        cash: "50000.50",
        equity: "100000.00",
        currency: "USD",
        created_at: "2024-01-01T00:00:00Z",
      }),
    }));

    const account = await adapter.getAccount(USER_ID);
    expect(account.id).toBe("acc-123");
    expect(account.user_id).toBe(USER_ID);
    expect(account.broker_name).toBe("alpaca");
    expect(account.mode).toBe("paper");
    expect(account.balance).toBeCloseTo(50000.5);
    expect(account.currency).toBe("USD");
  });
});

// ============ placeOrder ============

describe("AlpacaBrokerAdapter.placeOrder", () => {
  it("sends correct request body and returns mapped OrderResult", async () => {
    const fetchSpy = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        id: "ord-alpaca-1",
        symbol: "AAPL",
        side: "buy",
        type: "market",
        qty: "10",
        filled_qty: "10",
        filled_avg_price: "187.31",
        status: "filled",
        submitted_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:01Z",
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await adapter.placeOrder(USER_ID, {
      ticker: "AAPL",
      side: "buy",
      type: "market",
      quantity: 10,
    });

    expect(result.order_id).toBe("ord-alpaca-1");
    expect(result.status).toBe("filled");
    expect(result.filled_qty).toBe(10);
    expect(result.filled_price).toBeCloseTo(187.31);

    // Verify fetch was called with correct URL and body
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = getCall(fetchSpy, 0);
    expect(url).toBe(`${BASE_URL}/orders`);
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.symbol).toBe("AAPL");
    expect(body.side).toBe("buy");
    expect(body.type).toBe("market");
    expect(body.qty).toBe("10");
    expect(body.time_in_force).toBe("day");
  });

  it("includes limit_price for limit orders", async () => {
    const fetchSpy = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        id: "ord-limit-1",
        symbol: "MSFT",
        side: "buy",
        type: "limit",
        qty: "5",
        limit_price: "400.00",
        filled_qty: "0",
        status: "new",
        submitted_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await adapter.placeOrder(USER_ID, {
      ticker: "MSFT",
      side: "buy",
      type: "limit",
      quantity: 5,
      limit_price: 400,
    });

    const [, init] = getCall(fetchSpy, 0);
    const body = JSON.parse(init.body as string);
    expect(body.limit_price).toBe("400");
  });

  it("includes stop_price for stop orders", async () => {
    const fetchSpy = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        id: "ord-stop-1",
        symbol: "TSLA",
        side: "sell",
        type: "stop",
        qty: "20",
        stop_price: "200.00",
        filled_qty: "0",
        status: "new",
        submitted_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await adapter.placeOrder(USER_ID, {
      ticker: "TSLA",
      side: "sell",
      type: "stop",
      quantity: 20,
      stop_price: 200,
    });

    const [, init] = getCall(fetchSpy, 0);
    const body = JSON.parse(init.body as string);
    expect(body.stop_price).toBe("200");
  });
});

// ============ cancelOrder ============

describe("AlpacaBrokerAdapter.cancelOrder", () => {
  it("calls DELETE endpoint and returns true", async () => {
    const fetchSpy = mockFetch({
      ok: true,
      status: 204,
      json: async () => undefined,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await adapter.cancelOrder(USER_ID, "ord-123");
    expect(result).toBe(true);

    const [url, init] = getCall(fetchSpy, 0);
    expect(url).toBe(`${BASE_URL}/orders/ord-123`);
    expect(init.method).toBe("DELETE");
  });

  it("returns false on API error", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    }));

    const result = await adapter.cancelOrder(USER_ID, "ord-nonexistent");
    expect(result).toBe(false);
  });
});

// ============ getPositions ============

describe("AlpacaBrokerAdapter.listPositions", () => {
  it("returns mapped Position array", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: true,
      status: 200,
      json: async () => [
        {
          asset_id: "asset-aapl",
          symbol: "AAPL",
          qty: "100",
          avg_entry_price: "185.50",
          current_price: "187.31",
          unrealized_pl: "181.00",
        },
        {
          asset_id: "asset-msft",
          symbol: "MSFT",
          qty: "50",
          avg_entry_price: "390.00",
          current_price: "395.20",
          unrealized_pl: "260.00",
        },
      ],
    }));

    const positions = await adapter.listPositions(USER_ID);
    expect(positions).toHaveLength(2);
    expect(positions[0].ticker).toBe("AAPL");
    expect(positions[0].quantity).toBe(100);
    expect(positions[0].avg_price).toBeCloseTo(185.5);
    expect(positions[0].current_price).toBeCloseTo(187.31);
    expect(positions[0].unrealized_pnl).toBeCloseTo(181);
  });
});

// ============ getQuote ============

describe("AlpacaBrokerAdapter.getQuote", () => {
  it("returns bid/ask/last from Data API", async () => {
    const fetchSpy = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        bid_price: 187.30,
        bid_size: 100,
        ask_price: 187.35,
        ask_size: 200,
        last_price: 187.31,
        timestamp: "2024-01-01T10:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const quote = await adapter.getQuote("AAPL");
    expect(quote.ticker).toBe("AAPL");
    expect(quote.bid).toBeCloseTo(187.3);
    expect(quote.ask).toBeCloseTo(187.35);
    expect(quote.last).toBeCloseTo(187.31);

    // Verify it hits the Data API
    const [url] = getCall(fetchSpy, 0);
    expect(url).toContain(DATA_URL);
    expect(url).toContain("/stocks/AAPL/quotes/latest");
  });
});

// ============ Error handling ============

describe("AlpacaBrokerAdapter error handling", () => {
  it("throws on 401 unauthorized", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ message: "invalid key" }),
    }));

    await expect(adapter.getAccount(USER_ID)).rejects.toThrow();
    await expect(adapter.getAccount(USER_ID)).rejects.toSatisfy((err: AlpacaApiError) => {
      return err.status === 401 && err.message.includes("401");
    });
  });

  it("throws on 429 rate limit", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({ message: "rate limit exceeded" }),
    }));

    await expect(adapter.getAccount(USER_ID)).rejects.toSatisfy((err: AlpacaApiError) => {
      return err.status === 429;
    });
  });

  it("throws on 500 server error", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    }));

    await expect(adapter.getAccount(USER_ID)).rejects.toSatisfy((err: AlpacaApiError) => {
      return err.status === 500;
    });
  });
});

// ============ Factory: createBrokerAdapter ============

describe("createBrokerAdapter factory", () => {
  it("returns AlpacaBrokerAdapter when ALPACA_API_KEY is set", () => {
    const env: Env = {
      USE_MOCK: "true",
      ALPACA_API_KEY: "my-key",
      ALPACA_SECRET_KEY: "my-secret",
    };
    const broker = createBrokerAdapter(env);
    expect(broker.name).toBe("alpaca");
    expect(broker.mode).toBe("paper");
  });

  it("returns PaperBroker when no ALPACA_API_KEY", () => {
    const env: Env = { USE_MOCK: "true" };
    const broker = createBrokerAdapter(env);
    expect(broker.name).toBe("paper");
  });

  it("returns PaperBroker when env is undefined", () => {
    const broker = createBrokerAdapter(undefined);
    expect(broker.name).toBe("paper");
  });

  it("uses custom ALPACA_BASE_URL when provided", () => {
    const env: Env = {
      USE_MOCK: "true",
      ALPACA_API_KEY: "key",
      ALPACA_SECRET_KEY: "secret",
      ALPACA_BASE_URL: "https://custom.alpaca.example.com/v2",
    };
    const broker = createBrokerAdapter(env);
    expect(broker.name).toBe("alpaca");
  });
});

// ============ AlpacaClient rate limiting ============

describe("AlpacaClient rate limiting", () => {
  it("throws AlpacaApiError with 429 when rate limit would be exceeded", async () => {
    const client = new AlpacaClient(makeConfig());
    // Simulate 200 requests already made in the current window
    const now = Date.now();
    (client as unknown as { requestTimestamps: number[] }).requestTimestamps =
      Array.from({ length: 200 }, (_, i) => now - (199 - i));

    await expect(client.get("/account")).rejects.toThrow(AlpacaApiError);
    await expect(client.get("/account")).rejects.toThrow(/rate limit/);
  });
});

// ============ getOrder / listOrders ============

describe("AlpacaBrokerAdapter.getOrder", () => {
  it("returns mapped Order when found", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        id: "ord-1",
        symbol: "AAPL",
        side: "buy",
        type: "limit",
        qty: "10",
        filled_qty: "5",
        filled_avg_price: "190.00",
        limit_price: "195.00",
        status: "partially_filled",
        submitted_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:01:00Z",
      }),
    }));

    const order = await adapter.getOrder(USER_ID, "ord-1");
    expect(order).not.toBeNull();
    expect(order!.id).toBe("ord-1");
    expect(order!.order_status).toBe("partial");
    expect(order!.filled_qty).toBe(5);
  });

  it("returns null on API error (not found)", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ message: "order not found" }),
    }));

    const order = await adapter.getOrder(USER_ID, "ord-nonexistent");
    expect(order).toBeNull();
  });
});

describe("AlpacaBrokerAdapter.listOrders", () => {
  it("returns mapped Order array", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "ord-1",
          symbol: "AAPL",
          side: "buy",
          type: "market",
          qty: "10",
          filled_qty: "10",
          filled_avg_price: "187.31",
          status: "filled",
          submitted_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:01Z",
        },
        {
          id: "ord-2",
          symbol: "MSFT",
          side: "sell",
          type: "limit",
          qty: "5",
          filled_qty: "0",
          limit_price: "400.00",
          status: "new",
          submitted_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:00Z",
        },
      ],
    }));

    const orders = await adapter.listOrders(USER_ID);
    expect(orders).toHaveLength(2);
    expect(orders[0].order_status).toBe("filled");
    expect(orders[1].order_status).toBe("pending");
  });

  it("filters by status when provided", async () => {
    vi.stubGlobal("fetch", mockFetch({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "ord-1",
          symbol: "AAPL",
          side: "buy",
          type: "market",
          qty: "10",
          filled_qty: "10",
          status: "filled",
          submitted_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:01Z",
        },
        {
          id: "ord-2",
          symbol: "MSFT",
          side: "buy",
          type: "limit",
          qty: "5",
          filled_qty: "0",
          status: "new",
          submitted_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:00Z",
        },
      ],
    }));

    const filledOrders = await adapter.listOrders(USER_ID, "filled");
    expect(filledOrders).toHaveLength(1);
    expect(filledOrders[0].id).toBe("ord-1");
  });
});

// ============ closePosition ============

describe("AlpacaBrokerAdapter.closePosition", () => {
  it("sends DELETE to /positions/:symbol and returns OrderResult", async () => {
    const fetchSpy = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        id: "close-1",
        symbol: "AAPL",
        side: "sell",
        type: "market",
        qty: "100",
        filled_qty: "100",
        filled_avg_price: "187.00",
        status: "filled",
        submitted_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:01Z",
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await adapter.closePosition("AAPL");
    expect(result.order_id).toBe("close-1");
    expect(result.status).toBe("filled");

    const [url, init] = getCall(fetchSpy, 0);
    expect(url).toBe(`${BASE_URL}/positions/AAPL`);
    expect(init.method).toBe("DELETE");
  });
});
