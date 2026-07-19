/**
 * TDD Spec — ADR-0011: D1 Schema Master (Cross-Epic Unification)
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0011-d1-schema-master.md
 *
 * The schema sample here covers 10 tables actually defined in ADR-0011
 * (Migrations 001 / 002 / 003 / 006 / 007 / 008). Per the task constraint
 * "do NOT invent table names", we skip the candidate names that are NOT in
 * ADR-0011 (agent_traces, agent_steps, kv_session_meta, citations) and
 * substitute real ADR-0011 tables (user_profiles, url_check_queue).
 *
 * Tables covered (10):
 *   1. users                       (Migration 001)
 *   2. symbols                     (Migration 001)
 *   3. user_profiles               (Migration 003)
 *   4. conversation_history        (Migration 003)
 *   5. playbooks                   (Migration 006)
 *   6. playbook_ratings            (Migration 007)
 *   7. playbook_comments           (Migration 007)
 *   8. playbook_reports            (Migration 007)
 *   9. user_playbook_installs      (Migration 007)
 *   10. url_check_queue            (Migration 008, ADR-0007)
 */

import { beforeEach, describe, expect, it } from "vitest";

describe("ADR-0011: D1 Schema Master", () => {
  beforeEach(() => {
    // No module state to reset, but keep symmetry with other ADR tests.
  });

  // ---------- §Validation Criteria #1: schema exports table names ----------

  it("schema exports table names as constants", async () => {
    const { TABLE_NAMES } = await import("@/lib/db/schema");
    expect(TABLE_NAMES).toBeDefined();
    // 10 sample tables per ADR-0011 (not all 24, but representative).
    expect(TABLE_NAMES.USERS).toBe("users");
    expect(TABLE_NAMES.SYMBOLS).toBe("symbols");
    expect(TABLE_NAMES.USER_PROFILES).toBe("user_profiles");
    expect(TABLE_NAMES.CONVERSATION_HISTORY).toBe("conversation_history");
    expect(TABLE_NAMES.PLAYBOOKS).toBe("playbooks");
    expect(TABLE_NAMES.PLAYBOOK_RATINGS).toBe("playbook_ratings");
    expect(TABLE_NAMES.PLAYBOOK_COMMENTS).toBe("playbook_comments");
    expect(TABLE_NAMES.PLAYBOOK_REPORTS).toBe("playbook_reports");
    expect(TABLE_NAMES.USER_PLAYBOOK_INSTALLS).toBe("user_playbook_installs");
    expect(TABLE_NAMES.URL_CHECK_QUEUE).toBe("url_check_queue");
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
});
