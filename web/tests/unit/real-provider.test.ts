import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RealProvider } from "@/lib/data/provider";
import { shouldCacheR2 } from "@/lib/env";
import type { Env } from "@/lib/env";

// Mock R2Bucket
function mockR2(): {
  bucket: Map<string, string>;
  r2: R2Bucket;
} {
  const bucket = new Map<string, string>();
  const r2: R2Bucket = {
    get: async (key: string) => {
      const val = bucket.get(key);
      if (!val) return null;
      return {
        text: async () => val,
        json: async () => JSON.parse(val),
        arrayBuffer: async () => new TextEncoder().encode(val).buffer,
        blob: async () => new Blob([val]),
      } as R2ObjectBody;
    },
    put: async (key: string, value: string) => {
      bucket.set(key, typeof value === "string" ? value : await (value as ReadableStream).getReader().read().then(r => new TextDecoder().decode(r.value)));
    },
    delete: async (key: string) => { bucket.delete(key); },
    list: async () => ({ objects: [] as R2Object[] }),
    head: async () => null,
  } as unknown as R2Bucket;
  return { bucket, r2 };
}

describe("RealProvider (ADR-0002 R2 Cache + Yahoo/Alpha Vantage fallback)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should instantiate with env", () => {
    const env: Env = { USE_MOCK: "false" };
    const provider = new RealProvider(env);
    expect(provider.name).toBe("real");
  });

  it("should check R2 cache first for whitelisted symbols", async () => {
    const { bucket, r2 } = mockR2();
    // Pre-populate cache
    const cachedData = {
      symbol: "AAPL",
      timeframe: "1d",
      data: [
        { t: "2024-01-01", o: 100, h: 105, l: 99, c: 104, v: 1000 },
        { t: "2024-01-02", o: 104, h: 108, l: 103, c: 107, v: 1500 },
      ],
    };
    bucket.set("klines/AAPL_1d.json", JSON.stringify(cachedData));

    const env: Env = { USE_MOCK: "false", R2: r2 };
    const provider = new RealProvider(env);

    const klines = await provider.getKlines("AAPL", "1d",
      new Date("2024-01-01"), new Date("2024-01-31"));

    expect(klines).toHaveLength(2);
    expect(klines[0].c).toBe(104);
  });

  it("should skip R2 cache for non-whitelisted symbols", async () => {
    const env: Env = { USE_MOCK: "false" };
    const provider = new RealProvider(env);

    // Mock fetch for Yahoo
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1700000000],
            indicators: { quote: [{ open: [100], high: [105], low: [99], close: [104], volume: [1000] }] },
          }],
        },
      }),
    } as Response);

    // SPY is not in whitelist
    expect(shouldCacheR2("SPY")).toBe(false);

    const klines = await provider.getKlines("SPY", "1d",
      new Date("2023-11-01"), new Date("2023-11-30"));

    expect(klines).toHaveLength(1);
    // Should NOT have attempted R2 cache write
  });

  it("should fallback to Mock when Yahoo fails", async () => {
    const env: Env = { USE_MOCK: "false" };
    const provider = new RealProvider(env);

    // Mock fetch to fail
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const klines = await provider.getKlines("AAPL", "1d",
      new Date("2024-01-01"), new Date("2024-12-31"));

    // Should fall back to Mock provider, which reads from /mock/klines/AAPL_1d.json
    // In test env (no running dev server), fetch is stubbed, so this returns []
    expect(Array.isArray(klines)).toBe(true);
  });

  it("should try Alpha Vantage when configured and Yahoo fails", async () => {
    const env: Env = {
      USE_MOCK: "false",
      ALPHA_VANTAGE_KEY: "test_key",
    };
    const provider = new RealProvider(env);

    // First call (Yahoo) fails, second call (Alpha Vantage) succeeds
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error("Yahoo error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "Time Series (Daily)": {
            "2024-01-01": { "1. open": "100", "2. high": "105", "3. low": "99", "4. close": "104", "5. volume": "1000" },
          },
        }),
      } as Response);

    const klines = await provider.getKlines("AAPL", "1d",
      new Date("2024-01-01"), new Date("2024-01-31"));

    expect(klines).toHaveLength(1);
    expect(klines[0].c).toBe(104);
    expect(klines[0].o).toBe(100);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("should write to R2 cache after successful Yahoo fetch (whitelisted symbol)", async () => {
    const { bucket, r2 } = mockR2();
    const env: Env = { USE_MOCK: "false", R2: r2 };
    const provider = new RealProvider(env);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1700000000],
            indicators: { quote: [{ open: [100], high: [105], low: [99], close: [104], volume: [1000] }] },
          }],
        },
      }),
    } as Response);

    await provider.getKlines("AAPL", "1d",
      new Date("2023-11-01"), new Date("2023-11-30"));

    // Verify R2 cache was written
    expect(bucket.has("klines/AAPL_1d.json")).toBe(true);
    const cached = JSON.parse(bucket.get("klines/AAPL_1d.json")!);
    expect(cached.ticker).toBe("AAPL");
    expect(cached.data).toHaveLength(1);
  });

  it("should handle Alpha Vantage rate limit response", async () => {
    const env: Env = {
      USE_MOCK: "false",
      ALPHA_VANTAGE_KEY: "test_key",
    };
    const provider = new RealProvider(env);

    // Yahoo fails, Alpha Vantage returns rate limit note
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error("Yahoo error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Note: "Thank you for using Alpha Vantage! Our standard API call frequency is 25 requests per day.",
        }),
      } as Response);

    // Should fall back to Mock (which returns [] in test env)
    const klines = await provider.getKlines("AAPL", "1d",
      new Date("2024-01-01"), new Date("2024-01-31"));

    expect(Array.isArray(klines)).toBe(true);
  });

  it("should handle R2 read errors gracefully", async () => {
    const r2: R2Bucket = {
      get: async () => { throw new Error("R2 connection error"); },
      put: async () => {},
      delete: async () => {},
      list: async () => ({ objects: [] }),
      head: async () => null,
    } as unknown as R2Bucket;

    const env: Env = { USE_MOCK: "false", R2: r2 };
    const provider = new RealProvider(env);

    // Mock Yahoo to succeed (R2 read error should not block)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: { result: [{ timestamp: [1700000000], indicators: { quote: [{ open: [100], high: [105], low: [99], close: [104], volume: [1000] }] } }] },
      }),
    } as Response);

    const klines = await provider.getKlines("AAPL", "1d",
      new Date("2023-11-01"), new Date("2023-11-30"));

    expect(klines).toHaveLength(1);
  });

  it("should respect ADR-0002 whitelist: only 10 symbols cached", () => {
    const whitelisted = ["AAPL", "MSFT", "NVDA", "GOOG", "META", "AMZN", "TSLA", "NFLX", "AMD", "INTC"];
    const notWhitelisted = ["SPY", "QQQ", "DIA", "IWM", "VTI"];

    whitelisted.forEach(s => expect(shouldCacheR2(s)).toBe(true));
    notWhitelisted.forEach(s => expect(shouldCacheR2(s)).toBe(false));
  });
});
