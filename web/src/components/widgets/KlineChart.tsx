"use client";

/**
 * K-line Chart Widget (Epic 05, Sprint 5).
 *
 * Powered by TradingView lightweight-charts v5.
 * Supports:
 *   - Candlestick + volume
 *   - Indicator overlays: SMA(20), EMA(50), RSI(14)
 *   - Strategy markers (BUY/SELL arrows)
 *   - Dark/light theme auto-adapt
 *   - Responsive resize
 */

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type SeriesMarker,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import { isMockMode } from "@/lib/env";
import type { Kline } from "@/lib/types";
import { sma, ema, rsi } from "@/lib/indicators";

interface Props {
  symbol: string;
  height?: number;
  /** Optional strategy markers (BUY/SELL). */
  markers?: Array<{
    time: string;
    position: "BUY" | "SELL";
    price?: number;
    text?: string;
  }>;
  /** Toggle indicator overlays. */
  showSMA?: boolean;
  showEMA?: boolean;
  showRSI?: boolean;
}

type Theme = "dark" | "light";

function detectTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function KlineChart({
  symbol,
  height = 400,
  markers = [],
  showSMA = true,
  showEMA = true,
  showRSI = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Load kline data ----
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isMockMode()) {
          const res = await fetch(`/mock/klines/${symbol.toUpperCase()}_1d.json`);
          if (!res.ok) throw new Error(`No mock data for ${symbol}`);
          const json = await res.json() as { data?: Kline[] };
          setKlines((json.data ?? []).slice(-180));
        } else {
          const res = await fetch(`/api/chart/${symbol}?timeframe=1d`);
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          const json = await res.json() as { data?: { klines?: Kline[] } };
          setKlines((json.data?.klines ?? []).slice(-180));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [symbol]);

  // ---- Create chart once ----
  useEffect(() => {
    if (!containerRef.current) return;
    const theme = detectTheme();
    const isDark = theme === "dark";
    const bg = isDark ? "#09090b" : "#ffffff";
    const text = isDark ? "#e4e4e7" : "#27272a";
    const grid = isDark ? "#27272a" : "#e4e4e7";

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: text,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: grid },
      timeScale: {
        borderColor: grid,
        timeVisible: false,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: isDark ? "#3f3f46" : "#d4d4d8",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    if (showSMA) {
      smaSeriesRef.current = chart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
    }
    if (showEMA) {
      emaSeriesRef.current = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
    }
    if (showRSI) {
      rsiSeriesRef.current = chart.addSeries(LineSeries, {
        color: "#a855f7",
        lineWidth: 1,
        priceScaleId: "rsi",
        lastValueVisible: true,
      });
      chart.priceScale("rsi").applyOptions({
        scaleMargins: { top: 0.75, bottom: 0 },
      });
    }

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // ---- Update data ----
  useEffect(() => {
    if (!candleSeriesRef.current || klines.length === 0) return;

    const candleData = klines.map((k) => ({
      time: k.t as Time,
      open: k.o,
      high: k.h,
      low: k.l,
      close: k.c,
    }));
    candleSeriesRef.current.setData(candleData);

    const volData = klines.map((k) => ({
      time: k.t as Time,
      value: k.v,
      color: k.c >= k.o ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
    }));
    volumeSeriesRef.current?.setData(volData);

    if (smaSeriesRef.current) {
      smaSeriesRef.current.setData(
        sma(klines, 20).map((p) => ({ time: p.time as Time, value: p.value })),
      );
    }
    if (emaSeriesRef.current) {
      emaSeriesRef.current.setData(
        ema(klines, 50).map((p) => ({ time: p.time as Time, value: p.value })),
      );
    }
    if (rsiSeriesRef.current) {
      rsiSeriesRef.current.setData(
        rsi(klines, 14).map((p) => ({ time: p.time as Time, value: p.value })),
      );
    }

    // Strategy markers
    if (markers.length > 0) {
      const seriesMarkers: SeriesMarker<Time>[] = markers.map((m) => ({
        time: m.time as Time,
        position: m.position === "BUY" ? "belowBar" : "aboveBar",
        color: m.position === "BUY" ? "#22c55e" : "#ef4444",
        shape: m.position === "BUY" ? "arrowUp" : "arrowDown",
        text: m.text ?? m.position,
      }));
      if (markersRef.current) {
        markersRef.current.setMarkers(seriesMarkers);
      } else if (candleSeriesRef.current) {
        markersRef.current = createSeriesMarkers(candleSeriesRef.current, seriesMarkers);
      }
    }

    chartRef.current?.timeScale().fitContent();
  }, [klines, markers, showSMA, showEMA, showRSI]);

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center text-zinc-400 text-sm">
        Loading {symbol}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-red-500 text-sm gap-2">
        <div>Failed to load: {error}</div>
        <div className="text-xs text-zinc-400">Symbol: {symbol}</div>
      </div>
    );
  }

  if (klines.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-zinc-400 text-sm">
        No data for {symbol}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {symbol}
          </span>
          <span className="ml-2 text-xs text-zinc-500">
            Daily · Last {klines.length} days
          </span>
        </div>
        <div className="text-right">
          <div className="text-lg font-mono text-zinc-900 dark:text-zinc-50">
            ${klines[klines.length - 1].c.toFixed(2)}
          </div>
          <div
            className={`text-xs font-mono ${
              klines[klines.length - 1].c >= klines[0].c
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {klines[klines.length - 1].c >= klines[0].c ? "+" : ""}
            {(
              (klines[klines.length - 1].c / klines[0].c - 1) *
              100
            ).toFixed(2)}
            %
          </div>
        </div>
      </div>
      <div className="flex gap-3 mb-2 text-xs">
        {showSMA && (
          <span className="text-blue-500">─ SMA(20)</span>
        )}
        {showEMA && (
          <span className="text-amber-500">─ EMA(50)</span>
        )}
        {showRSI && (
          <span className="text-purple-500">─ RSI(14)</span>
        )}
      </div>
      <div ref={containerRef} className="w-full" style={{ height }} />
    </div>
  );
}
