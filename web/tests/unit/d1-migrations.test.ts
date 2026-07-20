import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../migrations");

// Expected migrations per ADR-0011 §Master Schema
const EXPECTED_MIGRATIONS = [
  { file: "0001_users_symbols.sql", tables: ["users", "symbols"] },
  { file: "0002_data_layer.sql", tables: ["watchlists", "watchlist_items", "kline_cache_index", "fundamentals"] },
  { file: "0003_ask_memory.sql", tables: ["user_profiles", "conversation_history"] },
  { file: "0004_strategy_backtest.sql", tables: ["strategies", "backtest_results"] },
  { file: "0005_broker.sql", tables: ["broker_accounts", "orders", "positions", "trades"] },
  { file: "0006_playbook.sql", tables: ["playbooks", "playbook_versions", "playbook_dependencies"] },
  { file: "0007_community.sql", tables: ["community_playbooks", "user_playbook_installs", "playbook_ratings", "playbook_comments", "playbook_reports"] },
  { file: "0008_url_check_queue.sql", tables: ["url_check_queue"] },
  { file: "0009_rag_metadata.sql", tables: ["rag_chunks", "news_articles"] },
];

describe("D1 Migrations (ADR-0011 §Master Schema)", () => {
  it("should have 9 migration files", () => {
    for (const { file } of EXPECTED_MIGRATIONS) {
      expect(existsSync(join(MIGRATIONS_DIR, file))).toBe(true);
    }
  });

  it("should create all 25 tables across migrations", () => {
    const allTables: string[] = [];
    for (const { file } of EXPECTED_MIGRATIONS) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      const matches = content.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g);
      for (const m of matches) {
        allTables.push(m[1]);
      }
    }
    expect(allTables).toHaveLength(25);
    // Verify no duplicates
    expect(new Set(allTables).size).toBe(25);
  });

  it("each migration should create expected tables", () => {
    for (const { file, tables } of EXPECTED_MIGRATIONS) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      for (const table of tables) {
        expect(content).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      }
    }
  });

  it("migrations should use IF NOT EXISTS for idempotency", () => {
    for (const { file } of EXPECTED_MIGRATIONS) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      const createCount = (content.match(/CREATE TABLE/g) || []).length;
      const ifNotExistsCount = (content.match(/CREATE TABLE IF NOT EXISTS/g) || []).length;
      expect(createCount).toBe(ifNotExistsCount);
    }
  });

  it("migrations should define foreign keys where required", () => {
    const content0002 = readFileSync(join(MIGRATIONS_DIR, "0002_data_layer.sql"), "utf-8");
    expect(content0002).toContain("FOREIGN KEY (user_id) REFERENCES users(id)");
    expect(content0002).toContain("FOREIGN KEY (ticker) REFERENCES symbols(ticker)");

    const content0005 = readFileSync(join(MIGRATIONS_DIR, "0005_broker.sql"), "utf-8");
    expect(content0005).toContain("FOREIGN KEY (account_id) REFERENCES broker_accounts(id)");
    expect(content0005).toContain("FOREIGN KEY (ticker) REFERENCES symbols(ticker)");
  });

  it("migrations should define indexes for performance", () => {
    for (const { file } of EXPECTED_MIGRATIONS) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      expect(content).toContain("CREATE INDEX");
    }
  });

  it("migration 0001 should seed 10 Mock symbols", () => {
    const content = readFileSync(join(MIGRATIONS_DIR, "0001_users_symbols.sql"), "utf-8");
    expect(content).toContain("AAPL");
    expect(content).toContain("MSFT");
    expect(content).toContain("NVDA");
    expect(content).toContain("INTC");
    expect(content).toContain("is_mockup");
    // Count symbol inserts
    const insertMatches = content.match(/INSERT OR IGNORE INTO symbols/g);
    expect(insertMatches).not.toBeNull();
    // Should have 10 symbol entries in VALUES clause
    const valuesCount = (content.match(/\('AAPL'|'MSFT'|'NVDA'|'GOOG'|'META'|'AMZN'|'TSLA'|'NFLX'|'AMD'|'INTC'/g) || []).length;
    expect(valuesCount).toBe(10);
  });

  it("migration 0007 should include content_hash column (ADR-0011 C16)", () => {
    const content = readFileSync(join(MIGRATIONS_DIR, "0007_community.sql"), "utf-8");
    expect(content).toContain("content_hash");
  });

  it("migration 0007 should include moderation_status on UGC tables", () => {
    const content = readFileSync(join(MIGRATIONS_DIR, "0007_community.sql"), "utf-8");
    expect(content).toContain("moderation_status");
    // moderation_status should appear in community_playbooks, playbook_comments, playbook_reports
    const modCount = (content.match(/moderation_status/g) || []).length;
    expect(modCount).toBeGreaterThanOrEqual(3);
  });

  it("migration 0008 should define url_check_queue for ADR-0007", () => {
    const content = readFileSync(join(MIGRATIONS_DIR, "0008_url_check_queue.sql"), "utf-8");
    expect(content).toContain("url_check_queue");
    expect(content).toContain("trace_id");
    expect(content).toContain("citation_url");
    expect(content).toContain("status");
  });

  it("migration 0009 should define rag_chunks + news_articles for ADR-0014", () => {
    const content = readFileSync(join(MIGRATIONS_DIR, "0009_rag_metadata.sql"), "utf-8");
    expect(content).toContain("rag_chunks");
    expect(content).toContain("news_articles");
    expect(content).toContain("source_type");
    expect(content).toContain("snippet");
  });

  it("orders table should have order_status with CHECK-like constraint or default", () => {
    const content = readFileSync(join(MIGRATIONS_DIR, "0005_broker.sql"), "utf-8");
    expect(content).toContain("order_status");
    expect(content).toContain("DEFAULT 'pending'");
  });

  it("playbook_ratings should enforce 1-5 rating range", () => {
    const content = readFileSync(join(MIGRATIONS_DIR, "0007_community.sql"), "utf-8");
    expect(content).toContain("CHECK (rating BETWEEN 1 AND 5)");
  });
});
