# 04 — Test Fixtures & Mocks

> **Owner**: Engineering
> **Last reviewed**: 2026-07-20
> **Parent**: [`README.md`](./README.md)

This document catalogs every shared fixture, factory, stub, and test double used by the test suite. Tests must NOT construct ad-hoc JSON inline — pull from this catalog so that schema changes break tests in one place, not fifty.

Fixtures live under `web/tests/fixtures/` and test doubles under `web/tests/doubles/`. Both directories are excluded from production builds.

---

## 1. Fixture Directory Layout

```
web/tests/
├── fixtures/
│   ├── klines/
│   │   ├── aapl-1d-1y.json         ← 252 daily candles for AAPL
│   │   ├── aapl-1d-2y.json         ← 504 candles
│   │   ├── nvda-1d-1y.json
│   │   └── ...
│   ├── qa-samples/
│   │   ├── aapl-price-response.json   ← simple_qa response
│   │   ├── nvda-earnings-response.json← deep_research response
│   │   ├── tsla-news-response.json    ← tool_call response
│   │   └── clarify-response.json
│   ├── strategies/
│   │   ├── strategy-minimal.yaml
│   │   ├── strategy-sma-cross.yaml
│   │   ├── strategy-rsi-reversion.yaml
│   │   └── strategy-invalid-unknown-indicator.yaml
│   ├── playbooks/
│   │   ├── playbook-strategy.yaml
│   │   ├── playbook-composite-parallel.yaml
│   │   ├── playbook-composite-cyclic.yaml  ← has A→B→A cycle
│   │   └── playbook-narrative-missing-why.yaml
│   ├── community/
│   │   └── share-package-signed.json
│   ├── traces/
│   │   ├── trace-happy-path.json     ← 5-step agent trace
│   │   ├── trace-cost-exceeded.json
│   │   └── trace-citation-failed.json
│   └── backtest/
│       ├── backtest-result-aapl-1y.json
│       └── backtest-result-nvda-1y.json
├── doubles/
│   ├── d1-mock.ts                    ← D1 binding test double
│   ├── kv-mock.ts                    ← KV binding test double
│   ├── r2-mock.ts                    ← R2 binding test double
│   ├── vectorize-mock.ts             ← Vectorize binding test double
│   ├── fetch-stub.ts                 ← globalThis.fetch stub
│   └── llm-response-stub.ts          ← MockLLM response factory
└── setup.ts                          ← global Vitest setup
```

---

## 2. K-line Factories

### 2.1 `fixtures/klines/aapl-1d-1y.json`

```json
{
  "ticker": "AAPL",
  "timeframe": "1d",
  "source": "mock",
  "generated_at": "2024-01-02T00:00:00Z",
  "data": [
    { "t": "2023-01-03", "o": 130.28, "h": 130.90, "l": 129.11, "c": 125.07, "v": 112117500 },
    { "t": "2023-01-04", "o": 126.89, "h": 128.57, "l": 125.08, "c": 126.36, "v": 89113600 },
    ...
  ]
}
```

Length: 252 trading days (1 year). Used by:
- ADR-0001 unit tests (MockProvider reads `/mock/klines/AAPL_1d.json`)
- ADR-0009 backtest engine tests (strategy execution)
- ADR-0010 indicator library tests (sma/ema/rsi/macd/bbands/atr/obv/vwap)
- ADR-0013 playbook executor tests (composite strategy execution)

### 2.2 Factory functions

```ts
// tests/fixtures/kline-factory.ts (planned)
import type { Kline } from "@/lib/types";

export function makeKline(overrides: Partial<Kline> = {}): Kline {
  return {
    t: "2024-01-02",
    o: 100,
    h: 105,
    l: 95,
    c: 102,
    v: 1_000_000,
    ...overrides,
  };
}

export function makeKlineSeries(count: number, basePrice = 100): Kline[] {
  // Deterministic pseudo-random walk seeded by count for reproducibility.
  // Returns {count} Klines ending today, with realistic OHLCV shape.
  // Implementation: simple LCG with seed = count, no Math.random() (forbidden in tests).
}

export function makeConstantKlineSeries(count: number, price = 100): Kline[] {
  // All Klines identical — useful for ATR/RSI zero-volatility assertions.
}
```

