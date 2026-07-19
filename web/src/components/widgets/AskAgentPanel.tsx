"use client";

/**
 * Ask Agent Panel Widget (Epic 03 + Epic 05).
 * Phase 1: Loads pre-generated Mock QA samples.
 */

import { useState } from "react";
import { isMockMode } from "@/lib/env";
import type { AskResponse } from "@/lib/types";

const SUGGESTED_QUERIES = [
  "AAPL 当前价格",
  "NVDA 财报分析",
  "TSLA 最近新闻",
  "我的持仓风险",
];

export interface AskAgentPanelProps {
  defaultQuery?: string;
}

export function AskAgentPanel({ defaultQuery = "" }: AskAgentPanelProps = {}) {
  const [query, setQuery] = useState(defaultQuery);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setResponse(null);

    try {
      if (isMockMode()) {
        // Load Mock QA sample
        let sampleFile = "/mock/qa_samples/clarify.json";
        if (/价格|多少钱|price/.test(q))            sampleFile = "/mock/qa_samples/aapl_price.json";
        else if (/财报|earnings|营收/.test(q))        sampleFile = "/mock/qa_samples/nvda_earnings.json";
        else if (/新闻|news/.test(q))                 sampleFile = "/mock/qa_samples/tsla_news.json";
        else if (/持仓|portfolio|risk/.test(q))        sampleFile = "/mock/qa_samples/portfolio_risk.json";

        const res = await fetch(sampleFile);
        const sample: any = await res.json();
        setResponse({
          ...sample.response,
          intent: sample.intent,
          cost: { credits_used: 0, model: "mock-qa-sample" },
        });
      } else {
        // Real mode: call /api/ask
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const json: any = await res.json();
        setResponse(json.data?.answer || json.data);
      }
    } catch (e) {
      setResponse({
        summary: `Error: ${e instanceof Error ? e.message : String(e)}`,
        numeric_facts: [],
        citations: [],
        confidence: 0,
        intent: "clarify",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Ask Agent</h3>
        <span className="text-xs text-zinc-500">{isMockMode() ? "Mock mode · 0 Credit" : "Real mode"}</span>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && ask(query)}
          placeholder="Ask anything about stocks..."
          className="flex-1 px-3 py-2 text-sm rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={() => ask(query)}
          disabled={loading || !query.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-400 rounded transition-colors"
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {SUGGESTED_QUERIES.map(q => (
          <button
            key={q}
            onClick={() => { setQuery(q); ask(q); }}
            className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {q}
          </button>
        ))}
      </div>

      {response && (
        <div className="space-y-3">
          <div className="text-sm text-zinc-900 dark:text-zinc-50 leading-relaxed">
            {response.summary}
          </div>

          {response.numeric_facts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-500 mb-1">Numeric Facts</div>
              <div className="space-y-1">
                {response.numeric_facts.map((f, i) => (
                  <div key={i} className="text-xs font-mono text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">${f.value} {f.unit}</span>
                    <span className="text-zinc-500">(confidence: {(f.confidence * 100).toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {response.citations.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-500 mb-1">Citations</div>
              <ul className="space-y-1">
                {response.citations.map((c, i) => (
                  <li key={i} className="text-xs">
                    <a href={c.url} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                      [{i + 1}] {c.source}
                    </a>
                    <span className="text-zinc-500 ml-1">— {c.quote.slice(0, 80)}{c.quote.length > 80 ? "..." : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-900 text-xs text-zinc-500">
            <span>Intent: <span className="font-mono">{response.intent}</span></span>
            <span>Confidence: <span className="font-mono">{(response.confidence * 100).toFixed(0)}%</span></span>
            {response.cost && (
              <span>Cost: <span className="font-mono">{response.cost.credits_used} Credit</span></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
