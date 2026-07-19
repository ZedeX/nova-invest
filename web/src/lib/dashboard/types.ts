/**
 * Dashboard Layout types — ADR-0010.
 *
 * WidgetType is a closed enum of 9 widget types (6 Phase 1 + 3 Phase 2).
 * WidgetConfig describes a widget's grid placement and data source.
 * DashboardGridConfig describes the 12-column grid container.
 *
 * NOTE: Per task plan, this module covers dashboard LAYOUT only (grid + widget
 * config validation). It does NOT cover the indicator library — indicators
 * belong to ADR-0013 (Playbook) / ADR-0008 (Strategy DSL).
 */

/** Closed enum of 9 widget types per ADR-0010 §"Widget Types (9 total)". */
export type WidgetType =
  | "kline_chart"
  | "ask_agent"
  | "watchlist"
  | "positions_table"
  | "strategy_list"
  | "community_feed"
  | "credit_balance"
  | "backtest_result"
  | "news_feed";

/** Grid position on the 12-column dashboard grid. */
export interface GridPosition {
  /** Starting column (0-indexed, 0..11). */
  col: number;
  /** Starting row (0-indexed). */
  row: number;
  /** Width in columns (must be > 0; col + w must be <= 12). */
  w: number;
  /** Height in rows (must be > 0). */
  h: number;
}

/**
 * Widget descriptor — placement + data source for a single widget on the
 * dashboard grid.
 */
export interface WidgetConfig {
  /** Unique identifier within the dashboard. */
  id: string;
  /** Widget type — must be a member of WIDGET_TYPES. */
  type: WidgetType;
  /** Display title (rendered in the widget header). */
  title: string;
  /** Grid placement on the 12-column dashboard grid. */
  grid_position: GridPosition;
  /** Optional data source URL / API key (e.g., "/api/kline/AAPL"). */
  data_source?: string;
  /** Optional refresh interval in milliseconds (polling mode only). */
  refresh_interval_ms?: number;
  /** Whether this widget is wrapped in its own ErrorBoundary (default true). */
  error_boundary?: boolean;
}

/**
 * Dashboard grid container — 12 columns, fixed gap.
 */
export interface DashboardGridConfig {
  /** Ordered list of widgets rendered top-to-bottom on the grid. */
  widgets: WidgetConfig[];
  /** Total columns (always 12 per ADR-0010). */
  columns: 12;
  /** Gap between grid cells in pixels (matches Tailwind gap-4 = 16px). */
  gap: 16;
}

/** Result of widget / grid validation. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