**Rule**: factory functions must be **deterministic**. No `Math.random()`. Use a seeded LCG (linear congruential generator) so test failures are reproducible.

---

## 3. LLM Response Stubs

### 3.1 `fixtures/qa-samples/aapl-price-response.json`

```json
{
  "response": {
    "summary": "AAPL is currently trading at $189.41, up 1.2% on the day.",
    "numeric_facts": [
      {
        "value": 189.41,
        "unit": "USD",
        "source": {
          "source": "Yahoo Finance",
          "url": "https://finance.yahoo.com/quote/AAPL",
          "quote": "AAPL 189.41 +1.2%"
        },
        "confidence": 0.95
      }
    ],
    "citations": [
      {
        "source": "Yahoo Finance",
        "url": "https://finance.yahoo.com/quote/AAPL",
        "quote": "AAPL 189.41 +1.2%"
      }
    ],
    "confidence": 0.95,
    "intent": "simple_qa",
    "cost": { "credits_used": 0, "model": "mock-qa-sample" }
  }
}
```

This file is mirrored to `web/public/mock/qa_samples/aapl_price.json` for runtime use by `MockLLM`. The fixture under `tests/fixtures/` is the canonical source; a build script (planned) syncs to `public/mock/`.

### 3.2 LLM response factory

```ts
// tests/doubles/llm-response-stub.ts (planned)
import type { AskResponse, QueryIntent, Citation, NumericFact } from "@/lib/types";

export function makeCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    source: "Yahoo Finance",
    url: "https://finance.yahoo.com/quote/AAPL",
    quote: "AAPL 189.41 +1.2%",
    ...overrides,
  };
}

export function makeNumericFact(overrides: Partial<NumericFact> = {}): NumericFact {
  return {
    value: 189.41,
    unit: "USD",
    source: makeCitation(),
    confidence: 0.95,
    ...overrides,
  };
}

export function makeAskResponse(overrides: Partial<AskResponse> = {}): AskResponse {
  return {
    summary: "Mock answer.",
    numeric_facts: [],
    citations: [],
    confidence: 0.5,
    intent: "simple_qa",
    cost: { credits_used: 0, model: "mock-qa-sample" },
    ...overrides,
  };
}

export function makeResponseWithBadCitation(): AskResponse {
  // 2 citations, one with quote that doesn't substring-match the source document.
  return makeAskResponse({
    citations: [
      makeCitation({ quote: "AAPL 189.41 +1.2%" }),  // good
      makeCitation({ quote: "TSLA 250.00 +5.0%" }),  // bad — wrong symbol
    ],
  });
}

export function makeResponseExceedingCost(threshold: number): AskResponse {
  return makeAskResponse({
    cost: { credits_used: threshold + 1, model: "doubao-pro-32k" },
  });
}
```

### 3.3 Streaming stub

```ts
// tests/doubles/llm-stream-stub.ts (planned)
import { ReadableStream } from "node:stream/web";

export function makeSSEStream(events: Array<{ type: string; [k: string]: unknown }>): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      }
      controller.close();
    },
  });
}
```

---

## 4. Strategy DSL Fixtures

### 4.1 `fixtures/strategies/strategy-minimal.yaml`

```yaml
name: "SMA Cross AAPL"
description: "Buy when SMA(20) crosses above SMA(50)"
symbols: ["AAPL"]
timeframe: "1d"
entry:
  indicator: "sma"
  period: 20
  operator: "crosses_above"
  ref_indicator: "sma"
  ref_period: 50
exit:
  indicator: "sma"
  period: 20
  operator: "crosses_below"
  ref_indicator: "sma"
  ref_period: 50
position_sizing:
  method: "fixed_fractional"
  value: 0.10
status: "draft"
```

