import type { RAGSourceAdapter, RAGDocument, RAGRetrieveOptions } from "../types";

interface MockPlaybook {
  id: string;
  title: string;
  description: string;
  tags: string[];
  kind: string;
  author: string;
}

const MOCK_PLAYBOOKS: MockPlaybook[] = [
  { id: "pb_momentum", title: "Momentum Breakout Strategy", description: "A systematic approach to identifying and trading momentum breakouts in large-cap stocks. Uses 50-day and 200-day moving average crossovers with volume confirmation.", tags: ["momentum", "breakout", "technical", "stocks"], kind: "strategy", author: "community_pro_1" },
  { id: "pb_value", title: "Deep Value Screening", description: "A fundamental analysis playbook that screens for undervalued stocks based on P/E, P/B, and free cash flow yield metrics.", tags: ["value", "fundamental", "screening", "stocks"], kind: "strategy", author: "community_pro_2" },
  { id: "pb_earnings", title: "Earnings Surprise Scanner", description: "Scans for stocks with positive earnings surprises and tracks post-earnings drift patterns over 30-day windows.", tags: ["earnings", "surprise", "drift", "stocks"], kind: "strategy", author: "community_pro_3" },
  { id: "pb_risk_parity", title: "Risk Parity Portfolio", description: "Constructs a risk-balanced portfolio by allocating based on inverse volatility across asset classes. Rebalances quarterly.", tags: ["risk", "portfolio", "allocation", "balanced"], kind: "composite", author: "community_pro_1" },
  { id: "pb_mean_revert", title: "Mean Reversion Pairs", description: "Identifies cointegrated stock pairs and trades mean-reversion spreads when the z-score exceeds 2 standard deviations.", tags: ["mean-reversion", "pairs", "statistical", "stocks"], kind: "strategy", author: "community_pro_4" },
  { id: "pb_dividend", title: "Dividend Growth Compounder", description: "Selects stocks with 10+ year dividend growth streaks, targeting 3%+ yield with sustainable payout ratios below 60%.", tags: ["dividend", "growth", "income", "stocks"], kind: "strategy", author: "community_pro_2" },
];

/**
 * Playbook adapter — returns community playbooks matching the query.
 * Mock mode: searches mock playbooks by tag/name matching.
 */
export class PlaybookAdapter implements RAGSourceAdapter {
  id = "playbook";
  name = "Community Playbooks";
  weight = 0.5;

  constructor(private mockMode: boolean = true) {}

  async retrieve(query: string, options?: RAGRetrieveOptions): Promise<RAGDocument[]> {
    if (this.mockMode) {
      return this.retrieveMock(query, options);
    }

    // Real mode: would query D1 playbook_versions + Vectorize — deferred to production wiring
    return this.retrieveMock(query, options);
  }

  private retrieveMock(query: string, options?: RAGRetrieveOptions): RAGDocument[] {
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/[\s,.?;:!?'"\-_/]+/).filter((t) => t.length > 1);

    // Score each playbook by how many query tokens match tags or title/description
    const scored = MOCK_PLAYBOOKS.map((pb) => {
      const tagSet = new Set(pb.tags.map((t) => t.toLowerCase()));
      const textFields = `${pb.title} ${pb.description}`.toLowerCase();
      let matchCount = 0;

      for (const token of queryTokens) {
        if (tagSet.has(token) || textFields.includes(token)) {
          matchCount++;
        }
      }

      return { playbook: pb, matchCount };
    }).filter((s) => s.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount);

    const limit = options?.limit ?? 5;

    return scored.slice(0, limit).map((entry, i) => {
      const pb = entry.playbook;
      return {
        id: `playbook_${pb.id}`,
        source: "playbook",
        content: `${pb.title}: ${pb.description}`,
        score: 0.7 - i * 0.05,
        metadata: {
          playbook_id: pb.id,
          title: pb.title,
          tags: pb.tags,
          kind: pb.kind,
          author: pb.author,
          match_count: entry.matchCount,
        },
        timestamp: new Date().toISOString(),
      };
    });
  }
}
