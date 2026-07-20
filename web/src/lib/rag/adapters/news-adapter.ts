import type { RAGSourceAdapter, RAGDocument, RAGRetrieveOptions } from "../types";

const MOCK_SYMBOLS = new Set([
  "AAPL", "MSFT", "NVDA", "GOOG", "META",
  "AMZN", "TSLA", "NFLX", "AMD", "INTC",
]);

interface MockNewsItem {
  title: string;
  snippet: string;
  source: string;
  url: string;
  symbol: string;
  date: string;
}

const MOCK_NEWS: MockNewsItem[] = [
  { title: "Apple Q3 Earnings Beat Expectations", snippet: "Apple Inc. reported Q3 revenue of $85.8B, beating analyst estimates of $84.5B. Services revenue grew 14% YoY to a record $24.2B.", source: "reuters", url: "https://www.reuters.com/article/apple-q3-earnings", symbol: "AAPL", date: "2026-07-18" },
  { title: "NVIDIA AI Chip Demand Surges", snippet: "NVIDIA reported unprecedented demand for its H200 AI chips, with data center revenue reaching $22.1B in Q4, up 409% YoY.", source: "bloomberg", url: "https://www.bloomberg.com/news/articles/nvidia-ai-demand", symbol: "NVDA", date: "2026-07-17" },
  { title: "Microsoft Cloud Growth Accelerates", snippet: "Microsoft Azure revenue grew 31% YoY, exceeding expectations. CEO Satya Nadella highlighted AI integration as a key driver.", source: "yahoo_news", url: "https://finance.yahoo.com/news/microsoft-cloud-growth", symbol: "MSFT", date: "2026-07-16" },
  { title: "Tesla Deliveries Top Estimates", snippet: "Tesla delivered 444,000 vehicles in Q2, surpassing Wall Street estimates of 438,000. Model Y remained the top-selling EV globally.", source: "reuters", url: "https://www.reuters.com/article/tesla-deliveries-q2", symbol: "TSLA", date: "2026-07-15" },
  { title: "Amazon Prime Day Sets Record", snippet: "Amazon reported record Prime Day sales, with over $14B in total merchandise sold during the 48-hour event.", source: "bloomberg", url: "https://www.bloomberg.com/news/articles/amazon-prime-day", symbol: "AMZN", date: "2026-07-14" },
  { title: "Meta AI Investments Pay Off", snippet: "Meta Platforms reported advertising revenue of $38.4B in Q2, driven by AI-powered ad targeting improvements.", source: "reuters", url: "https://www.reuters.com/article/meta-ai-ads", symbol: "META", date: "2026-07-13" },
  { title: "Google DeepMind Breakthrough", snippet: "Alphabet's DeepMind announced a major breakthrough in protein structure prediction, with potential pharmaceutical applications.", source: "bloomberg", url: "https://www.bloomberg.com/news/articles/google-deepmind", symbol: "GOOG", date: "2026-07-12" },
  { title: "Netflix Ad-Tier Subscribers Surge", snippet: "Netflix reported 40M ad-tier subscribers, up from 23M in the prior quarter, signaling strong monetization potential.", source: "yahoo_news", url: "https://finance.yahoo.com/news/netflix-ad-tier", symbol: "NFLX", date: "2026-07-11" },
  { title: "AMD MI300X Gains Market Share", snippet: "AMD's MI300X accelerator gained significant market share in the data center GPU segment, challenging NVIDIA's dominance.", source: "reuters", url: "https://www.reuters.com/article/amd-mi300x", symbol: "AMD", date: "2026-07-10" },
  { title: "Intel Foundry Strategy Update", snippet: "Intel announced progress on its $20B Ohio fab, with first chips expected by late 2027. The foundry business posted a $7B operating loss.", source: "bloomberg", url: "https://www.bloomberg.com/news/articles/intel-foundry", symbol: "INTC", date: "2026-07-09" },
];

function extractSymbol(query: string): string | null {
  const tokens = query.toUpperCase().split(/[\s,.?;:!?'"\-_/]+/);
  for (const token of tokens) {
    if (MOCK_SYMBOLS.has(token)) return token;
  }
  return null;
}

/**
 * News adapter — returns relevant news articles.
 * Mock mode: returns mock news articles about the matched symbols.
 */
export class NewsAdapter implements RAGSourceAdapter {
  id = "news";
  name = "Market News";
  weight = 0.6;

  constructor(private mockMode: boolean = true) {}

  async retrieve(query: string, options?: RAGRetrieveOptions): Promise<RAGDocument[]> {
    const symbol = extractSymbol(query);
    if (!symbol) return [];

    if (this.mockMode) {
      return this.retrieveMock(symbol, options);
    }

    // Real mode: would query D1 news_articles + Vectorize — deferred to production wiring
    return this.retrieveMock(symbol, options);
  }

  private retrieveMock(symbol: string, options?: RAGRetrieveOptions): RAGDocument[] {
    const matching = MOCK_NEWS.filter((n) => n.symbol === symbol);
    const limit = options?.limit ?? 5;

    return matching.slice(0, limit).map((news, i) => ({
      id: `news_${symbol}_${i}`,
      source: "news",
      content: `${news.title}: ${news.snippet}`,
      score: 0.8 - i * 0.05,
      metadata: {
        ticker: symbol,
        title: news.title,
        news_source: news.source,
        url: news.url,
        date: news.date,
      },
      timestamp: news.date,
    }));
  }
}