### 4.2 `fixtures/strategies/strategy-invalid-unknown-indicator.yaml`

Same as above but with `indicator: "foobar"`. Used by ADR-0008 test #3 and E2E EP04 #3.

### 4.3 Strategy factory

```ts
// tests/fixtures/strategy-factory.ts (planned)
export function makeMinimalStrategyYaml(overrides: Record<string, unknown> = {}): string {
  const base = loadFixture("strategies/strategy-minimal.yaml");
  return mergeYaml(base, overrides);
}
```

---

## 5. D1 Test Schema and Mock

### 5.1 In-memory D1 double

```ts
// tests/doubles/d1-mock.ts (planned)
import { Database } from "node:sqlite";  // Node 22+ built-in

export interface D1Binding {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<void>; all(): Promise<{ results: unknown[] }>; first<T>(): Promise<T | null>; }; };
  batch(stmts: Array<{ sql: string; values: unknown[] }>): Promise<void>;
  exec(sql: string): Promise<void>;
}

export function makeD1Binding(schemaSql: string): D1Binding {
  const db = new Database(":memory:");
  db.exec(schemaSql);
  // ... prepare/bind/run wrappers that return Promises matching Cloudflare D1 shape
  return { ... };
}
```

### 5.2 Test schema

```sql
-- tests/fixtures/d1-schema.sql (planned)
-- Mirrors migrations/*.sql applied in production per ADR-0011 (24+2 tables).
-- NOTE: Only tables referenced by Phase 1 tests are listed here; see ADR-0011
-- for the full schema (including watchlist_items, user_profiles, url_check_queue,
-- rag_chunks, news_articles, backtest_results).
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, plan TEXT CHECK(plan IN ('free','pro','team','enterprise')), created_at TEXT);
CREATE TABLE symbols (ticker TEXT PRIMARY KEY, name TEXT, exchange TEXT, sector TEXT, industry TEXT, market_cap REAL, is_mockup INTEGER);
CREATE TABLE watchlists (id INTEGER PRIMARY KEY, user_id TEXT, name TEXT, created_at TEXT);
CREATE TABLE kline_cache_index (ticker TEXT, timeframe TEXT, source TEXT, cached_at TEXT, PRIMARY KEY(ticker, timeframe));
CREATE TABLE fundamentals (ticker TEXT, period TEXT, data JSON, PRIMARY KEY(ticker, period));
CREATE TABLE conversation_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, role TEXT, content TEXT, intent TEXT, created_at TEXT);
CREATE TABLE strategies (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, dsl_yaml TEXT, lifecycle_status TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, account_id TEXT, symbol TEXT, side TEXT, type TEXT, quantity REAL, limit_price REAL, stop_price REAL, status TEXT, filled_qty REAL, filled_price REAL, strategy_id TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE positions (id INTEGER PRIMARY KEY, user_id TEXT, account_id TEXT, symbol TEXT, quantity REAL, avg_price REAL, current_price REAL, unrealized_pnl REAL, updated_at TEXT);
CREATE TABLE trades (id INTEGER PRIMARY KEY, order_id TEXT, symbol TEXT, side TEXT, quantity REAL, price REAL, executed_at TEXT);
CREATE TABLE broker_accounts (id TEXT PRIMARY KEY, user_id TEXT, broker_name TEXT, mode TEXT, balance REAL, currency TEXT, created_at TEXT);
CREATE TABLE playbooks (id TEXT PRIMARY KEY, title TEXT, description TEXT, author_id TEXT, kind TEXT, current_version TEXT, status TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE playbook_versions (id INTEGER PRIMARY KEY, playbook_id TEXT, version TEXT, yaml TEXT, changelog TEXT, created_at TEXT, UNIQUE(playbook_id, version));
CREATE TABLE playbook_dependencies (parent_id TEXT, child_id TEXT, child_version TEXT, dependency_type TEXT, weight REAL, created_at TEXT, PRIMARY KEY(parent_id, child_id));
CREATE TABLE community_playbooks (package_id TEXT PRIMARY KEY, playbook_id TEXT, author_id TEXT, title TEXT, description TEXT, tags JSON, version TEXT, moderation_status TEXT, content_hash TEXT NOT NULL, installed_count INTEGER, rating_avg REAL, rating_count INTEGER, performance_json JSON, risk_disclosure TEXT, yaml_r2_key TEXT, created_at TEXT);
CREATE TABLE user_playbook_installs (user_id TEXT, playbook_id TEXT, installed_at TEXT, PRIMARY KEY(user_id, playbook_id));
CREATE TABLE playbook_ratings (user_id TEXT, package_id TEXT, rating INTEGER, created_at TEXT, UNIQUE(user_id, package_id));
CREATE TABLE playbook_comments (id INTEGER PRIMARY KEY, package_id TEXT, user_id TEXT, parent_id INTEGER, content TEXT, moderation_status TEXT, created_at TEXT);
CREATE TABLE playbook_reports (id INTEGER PRIMARY KEY, package_id TEXT, reporter_id TEXT, severity TEXT, reason TEXT, description TEXT, moderation_status TEXT, created_at TEXT);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_playbook_versions_playbook_id ON playbook_versions(playbook_id);
CREATE INDEX idx_playbook_dependencies_child_id ON playbook_dependencies(child_id);
CREATE INDEX idx_user_playbook_installs_user_id ON user_playbook_installs(user_id);
CREATE INDEX idx_playbook_ratings_package_id ON playbook_ratings(package_id);
CREATE INDEX idx_playbook_comments_package_id ON playbook_comments(package_id);
CREATE INDEX idx_playbook_reports_package_id ON playbook_reports(package_id);
```

