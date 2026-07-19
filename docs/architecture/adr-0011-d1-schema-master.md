# ADR-0011: D1 Schema Master (Cross-Epic Unification)

## Status

Proposed

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + Cloudflare D1 (SQLite) |
| **Domain** | Core (Data Layer / Persistence) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP02 §2.4, EP03 §2.5, EP04 §ID-7, EP06 §2.6, EP07 §2.4, EP08 §2.8, ADR-0001 §API-0002, ADR-0002 §API-0003 |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | All 22 base tables + 1 `users` + 1 `url_check_queue` (ADR-0007) = 24 tables defined with FK constraints; migration order produces no FK violations; `pnpm run db:migrate` applies cleanly |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (mock_data_path - D1 is for metadata only, not Mock JSON), ADR-0002 (r2_cache_symbols_set - symbols.is_mockup synced to whitelist) - both Accepted |
| **Enables** | All Epic stories that touch D1 (EP02/03/04/06/07/08). Specifically unblocks: EP02 Data Layer stories, EP03 Ask Agent memory, EP04 Strategy persistence, EP06 Broker orders, EP07 Community UGC, EP08 Playbook versioning. |
| **Blocks** | Any story that creates a D1 table - cannot start until this ADR is Accepted |
| **Ordering Note** | Must be Accepted before any D1-touching story starts. ADR-0004 (Agent Loop) consumes `MemoryRef` which will be defined here as `conversation_history` reference. |

## Context

### Problem Statement

6 Epics (EP02/03/04/06/07/08) independently define D1 schemas totaling 22 tables. Cross-Epic integration issues identified during /architecture-review (2026-07-19):

1. **No `users` master table** - `user_id TEXT` referenced in 11 tables but never defined as PK. No referential integrity for users.
2. **`ticker` vs `symbol` naming conflict** - EP02 uses `ticker`, EP06 uses `symbol`. Same concept, different names. Will cause integration bugs when EP06 orders reference EP02 symbols.
3. **EP07 `community_playbooks.yaml_r2_key` vs EP08 `playbook_versions.yaml_r2_key`** - duplicated R2 key storage. EP07 stores on community package (latest version only); EP08 stores per version. Drift risk.
4. **EP07 `playbook_installs` vs EP08 `user_playbooks`** - two tables tracking the same concept (user installs of Playbook). Divergent schemas: EP07 has `package_id`, EP08 has `installed_version`.
5. **EP03 `user_profiles.holdings` JSON vs EP06 `positions` table** - two sources of truth for user holdings. Ask Agent reads JSON; Dashboard reads positions table. Will diverge.
6. **Missing FK constraints** - EP06 `orders.symbol`, `orders.strategy_id`; EP07 `community_playbooks.playbook_id`, `playbook_comments.parent_id`; EP08 `playbook_dependencies.child_id` - all reference other tables but have no FK declaration.
7. **`status` column overloaded** - EP07 moderation status (active/removed/banned), EP08 lifecycle status (draft/published/archived/deprecated), EP06 order status (pending/filled/cancelled) - all named `status`. Confusing.
8. **EP08 `playbook_dependencies` PK allows duplicates** - `PRIMARY KEY (parent_id, child_id, dependency_type)` allows same parent-child pair with different types. Should be unique per parent-child.
9. **No migration order defined** - 6 Epics create tables independently; FK constraints will fail if migration order is wrong.

### Constraints

- **Cloudflare D1 free tier**: 5GB storage + 5M row reads/day. 24 tables (including ADR-0007 `url_check_queue`) with ~10K rows total is well within limits.
- **SQLite limitations**: No native JSON type (store as TEXT). No array type. No partial index (well, SQLite supports partial indexes but D1 may not expose). No deferred FK checks.
- **Cloudflare Workers stateless**: D1 connection is via `env.DB` binding per request. No connection pooling. No transactions across multiple D1 calls (single-statement atomic only).
- **EP02 ID-5**: K-line data NOT in D1 (in R2 or Mock JSON). D1 stores only metadata + pointers.
- **ADR-0002 §Critical Implementation Rule**: `R2_CACHE_SYMBOLS` must stay in sync with `symbols.is_mockup` flag in D1.

