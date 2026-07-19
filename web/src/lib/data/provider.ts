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

import { Env, getEnv, isMockMode, R2_CACHE_SYMBOLS } from "../env";
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

// ============ Real Provider (placeholder) ============

export class RealProvider implements MarketDataProvider {
  name = "real";

  constructor(private env: Env) {}

  async getKlines(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Kline[]> {
    // Phase 1: Try Yahoo Finance (no key required)
    // Phase 1.5: Add Alpha Vantage + Polygon fallback
    try {
      return await this.fetchYahoo(symbol, timeframe, from, to);
    } catch (e) {
      console.warn("Yahoo failed, trying Mock fallback:", e);
      // Ultimate fallback to Mock if all real sources fail
      const mock = new MockProvider();
      return mock.getKlines(symbol, timeframe, from, to);
    }
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
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
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

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    // Phase 1.5: implement via Yahoo search API
    return [];
  }
}

// ============ Factory ============

let _provider: MarketDataProvider | null = null;

export function getProvider(): MarketDataProvider {
  if (_provider) return _provider;

  const env = getEnv();
  if (isMockMode()) {
    _provider = new MockProvider();
  } else {
    _provider = new RealProvider(env);
  }
  return _provider;
}

export function shouldCacheR2(symbol: string): boolean {
  return R2_CACHE_SYMBOLS.has(symbol.toUpperCase());
}