### 5.3 Usage

```ts
import { makeD1Binding } from "../doubles/d1-mock";
import { readFileSync } from "node:fs";

const schema = readFileSync("tests/fixtures/d1-schema.sql", "utf8");
const d1 = makeD1Binding(schema);
// Inject into module under test:
vi.stubGlobal("env", { DB: d1, ... });
```

---

## 6. KV Mock

```ts
// tests/doubles/kv-mock.ts (planned)
interface KVStore {
  get(key: string, opts?: { type?: "text" | "json" }): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string; expiration?: number }[] }>;
}

export function makeKVBinding(): KVStore {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  return {
    async get(key, opts) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      if (opts?.type === "json") return JSON.parse(entry.value);
      return entry.value;
    },
    async put(key, value, opts) {
      const expiresAt = opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
    async delete(key) { store.delete(key); },
    async list(opts) {
      let keys = [...store.keys()];
      if (opts?.prefix) keys = keys.filter(k => k.startsWith(opts.prefix!));
      const limit = opts?.limit ?? 1000;
      return { keys: keys.slice(0, limit).map(name => ({ name })) };
    },
  };
}
```

Usage: ADR-0005 (Memory Layer), ADR-0016 (Circuit Breaker state), Scenario 1 #6 (trace persistence), Scenario 3 #2 (cross-request breaker state).

---

## 7. R2 Mock

