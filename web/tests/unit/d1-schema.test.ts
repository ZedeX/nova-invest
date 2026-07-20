/**
 * TDD Spec — ADR-0011: D1 Schema Master (Cross-Epic Unification)
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0011-d1-schema-master.md
 *
 * Full 24-table master schema per ADR-0011 (Migrations 001-009):
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
 * Source of truth: docs/architecture/adr-0011-d1-schema-master.md §Master Schema
 */

import { beforeEach, describe, expect, it } from "vitest";

describe("ADR-0011: D1 Schema Master", () => {
  beforeEach(() => {
    // No module state to reset, but keep symmetry with other ADR tests.
  });

  // ---------- §Validation Criteria #1: schema exports table names ----------

  it("schema exports all 25 table names as constants", async () => {
    const { TABLE_NAMES, listAllTables } = await import("@/lib/db/schema");
    expect(TABLE_NAMES).toBeDefined();
    // All 24 tables per ADR-0011 §Master Schema.
    expect(TABLE_NAMES.USERS).toBe("users");
    expect(TABLE_NAMES.SYMBOLS).toBe("symbols");
    // Migration 002 (EP02 Data Layer)
    expect(TABLE_NAMES.WATCHLISTS).toBe("watchlists");
    expect(TABLE_NAMES.WATCHLIST_ITEMS).toBe("watchlist_items");
    expect(TABLE_NAMES.KLINE_CACHE_INDEX).toBe("kline_cache_index");
    expect(TABLE_NAMES.FUNDAMENTALS).toBe("fundamentals");
    // Migration 003 (EP03 Ask Agent memory)
    expect(TABLE_NAMES.USER_PROFILES).toBe("user_profiles");
    expect(TABLE_NAMES.CONVERSATION_HISTORY).toBe("conversation_history");
    // Migration 004 (EP04 Strategy DSL)
    expect(TABLE_NAMES.STRATEGIES).toBe("strategies");
    expect(TABLE_NAMES.BACKTEST_RESULTS).toBe("backtest_results");
    // Migration 005 (EP06 Broker)
    expect(TABLE_NAMES.BROKER_ACCOUNTS).toBe("broker_accounts");
    expect(TABLE_NAMES.ORDERS).toBe("orders");
    expect(TABLE_NAMES.POSITIONS).toBe("positions");
    expect(TABLE_NAMES.TRADES).toBe("trades");
    // Migration 006 (EP08 Playbook System)
    expect(TABLE_NAMES.PLAYBOOKS).toBe("playbooks");
    expect(TABLE_NAMES.PLAYBOOK_VERSIONS).toBe("playbook_versions");
    expect(TABLE_NAMES.PLAYBOOK_DEPENDENCIES).toBe("playbook_dependencies");
    // Migration 007 (EP07 Community UGC)
    expect(TABLE_NAMES.COMMUNITY_PLAYBOOKS).toBe("community_playbooks");
    expect(TABLE_NAMES.USER_PLAYBOOK_INSTALLS).toBe("user_playbook_installs");
    expect(TABLE_NAMES.PLAYBOOK_RATINGS).toBe("playbook_ratings");
    expect(TABLE_NAMES.PLAYBOOK_COMMENTS).toBe("playbook_comments");
    expect(TABLE_NAMES.PLAYBOOK_REPORTS).toBe("playbook_reports");
    // Migration 008 (ADR-0007 Citation URL Check)
    expect(TABLE_NAMES.URL_CHECK_QUEUE).toBe("url_check_queue");
    // Migration 009 (ADR-0014 RAG Metadata)
    expect(TABLE_NAMES.RAG_CHUNKS).toBe("rag_chunks");
    expect(TABLE_NAMES.NEWS_ARTICLES).toBe("news_articles");

    // Count check: exactly 25 tables in master schema.
    //
    // NOTE: ADR-0011 §Context text says "24 tables (22 base + users + url_check_queue)"
    // but the Master Schema DDL (Migrations 001-009) actually defines 25 tables:
    //   001: users, symbols (2)
    //   002: watchlists, watchlist_items, kline_cache_index, fundamentals (4)
    //   003: user_profiles, conversation_history (2)
    //   004: strategies, backtest_results (2)
    //   005: broker_accounts, orders, positions, trades (4)
    //   006: playbooks, playbook_versions, playbook_dependencies (3)
    //   007: community_playbooks, user_playbook_installs, playbook_ratings,
    //        playbook_comments, playbook_reports (5)
    //   008: url_check_queue (1)
    //   009: rag_chunks, news_articles (2 - added by ADR-0014 amendment)
    // Total = 2+4+2+2+4+3+5+1+2 = 25
    //
    // ADR-0014 added Migration 009 (2 tables) AFTER ADR-0011 was Accepted.
    // ADR-0011 §Context + §Performance still say "24" - this is a known ADR
    // documentation drift; the DDL is the canonical source of truth.
    expect(listAllTables()).toHaveLength(25);
  });

  // ---------- §Validation Criteria #2: validateSchema happy path ----------

  it("validateSchema(tableName, rowData) returns true for a valid row", async () => {
    const { validateSchema, TABLE_NAMES } = await import("@/lib/db/schema");
    const validRow = {
      id: 1,
      user_id: "user_mock_001",
      session_id: "sess-1",
      role: "user",
      content: "what's AAPL price?",
      metadata_json: '{"intent":"simple_qa"}',
      created_at: "2026-07-19T00:00:00Z",
    };
    const result = validateSchema(TABLE_NAMES.CONVERSATION_HISTORY, validRow);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // ---------- §Validation Criteria #3: validateSchema failure path ----------

  it("validateSchema(tableName, rowData) returns false for invalid row (missing required column)", async () => {
    const { validateSchema, TABLE_NAMES } = await import("@/lib/db/schema");
    // Missing required `user_id` column.
    const invalidRow = {
      id: 1,
      session_id: "sess-1",
      role: "user",
      content: "hello",
      created_at: "2026-07-19T00:00:00Z",
    };
    const result = validateSchema(TABLE_NAMES.CONVERSATION_HISTORY, invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("user_id"))).toBe(true);
  });

  // ---------- §Master Schema per-table column verification ----------
  //
  // The next 5 tests verify schema.ts column lists match ADR-0011 §Master
  // Schema verbatim for 5 representative tables (one per Migration 003/007/008).
  // This catches drift between schema.ts and ADR-0011 (e.g., someone adds an
  // `intent` column to conversation_history without updating ADR-0011).
  //
  // Source of truth: docs/architecture/adr-0011-d1-schema-master.md
  //   - Migration 003: user_profiles, conversation_history
  //   - Migration 007: playbook_ratings, user_playbook_installs
  //   - Migration 008: url_check_queue

  it("conversation_history columns match ADR-0011 Migration 003", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.CONVERSATION_HISTORY);
    expect(cols).toEqual([
      "id",
      "user_id",
      "session_id",
      "role",
      "content",
      "metadata_json",
      "created_at",
    ]);
  });

  it("user_profiles columns match ADR-0011 Migration 003", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.USER_PROFILES);
    expect(cols).toEqual([
      "user_id",
      "risk_tolerance",
      "sectors_json",
      "preferred_sources",
      "created_at",
      "updated_at",
    ]);
  });

  it("playbook_ratings columns match ADR-0011 Migration 007", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.PLAYBOOK_RATINGS);
    expect(cols).toEqual([
      "user_id",
      "package_id",
      "rating",
      "created_at",
    ]);
  });

  it("user_playbook_installs columns match ADR-0011 Migration 007 (EP07+EP08 merged)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.USER_PLAYBOOK_INSTALLS);
    expect(cols).toEqual([
      "user_id",
      "playbook_id",
      "package_id",
      "installed_version",
      "installed_at",
    ]);
  });

  it("url_check_queue columns match ADR-0011 Migration 008 (ADR-0007)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.URL_CHECK_QUEUE);
    expect(cols).toEqual([
      "id",
      "trace_id",
      "citation_url",
      "citation_source",
      "fact_value",
      "status",
      "checked_at",
      "http_status",
      "error_message",
      "created_at",
    ]);
  });

  // ---------- New tables (added 2026-07-20) — full 24-table coverage ----------

  it("watchlists columns match ADR-0011 Migration 002 (EP02)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.WATCHLISTS);
    expect(cols).toEqual(["id", "user_id", "name", "created_at"]);
  });

  it("watchlist_items columns match ADR-0011 Migration 002 (EP02)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.WATCHLIST_ITEMS);
    expect(cols).toEqual(["watchlist_id", "ticker", "added_at"]);
  });

  it("kline_cache_index columns match ADR-0011 Migration 002 (EP02)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.KLINE_CACHE_INDEX);
    expect(cols).toEqual(["ticker", "timeframe", "cached_at", "r2_key"]);
  });

  it("fundamentals columns match ADR-0011 Migration 002 (EP02)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.FUNDAMENTALS);
    expect(cols).toEqual(["ticker", "field", "value", "period", "updated_at"]);
  });

  it("strategies columns match ADR-0011 Migration 004 (EP04)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.STRATEGIES);
    expect(cols).toEqual([
      "id",
      "user_id",
      "name",
      "dsl_yaml",
      "lifecycle_status",
      "created_at",
      "updated_at",
    ]);
  });

  it("backtest_results columns match ADR-0011 Migration 004 (EP04)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.BACKTEST_RESULTS);
    expect(cols).toEqual(["id", "strategy_id", "result_json", "run_at"]);
  });

  it("broker_accounts columns match ADR-0011 Migration 005 (EP06)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.BROKER_ACCOUNTS);
    expect(cols).toEqual([
      "id",
      "user_id",
      "broker_name",
      "mode",
      "balance",
      "currency",
      "created_at",
    ]);
  });

  it("orders columns match ADR-0011 Migration 005 (EP06, ticker not symbol)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.ORDERS);
    expect(cols).toEqual([
      "id",
      "user_id",
      "account_id",
      "ticker", // renamed from `symbol` per ADR-0011 §Naming Conventions
      "side",
      "type",
      "quantity",
      "limit_price",
      "stop_price",
      "order_status", // prefixed from `status` per ADR-0011 §Naming Conventions
      "filled_qty",
      "filled_price",
      "created_at",
      "updated_at",
      "strategy_id",
    ]);
  });

  it("positions columns match ADR-0011 Migration 005 (EP06, ticker not symbol)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.POSITIONS);
    expect(cols).toEqual([
      "id",
      "user_id",
      "account_id",
      "ticker",
      "quantity",
      "avg_price",
      "current_price",
      "unrealized_pnl",
      "updated_at",
    ]);
  });

  it("trades columns match ADR-0011 Migration 005 (EP06)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.TRADES);
    expect(cols).toEqual([
      "id",
      "order_id",
      "ticker",
      "side",
      "quantity",
      "price",
      "commission",
      "executed_at",
    ]);
  });

  it("playbooks columns match ADR-0011 Migration 006 (EP08, lifecycle_status)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.PLAYBOOKS);
    expect(cols).toEqual([
      "id",
      "title",
      "description",
      "author_id",
      "kind",
      "current_version",
      "lifecycle_status", // prefixed from `status`
      "created_at",
      "updated_at",
    ]);
  });

  it("playbook_versions columns match ADR-0011 Migration 006 (EP08)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.PLAYBOOK_VERSIONS);
    expect(cols).toEqual([
      "playbook_id",
      "version",
      "yaml_r2_key",
      "changelog",
      "published_by",
      "published_at",
    ]);
  });

  it("playbook_dependencies columns match ADR-0011 Migration 006 (EP08, PK fix)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.PLAYBOOK_DEPENDENCIES);
    expect(cols).toEqual([
      "parent_id",
      "child_id",
      "child_version",
      "dependency_type",
      "weight",
      "created_at",
    ]);
  });

  it("community_playbooks columns match ADR-0011 Migration 007 (EP07, no yaml_r2_key)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.COMMUNITY_PLAYBOOKS);
    expect(cols).toEqual([
      "package_id",
      "playbook_id",
      "author_id",
      "title",
      "description",
      "tags_json",
      "content_hash", // SHA-256 per ADR-0012 checkDuplicate()
      "version",
      "moderation_status", // prefixed from `status`
      "installed_count",
      "rating_avg",
      "rating_count",
      "created_at",
    ]);
    // Critical: yaml_r2_key column REMOVED per ADR-0011.
    expect(cols).not.toContain("yaml_r2_key");
  });

  it("rag_chunks columns match ADR-0011 Migration 009 (ADR-0014 RAG)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.RAG_CHUNKS);
    expect(cols).toEqual([
      "id",
      "source_type",
      "source_id",
      "ticker",
      "title",
      "snippet",
      "chunk_index",
      "r2_key",
      "url",
      "date",
      "indexed_at",
    ]);
  });

  it("news_articles columns match ADR-0011 Migration 009 (ADR-0014 RAG)", async () => {
    const { getTableColumns, TABLE_NAMES } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.NEWS_ARTICLES);
    expect(cols).toEqual([
      "id",
      "source",
      "title",
      "snippet",
      "ticker",
      "url",
      "r2_key",
      "published_at",
      "indexed_at",
    ]);
  });

  // ---------- ADR-0011 §Critical Implementation Rules validation ----------

  it("no table has a bare 'status' column (FP-0009 + ADR-0011 Rule #6)", async () => {
    const { listAllTables, getTableColumns } = await import("@/lib/db/schema");
    const tables = listAllTables();
    const violations: string[] = [];
    for (const table of tables) {
      const cols = getTableColumns(table) ?? [];
      // url_check_queue is the EXCEPTION per ADR-0011 Rule #6 (task queue state).
      if (table === "url_check_queue") continue;
      if (cols.includes("status")) {
        violations.push(`${table}.status (should be lifecycle_status/moderation_status/order_status)`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("no EP06 table has a 'symbol' column (renamed to 'ticker' per ADR-0011 Rule #5)", async () => {
    const { TABLE_NAMES, getTableColumns } = await import("@/lib/db/schema");
    const ep06Tables = [
      TABLE_NAMES.ORDERS,
      TABLE_NAMES.POSITIONS,
      TABLE_NAMES.TRADES,
    ];
    for (const table of ep06Tables) {
      const cols = getTableColumns(table) ?? [];
      expect(cols).not.toContain("symbol");
      expect(cols).toContain("ticker");
    }
  });

  it("user_profiles has no holdings_json column (REMOVED per ADR-0011 Rule #4)", async () => {
    const { TABLE_NAMES, getTableColumns } = await import("@/lib/db/schema");
    const cols = getTableColumns(TABLE_NAMES.USER_PROFILES) ?? [];
    expect(cols).not.toContain("holdings_json");
  });
});
