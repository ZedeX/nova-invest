"use client";

/**
 * K-line Chart Widget.
 * Phase 1: Simple SVG-based chart (no external library dependency).
 * Phase 1.5: Will replace with lightweight-charts.
 *
 * Per Epic 05 decision:
 *   - Mock mode: load from /mock/klines/*.json
 *   - Real mode: load from /api/data/klines
 */

import { useEffect, useState } from "react";
import { isMockMode } from "@/lib/env";
import type { Kline } from "@/lib/types";

interface Props {
  symbol: string;
  height?: number;
}

export function KlineChart({ symbol, height = 320 }: Props) {
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isMockMode()) {
          const res = await fetch(`/mock/klines/${symbol.toUpperCase()}_1d.json`);
          if (!res.ok) throw new Error(`No mock data for ${symbol}`);
          const json: any = await res.json();
          setKlines(json.data.slice(-90));  // Last ~3 months
        } else {
          // Real mode: call API
          const res = await fetch(`/api/data/klines?symbol=${symbol}&timeframe=1d&from=2024-01-01&to=2025-12-31`);
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          const json: any = await res.json();
          setKlines(json.data?.slice(-90) || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [symbol]);

  if (loading) {
    return <div className="h-[320px] flex items-center justify-center text-zinc-400 text-sm">Loading {symbol}...</div>;
  }

  if (error) {
    return (
      <div className="h-[320px] flex flex-col items-center justify-center text-red-500 text-sm gap-2">
        <div>Failed to load: {error}</div>
        <div className="text-xs text-zinc-400">Symbol: {symbol}</div>
      </div>
    );
  }

  if (klines.length === 0) {
    return <div className="h-[320px] flex items-center justify-center text-zinc-400 text-sm">No data for {symbol}</div>;
  }

  // Simple SVG chart
  const prices = klines.flatMap(k => [k.l, k.h]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const width = 800;
  const chartHeight = height - 60;
  const candleWidth = Math.max(2, (width - 40) / klines.length - 1);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{symbol}</span>
          <span className="ml-2 text-xs text-zinc-500">Daily · Last {klines.length} days</span>
        </div>
        <div className="text-right">
          <div className="text-lg font-mono text-zinc-900 dark:text-zinc-50">
            ${klines[klines.length - 1].c.toFixed(2)}
          </div>
          <div className={`text-xs font-mono ${klines[klines.length - 1].c >= klines[0].c ? "text-green-600" : "text-red-600"}`}>
            {klines[klines.length - 1].c >= klines[0].c ? "+" : ""}
            {((klines[klines.length - 1].c / klines[0].c - 1) * 100).toFixed(2)}%
          </div>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <line key={p} x1="0" x2={width} y1={p * chartHeight + 10} y2={p * chartHeight + 10}
                stroke="currentColor" strokeWidth="0.5" className="text-zinc-200 dark:text-zinc-800" />
        ))}
        {/* Candles */}
        {klines.map((k, i) => {
          const x = 20 + i * (candleWidth + 1);
          const isUp = k.c >= k.o;
          const color = isUp ? "#22c55e" : "#ef4444";
          const highY = chartHeight + 10 - ((k.h - min) / range) * chartHeight;
          const lowY = chartHeight + 10 - ((k.l - min) / range) * chartHeight;
          const openY = chartHeight + 10 - ((k.o - min) / range) * chartHeight;
          const closeY = chartHeight + 10 - ((k.c - min) / range) * chartHeight;
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(1, Math.abs(closeY - openY));
          return (
            <g key={i}>
              <line x1={x + candleWidth/2} x2={x + candleWidth/2}
                    y1={highY} y2={lowY} stroke={color} strokeWidth="0.5" />
              <rect x={x} y={bodyTop} width={candleWidth} height={bodyHeight}
                    fill={color} />
            </g>
          );
        })}
        {/* Y axis labels */}
        <text x={width - 5} y={15} textAnchor="end" className="text-xs fill-zinc-500">${max.toFixed(2)}</text>
        <text x={width - 5} y={chartHeight + 5} textAnchor="end" className="text-xs fill-zinc-500">${min.toFixed(2)}</text>
      </svg>
    </div>
  );
}
