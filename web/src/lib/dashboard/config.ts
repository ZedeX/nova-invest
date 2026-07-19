/**
 * Dashboard Layout configuration + validation — ADR-0010.
 *
 * Implements:
 *   - WIDGET_TYPES: closed readonly array of 9 widget types
 *   - DEFAULT_DEDUP_INTERVAL_MS: SWR dedupingInterval (5s per ADR-0010)
 *   - LCP_BUDGET_MS: LCP performance budget (2.5s per ADR-0010)
 *   - isWithinGridBounds: grid-bounds predicate
 *   - validateWidgetConfig: per-widget schema + bounds validation
 *   - validateDashboardGrid: grid-level validation (duplicate ids, overlaps)
 */

import type {
  DashboardGridConfig,
  ValidationResult,
  WidgetConfig,
  WidgetType,
} from "./types";

/**
 * Closed set of 9 widget types per ADR-0010 §"Widget Types (9 total)".
 * 6 Phase 1 widgets + 3 Phase 2 widgets.
 */
export const WIDGET_TYPES: readonly WidgetType[] = [
  "kline_chart",
  "ask_agent",
  "watchlist",
  "positions_table",
  "strategy_list",
  "community_feed",
  "credit_balance",
  "backtest_result",
  "news_feed",
] as const;

/**
 * SWR dedupingInterval in milliseconds.
 * Per ADR-0010 §"DashboardSWRConfig": 5000ms dedup window prevents duplicate
 * requests for the same SWR key across widgets.
 */
export const DEFAULT_DEDUP_INTERVAL_MS = 5000;

/**
 * LCP (Largest Contentful Paint) budget in milliseconds.
 * Per ADR-0010 §"Decision": LCP <2s in Mock mode, <3s in Real mode.
 * 2500ms is the midpoint used as the test threshold.
 */
export const LCP_BUDGET_MS = 2500;

/** Total grid columns per ADR-0010. */
const GRID_COLUMNS = 12;

/**
 * Returns true if the widget fits within the 12-column grid horizontally.
 * Does NOT check vertical bounds (rows can grow freely).
 */
export function isWithinGridBounds(
  widget: WidgetConfig,
  columns: 12,
): boolean {
  return widget.grid_position.col + widget.grid_position.w <= columns;
}

/**
 * Validates a single WidgetConfig.
 * Checks: type ∈ WIDGET_TYPES, col ≥ 0, row ≥ 0, w > 0, h > 0, col + w ≤ 12.
 */
export function validateWidgetConfig(w: WidgetConfig): ValidationResult {
  const errors: string[] = [];

  // 1. Type must be in WIDGET_TYPES (runtime check — TS closes the enum at
  //    compile time, but tests/casts can bypass).
  if (!WIDGET_TYPES.includes(w.type)) {
    errors.push(`Invalid widget type: ${String(w.type)}`);
  }

  // 2. col must be >= 0
  if (w.grid_position.col < 0) {
    errors.push("grid_position.col must be >= 0");
  }

  // 3. row must be >= 0
  if (w.grid_position.row < 0) {
    errors.push("grid_position.row must be >= 0");
  }

  // 4. w must be > 0
  if (w.grid_position.w <= 0) {
    errors.push("grid_position.w must be > 0");
  }

  // 5. h must be > 0
  if (w.grid_position.h <= 0) {
    errors.push("grid_position.h must be > 0");
  }

  // 6. col + w must be <= 12 (within grid bounds)
  if (!isWithinGridBounds(w, GRID_COLUMNS)) {
    errors.push(
      `grid_position.col + w (${w.grid_position.col + w.grid_position.w}) exceeds grid columns (${GRID_COLUMNS})`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a DashboardGridConfig.
 * Checks: no duplicate widget ids, every widget passes validateWidgetConfig,
 * no two widgets overlap on the grid.
 */
export function validateDashboardGrid(
  grid: DashboardGridConfig,
): ValidationResult {
  const errors: string[] = [];

  // 1. Detect duplicate widget ids
  const seenIds = new Set<string>();
  for (const w of grid.widgets) {
    if (seenIds.has(w.id)) {
      errors.push(`Duplicate widget id: ${w.id}`);
    } else {
      seenIds.add(w.id);
    }
  }

  // 2. Validate each widget individually
  for (const w of grid.widgets) {
    const r = validateWidgetConfig(w);
    if (!r.valid) {
      for (const e of r.errors) {
        errors.push(`[widget ${w.id}] ${e}`);
      }
    }
  }

  // 3. Detect overlapping widgets (pairwise rectangle intersection)
  for (let i = 0; i < grid.widgets.length; i++) {
    for (let j = i + 1; j < grid.widgets.length; j++) {
      const a = grid.widgets[i];
      const b = grid.widgets[j];
      if (rectsOverlap(a, b)) {
        errors.push(`Widgets overlap: ${a.id} and ${b.id}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns true if two widgets' grid rectangles intersect.
 * Two ranges [a1, a2) and [b1, b2) overlap iff a1 < b2 && b1 < a2.
 */
function rectsOverlap(a: WidgetConfig, b: WidgetConfig): boolean {
  const aCol1 = a.grid_position.col;
  const aCol2 = a.grid_position.col + a.grid_position.w;
  const aRow1 = a.grid_position.row;
  const aRow2 = a.grid_position.row + a.grid_position.h;

  const bCol1 = b.grid_position.col;
  const bCol2 = b.grid_position.col + b.grid_position.w;
  const bRow1 = b.grid_position.row;
  const bRow2 = b.grid_position.row + b.grid_position.h;

  // Intervals are half-open [start, end); overlap iff strict inequality on both ends.
  return aCol1 < bCol2 && bCol1 < aCol2 && aRow1 < bRow2 && bRow1 < aRow2;
}
