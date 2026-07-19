/**
 * D1 Schema constants + validation (ADR-0011).
 *
 * Sample of 10 tables actually defined in ADR-0011 master schema:
 *   users, symbols, user_profiles, conversation_history, playbooks,
 *   playbook_ratings, playbook_comments, playbook_reports,
 *   user_playbook_installs, url_check_queue
 *
 * Per the task constraint "do NOT invent table names", tables NOT in ADR-0011
 * (agent_traces, agent_steps, kv_session_meta, citations) are excluded.
 *
 * Column lists mirror ADR-0011 §Master Schema verbatim. Required columns are
 * those declared `NOT NULL` (or PK) in ADR-0011. Nullable columns are still
 * listed in `columns` but not in `requiredColumns`.
 */

// ============ Table name constants ============

export const TABLE_NAMES = {
  USERS: "users",
  SYMBOLS: "symbols",
  USER_PROFILES: "user_profiles",
  CONVERSATION_HISTORY: "conversation_history",
  PLAYBOOKS: "playbooks",
  PLAYBOOK_RATINGS: "playbook_ratings",
  PLAYBOOK_COMMENTS: "playbook_comments",
  PLAYBOOK_REPORTS: "playbook_reports",
  USER_PLAYBOOK_INSTALLS: "user_playbook_installs",
  URL_CHECK_QUEUE: "url_check_queue",
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
  [TABLE_NAMES.PLAYBOOKS]: {
    columns: [
      "id", "title", "description", "author_id", "kind",
      "current_version", "lifecycle_status", "created_at", "updated_at",
    ],
    requiredColumns: ["id", "title", "author_id", "kind", "current_version", "lifecycle_status"],
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
  [TABLE_NAMES.USER_PLAYBOOK_INSTALLS]: {
    columns: [
      "user_id", "playbook_id", "package_id",
      "installed_version", "installed_at",
    ],
    requiredColumns: ["user_id", "playbook_id", "package_id", "installed_version"],
  },
  [TABLE_NAMES.URL_CHECK_QUEUE]: {
    columns: [
      "id", "trace_id", "citation_url", "citation_source", "fact_value",
      "status", "checked_at", "http_status", "error_message", "created_at",
    ],
    requiredColumns: ["trace_id", "citation_url", "citation_source", "status"],
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
 *   1. `tableName` is a known table in the sample.
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
