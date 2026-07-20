/**
 * MarketDataProvider abstraction layer.
 *
 * Key design:
 *   - Single USE_MOCK switch controls Mock vs Real mode
 *   - Mock mode reads static JSON files from /mock/klines/*.json
 *   - Real mode calls external APIs (Yahoo/Alpha Vantage/Polygon) with fallback chain
 *   - R2 cache only caches 10 Mockup symbols (per Epic 02 decision)
 *
 * See: docs/prd/epic/02_DataLayer.md
 */

import { Env, getEnv, isMockMode, R2_CACHE_SYMBOLS, shouldCacheR2 } from "../env";
import type { Kline, KlineResponse, Quote, SymbolInfo, Timeframe } from "../types";

export interface MarketDataProvider {
  name: string;
  getKlines(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Kline[]>;
  getQuote(symbol: string): Promise<Quote>;
  searchSymbols(query: string): Promise<SymbolInfo[]>;
}

// ============ Mock Provider ============

export class MockProvider implements MarketDataProvider {
  name = "mock";

  async getKlines(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Kline[]> {
    if (timeframe !== "1d") {
      // For non-daily timeframes, we only have daily Mock data in Phase 1.
      // Return empty for now; could be extended later.
      console.warn(`Mock data only supports timeframe=1d (got ${timeframe})`);
    }

    const url = `/mock/klines/${symbol.toUpperCase()}_1d.json`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Mock file not found: ${url}`);
      }
      const json: KlineResponse = await res.json();
      return json.data.filter(k => {
        const d = new Date(k.t);
        return d >= from && d <= to;
      });
    } catch (e) {
      console.error("MockProvider.getKlines error:", e);
      return [];
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    const klines = await this.getKlines(symbol, "1d",
      new Date(Date.now() - 7 * 86400 * 1000), new Date());
    const last = klines[klines.length - 1];
    if (!last) {
      throw new Error(`No Mock data for ${symbol}`);
    }
    const prev = klines[klines.length - 2] || last;
    const change = last.c - prev.c;
    return {
      symbol: symbol.toUpperCase(),
      bid: last.c * 0.999,
      ask: last.c * 1.001,
      last: last.c,
      change,
      change_percent: (change / prev.c) * 100,
      volume: last.v,
      timestamp: last.t,
    };
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    // For Phase 1, return all 10 Mockup symbols if query matches
    const allSymbols = Array.from(R2_CACHE_SYMBOLS);
    const matches = allSymbols.filter(s =>
      s.toLowerCase().includes(query.toLowerCase())
    );
    return matches.map(ticker => ({
      ticker,
      name: MOCKUP_NAMES[ticker] || ticker,
      exchange: "NASDAQ",
      is_mockup: true,
    }));
  }
}

const MOCKUP_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corporation",
  NVDA: "NVIDIA Corporation",
  GOOG: "Alphabet Inc.",
  META: "Meta Platforms, Inc.",
  AMZN: "Amazon.com, Inc.",
  TSLA: "Tesla, Inc.",
  NFLX: "Netflix, Inc.",
  AMD:  "Advanced Micro Devices, Inc.",
  INTC: "Intel Corporation",
};

// ============ Real Provider ============

/**
 * RealProvider fetches data from external APIs with a fallback chain:
 *   1. R2 cache (if symbol is in whitelist per ADR-0002)
 *   2. Yahoo Finance (no API key required)
 *   3. Alpha Vantage (requires ALPHA_VANTAGE_KEY)
 *   4. Mock fallback (only if all real sources fail)
 *
 * R2 cache write happens only for the 10 whitelisted symbols (ADR-0002).
 */
export class RealProvider implements MarketDataProvider {
  name = "real";

  constructor(private env: Env) {}

  async getKlines(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Kline[]> {
    // Step 1: Check R2 cache for whitelisted symbols
    if (shouldCacheR2(symbol) && this.env.R2) {
      const cached = await this.tryR2Cache(symbol, timeframe);
      if (cached && cached.length > 0) {
        console.log(`[RealProvider] R2 cache hit: ${symbol} ${timeframe}`);
        return this.filterByDateRange(cached, from, to);
      }
    }

    // Step 2: Try Yahoo Finance
    try {
      const klines = await this.fetchYahoo(symbol, timeframe, from, to);
      if (klines.length > 0) {
        // Write to R2 cache if whitelisted
        if (shouldCacheR2(symbol) && this.env.R2) {
          await this.writeR2Cache(symbol, timeframe, klines);
        }
        return klines;
      }
    } catch (e) {
      console.warn(`[RealProvider] Yahoo failed for ${symbol}:`, e);
    }

    // Step 3: Try Alpha Vantage (if API key configured)
    if (this.env.ALPHA_VANTAGE_KEY) {
      try {
        const klines = await this.fetchAlphaVantage(symbol, timeframe, from, to);
        if (klines.length > 0) {
          if (shouldCacheR2(symbol) && this.env.R2) {
            await this.writeR2Cache(symbol, timeframe, klines);
          }
          return klines;
        }
      } catch (e) {
        console.warn(`[RealProvider] Alpha Vantage failed for ${symbol}:`, e);
      }
    }

    // Step 4: Ultimate fallback to Mock
    console.warn(`[RealProvider] All real sources failed for ${symbol}, falling back to Mock`);
    const mock = new MockProvider();
    return mock.getKlines(symbol, timeframe, from, to);
  }

  /**
   * Try to read cached K-lines from R2.
   * Returns null on cache miss or error.
   */
  private async tryR2Cache(symbol: string, timeframe: Timeframe): Promise<Kline[] | null> {
    if (!this.env.R2) return null;
    const key = `klines/${symbol.toUpperCase()}_${timeframe}.json`;
    try {
      const obj = await this.env.R2.get(key);
      if (!obj) return null;
      const text = await obj.text();
      const json = JSON.parse(text) as KlineResponse;
      return json.data || [];
    } catch (e) {
      console.warn(`[RealProvider] R2 read error for ${key}:`, e);
      return null;
    }
  }

  /**
   * Write K-lines to R2 cache.
   * Only called for whitelisted symbols per ADR-0002.
   */
  private async writeR2Cache(symbol: string, timeframe: Timeframe, klines: Kline[]): Promise<void> {
    if (!this.env.R2 || klines.length === 0) return;
    const key = `klines/${symbol.toUpperCase()}_${timeframe}.json`;
    try {
      const payload: KlineResponse = {
        ticker: symbol.toUpperCase(),
        timeframe,
        source: "r2_cache",
        data: klines,
      };
      await this.env.R2.put(key, JSON.stringify(payload));
      console.log(`[RealProvider] R2 cache write: ${key} (${klines.length} bars)`);
    } catch (e) {
      console.warn(`[RealProvider] R2 write error for ${key}:`, e);
    }
  }

  private filterByDateRange(klines: Kline[], from: Date, to: Date): Kline[] {
    return klines.filter(k => {
      const d = new Date(k.t);
      return d >= from && d <= to;
    });
  }

  /**
   * Fetch from Alpha Vantage TIME_SERIES_DAILY endpoint.
   * Requires ALPHA_VANTAGE_KEY env var.
   */
  private async fetchAlphaVantage(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Kline[]> {
    if (!this.env.ALPHA_VANTAGE_KEY) {
      throw new Error("ALPHA_VANTAGE_KEY not configured");
    }
    // Phase 1: only daily is supported by Alpha Vantage free tier
    if (timeframe !== "1d") {
      throw new Error(`Alpha Vantage only supports timeframe=1d (got ${timeframe})`);
    }
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${this.env.ALPHA_VANTAGE_KEY}&outputsize=full`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Alpha Vantage API error: ${res.status}`);
    }
    const json = await res.json() as {
      "Time Series (Daily)"?: Record<string, { "1. open": string; "2. high": string; "3. low": string; "4. close": string; "5. volume": string }>;
      Note?: string;  // rate limit message
    };

    if (json.Note) {
      throw new Error(`Alpha Vantage rate limit: ${json.Note}`);
    }
    const ts = json["Time Series (Daily)"];
    if (!ts) {
      throw new Error("Alpha Vantage returned no time series");
    }

    const klines: Kline[] = Object.entries(ts)
      .map(([date, values]) => ({
        t: date,
        o: parseFloat(values["1. open"]),
        h: parseFloat(values["2. high"]),
        l: parseFloat(values["3. low"]),
        c: parseFloat(values["4. close"]),
        v: parseInt(values["5. volume"], 10),
      }))
      .filter(k => {
        const d = new Date(k.t);
        return d >= from && d <= to && k.o > 0;
      })
      .sort((a, b) => a.t.localeCompare(b.t));

    return klines;
  }

  private async fetchYahoo(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Kline[]> {
    const period1 = Math.floor(from.getTime() / 1000);
    const period2 = Math.floor(to.getTime() / 1000);
    const interval = timeframe === "1d" ? "1d" : timeframe;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      throw new Error(`Yahoo API error: ${res.status}`);
    }
    const json: unknown = await res.json();
    const result = (json as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> } }> } })?.chart?.result?.[0];
    if (!result) {
      throw new Error("Yahoo returned no result");
    }
    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    return timestamps.map((t, i) => ({
      t: new Date(t * 1000).toISOString().slice(0, 10),
      o: quote.open?.[i] ?? 0,
      h: quote.high?.[i] ?? 0,
      l: quote.low?.[i] ?? 0,
      c: quote.close?.[i] ?? 0,
      v: quote.volume?.[i] ?? 0,
    })).filter(k => k.o > 0);
  }

  async getQuote(symbol: string): Promise<Quote> {
    // Simplified: use last daily K-line as quote
    const klines = await this.getKlines(symbol, "1d",
      new Date(Date.now() - 7 * 86400 * 1000), new Date());
    const last = klines[klines.length - 1];
    if (!last) throw new Error(`No data for ${symbol}`);
    return {
      symbol: symbol.toUpperCase(),
      bid: last.c * 0.999,
      ask: last.c * 1.001,
      last: last.c,
      change: 0,
      change_percent: 0,
      volume: last.v,
      timestamp: last.t,
    };
  }

  async searchSymbols(_query: string): Promise<SymbolInfo[]> {
    // Phase 1.5: implement via Yahoo search API
    return [];
  }
}

// ============ Factory ============
//
// Per ADR-0001 §Critical Implementation Rule: factory is request-scoped —
// each call returns a fresh instance. No module-level cache.
// Callers can pass an explicit `env` for test isolation; if omitted, the
// factory reads from the current process/globalThis environment.

export function getProvider(env?: Env): MarketDataProvider {
  const resolvedEnv = env ?? getEnv();
  const useMock = env ? env.USE_MOCK === "true" : isMockMode();
  if (useMock) {
    return new MockProvider();
  }
  return new RealProvider(resolvedEnv);
}

// shouldCacheR2 is now canonicaly exported from env.ts per ADR-0002.
// Re-export here for backward compat with any caller importing from provider.
export { shouldCacheR2 };