```ts
// tests/doubles/r2-mock.ts (planned)
interface R2Bucket {
  get(key: string): Promise<{ body: ArrayBuffer; metadata: unknown } | null>;
  put(key: string, value: ArrayBuffer | string | ReadableStream): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number }): Promise<{ objects: { key: string; size: number }[] }>;
}

export function makeR2Binding(): R2Bucket {
  const store = new Map<string, ArrayBuffer>();
  return {
    async get(key) {
      const buf = store.get(key);
      return buf ? { body: buf, metadata: {} } : null;
    },
    async put(key, value) {
      const buf = typeof value === "string" ? new TextEncoder().encode(value).buffer : value as ArrayBuffer;
      store.set(key, buf);
    },
    async delete(key) { store.delete(key); },
    async list(opts) {
      let keys = [...store.keys()];
      if (opts?.prefix) keys = keys.filter(k => k.startsWith(opts.prefix!));
      const limit = opts?.limit ?? 1000;
      return { objects: keys.slice(0, limit).map(key => ({ key, size: store.get(key)!.byteLength })) };
    },
  };
}
```

Usage: ADR-0002 (R2 cache whitelist), ADR-0006 (ProviderRouter write-through), Scenario 3 #6 (write-through verification).

---

## 8. Vectorize Mock

```ts
// tests/doubles/vectorize-mock.ts (planned)
interface VectorizeIndex {
  insert(vectors: { id: string; values: number[]; metadata?: object }[]): Promise<void>;
  query(vector: number[], opts?: { topK?: number; filter?: object }): Promise<{ matches: { id: string; score: number; metadata?: object }[] }>;
  deleteByIds(ids: string[]): Promise<void>;
}

export function makeVectorizeBinding(dimensions = 384): VectorizeIndex {
  const store = new Map<string, { values: number[]; metadata?: object }>();
  return {
    async insert(vectors) {
      for (const v of vectors) {
        if (v.values.length !== dimensions) {
          throw new Error(`Vector dimension mismatch: expected ${dimensions}, got ${v.values.length}`);
        }
        store.set(v.id, { values: v.values, metadata: v.metadata });
      }
    },
    async query(vector, opts) {
      if (vector.length !== dimensions) {
        throw new Error(`Query vector dimension mismatch: expected ${dimensions}, got ${vector.length}`);
      }
      const topK = opts?.topK ?? 10;
      // Cosine similarity (deterministic; no Math.random()).
      const scored = [...store.entries()].map(([id, entry]) => {
        const dot = vector.reduce((sum, v, i) => sum + v * entry.values[i], 0);
        const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) * Math.sqrt(entry.values.reduce((s, v) => s + v * v, 0));
        return { id, score: norm === 0 ? 0 : dot / norm, metadata: entry.metadata };
      });
      scored.sort((a, b) => b.score - a.score);
      return { matches: scored.slice(0, topK) };
    },
    async deleteByIds(ids) {
      for (const id of ids) store.delete(id);
    },
  };
}
```

Usage: ADR-0014 (RAG Pipeline), Scenario 2 (RAG integration).

---

## 9. ProviderRouter Test Doubles

```ts
// tests/doubles/provider-stubs.ts (planned)
import type { KlineResponse } from "@/lib/types";

export function makeYahooSuccessResponse(symbol: string): KlineResponse {
  return {
    ticker: symbol,
    timeframe: "1d",
    source: "yahoo",
    data: [/* fixture-loaded candles */],
  };
}

export function makeYahoo500Response(): Response {
  return new Response("Internal Server Error", { status: 500 });
}

export function makeAlphaSuccessResponse(symbol: string): KlineResponse {
  return { /* ... */ source: "alpha", /* ... */ };
}

export function makeR2HitResponse(symbol: string): KlineResponse {
  return { /* ... */ source: "r2_cache", /* ... */ };
}
```

---

## 10. Fetch Stub (Global)

The default fetch stub in `web/tests/setup.ts` rejects all calls:

```ts
// tests/setup.ts (existing)
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Mock mode: fetch is forbidden")));
});
```

Tests that need to assert on specific URLs override the stub locally:

```ts
it("calls Yahoo Finance on R2 miss", async () => {
  const fetchStub = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(makeYahooSuccessResponse("AAPL")), { status: 200 }));
  vi.stubGlobal("fetch", fetchStub);

  const result = await router.select("AAPL", "1d");
  expect(fetchStub).toHaveBeenCalledWith(expect.stringContaining("yahoo"));
  expect(result.source).toBe("yahoo");
});
```

