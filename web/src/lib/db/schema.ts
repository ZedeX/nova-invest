/**
 * D1 Schema constants + validation (ADR-0011 Master Schema).
 *
 * Full 24-table master schema per ADR-0011 §Master Schema (Migrations 001-009):
 *   001: users, symbols                                  (lookup tables)
 *   002: watchlists, watchlist_items, kline_cache_index, fundamentals  (EP02 Data Layer)
 *   003: user_profiles, conversation_history              (EP03 Ask Agent memory)
 *   004: strategies, backtest_results                     (EP04 Strategy DSL)
 *   005: broker_accounts, orders, positions, trades       (EP06 Broker)
 *   006: playbooks, playbook_versions, playbook_dependencies  (EP08 Playbook)
 *   007: community_playbooks, user_playbook_installs, playbook_ratings,
 *        playbook_comments, playbook_reports              (EP07 Community UGC)
 *   008: url_check_queue                                  (ADR-0007 Citation URL Check)
 *   009: rag_chunks, news_articles                        (ADR-0014 RAG Metadata)
 *
 * Column lists mirror ADR-0011 §Master Schema verbatim. Required columns are
 * those declared `NOT NULL` (or PK) in ADR-0011. Nullable columns are still
 * listed in `columns` but not in `requiredColumns`.
 */

// ============ Table name constants ============

export const TABLE_NAMES = {
  // Migration 001 (lookup tables)
  USERS: "users",
  SYMBOLS: "symbols",
  // Migration 002 (EP02 Data Layer)
  WATCHLISTS: "watchlists",
  WATCHLIST_ITEMS: "watchlist_items",
  KLINE_CACHE_INDEX: "kline_cache_index",
  FUNDAMENTALS: "fundamentals",
  // Migration 003 (EP03 Ask Agent memory)
  USER_PROFILES: "user_profiles",
  CONVERSATION_HISTORY: "conversation_history",
  // Migration 004 (EP04 Strategy DSL)
  STRATEGIES: "strategies",
  BACKTEST_RESULTS: "backtest_results",
  // Migration 005 (EP06 Broker)
  BROKER_ACCOUNTS: "broker_accounts",
  ORDERS: "orders",
  POSITIONS: "positions",
  TRADES: "trades",
  // Migration 006 (EP08 Playbook System)
  PLAYBOOKS: "playbooks",
  PLAYBOOK_VERSIONS: "playbook_versions",
  PLAYBOOK_DEPENDENCIES: "playbook_dependencies",
  // Migration 007 (EP07 Community UGC)
  COMMUNITY_PLAYBOOKS: "community_playbooks",
  USER_PLAYBOOK_INSTALLS: "user_playbook_installs",
  PLAYBOOK_RATINGS: "playbook_ratings",
  PLAYBOOK_COMMENTS: "playbook_comments",
  PLAYBOOK_REPORTS: "playbook_reports",
  // Migration 008 (ADR-0007 Citation URL Check)
  URL_CHECK_QUEUE: "url_check_queue",
  // Migration 009 (ADR-0014 RAG Metadata)
  RAG_CHUNKS: "rag_chunks",
  NEWS_ARTICLES: "news_articles",
} as const;

export type D1TableName = (typeof TABLE_NAMES)[keyof typeof TABLE_NAMES];

// ============ Column metadata (per ADR-0011 §Master Schema) ============

interface TableSchema {
  /** All columns declared in ADR-0011, in declaration order. */
  columns: string[];
  /** Subset of `columns` that are NOT NULL (or PK). */
  requiredColumns: string[];
}