### Requirements

- Single canonical D1 schema covering all 24 tables (23 base + 1 `url_check_queue` from ADR-0007).
- All FKs declared explicitly.
- Naming: `ticker` (not `symbol`), `lifecycle_status` / `moderation_status` / `order_status` (not overloaded `status`).
- Migration order defined such that FKs resolve.
- `users` master table added.
- EP07 + EP08 install tables merged into one.
- EP03 `user_profiles.holdings` JSON column removed (EP06 `positions` is canonical).
- EP07 `community_playbooks.yaml_r2_key` removed (reference EP08 `playbook_versions.yaml_r2_key` via `playbook_id` + `version`).

## Decision

**Adopt this 23-table master schema with explicit FKs, naming conventions, and migration order. All future D1 schema changes must update this ADR.**

### Naming Conventions

| Convention | Rule | Example |
|------------|------|---------|
| Primary keys | `id INTEGER PRIMARY KEY AUTOINCREMENT` for synthetic, or natural PK for lookup tables | `users.id TEXT PRIMARY KEY` |
| Foreign keys | `<table_singular>_id` referencing parent table | `orders.account_id REFERENCES broker_accounts(id)` |
| Ticker column | Always `ticker`, never `symbol` | `orders.ticker REFERENCES symbols(ticker)` |
| Timestamps | `created_at TEXT DEFAULT (datetime('now'))`, `updated_at TEXT` (updated by app) | All tables |
| Status columns | Prefix with domain: `lifecycle_status`, `moderation_status`, `order_status` | Avoid bare `status` |
| JSON columns | Suffix with `_json` to flag TEXT-stored JSON | `metadata_json` |
| Boolean columns | Prefix with `is_` or `has_`, type INTEGER (0/1) | `is_mockup INTEGER DEFAULT 0` |
| Indexes | `idx_<table>_<col1>_<col2>` naming | `idx_orders_user_created` |

### Master Schema (24 tables: 23 base + 1 ADR-0007)