**Always** restore in `afterEach`: `vi.unstubAllGlobals()`.

---

## 11. Trace Fixtures

### 11.1 `fixtures/traces/trace-happy-path.json`

```json
{
  "trace_id": "trace_001",
  "user_id": "u1",
  "query": "Analyze NVDA earnings",
  "status": "complete",
  "aggregate_cost_usd": 0.12,
  "started_at": "2024-01-15T10:00:00Z",
  "ended_at": "2024-01-15T10:02:30Z",
  "steps": [
    { "step_index": 0, "state": "init", "event": "start", "cost_usd": 0, "ts": "2024-01-15T10:00:00Z" },
    { "step_index": 1, "state": "plan", "event": "plan_ready", "cost_usd": 0, "ts": "2024-01-15T10:00:05Z" },
    { "step_index": 2, "state": "execute", "event": "execute_start", "cost_usd": 0.05, "ts": "2024-01-15T10:00:10Z" },
    { "step_index": 3, "state": "synthesize", "event": "synthesize", "cost_usd": 0.07, "ts": "2024-01-15T10:02:00Z" },
    { "step_index": 4, "state": "final_answer", "event": "final_answer", "cost_usd": 0.12, "ts": "2024-01-15T10:02:30Z" }
  ]
}
```

### 11.2 `fixtures/traces/trace-cost-exceeded.json`

Same shape, but `status: "aborted"`, `aggregate_cost_usd: 5.05`, last step `state: "aborted"`, `event: "cost_exceeded"`.

### 11.3 `fixtures/traces/trace-citation-failed.json`

Same shape, `status: "aborted"`, last step `event: "citation_validation_failed"`.

---

## 12. Backtest Result Fixtures

### 12.1 `fixtures/backtest/backtest-result-aapl-1y.json`

```json
{
  "trades": [
    { "entry_date": "2023-02-01", "entry_price": 145.00, "exit_date": "2023-03-01", "exit_price": 152.00, "return": 7.00, "return_pct": 0.0483 }
  ],
  "equity_curve": [
    { "date": "2023-01-03", "equity": 1.0 },
    { "date": "2023-12-29", "equity": 1.12 }
  ],
  "metrics": {
    "total_return": 0.12,
    "cagr": 0.12,
    "sharpe_ratio": 1.45,
    "max_drawdown": -0.08,
    "win_rate": 0.55,
    "profit_factor": 1.8,
    "sortino_ratio": 1.65,
    "calmar_ratio": 1.5
  },
  "benchmark_return": 0.10,
  "alpha": 0.02,
  "beta": 0.95,
  "sample_split": {
    "in_sample": { "period": "2023-01-03 to 2023-09-30", "sharpe": 1.55 },
    "out_of_sample": { "period": "2023-10-01 to 2023-12-29", "sharpe": 1.20 }
  }
}
```

Used by ADR-0009 unit tests and E2E EP04 #4 (backtest render).

---

## 13. Community / Playbook Fixtures

### 13.1 `fixtures/playbooks/playbook-strategy.yaml`

```yaml
kind: "strategy"
title: "SMA Cross Strategy"
description: "Buy when SMA(20) crosses above SMA(50)"
version: "1.0.0"
status: "draft"
narrative:
  why: "Trend following captures momentum in liquid large-cap stocks."
  how: "Long-only entry on golden cross, exit on death cross."
  risks: "Whipsaw in sideways markets; late exit on trend reversals."
dsl: |
  name: "SMA Cross"
  symbols: ["AAPL"]
  timeframe: "1d"
  entry:
    indicator: "sma"
    period: 20
    operator: "crosses_above"
    ref_indicator: "sma"
    ref_period: 50
  exit:
    indicator: "sma"
    period: 20
    operator: "crosses_below"
    ref_indicator: "sma"
    ref_period: 50
```

