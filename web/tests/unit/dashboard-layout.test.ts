/**
 * TDD Spec — ADR-0010: Dashboard Layout + Widget System
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0010-dashboard-layout.md
 *
 * Test scope (per task plan — rewritten to test dashboard LAYOUT, not indicators):
 *   - WidgetConfig schema validation (type, grid_position bounds)
 *   - DashboardGridConfig validation (duplicate ids, overlapping widgets)
 *   - WIDGET_TYPES closed enum (9 types)
 *   - DEFAULT_DEDUP_INTERVAL_MS / LCP_BUDGET_MS constants
 *   - isWithinGridBounds predicate
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DEDUP_INTERVAL_MS,
  LCP_BUDGET_MS,
  WIDGET_TYPES,
  isWithinGridBounds,
  validateDashboardGrid,
  validateWidgetConfig,
} from "@/lib/dashboard/config";
import type { DashboardGridConfig, WidgetConfig } from "@/lib/dashboard/types";

// Helper: build a valid widget fixture
function makeWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "w1",
    type: "kline_chart",
    title: "K-Line Chart",
    grid_position: { col: 0, row: 0, w: 8, h: 4 },
    data_source: "/api/kline/AAPL",
    refresh_interval_ms: 30_000,
    error_boundary: true,
    ...overrides,
  };
}

// Helper: build a valid grid fixture
function makeGrid(widgets: WidgetConfig[]): DashboardGridConfig {
  return { widgets, columns: 12, gap: 16 };
}

describe("ADR-0010: Dashboard Layout + Widget System", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ---------- WIDGET_TYPES closed enum (9 types) ----------

  it("WIDGET_TYPES has exactly 9 types", () => {
    expect(WIDGET_TYPES).toHaveLength(9);
  });

  it("WIDGET_TYPES contains all 9 expected types", () => {
    expect([...WIDGET_TYPES]).toEqual([
      "kline_chart",
      "ask_agent",
      "watchlist",
      "positions_table",
      "strategy_list",
      "community_feed",
      "credit_balance",
      "backtest_result",
      "news_feed",
    ]);
  });

  // ---------- Constants ----------

  it("DEFAULT_DEDUP_INTERVAL_MS === 5000 (SWR dedupingInterval per ADR-0010)", () => {
    expect(DEFAULT_DEDUP_INTERVAL_MS).toBe(5000);
  });

  it("LCP_BUDGET_MS === 2500 (LCP budget per ADR-0010)", () => {
    expect(LCP_BUDGET_MS).toBe(2500);
  });

  // ---------- validateWidgetConfig ----------

  it("validateWidgetConfig accepts a valid widget config", () => {
    const result = validateWidgetConfig(makeWidget());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validateWidgetConfig rejects widget with invalid type (not in WIDGET_TYPES)", () => {
    const bad = makeWidget({ type: "invalid_type" as unknown as WidgetConfig["type"] });
    const result = validateWidgetConfig(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateWidgetConfig rejects widget with col < 0", () => {
    const bad = makeWidget({
      grid_position: { col: -1, row: 0, w: 4, h: 2 },
    });
    const result = validateWidgetConfig(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateWidgetConfig rejects widget with row < 0", () => {
    const bad = makeWidget({
      grid_position: { col: 0, row: -1, w: 4, h: 2 },
    });
    const result = validateWidgetConfig(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateWidgetConfig rejects widget with w <= 0 or h <= 0", () => {
    const badW = makeWidget({
      grid_position: { col: 0, row: 0, w: 0, h: 2 },
    });
    expect(validateWidgetConfig(badW).valid).toBe(false);

    const badH = makeWidget({
      grid_position: { col: 0, row: 0, w: 4, h: -1 },
    });
    expect(validateWidgetConfig(badH).valid).toBe(false);
  });

  it("validateWidgetConfig rejects widget with col + w > 12 (out of grid bounds)", () => {
    const bad = makeWidget({
      grid_position: { col: 8, row: 0, w: 5, h: 2 }, // 8 + 5 = 13 > 12
    });
    const result = validateWidgetConfig(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // ---------- isWithinGridBounds ----------

  it("isWithinGridBounds returns true for widget at col=0, w=12 (full row)", () => {
    const w = makeWidget({
      grid_position: { col: 0, row: 0, w: 12, h: 2 },
    });
    expect(isWithinGridBounds(w, 12)).toBe(true);
  });

  it("isWithinGridBounds returns false for widget at col=8, w=5 (8+5=13 > 12)", () => {
    const w = makeWidget({
      grid_position: { col: 8, row: 0, w: 5, h: 2 },
    });
    expect(isWithinGridBounds(w, 12)).toBe(false);
  });

  // ---------- validateDashboardGrid ----------

  it("validateDashboardGrid accepts grid with valid widgets", () => {
    const grid = makeGrid([
      makeWidget({ id: "w1", grid_position: { col: 0, row: 0, w: 8, h: 4 } }),
      makeWidget({ id: "w2", grid_position: { col: 8, row: 0, w: 4, h: 4 } }),
    ]);
    const result = validateDashboardGrid(grid);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validateDashboardGrid rejects grid with duplicate widget ids", () => {
    const grid = makeGrid([
      makeWidget({ id: "dup", grid_position: { col: 0, row: 0, w: 4, h: 2 } }),
      makeWidget({ id: "dup", grid_position: { col: 4, row: 0, w: 4, h: 2 } }),
    ]);
    const result = validateDashboardGrid(grid);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateDashboardGrid rejects grid with overlapping widgets", () => {
    // w1: col=0..8, row=0..2 ; w2: col=4..12, row=1..3 → overlap at col 4..8, row 1..2
    const grid = makeGrid([
      makeWidget({ id: "w1", grid_position: { col: 0, row: 0, w: 8, h: 2 } }),
      makeWidget({ id: "w2", grid_position: { col: 4, row: 1, w: 8, h: 2 } }),
    ]);
    const result = validateDashboardGrid(grid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /overlap/i.test(e))).toBe(true);
  });
});