```sql
-- ============ Migration 001: users + symbols (lookup tables) ============

CREATE TABLE users (
  id          TEXT PRIMARY KEY,           -- clerk.dev user id or custom
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT
);

CREATE TABLE symbols (
  ticker      TEXT PRIMARY KEY,           -- "AAPL", "NVDA", etc.
  name        TEXT NOT NULL,              -- "Apple Inc."
  exchange    TEXT NOT NULL,              -- NYSE/NASDAQ/AMEX
  sector      TEXT,
  industry    TEXT,
  market_cap  INTEGER,                    -- USD
  is_mockup   INTEGER DEFAULT 0,          -- 1 = in R2_CACHE_SYMBOLS whitelist (synced per ADR-0002)
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_symbols_exchange ON symbols(exchange);
CREATE INDEX idx_symbols_is_mockup ON symbols(is_mockup);

-- ============ Migration 002: EP02 Data Layer ============

CREATE TABLE watchlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE watchlist_items (
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL REFERENCES symbols(ticker),
  added_at     TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (watchlist_id, ticker)
);

CREATE TABLE kline_cache_index (
  ticker       TEXT NOT NULL REFERENCES symbols(ticker),
  timeframe    TEXT NOT NULL,              -- 1d/5m/15m/1h
  cached_at    TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  PRIMARY KEY (ticker, timeframe)
);

CREATE TABLE fundamentals (
  ticker       TEXT NOT NULL REFERENCES symbols(ticker),
  field        TEXT NOT NULL,              -- pe_ratio/eps/revenue/...
  value        TEXT,
  period       TEXT,                       -- 2024-Q4 / 2024-FY
  updated_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (ticker, field, period)
);

-- ============ Migration 003: EP03 Ask Agent (memory) ============

CREATE TABLE user_profiles (
  user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  risk_tolerance    TEXT,                  -- conservative/moderate/aggressive
  sectors_json      TEXT,                  -- JSON array: ["tech", "healthcare"]
  preferred_sources TEXT,                  -- JSON array: ["yahoo", "sec_edgar"]
  -- NOTE: holdings column REMOVED per ADR-0011. EP06 positions table is canonical.
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT
);

CREATE TABLE conversation_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  role          TEXT NOT NULL,             -- user/assistant
  content       TEXT,
  metadata_json TEXT,                      -- JSON: {intent, citations, cost_usd, trace_id}
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_conv_user_session ON conversation_history(user_id, session_id);

-- ============ Migration 004: EP04 Strategy DSL ============

CREATE TABLE strategies (
  id           TEXT PRIMARY KEY,           -- UUID
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  dsl_yaml     TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',  -- draft/validated/backtested/paper/live
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT
);

CREATE INDEX idx_strategies_user ON strategies(user_id, created_at);

CREATE TABLE backtest_results (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id  TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  result_json  TEXT NOT NULL,              -- serialized BacktestResult
  run_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_backtest_strategy ON backtest_results(strategy_id, run_at DESC);

-- ============ Migration 005: EP06 Broker Integration ============

CREATE TABLE broker_accounts (
  id           TEXT PRIMARY KEY,           -- UUID
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker_name  TEXT NOT NULL,              -- paper/alpaca/ibkr
  mode         TEXT NOT NULL,              -- paper/live
  balance      REAL DEFAULT 100000,        -- USD, virtual default
  currency     TEXT DEFAULT 'USD',
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE orders (
  id           TEXT PRIMARY KEY,           -- "ord_<timestamp>_<random6>" per EP06 ID-3
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   TEXT NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL REFERENCES symbols(ticker),  -- renamed from `symbol`
  side         TEXT NOT NULL,              -- buy/sell/sell_short/buy_to_cover
  type         TEXT NOT NULL,              -- market/limit/stop/stop_limit
  quantity     REAL NOT NULL,
  limit_price  REAL,
  stop_price   REAL,
  order_status TEXT NOT NULL DEFAULT 'pending',  -- renamed from `status`
  filled_qty   REAL DEFAULT 0,
  filled_price REAL,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT,
  strategy_id  TEXT REFERENCES strategies(id) ON DELETE SET NULL  -- FK added
);

CREATE INDEX idx_orders_user ON orders(user_id, created_at);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_strategy ON orders(strategy_id);

CREATE TABLE positions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   TEXT NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL REFERENCES symbols(ticker),  -- renamed from `symbol`
  quantity     REAL NOT NULL,
  avg_price    REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  updated_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, account_id, ticker)
);

CREATE TABLE trades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL REFERENCES symbols(ticker),  -- renamed from `symbol`
  side         TEXT NOT NULL,
  quantity     REAL NOT NULL,
  price        REAL NOT NULL,
  commission   REAL DEFAULT 0,
  executed_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_trades_order ON trades(order_id);

-- ============ Migration 006: EP08 Playbook System ============

CREATE TABLE playbooks (
  id              TEXT PRIMARY KEY,        -- "pb_xxx"
  title           TEXT NOT NULL,
  description     TEXT,
  author_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,           -- strategy/composite/data_fetcher/risk_manager/alert/narrative
  current_version TEXT NOT NULL,           -- SemVer "1.2.0"
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',  -- draft/published/archived/deprecated (renamed from `status`)
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE playbook_versions (
  playbook_id    TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  version        TEXT NOT NULL,            -- SemVer
  yaml_r2_key    TEXT NOT NULL,            -- canonical R2 key for YAML
  changelog      TEXT,
  published_by   TEXT NOT NULL REFERENCES users(id),
  published_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (playbook_id, version)
);

CREATE INDEX idx_pbv_playbook ON playbook_versions(playbook_id, published_at DESC);

CREATE TABLE playbook_dependencies (
  parent_id       TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  child_id        TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  child_version   TEXT,                    -- optional pinned version
  dependency_type TEXT NOT NULL,           -- parallel/sequential/conditional/data
  weight         REAL,                     -- parallel weight
  created_at     TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (parent_id, child_id)        -- FIX: removed dependency_type from PK
);

-- ============ Migration 007: EP07 Community (references EP08) ============

CREATE TABLE community_playbooks (
  package_id      TEXT PRIMARY KEY,        -- "pkg_xxx"
  playbook_id     TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,  -- FK added
  author_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  tags_json       TEXT,                    -- JSON array
  -- NOTE: yaml_r2_key column REMOVED per ADR-0011. Reference playbook_versions.yaml_r2_key via playbook_id + current_version.
  version         TEXT DEFAULT '1.0',      -- SemVer of published version
  moderation_status TEXT NOT NULL DEFAULT 'active',  -- active/removed/banned (renamed from `status`)
  installed_count INTEGER DEFAULT 0,
  rating_avg      REAL DEFAULT 0,
  rating_count    INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_cp_status_created ON community_playbooks(moderation_status, created_at);
CREATE INDEX idx_cp_author ON community_playbooks(author_id);

-- MERGED: EP07 playbook_installs + EP08 user_playbooks -> single table
CREATE TABLE user_playbook_installs (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playbook_id        TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  package_id         TEXT NOT NULL REFERENCES community_playbooks(package_id) ON DELETE CASCADE,
  installed_version  TEXT NOT NULL,        -- SemVer
  installed_at       TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, playbook_id)
);

CREATE TABLE playbook_ratings (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id     TEXT NOT NULL REFERENCES community_playbooks(package_id) ON DELETE CASCADE,
  rating         INTEGER NOT NULL,         -- 1-5
  created_at     TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, package_id)
);

CREATE TABLE playbook_comments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id     TEXT NOT NULL REFERENCES community_playbooks(package_id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  parent_id      INTEGER REFERENCES playbook_comments(id) ON DELETE CASCADE,  -- FK added; self-reference
  moderation_status TEXT NOT NULL DEFAULT 'active',  -- active/hidden/deleted (renamed from `status`)
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE playbook_reports (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id     TEXT NOT NULL REFERENCES community_playbooks(package_id) ON DELETE CASCADE,
  reporter_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason         TEXT NOT NULL,
  description    TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending',  -- pending/resolved/rejected (renamed from `status`)
  created_at     TEXT DEFAULT (datetime('now'))
);
```

