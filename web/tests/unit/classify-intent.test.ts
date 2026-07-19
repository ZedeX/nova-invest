/**
 * TDD Spec — ADR-0003: classifyIntent (Intent Classifier)
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0003-llm-routing-cost-cap.md
 *
 * The 4 canonical examples come directly from EP03 §2.2 (per ADR-0003
 * §Verification Required). The expanded cases exercise the regex branches
 * in `web/src/lib/llm/router.ts` to catch regressions when patterns change.
 *
 * classifyIntent is a pure function — no env, no fetch, no module state —
 * so tests can import it statically without vi.resetModules().
 */

import { describe, expect, it } from "vitest";
import { classifyIntent } from "@/lib/llm/router";

describe("ADR-0003: classifyIntent (regex-based intent classifier)", () => {
  // ---------- §Validation Criteria — 4 canonical examples ----------

  it("classifyIntent('AAPL 现在多少钱') → 'simple_qa'", () => {
    expect(classifyIntent("AAPL 现在多少钱")).toBe("simple_qa");
  });

  it("classifyIntent('分析 NVDA 过去 3 年财报趋势') → 'deep_research'", () => {
    expect(classifyIntent("分析 NVDA 过去 3 年财报趋势")).toBe("deep_research");
  });

  it("classifyIntent('查 TSLA 最近新闻') → 'tool_call'", () => {
    expect(classifyIntent("查 TSLA 最近新闻")).toBe("tool_call");
  });

  it("classifyIntent('你觉得我该怎么办') → 'clarify'", () => {
    expect(classifyIntent("你觉得我该怎么办")).toBe("clarify");
  });

  // ---------- Expanded — simple_qa branch ----------

  describe("simple_qa branch", () => {
    it.each([
      "AAPL 现在价格",
      "MSFT 当前股价",
      "NVDA 现在多少钱",
      "current price of AAPL",
      "how much is TSLA",
      "Current Price GOOG",
      "HOW MUCH IS NFLX",
    ])("classifies %p as simple_qa", (q) => {
      expect(classifyIntent(q)).toBe("simple_qa");
    });
  });

  // ---------- Expanded — deep_research branch ----------

  describe("deep_research branch", () => {
    it.each([
      "分析 NVDA 财报",
      "研究 AMZN 商业模式",
      "比较 AAPL 和 MSFT",
      "AMD 过去一年趋势",
      "META 历史估值",
      "analyze TSLA earnings",
      "research semiconductor industry",
      "compare GOOG and META",
      "trend of NVDA last year",
      "past performance of INTC",
      "history of NFLX stock",
    ])("classifies %p as deep_research", (q) => {
      expect(classifyIntent(q)).toBe("deep_research");
    });
  });

  // ---------- Expanded — tool_call branch ----------

  describe("tool_call branch", () => {
    it.each([
      "查 AAPL 最近新闻",
      "调用 TSLA 财报接口",
      "搜索 NVDA 相关新闻",
      "search latest news on AMD",
      "fetch earnings for MSFT",
      "news about META",
    ])("classifies %p as tool_call", (q) => {
      expect(classifyIntent(q)).toBe("tool_call");
    });
  });

  // ---------- Expanded — clarify branch (fallback) ----------

  describe("clarify branch (fallback)", () => {
    it.each([
      "你觉得我该怎么办",
      "随便聊聊",
      "hello",
      "",
      "？？？",
      "今天天气不错",
    ])("classifies %p as clarify", (q) => {
      expect(classifyIntent(q)).toBe("clarify");
    });
  });

  // ---------- Case-insensitivity ----------

  it("classifyIntent is case-insensitive (lowercases input before matching)", () => {
    expect(classifyIntent("ANALYZE NVDA")).toBe("deep_research");
    expect(classifyIntent("Current Price AAPL")).toBe("simple_qa");
    expect(classifyIntent("FETCH NEWS TSLA")).toBe("tool_call");
  });

  // ---------- Return type contract ----------

  it("returns one of the 4 canonical QueryIntent values", () => {
    const validIntents = new Set(["simple_qa", "deep_research", "tool_call", "clarify"]);
    const queries = [
      "AAPL 价格", "分析 NVDA", "查 TSLA 新闻", "随便聊聊",
      "current price", "analyze", "search news", "hello",
    ];
    for (const q of queries) {
      expect(validIntents.has(classifyIntent(q))).toBe(true);
    }
  });
});