### 13.2 `fixtures/playbooks/playbook-composite-cyclic.yaml`

A composite playbook with dependencies `A → B → A` — used by ADR-0013 test #7 and E2E EP08 #3.

### 13.3 `fixtures/community/share-package.json`

> Mirrors the `SharePackage` interface from ADR-0012 §"Share Package Structure". Per ADR-0012, the package has NO `signature` and NO `license` field — author signature and CC-BY-NC licensing are Phase 2 (out of scope for Phase 1 tests).

```json
{
  "package_id": "pkg_test_001",
  "playbook_id": "pb_sma_cross",
  "version": "1.0.0",
  "author_id": "u1",
  "title": "SMA Cross Strategy",
  "description": "Trend-following baseline",
  "tags": ["trend", "sma", "large-cap"],
  "risk_disclosure": "This strategy is for educational purposes only. Past performance does not guarantee future results. Strategy may incur significant losses in ranging markets.",
  "performance_json": {
    "total_return": 0.12,
    "sharpe_ratio": 1.45,
    "max_drawdown": -0.08,
    "win_rate": 0.55,
    "profit_factor": 1.8,
    "total_trades": 42,
    "snapshot_at": "2026-07-19T00:00:00Z"
  },
  "yaml_r2_key": "playbooks/pb_sma_cross/1.0.0.yaml",
  "moderation_status": "active",
  "installed_count": 0,
  "rating_avg": 0,
  "rating_count": 0,
  "created_at": "2026-07-19T12:00:00Z"
}
```

---

## 14. Fixture Loading Helper

```ts
// tests/fixtures/load.ts (planned)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadJson<T>(relativePath: string): T {
  const fullPath = path.resolve(__dirname, relativePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as T;
}

export function loadText(relativePath: string): string {
  const fullPath = path.resolve(__dirname, relativePath);
  return readFileSync(fullPath, "utf8");
}
```

Usage:
```ts
import { loadJson, loadText } from "../fixtures/load";
const trace = loadJson("traces/trace-happy-path.json");
const yaml = loadText("strategies/strategy-minimal.yaml");
```

---

## 15. Conventions

### 15.1 Determinism
- All factory functions are pure. No `Math.random()`, no `Date.now()` inside factories.
- Use seeded LCGs for pseudo-random data; record the seed in the fixture filename if needed.
- Use fixed ISO timestamps in fixtures; never `new Date().toISOString()`.

### 15.2 Naming
- JSON fixtures: `{subject}-{variant}.json` (e.g., `aapl-1d-1y.json`).
- YAML fixtures: `{subject}.yaml` (e.g., `strategy-minimal.yaml`).
- Test doubles: `{binding}-mock.ts` (e.g., `d1-mock.ts`).
- Factory functions: `make{Subject}` (e.g., `makeKline`, `makeAskResponse`).

### 15.3 Sync with production mocks
- Files under `tests/fixtures/qa-samples/*.json` are the canonical source.
- A build script (planned: `scripts/sync-mock-fixtures.ts`) copies them to `web/public/mock/qa_samples/`.
- The reverse sync (`public/mock` → `tests/fixtures`) is forbidden — fixtures are authoritative.

### 15.4 No inline JSON in tests
Tests must not inline JSON payloads longer than 5 lines. Anything bigger goes into a fixture file.

### 15.5 Cleanup
- D1/KV/R2/Vectorize doubles are in-memory; no `afterEach` cleanup needed (they're garbage-collected with the test scope).
- `vi.stubGlobal` and `vi.stubEnv` MUST be cleaned up via `vi.unstubAllGlobals()` + `vi.unstubAllEnvs()` in `afterEach`.

---

## 16. Change Log

| Date       | Change                                                  | Author      |
|------------|---------------------------------------------------------|-------------|
| 2026-07-20 | Initial fixtures & doubles catalog from ADR inventory.  | Engineering |