### Migration Order

Migrations MUST be applied in this order (FK dependencies):

```
001_users_symbols.sql    -> users, symbols (no FKs)
002_data_layer.sql       -> watchlists, watchlist_items, kline_cache_index, fundamentals (FK -> users, symbols)
003_ask_agent.sql        -> user_profiles, conversation_history (FK -> users)
004_strategy.sql         -> strategies, backtest_results (FK -> users)
005_broker.sql           -> broker_accounts, orders, positions, trades (FK -> users, symbols, strategies)
006_playbook.sql         -> playbooks, playbook_versions, playbook_dependencies (FK -> users)
007_community.sql        -> community_playbooks, user_playbook_installs, playbook_ratings,
                            playbook_comments, playbook_reports (FK -> users, playbooks, community_playbooks)
008_citation_url_check.sql -> url_check_queue (no FKs; task queue table, FK -> future ADR-0014 traces)
```

Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`). Migration files live at `web/migrations/001_*.sql` through `web/migrations/008_*.sql`.

> **Note (2026-07-19 amendment)**: Migration 008 added by [ADR-0007](adr-0007-citation-validator.md) §D1 Schema Addition. The `url_check_queue` table stores async URL reachability check tasks for Cloud mode citation validation. `status` column here is queue-task state (pending/processing/done/failed), which is an EXCEPTION to FP-0009 (FP-0009 applies to entity lifecycle state, not task queue state).

### Migration 008: url_check_queue (ADR-0007)

```sql
-- 008_citation_url_check.sql
-- Added by ADR-0007 §D1 Schema Addition
-- Purpose: Async URL reachability check queue for citation validation (Cloud mode only)

CREATE TABLE IF NOT EXISTS url_check_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id        TEXT NOT NULL,                    -- references future ADR-0014 traces.trace_id
  citation_url    TEXT NOT NULL,
  citation_source TEXT NOT NULL,                    -- "sec_edgar" | "yahoo" | "fred" | "news" | "playbook" | "user_note"
  fact_value      TEXT,                             -- the numeric value being cited (for debugging)
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending/processing/done/failed (queue task state, FP-0009 exception)
  checked_at      TEXT,
  http_status     INTEGER,
  error_message   TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_url_check_status ON url_check_queue(status, created_at);