const SCHEMA: Record<D1TableName, TableSchema> = {
  // ---------- Migration 001: users + symbols ----------
  [TABLE_NAMES.USERS]: {
    columns: ["id", "email", "name", "created_at", "updated_at"],
    requiredColumns: ["id", "email"],
  },
  [TABLE_NAMES.SYMBOLS]: {
    columns: [
      "ticker", "name", "exchange", "sector", "industry",
      "market_cap", "is_mockup", "created_at",
    ],
    requiredColumns: ["ticker", "name", "exchange"],
  },

  // ---------- Migration 002: EP02 Data Layer ----------
  [TABLE_NAMES.WATCHLISTS]: {
    columns: ["id", "user_id", "name", "created_at"],
    requiredColumns: ["user_id", "name"],
  },
  [TABLE_NAMES.WATCHLIST_ITEMS]: {
    columns: ["watchlist_id", "ticker", "added_at"],
    requiredColumns: ["watchlist_id", "ticker"],
  },
  [TABLE_NAMES.KLINE_CACHE_INDEX]: {
    columns: ["ticker", "timeframe", "cached_at", "r2_key"],
    requiredColumns: ["ticker", "timeframe", "cached_at", "r2_key"],
  },
  [TABLE_NAMES.FUNDAMENTALS]: {
    columns: ["ticker", "field", "value", "period", "updated_at"],
    requiredColumns: ["ticker", "field"],
  },

  // ---------- Migration 003: EP03 Ask Agent (memory) ----------
  [TABLE_NAMES.USER_PROFILES]: {
    columns: [
      "user_id", "risk_tolerance", "sectors_json",
      "preferred_sources", "created_at", "updated_at",
    ],
    requiredColumns: ["user_id"],
  },
  [TABLE_NAMES.CONVERSATION_HISTORY]: {
    columns: [
      "id", "user_id", "session_id", "role",
      "content", "metadata_json", "created_at",
    ],
    requiredColumns: ["user_id", "session_id", "role"],
  },

  // ---------- Migration 004: EP04 Strategy DSL ----------
  [TABLE_NAMES.STRATEGIES]: {
    columns: [
      "id", "user_id", "name", "dsl_yaml",
      "lifecycle_status", "created_at", "updated_at",
    ],
    requiredColumns: ["id", "user_id", "name", "dsl_yaml", "lifecycle_status"],
  },
  [TABLE_NAMES.BACKTEST_RESULTS]: {
    columns: ["id", "strategy_id", "result_json", "run_at"],
    requiredColumns: ["strategy_id", "result_json"],
  },

  // ---------- Migration 005: EP06 Broker Integration ----------
  [TABLE_NAMES.BROKER_ACCOUNTS]: {
    columns: [
      "id", "user_id", "broker_name", "mode",
      "balance", "currency", "created_at",
    ],
    requiredColumns: ["id", "user_id", "broker_name", "mode"],
  },
  [TABLE_NAMES.ORDERS]: {
    columns: [
      "id", "user_id", "account_id", "ticker",
      "side", "type", "quantity", "limit_price", "stop_price",
      "order_status", "filled_qty", "filled_price",
      "created_at", "updated_at", "strategy_id",
    ],
    requiredColumns: [
      "id", "user_id", "account_id", "ticker",
      "side", "type", "quantity", "order_status",
    ],
  },
  [TABLE_NAMES.POSITIONS]: {
    columns: [
      "id", "user_id", "account_id", "ticker",
      "quantity", "avg_price", "current_price",
      "unrealized_pnl", "updated_at",
    ],
    requiredColumns: ["user_id", "account_id", "ticker", "quantity", "avg_price"],
  },
  [TABLE_NAMES.TRADES]: {
    columns: [
      "id", "order_id", "ticker", "side",
      "quantity", "price", "commission", "executed_at",
    ],
    requiredColumns: ["order_id", "ticker", "side", "quantity", "price"],
  },

  // ---------- Migration 006: EP08 Playbook System ----------
  [TABLE_NAMES.PLAYBOOKS]: {
    columns: [
      "id", "title", "description", "author_id", "kind",
      "current_version", "lifecycle_status", "created_at", "updated_at",
    ],
    requiredColumns: ["id", "title", "author_id", "kind", "current_version", "lifecycle_status"],
  },
  [TABLE_NAMES.PLAYBOOK_VERSIONS]: {
    columns: [
      "playbook_id", "version", "yaml_r2_key",
      "changelog", "published_by", "published_at",
    ],
    requiredColumns: ["playbook_id", "version", "yaml_r2_key", "published_by"],
  },
  [TABLE_NAMES.PLAYBOOK_DEPENDENCIES]: {
    columns: [
      "parent_id", "child_id", "child_version",
      "dependency_type", "weight", "created_at",
    ],
    requiredColumns: ["parent_id", "child_id", "dependency_type"],
  },

  // ---------- Migration 007: EP07 Community UGC ----------
  [TABLE_NAMES.COMMUNITY_PLAYBOOKS]: {
    columns: [
      "package_id", "playbook_id", "author_id",
      "title", "description", "tags_json", "content_hash",
      "version", "moderation_status",
      "installed_count", "rating_avg", "rating_count", "created_at",
    ],
    requiredColumns: [
      "package_id", "playbook_id", "author_id",
      "title", "moderation_status",
    ],
  },
  [TABLE_NAMES.USER_PLAYBOOK_INSTALLS]: {
    columns: [
      "user_id", "playbook_id", "package_id",
      "installed_version", "installed_at",
    ],
    requiredColumns: ["user_id", "playbook_id", "package_id", "installed_version"],
  },
  [TABLE_NAMES.PLAYBOOK_RATINGS]: {
    columns: ["user_id", "package_id", "rating", "created_at"],
    requiredColumns: ["user_id", "package_id", "rating"],
  },
  [TABLE_NAMES.PLAYBOOK_COMMENTS]: {
    columns: [
      "id", "package_id", "user_id", "content",
      "parent_id", "moderation_status", "created_at",
    ],
    requiredColumns: ["package_id", "user_id", "content", "moderation_status"],
  },
  [TABLE_NAMES.PLAYBOOK_REPORTS]: {
    columns: [
      "id", "package_id", "reporter_id", "reason",
      "description", "moderation_status", "created_at",
    ],
    requiredColumns: ["package_id", "reporter_id", "reason", "moderation_status"],
  },

  // ---------- Migration 008: ADR-0007 Citation URL Check ----------
  [TABLE_NAMES.URL_CHECK_QUEUE]: {
    columns: [
      "id", "trace_id", "citation_url", "citation_source", "fact_value",
      "status", "checked_at", "http_status", "error_message", "created_at",
    ],
    requiredColumns: ["trace_id", "citation_url", "citation_source", "status"],
  },

  // ---------- Migration 009: ADR-0014 RAG Metadata ----------
  [TABLE_NAMES.RAG_CHUNKS]: {
    columns: [
      "id", "source_type", "source_id", "ticker",
      "title", "snippet", "chunk_index",
      "r2_key", "url", "date", "indexed_at",
    ],
    requiredColumns: ["id", "source_type", "source_id", "title", "snippet"],
  },
  [TABLE_NAMES.NEWS_ARTICLES]: {
    columns: [
      "id", "source", "title", "snippet",
      "ticker", "url", "r2_key",
      "published_at", "indexed_at",
    ],
    requiredColumns: ["id", "source", "title", "snippet", "url", "published_at"],
  },
};

