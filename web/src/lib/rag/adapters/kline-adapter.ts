import type { RAGSourceAdapter, RAGDocument, RAGRetrieveOptions } from "../types";

/** Known mock symbols shared with R2_CACHE_SYMBOLS in env.ts */
const MOCK_SYMBOLS = new Set([
  "AAPL", "MSFT", "NVDA", "GOOG", "META",
  "AMZN", "TSLA", "NFLX", "AMD", "INTC",
]);

const MOCK_PRICES: Record<string, { name: string; price: number; change: number; volume: string }> = {
  AAPL: { name: "Apple Inc.", price: 213.07, change: 1.24, volume: "62.3M" },
  MSFT: { name: "Microsoft Corporation", price: 478.91, change: -2.15, volume: "28.1M" },
  NVDA: { name: "NVIDIA Corporation", price: 875.28, change: 12.45, volume: "45.7M" },
  GOOG: { name: "Alphabet Inc.", price: 178.36, change: 0.87, volume: "18.9M" },
  META: { name: "Meta Platforms, Inc.", price: 504.72, change: 3.56, volume: "15.2M" },
  AMZN: { name: "Amazon.com, Inc.", price: 192.84, change: -0.93, volume: "32.5M" },
  TSLA: { name: "Tesla, Inc.", price: 248.42, change: -5.67, volume: "78.4M" },
  NFLX: { name: "Netflix, Inc.", price: 628.15, change: 8.34, volume: "9.8M" },
  AMD:  { name: "Advanced Micro Devices, Inc.", price: 162.39, change: 2.18, volume: "41.6M" },
  INTC: { name: "Intel Corporation", price: 24.87, change: -0.42, volume: "55.2M" },
};

/** Extract a stock symbol from a query string */
function extractSymbol(query: string): string | null {
  const tokens = query.toUpperCase().split(/[\s,.?;:!?'"\-_/]+/);
  for (const token of tokens) {
    if (MOCK_SYMBOLS.has(token)) return token;
  }
  return null;
}

/**
 * Kline/Market Data RAG adapter.
 * In Mock mode: returns mock kline summaries for the 10 mock symbols.
 * In Real mode: uses MarketDataProvider to fetch recent data.
 */
export class KlineAdapter implements RAGSourceAdapter {
  id = "kline";
  name = "Market Data (Kline)";
  weight = 1.0;

  constructor(private mockMode: boolean = true) {}

  async retrieve(query: string, options?: RAGRetrieveOptions): Promise<RAGDocument[]> {
    const symbol = extractSymbol(query);
    if (!symbol) return [];

    if (this.mockMode) {
      return this.retrieveMock(symbol, options);
    }

    // Real mode: would use MarketDataProvider — deferred to production wiring
    return this.retrieveMock(symbol, options);
  }

  private retrieveMock(symbol: string, options?: RAGRetrieveOptions): RAGDocument[] {
    const data = MOCK_PRICES[symbol];
    if (!data) return [];

    const doc: RAGDocument = {
      id: `kline_${symbol}_1d`,
      source: "kline",
      content: `${symbol} (${data.name}): $${data.price.toFixed(2)} (${data.change >= 0 ? "+" : ""}${data.change.toFixed(2)}), Volume: ${data.volume}`,
      score: 1.0,
      metadata: {
        ticker: symbol,
        name: data.name,
        price: data.price,
        change: data.change,
        volume: data.volume,
        timeframe: "1d",
      },
      timestamp: new Date().toISOString(),
    };

    const limit = options?.limit ?? 10;
    return [doc].slice(0, limit);
  }
}