```

**Cleanup**: `url_check_queue` entries older than 30 days should be deleted by a cron worker to prevent unbounded growth. Queue depth > 1000 should trigger an alert.

### Critical Implementation Rules

1. **All DDL goes through this ADR**: No Epic may define new D1 tables without updating ADR-0011 §Master Schema. New tables must follow naming conventions.
2. **K-line data NEVER in D1**: Per EP02 ID-5. K-line goes to R2 (ADR-0002) or Mock JSON (ADR-0001). D1 stores only `kline_cache_index` metadata.
3. **`symbols.is_mockup` sync**: Must stay in sync with `R2_CACHE_SYMBOLS` whitelist (ADR-0002). CI check `pnpm run check:mock-symbols` validates this.
4. **Holdings canonical source**: EP06 `positions` table. EP03 `user_profiles.holdings_json` column is REMOVED. Ask Agent reads holdings via SQL JOIN on positions.
5. **`ticker` not `symbol`**: All ticker columns named `ticker`. EP06 docs (orders.symbol, positions.symbol, trades.symbol) must be updated to use `ticker`.
6. **Status column prefixing**: Bare `status` column name is FORBIDDEN for entity state. Use `lifecycle_status` (entity lifecycle), `moderation_status` (UGC moderation), `order_status` (orders). **Exception (ADR-0007)**: Task queue tables (e.g., `url_check_queue.status`) may use bare `status` for task state (pending/processing/done/failed) - this represents task progression, not entity lifecycle, and is scoped to the queue's domain.
7. **FKs are mandatory**: Every column referencing another table MUST have `REFERENCES <table>(<col>)`. No implicit FKs. Exception: task queue tables may reference future ADR-defined tables (e.g., `url_check_queue.trace_id` -> future ADR-0014 `traces.trace_id`) via comment-only FK until the parent table is created.

## Alternatives Considered

### Alternative 1: Keep per-Epic schemas, document relationships only

- **Description**: Each Epic keeps its own D1 schema section. ADR-0011 only documents cross-Epic FK relationships and naming conventions, doesn't unify.
- **Pros**: Less upfront work. Epics retain autonomy.
- **Cons**: 6 schemas drift over time. No single source of truth. FK violations only caught at integration time.
- **Rejection Reason**: /architecture-review found 9 cross-Epic issues. Without unification, integration will be painful.

### Alternative 2: Use Prisma or Drizzle ORM schema as master

- **Description**: Define schema in `schema.prisma` or Drizzle TS, generate SQL migrations from it.
- **Pros**: Type-safe schema. Auto-generated migrations. Better DX.
- **Cons**: Adds dependency. Cloudflare D1 + Prisma has known compatibility issues. Drizzle works but adds learning curve. EP01 ID-1 says "自研轻量", implies minimal deps.
- **Rejection Reason**: Premature complexity for Phase 1. Revisit in Phase 1.5 if schema churn is high. ADR-0011 keeps raw SQL as source of truth.

### Alternative 3: Multiple D1 databases (one per Epic)

- **Description**: Separate D1 database per Epic (nova-invest-data, nova-invest-broker, etc.). No cross-DB FKs.
- **Pros**: Isolation. Per-domain scaling.
- **Cons**: Cloudflare free tier is 1 D1 database per account (10 databases paid). Cross-DB queries impossible. No FK integrity.
- **Rejection Reason**: Free tier constraint. Single D1 is correct for Phase 1-2.

## Consequences

### Positive

- Single source of truth for all 23 D1 tables.
- All FKs declared - referential integrity enforced by SQLite.
- Naming conventions prevent the `ticker`/`symbol` and `status` overload bugs.
- Migration order is explicit - no FK violations during setup.
- `users` master table enables future auth + billing integration.
- Merged `user_playbook_installs` eliminates EP07/EP08 install drift.
- EP06 `positions` as canonical holdings source eliminates EP03/EP06 divergence.

### Negative

- EP03, EP06, EP07, EP08 docs now have stale schema sections. Each must add a note: "See ADR-0011 for canonical schema."
- EP07 `community_playbooks.yaml_r2_key` column removed - community code must JOIN through `playbook_versions` to get R2 key.
- EP03 Ask Agent must read holdings via SQL (positions table) instead of JSON column. Slightly more complex query.
- Migration files must be kept in order. Renumbering is painful if a migration is inserted later.

### Risks

- **Risk**: Existing code references `symbol` column name (EP06 docs).
  - **Mitigation**: ADR-0011 §Critical Implementation Rules #5. Update EP06 docs to use `ticker`. Code-level search-and-replace when EP06 is implemented.
- **Risk**: `users` table PK choice (TEXT from clerk.dev vs INTEGER auto-increment).
  - **Mitigation**: Use TEXT to accommodate clerk.dev user IDs (future Phase 2 auth). Phase 1 can use any unique string (e.g., "user_mock_001").
- **Risk**: Migration 007 (`community_playbooks`) depends on Migration 006 (`playbooks`). If community is built before playbook system, FK fails.
  - **Mitigation**: Migration order is enforced. EP07 implementation cannot start before EP08 playbooks table exists. Roadmap already sequences EP08 (Phase 3) after EP07 (Phase 2). For Phase 1 demo, mock community data uses static JSON (no D1 needed).
- **Risk**: `playbook_dependencies` PK change (removed `dependency_type`) breaks existing data.
  - **Mitigation**: No existing data - schema is new. Document in changelog.
- **Risk**: D1 SQLite enforces FKs only if `PRAGMA foreign_keys = ON;` is set.
  - **Mitigation**: Migration 001 includes `PRAGMA foreign_keys = ON;` as first statement. Wrangler D1 binding sets this by default per Cloudflare docs.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP02 §2.4 | D1 schema: symbols/watchlists/kline_cache_index/fundamentals 4 tables | Defines all 4 with FKs to users + symbols |
| EP02 ID-5 | "D1 作为元数据存储，K 线不入 D1" | Codified in §Critical Implementation Rules #2 |
| EP02 ID-6 | "标的元数据预置：Mockup 池 + S&P 500 前 100" | `symbols.is_mockup` flag + seed.sql |
| EP03 §2.5 | user_profiles + conversation_history tables | Defined in Migration 003; `holdings_json` column REMOVED |
| EP04 §ID-7 | strategies + backtest_results tables | Defined in Migration 004 with FK to users |
| EP06 §2.6 | broker_accounts/orders/positions/trades 4 tables | Defined in Migration 005; `symbol` renamed to `ticker`; FKs to symbols + strategies added |
| EP06 ID-3 | Order ID generation `ord_<timestamp>_<random6>` | `orders.id TEXT PRIMARY KEY` (app-generated) |
| EP07 §2.4 | community_playbooks + 4 related tables | Defined in Migration 007; `yaml_r2_key` removed; `status` renamed to `moderation_status` |
| EP07 ID-3 | "安装即'复制引用'而非'复制内容'" | `user_playbook_installs` references `playbook_id` + `package_id`, no content copy |
| EP08 §2.8 | playbooks + playbook_versions + playbook_dependencies + user_playbooks 4 tables | Defined in Migration 006; `playbook_dependencies` PK fixed; `user_playbooks` merged with EP07 `playbook_installs` into `user_playbook_installs` |
| EP08 ID-2 | SemVer strict validation | `playbook_versions.version TEXT` + app-level `semver.valid()` check |
| EP08 ID-3 | Parallel composition weight sum = 1.0 | `playbook_dependencies.weight REAL` + app-level validation |
| EP08 ID-4 | Circular dependency detection | App-level graph traversal; DB stores edges only |
| ADR-0001 §API-0002 | Mock data at `web/public/mock/` | D1 not used for Mock data (Rule #2) |
| ADR-0002 §API-0003 | R2_CACHE_SYMBOLS sync | `symbols.is_mockup` synced via CI check |

## Performance Implications

- **Storage**: 24 tables × ~1000 rows average = ~24K rows. Well within D1 5GB free tier.
- **Row reads**: 5M/day free tier. Typical query: 1-10 row reads. Supports ~500K queries/day.
- **Index strategy**: All FK columns indexed. `user_id` columns indexed where time-ordered queries are common (orders, conversation_history, backtest_results).
- **JOIN cost**: `community_playbooks` -> `playbooks` -> `playbook_versions` is a 3-table JOIN to get YAML R2 key. Acceptable for community browse (low frequency).
- **No denormalization**: Holdings not cached in user_profiles (per decision). Ask Agent reads positions via SQL - adds 1 query per holdings-aware request. Acceptable.

## Migration Plan

No existing D1 database. Migration is greenfield:

1. Create `web/migrations/` directory.
2. Write 7 migration files (001 through 007) per §Migration Order.
3. Add `PRAGMA foreign_keys = ON;` as first statement of 001.
4. Write `web/migrations/seed.sql` with:
   - 10 mockup symbols (AAPL/MSFT/NVDA/GOOG/META/AMZN/TSLA/NFLX/AMD/INTC) with `is_mockup=1`
   - 100 S&P 500 symbols with `is_mockup=0`
   - 1 test user (id="user_mock_001", email="brenda@example.com")
   - 1 broker_account for test user (paper mode, $100K balance)
   - 3 sample strategies (MA Cross, RSI Oversold, Bollinger Breakout)
5. Update `package.json` `db:migrate` script to apply all 8 migrations in order.
6. Add CI check: `pnpm run check:schema` that runs `wrangler d1 execute --local --command "SELECT name FROM sqlite_master WHERE type='table'"` and asserts 24 tables exist.
7. Update EP03/EP06/EP07/EP08 docs with note: "Canonical D1 schema is defined in ADR-0011. The schema section below is retained for historical context but may be stale."

## Validation Criteria

- [ ] All 24 tables created via `pnpm run db:migrate`
- [ ] `PRAGMA foreign_keys = ON;` is set (test by inserting an order with non-existent `account_id` - should fail)
- [ ] `symbols` table has 10 rows with `is_mockup=1` matching `R2_CACHE_SYMBOLS` exactly
- [ ] `users` table has at least 1 test user
- [ ] `orders.ticker` FK to `symbols.ticker` enforced (insert with "FAKE" ticker fails)
- [ ] `orders.strategy_id` FK to `strategies.id` enforced (insert with "str_fake" fails)
- [ ] `playbook_dependencies` PRIMARY KEY (parent_id, child_id) rejects duplicate pairs
- [ ] `user_playbook_installs` PRIMARY KEY (user_id, playbook_id) rejects duplicates
- [ ] `community_playbooks.yaml_r2_key` column does NOT exist (removed per ADR-0011)
- [ ] `user_profiles.holdings_json` column does NOT exist (removed per ADR-0011)
- [ ] No table has a bare `status` column (all renamed to `lifecycle_status` / `moderation_status` / `order_status`)
- [ ] Migration order produces no FK violations when applied to fresh D1
- [ ] `pnpm run check:mock-symbols` passes (symbols.is_mockup=1 set matches R2_CACHE_SYMBOLS)

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) - D1 is not used for Mock data; Mock JSON at `web/public/mock/`
- **ADR-0002** (R2 cache whitelist) - `symbols.is_mockup` synced to `R2_CACHE_SYMBOLS`
- **ADR-0004** (Agent Loop) - `conversation_history.metadata_json` stores `trace_id` for loop traceability
- EP02 §2.4, EP03 §2.5, EP04 §ID-7, EP06 §2.6, EP07 §2.4, EP08 §2.8 - originating schemas (now superseded by this ADR)

## TECH_DEBT - None at ADR Creation

This is a new ADR; no existing D1 database to migrate. The 12 validation criteria in §Validation Criteria are the acceptance signals for future implementation.

When the D1 database is created and migrations applied, if any criterion fails, the migration must be fixed before stories can depend on the schema.
