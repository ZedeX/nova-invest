/**
 * TDD Spec — Epic 04: CSV Export for backtest trade log + metrics
 *
 * Validates:
 *   - csvHeader returns correct column names
 *   - tradeToCsvRow formats single trade correctly
 *   - tradesToCsv with multiple trades
 *   - tradesToCsv with empty array → header only
 *   - CSV escaping: fields with commas, quotes, newlines
 *   - metricsToCsv produces key,value format
 *   - Numbers formatted correctly (decimal places)
 *   - Round-trip: parse CSV output back to objects
 */

import { describe, expect, it } from "vitest";
import type { BacktestMetrics, Trade } from "@/lib/backtest/types";
import {
  csvHeader,
  metricsToCsv,
  tradeToCsvRow,
  tradesToCsv,
} from "@/lib/backtest/csv-export";

// ============ Fixtures ============

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    entry_date: "2025-01-01",
    exit_date: "2025-01-05",
    entry_price: 100,
    exit_price: 110,
    qty: 10,
    pnl: 100,
    pnl_pct: 0.1,
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<BacktestMetrics> = {}): BacktestMetrics {
  return {
    total_return: 0.15,
    sharpe: 1.5,
    sortino: 2.0,
    max_drawdown: 0.08,
    win_rate: 0.6,
    profit_factor: 1.8,
    total_trades: 10,
    avg_hold_days: 5.25,
    ...overrides,
  };
}

// ============ Tests ============

describe("Epic 04: CSV Export", () => {
  // ---------- csvHeader ----------

  it("csvHeader returns correct column names", () => {
    const header = csvHeader();
    expect(header).toBe(
      "entry_date,exit_date,entry_price,exit_price,qty,pnl,pnl_pct",
    );
  });

  // ---------- tradeToCsvRow ----------

  it("tradeToCsvRow formats single trade correctly", () => {
    const trade = makeTrade();
    const row = tradeToCsvRow(trade);
    // entry_date,exit_date,entry_price(4dp),exit_price(4dp),qty(4dp),pnl(4dp),pnl_pct(6dp)
    expect(row).toBe("2025-01-01,2025-01-05,100.0000,110.0000,10.0000,100.0000,0.100000");
  });

  it("tradeToCsvRow formats fractional values with correct decimal places", () => {
    const trade = makeTrade({
      entry_price: 123.456789,
      exit_price: 234.56789,
      qty: 7.891011,
      pnl: -12.34567,
      pnl_pct: -0.0234567,
    });
    const row = tradeToCsvRow(trade);
    const parts = row.split(",");
    expect(parts[2]).toBe("123.4568"); // 4dp, rounded
    expect(parts[3]).toBe("234.5679"); // 4dp, rounded
    expect(parts[4]).toBe("7.8910");   // 4dp
    expect(parts[5]).toBe("-12.3457");  // 4dp, rounded
    expect(parts[6]).toBe("-0.023457"); // 6dp, rounded
  });

  // ---------- tradesToCsv ----------

  it("tradesToCsv with multiple trades", () => {
    const trades = [
      makeTrade({ entry_date: "2025-01-01", exit_date: "2025-01-05" }),
      makeTrade({ entry_date: "2025-02-01", exit_date: "2025-02-10" }),
    ];
    const csv = tradesToCsv(trades);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toBe(csvHeader());
    expect(lines[1]).toContain("2025-01-01");
    expect(lines[2]).toContain("2025-02-01");
  });

  it("tradesToCsv with empty array → header only", () => {
    const csv = tradesToCsv([]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(csvHeader());
  });

  // ---------- CSV escaping ----------

  it("CSV escaping: fields with commas are double-quoted", () => {
    const trade = makeTrade({ entry_date: "Jan, 1" });
    const row = tradeToCsvRow(trade);
    // The entry_date field should be quoted
    expect(row.startsWith('"Jan, 1"')).toBe(true);
  });

  it("CSV escaping: fields with double-quotes escape them by doubling", () => {
    const trade = makeTrade({ entry_date: 'Jan"1' });
    const row = tradeToCsvRow(trade);
    expect(row.startsWith('"Jan""1"')).toBe(true);
  });

  it("CSV escaping: fields with newlines are double-quoted", () => {
    const trade = makeTrade({ entry_date: "Jan\n1" });
    const row = tradeToCsvRow(trade);
    expect(row.startsWith('"Jan\n1"')).toBe(true);
  });

  // ---------- metricsToCsv ----------

  it("metricsToCsv produces key,value format", () => {
    const metrics = makeMetrics();
    const csv = metricsToCsv(metrics);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(8); // 8 metric fields

    // Check each line is key,value
    for (const line of lines) {
      const [key, ...rest] = line.split(",");
      expect(key.length).toBeGreaterThan(0);
      expect(rest.join(",").length).toBeGreaterThan(0);
    }

    // Spot-check specific values
    expect(csv).toContain("total_return,0.150000");
    expect(csv).toContain("sharpe,1.500000");
    expect(csv).toContain("total_trades,10");
    expect(csv).toContain("avg_hold_days,5.2500");
  });

  // ---------- Number formatting ----------

  it("pnl_pct uses 6 decimal places, prices/qty use 4", () => {
    const trade = makeTrade({
      entry_price: 1,
      exit_price: 2,
      qty: 3,
      pnl: 4,
      pnl_pct: 0.5,
    });
    const row = tradeToCsvRow(trade);
    const parts = row.split(",");
    expect(parts[2]).toBe("1.0000");  // entry_price 4dp
    expect(parts[3]).toBe("2.0000");  // exit_price 4dp
    expect(parts[4]).toBe("3.0000");  // qty 4dp
    expect(parts[5]).toBe("4.0000");  // pnl 4dp
    expect(parts[6]).toBe("0.500000"); // pnl_pct 6dp
  });

  // ---------- Round-trip ----------

  it("round-trip: parse CSV output back to objects", () => {
    const trades = [
      makeTrade(),
      makeTrade({
        entry_date: "2025-03-15",
        exit_date: "2025-03-20",
        entry_price: 200.5,
        exit_price: 195.25,
        qty: 50,
        pnl: -262.5,
        pnl_pct: -0.02618,
      }),
    ];
    const csv = tradesToCsv(trades);
    const lines = csv.split("\n");
    const headerLine = lines[0];
    const headers = headerLine.split(",");

    // Parse each data row back
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      expect(values.length).toBe(headers.length);

      const parsed: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        parsed[headers[j]] = values[j];
      }

      // Verify the trade matches
      const original = trades[i - 1];
      expect(parsed.entry_date).toBe(original.entry_date);
      expect(parsed.exit_date).toBe(original.exit_date);
      expect(parseFloat(parsed.entry_price)).toBeCloseTo(original.entry_price, 4);
      expect(parseFloat(parsed.exit_price)).toBeCloseTo(original.exit_price, 4);
      expect(parseFloat(parsed.qty)).toBeCloseTo(original.qty, 4);
      expect(parseFloat(parsed.pnl)).toBeCloseTo(original.pnl, 4);
      expect(parseFloat(parsed.pnl_pct)).toBeCloseTo(original.pnl_pct, 6);
    }
  });
});