// ============ Validator ============

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a row against its ADR-0011 table schema.
 *
 * Checks:
 *   1. `tableName` is a known table in the master schema.
 *   2. Every `requiredColumns` entry is present in `rowData` (value may be
 *      null/undefined; we check key presence, matching D1 INSERT semantics
 *      where missing NOT NULL columns cause bind errors).
 *
 * Does NOT validate column types or unknown columns — ADR-0011 schema
 * enforcement is the responsibility of D1 itself (PRAGMA foreign_keys + NOT
 * NULL constraints). This validator is a programmatic pre-flight check.
 */
export function validateSchema(
  tableName: string,
  rowData: Record<string, unknown>,
): SchemaValidationResult {
  const errors: string[] = [];
  const tableKey = tableNamesKey(tableName);
  const schema = tableKey ? SCHEMA[tableKey] : undefined;
  if (!schema) {
    return {
      valid: false,
      errors: [`unknown table: ${tableName}`],
    };
  }
  if (!rowData || typeof rowData !== "object") {
    return {
      valid: false,
      errors: ["rowData must be an object"],
    };
  }
  for (const col of schema.requiredColumns) {
    if (!(col in rowData)) {
      errors.push(`missing required column: ${col}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Look up columns for a table (returns undefined for unknown tables). */
export function getTableColumns(tableName: string): string[] | undefined {
  const tableKey = tableNamesKey(tableName);
  return tableKey ? SCHEMA[tableKey]?.columns : undefined;
}

/** Returns the list of all table names defined in the master schema. */
export function listAllTables(): string[] {
  return Object.values(TABLE_NAMES);
}

// ============ Helpers ============

function tableNamesKey(tableName: string): D1TableName | undefined {
  // Reverse lookup: find the TABLE_NAMES key whose value matches tableName.
  for (const key of Object.keys(TABLE_NAMES) as Array<keyof typeof TABLE_NAMES>) {
    if (TABLE_NAMES[key] === tableName) {
      return TABLE_NAMES[key];
    }
  }
  return undefined;
}
