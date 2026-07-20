import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/data/provider";
import { R2_CACHE_SYMBOLS } from "@/lib/env";
import type { Timeframe } from "@/lib/types";

/**
 * GET /api/chart/[symbol]?timeframe=1d&from=2024-01-01&to=2024-12-31
 *
 * Returns K-line (candlestick) data for a symbol.
 * - Mock mode: reads from /mock/klines/*.json
 * - Real mode: fetches from Yahoo Finance (with R2 cache for whitelisted symbols)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const { searchParams } = new URL(request.url);

  const timeframe = (searchParams.get("timeframe") || "1d") as Timeframe;
  const to = new Date(searchParams.get("to") || Date.now());
  const fromStr = searchParams.get("from");
  const from = fromStr
    ? new Date(fromStr)
    : new Date(Date.now() - 365 * 86400 * 1000);

  // Validate symbol is in whitelist (Phase 1)
  if (!R2_CACHE_SYMBOLS.has(symbol)) {
    return NextResponse.json(
      {
        error: "Symbol not supported in Phase 1",
        symbol,
        supported: Array.from(R2_CACHE_SYMBOLS),
      },
      { status: 400 },
    );
  }

  try {
    const provider = getProvider();
    const klines = await provider.getKlines(symbol, timeframe, from, to);

    return NextResponse.json({
      symbol,
      timeframe,
      count: klines.length,
      data: klines,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message, symbol },
      { status: 500 },
    );
  }
}
