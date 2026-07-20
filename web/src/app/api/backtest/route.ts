import { NextRequest, NextResponse } from "next/server";
import { BacktestEngine } from "@/lib/backtest/engine";
import type { BacktestConfig } from "@/lib/backtest/types";
import { getProvider } from "@/lib/data/provider";
import type { Strategy } from "@/lib/backtest/types";

/**
 * POST /api/backtest
 * Body: {
 *   strategy: Strategy,      // { evaluate(ctx) => "BUY"|"SELL"|"HOLD" }
 *   symbol: string,          // e.g. "AAPL"
 *   start_date: string,      // ISO date
 *   end_date: string,        // ISO date
 *   initial_capital: number, // default 100000
 *   fee_bps: number,         // default 5
 *   slippage_bps: number,    // default 5
 * }
 *
 * Returns: BacktestResult (per ADR-0009)
 */

interface BacktestRequest {
  // Strategy is sent as a DSL YAML string; server compiles to Strategy object
  dsl_yaml?: string;
  // For Phase 1 simplicity, allow sending a pre-compiled strategy spec
  strategy_name?: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital?: number;
  fee_bps?: number;
  slippage_bps?: number;
}

/**
 * Compile a YAML DSL string into a Strategy object.
 * Phase 1: stub implementation that returns a simple SMA crossover strategy.
 * Full DSL compilation is ADR-0008 Phase-2 work.
 */
function compileStrategy(_dsl_yaml: string): Strategy {
  // Phase-1 simplified: SMA(20) crossover
  return {
    evaluate(ctx) {
      const klines = ctx.klines;
      if (klines.length < 21) return "HOLD";
      const sma20 = klines.slice(-20).reduce((s, k) => s + k.c, 0) / 20;
      const last = klines[klines.length - 1];
      return last.c > sma20 ? "BUY" : "SELL";
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BacktestRequest;

    if (!body.symbol || !body.start_date || !body.end_date) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, start_date, end_date" },
        { status: 400 },
      );
    }

    if (!body.dsl_yaml && !body.strategy_name) {
      return NextResponse.json(
        { error: "Missing required: either dsl_yaml or strategy_name" },
        { status: 400 },
      );
    }

    // Fetch K-line data
    const provider = getProvider();
    const klines = await provider.getKlines(
      body.symbol.toUpperCase(),
      "1d",
      new Date(body.start_date),
      new Date(body.end_date),
    );

    if (klines.length === 0) {
      return NextResponse.json(
        { error: `No kline data for ${body.symbol} in the given date range` },
        { status: 404 },
      );
    }

    // Compile strategy
    const strategy = compileStrategy(body.dsl_yaml || "sma20_crossover");

    // Run backtest
    const config: BacktestConfig = {
      strategy,
      start_date: body.start_date,
      end_date: body.end_date,
      initial_capital: body.initial_capital ?? 100000,
      fee_bps: body.fee_bps ?? 5,
      slippage_bps: body.slippage_bps ?? 5,
    };

    const engine = new BacktestEngine(config);
    const result = await engine.run(klines);

    return NextResponse.json({
      symbol: body.symbol.toUpperCase(),
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
