/**
 * CSV Export — Backtest trade log + metrics (Epic 04)
 *
 * Converts `Trade[]` and `BacktestMetrics` objects to CSV strings suitable
 * for download or persistence. Uses standard CSV escaping (RFC 4180):
 *   - Fields containing commas, double-quotes, or newlines are wrapped in
 *     double-quotes; embedded double-quotes are escaped by doubling them.
 *   - Prices/quantities formatted to 4 decimal places.
 *   - pnl_pct formatted to 6 decimal places.
 *   - Empty trades → header only.
 */

import type { BacktestMetrics, Trade } from "./types";

/** Column order for the CSV output */
const CSV_COLUMNS = [
  "entry_date",
  "exit_date",
  "entry_price",
  "exit_price",
  "qty",
  "pnl",
  "pnl_pct",
] as const;

/** CSV header row */
export function csvHeader(): string {
  return CSV_COLUMNS.join(",");
}

/** Escape a single field for CSV output (RFC 4180). */
function escapeField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Convert a single Trade to a CSV row */
export function tradeToCsvRow(trade: Trade): string {
  const fields = [
    escapeField(trade.entry_date),
    escapeField(trade.exit_date),
    trade.entry_price.toFixed(4),
    trade.exit_price.toFixed(4),
    trade.qty.toFixed(4),
    trade.pnl.toFixed(4),
    trade.pnl_pct.toFixed(6),
  ];
  return fields.join(",");
}

/** Convert an array of trades to a full CSV string (header + rows) */
export function tradesToCsv(trades: Trade[]): string {
  const rows = trades.map(tradeToCsvRow);
  return [csvHeader(), ...rows].join("\n");
}

/** Convert backtest metrics to a summary CSV (key,value format) */
export function metricsToCsv(metrics: BacktestMetrics): string {
  const entries: [string, string][] = [
    ["total_return", metrics.total_return.toFixed(6)],
    ["sharpe", metrics.sharpe.toFixed(6)],
    ["sortino", metrics.sortino.toFixed(6)],
    ["max_drawdown", metrics.max_drawdown.toFixed(6)],
    ["win_rate", metrics.win_rate.toFixed(6)],
    ["profit_factor", metrics.profit_factor.toFixed(6)],
    ["total_trades", String(metrics.total_trades)],
    ["avg_hold_days", metrics.avg_hold_days.toFixed(4)],
  ];
  return entries.map(([k, v]) => `${k},${v}`).join("\n");
}
