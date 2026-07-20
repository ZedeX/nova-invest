import type { RAGSourceAdapter, RAGDocument, RAGRetrieveOptions } from "../types";

const MOCK_SYMBOLS = new Set([
  "AAPL", "MSFT", "NVDA", "GOOG", "META",
  "AMZN", "TSLA", "NFLX", "AMD", "INTC",
]);

const MOCK_FUNDAMENTALS: Record<string, { name: string; pe: number; marketCap: string; revenue: string; sector: string }> = {
  AAPL: { name: "Apple Inc.", pe: 33.2, marketCap: "$3.28T", revenue: "$383.29B", sector: "Technology" },
  MSFT: { name: "Microsoft Corporation", pe: 36.8, marketCap: "$3.55T", revenue: "$227.58B", sector: "Technology" },
  NVDA: { name: "NVIDIA Corporation", pe: 68.4, marketCap: "$2.15T", revenue: "$60.92B", sector: "Technology" },
  GOOG: { name: "Alphabet Inc.", pe: 26.1, marketCap: "$2.20T", revenue: "$307.39B", sector: "Communication Services" },
  META: { name: "Meta Platforms, Inc.", pe: 28.9, marketCap: "$1.28T", revenue: "$134.90B", sector: "Communication Services" },
  AMZN: { name: "Amazon.com, Inc.", pe: 58.7, marketCap: "$1.98T", revenue: "$574.78B", sector: "Consumer Cyclical" },
  TSLA: { name: "Tesla, Inc.", pe: 72.3, marketCap: "$789.4B", revenue: "$96.77B", sector: "Consumer Cyclical" },
  NFLX: { name: "Netflix, Inc.", pe: 48.2, marketCap: "$271.5B", revenue: "$33.72B", sector: "Communication Services" },
  AMD:  { name: "Advanced Micro Devices, Inc.", pe: 52.1, marketCap: "$262.8B", revenue: "$22.68B", sector: "Technology" },
  INTC: { name: "Intel Corporation", pe: 108.5, marketCap: "$118.3B", revenue: "$54.23B", sector: "Technology" },
};

function extractSymbol(query: string): string | null {
  const tokens = query.toUpperCase().split(/[\s,.?;:!?'"\-_/]+/);
  for (const token of tokens) {
    if (MOCK_SYMBOLS.has(token)) return token;
  }
  return null;
}

/**
 * Fundamentals adapter — returns company fundamentals data.
 * Mock mode: returns mock PE ratio, market cap, revenue for the 10 symbols.
 */
export class FundamentalsAdapter implements RAGSourceAdapter {
  id = "fundamentals";
  name = "Company Fundamentals";
  weight = 0.8;

  constructor(private mockMode: boolean = true) {}

  async retrieve(query: string, options?: RAGRetrieveOptions): Promise<RAGDocument[]> {
    const symbol = extractSymbol(query);
    if (!symbol) return [];

    if (this.mockMode) {
      return this.retrieveMock(symbol, options);
    }

    // Real mode: would query D1 fundamentals table — deferred to production wiring
    return this.retrieveMock(symbol, options);
  }

  private retrieveMock(symbol: string, options?: RAGRetrieveOptions): RAGDocument[] {
    const data = MOCK_FUNDAMENTALS[symbol];
    if (!data) return [];

    const doc: RAGDocument = {
      id: `fundamentals_${symbol}`,
      source: "fundamentals",
      content: `${symbol} (${data.name}) — Sector: ${data.sector}, P/E: ${data.pe}, Market Cap: ${data.marketCap}, Revenue: ${data.revenue}`,
      score: 0.9,
      metadata: {
        ticker: symbol,
        name: data.name,
        pe_ratio: data.pe,
        market_cap: data.marketCap,
        revenue: data.revenue,
        sector: data.sector,
      },
      timestamp: new Date().toISOString(),
    };

    const limit = options?.limit ?? 10;
    return [doc].slice(0, limit);
  }
}
