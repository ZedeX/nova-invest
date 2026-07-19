# 00 — Test Strategy

> **Owner**: Engineering
> **Last reviewed**: 2026-07-20
> **Parent**: [`README.md`](./README.md)

This document defines *how* nova-invest tests its code: the pyramid, the environments, the data strategy, the CI integration, the seams catalog, and the anti-patterns that must be rejected in review.

---

## 1. Test Pyramid

```
                       ┌────────────────┐
                       │     E2E        │  Playwright · Mock-mode Next.js dev server
                       │   ~30 specs    │  ≥1 per Epic user story
                       └────────────────┘
                  ┌─────────────────────────┐
                  │     Integration         │  Vitest · cross-ADR behavior in jsdom
                  │     ~20 specs           │  Agent Loop, RAG, Router+CB, SSE+Agent, …
                  └─────────────────────────┘
           ┌──────────────────────────────────────┐
           │              Unit                    │  Vitest · one seam per spec
           │            ~80 specs                 │  All 16 ADRs covered
           └──────────────────────────────────────┘
```

### 1.1 Layer contracts

| Layer        | What it asserts                                                                  | What it must NOT assert                                  |
|--------------|----------------------------------------------------------------------------------|---------------------------------------------------------|
| Unit         | A single seam's behavior given controlled inputs (mocks/stubs at the boundary).  | Cross-module flows, DB state, network, React rendering. |
| Integration  | Two or more seams compose correctly (e.g., Agent Loop drives LLM + Memory + Tool).| Browser rendering, user gesture sequencing.            |
| E2E          | A user-visible flow succeeds in a real browser against the dev server.           | Internal algorithm correctness (push down to unit).     |

### 1.2 Count targets

The "80/20/30" targets are derived from the ADR inventory (16 ADRs × ~5 unit tests = 80) and the 8 Epics' user stories (≥3 E2E per Epic = 24+, rounded to 30). The 20 integration target comes from the 6 mandatory multi-ADR scenarios documented in [`02-integration-tests.md`](./02-integration-tests.md) plus per-ADR integration extensions.

---

## 2. Environments

### 2.1 Mock mode (default)

- Set via `USE_MOCK=true` (default in `web/vitest.config.ts`, `web/playwright.config.ts`, `.github/workflows/tests.yml`).
- `globalThis.fetch` is stubbed in `web/tests/setup.ts` to **reject** any call. A test that triggers a real HTTP request in Mock mode is a bug.
- All data comes from JSON files under `web/public/mock/`:
  - `web/public/mock/klines/{SYMBOL}_1d.json` — K-line caches for the 10 whitelisted symbols (ADR-0002).
  - `web/public/mock/qa_samples/{intent}.json` — pre-generated LLM responses per intent (ADR-0003).
  - `web/public/mock/fundamentals/*.json` — fundamentals snapshots.
  - `web/public/mock/community/*.json` — preloaded community playbooks.
- `MockProvider` reads from `/mock/klines/...`; `MockLLM` reads from `/mock/qa_samples/...`.

### 2.2 Real mode (opt-in, never in CI)

- Set via `vi.stubEnv("USE_MOCK", "false")` inside a single test, with `vi.stubEnv("LLM_PROVIDER", "lmstudio" | "ark")` and `vi.stubEnv("ENVIRONMENT", "production")` as needed.
- **Cleanup is mandatory**: `afterEach(() => vi.unstubAllEnvs())` (or `vi.resetModules()` in `beforeEach`).
- Real-mode tests are tagged `@real` in the test name (e.g., `it("(@real) routes deep_research to Ark in production", ...)`).
- CI never runs Real-mode tests. They are for local sanity checks only.

### 2.3 Environment variable contract

| Variable          | Default in tests | Allowed overrides                         | Read by                          |
|-------------------|------------------|-------------------------------------------|----------------------------------|
| `USE_MOCK`        | `"true"`         | `"true"` \| `"false"`                     | `isMockMode()` in `env.ts`       |
| `ENVIRONMENT`     | `"test"`         | `"test"` \| `"production"`                | `getEnv()` in `env.ts`           |
| `LLM_PROVIDER`    | unset            | `"lmstudio"` \| `"ark"`                   | `route()` in `llm/router.ts`     |
| `LLM_API_BASE`    | unset            | any URL                                   | `RealLLM` constructor            |
| `R2_CACHE_SYMBOLS`| built-in list    | (do not override in tests)                | `env.ts`                         |

**Anti-pattern**: reading `process.env.X` directly inside a module under test. Always go through `getEnv()` so tests can stub via `vi.stubEnv`.

---

## 3. Data Strategy

### 3.1 Mock dataset location

```
web/public/mock/
├── klines/
│   ├── AAPL_1d.json      ← ADR-0002 whitelist (10 symbols)
│   ├── MSFT_1d.json
│   ├── GOOGL_1d.json
│   ├── AMZN_1d.json
│   ├── NVDA_1d.json
│   ├── META_1d.json
│   ├── TSLA_1d.json
│   ├── AMD_1d.json
│   ├── INTC_1d.json
│   └── NFLX_1d.json
├── qa_samples/
│   ├── aapl_price.json   ← intent: simple_qa
│   ├── nvda_earnings.json← intent: deep_research
│   ├── tsla_news.json    ← intent: tool_call
│   └── clarify.json      ← intent: clarify
├── fundamentals/
│   └── *.json
└── community/
    └── *.json            ← 10 preloaded playbooks (EP07)
```

### 3.2 Mock symbol sync

ADR-0002 requires `R2_CACHE_SYMBOLS` to be a strict subset of the filenames present under `web/public/mock/klines/`. This is enforced by:

1. The unit test `web/tests/unit/r2-cache-whitelist.test.ts` (8 active assertions, bidirectional sync).
2. The CI step `pnpm run check:mock-symbols` in `.github/workflows/tests.yml` (line 58).

A PR that adds a symbol to `R2_CACHE_SYMBOLS` without adding the corresponding JSON file (or vice versa) will fail CI.

### 3.3 Fixtures directory

Test-only fixtures (large sample payloads, golden traces, backtest fixtures) live under `web/tests/fixtures/` — see [`04-test-fixtures.md`](./04-test-fixtures.md). They are never shipped to production.

---

## 4. Coverage Thresholds Progression

Defined in `web/vitest.config.ts` lines 41–49.

| Phase   | Statements | Branches | Functions | Lines | Trigger                                    |
|---------|------------|----------|-----------|-------|--------------------------------------------|
| Phase 1 | 40%        | 40%      | 50%       | 40%   | Active (current)                           |
| Phase 2 | 60%        | 60%      | 65%       | 60%   | After ADR-0004/0005/0006 unit specs land   |
| Phase 3 | 80%        | 80%      | 80%       | 80%   | EP01 acceptance gate                       |

### 4.1 Coverage scope

- **Included**: `src/lib/**/*.ts` only.
- **Excluded**: `src/**/*.d.ts`, `src/**/*.test.{ts,tsx}`, `**/types.ts`.
- Widgets under `src/app/` and `src/components/` are validated by Playwright, not by Vitest coverage.

### 4.2 Raising thresholds

Thresholds are raised only after:
1. The new threshold passes on `main`.
2. The `05-coverage-matrix.md` row for every uncovered TR-ID has been updated to reflect the new status.
3. A commit bumps `web/vitest.config.ts` and notes the change in the commit message.

---

## 5. CI Integration

### 5.1 Workflow file

`.github/workflows/tests.yml` defines two jobs:

#### `lint-and-test` job (runs on every push/PR to main)
1. `actions/checkout@v4`
2. `pnpm/action-setup@v4` (pnpm 11)
3. `actions/setup-node@v4` (Node 22, pnpm cache)
4. `pnpm install --frozen-lockfile`
5. `pnpm approve-builds esbuild msw sharp workerd || true`
6. `pnpm lint`
7. `pnpm exec tsc --noEmit`
8. `pnpm run check:mock-symbols` (ADR-0002 sync check)
9. `pnpm test:coverage` with `USE_MOCK=true`, `ENVIRONMENT=test`
10. `codecov/codecov-action@v4` (uploads `web/coverage/`, `fail_ci_if_error: false`)
11. `pnpm build` with `USE_MOCK=true`, `ENVIRONMENT=production`

#### `e2e` job (gated on `lint-and-test`)
1. Same checkout + pnpm + node setup.
2. `pnpm exec playwright install --with-deps chromium`
3. `pnpm test:e2e` with `USE_MOCK=true`, `ENVIRONMENT=test`
4. Upload `web/playwright-report/` artifact (30-day retention).

### 5.2 Local CI parity

To reproduce CI locally:

```bash
cd web
USE_MOCK=true ENVIRONMENT=test pnpm test:coverage
USE_MOCK=true ENVIRONMENT=test pnpm test:e2e
```

### 5.3 Branch protection

PRs to `main` require:
- `lint-and-test` job passes.
- `e2e` job passes.
- No `it.todo` is removed without either a real `it()` replacing it or a note in the PR description explaining why the test was dropped.

---

## 6. Seams Catalog

The following seams are pre-agreed. New seams must be added here before a test is written against them.

### 6.1 EP01 — Agent Harness

| Seam                    | Module                                | Layer       | Tests                                                              |
|-------------------------|---------------------------------------|-------------|--------------------------------------------------------------------|
| `runAgentLoop(q, ctx)`  | `src/lib/agent/loop.ts` *(planned)*   | Integration | `tests/integration/agent-loop.test.ts`                            |
| `Supervisor`            | `src/lib/agent/supervisor.ts` *(planned)* | Unit        | `tests/unit/supervisor.test.ts` *(planned)*                       |
| `ToolRegistry`          | `src/lib/agent/tools.ts` *(planned)*  | Unit        | `tests/unit/tool-registry.test.ts` *(planned)*                    |
| `CostBudget`            | `src/lib/agent/cost.ts` *(planned)*   | Unit        | `tests/unit/cost-budget.test.ts` *(planned)*                      |
| E2E: Ask/Build/Dashboard | `src/app/(routes)`                    | E2E         | `tests/e2e/ep01-*.spec.ts` *(planned)*                            |

### 6.2 EP02 — Data Layer

| Seam                    | Module                                | Layer | Tests                                          |
|-------------------------|---------------------------------------|-------|------------------------------------------------|
| `getProvider()`         | `src/lib/data/provider.ts`            | Unit  | `tests/unit/use-mock-switch.test.ts`           |
| `shouldCacheR2(sym)`    | `src/lib/env.ts`                      | Unit  | `tests/unit/r2-cache-whitelist.test.ts`        |
| `ProviderRouter.select()`| `src/lib/data/router.ts` *(planned)* | Unit  | `tests/unit/provider-router.test.ts` *(planned)* |
| `RealProvider.fetch()`  | `src/lib/data/provider.ts`            | Unit  | `tests/unit/real-provider.test.ts` *(planned, @real)* |

### 6.3 EP03 — Ask Agent

| Seam                      | Module                                  | Layer       | Tests                                            |
|---------------------------|-----------------------------------------|-------------|--------------------------------------------------|
| `classifyIntent(q)`       | `src/lib/llm/router.ts`                 | Unit        | `tests/unit/classify-intent.test.ts`             |
| `route(intent)`           | `src/lib/llm/router.ts`                 | Unit        | `tests/unit/llm-route.test.ts`                   |
| `getLLM(intent)`          | `src/lib/llm/router.ts`                 | Unit        | `tests/unit/llm-route.test.ts`                   |
| `validateCitations(resp)` | `src/lib/llm/citations.ts` *(planned)*  | Unit        | `tests/unit/citation-validator.test.ts` *(planned)* |
| `ragRetrieve(q, opts)`    | `src/lib/rag/pipeline.ts` *(planned)*   | Integration | `tests/integration/rag-pipeline.test.ts` *(planned)* |
| `MemoryStore`             | `src/lib/agent/memory.ts` *(planned)*   | Unit        | `tests/unit/memory-store.test.ts` *(planned)*    |

### 6.4 EP04 — Strategy DSL

| Seam                       | Module                                     | Layer | Tests                                       |
|----------------------------|--------------------------------------------|-------|---------------------------------------------|
| `validateDSL(yaml)`        | `src/lib/strategy/validator.ts` *(planned)*| Unit  | `tests/unit/strategy-dsl.test.ts` *(planned)* |
| `parseStrategy(yaml)`      | `src/lib/strategy/parser.ts` *(planned)*   | Unit  | `tests/unit/strategy-dsl.test.ts` *(planned)* |
| `runBacktest(s, data)`     | `src/lib/backtest/engine.ts` *(planned)*   | Unit  | `tests/unit/backtest-engine.test.ts` *(planned)* |

### 6.5 EP05 — Dashboard

| Seam                    | Module                                | Layer | Tests                                          |
|-------------------------|---------------------------------------|-------|------------------------------------------------|
| `<Widget>` render       | `src/components/widgets/*`            | E2E   | `tests/e2e/ep05-dashboard.spec.ts` *(planned)* |
| `useDataFeed(symbol)`   | `src/lib/hooks/use-data-feed.ts` *(planned)* | Unit | `tests/unit/use-data-feed.test.ts` *(planned)* |
| Mock Badge              | `src/components/MockBadge.tsx`        | E2E   | `tests/e2e/ep05-dashboard.spec.ts` *(planned)* |

### 6.6 EP06 — Broker Integration

| Seam                       | Module                                  | Layer | Tests                                       |
|----------------------------|-----------------------------------------|-------|---------------------------------------------|
| `BrokerAdapter`            | `src/lib/broker/adapter.ts` *(planned)* | Unit  | `tests/unit/broker-adapter.test.ts` *(planned)* |
| `PaperBroker.placeOrder()` | `src/lib/broker/paper.ts` *(planned)*   | Unit  | `tests/unit/paper-broker.test.ts` *(planned)* |
| `BrokerRiskManager`        | `src/lib/broker/risk.ts` *(planned)*    | Unit  | `tests/unit/broker-risk.test.ts` *(planned)* |

### 6.7 EP07 — Share & Community

| Seam                       | Module                                       | Layer | Tests                                              |
|----------------------------|----------------------------------------------|-------|----------------------------------------------------|
| `SharePackage`             | `src/lib/community/share.ts` *(planned)*     | Unit  | `tests/unit/community-share.test.ts` *(planned)*   |
| `AntiAbuseFilter`          | `src/lib/community/anti-abuse.ts` *(planned)*| Unit  | `tests/unit/anti-abuse-filter.test.ts` *(planned)* |

### 6.8 EP08 — Playbook System

| Seam                          | Module                                        | Layer | Tests                                      |
|-------------------------------|-----------------------------------------------|-------|--------------------------------------------|
| `validatePlaybook(yaml)`      | `src/lib/playbook/validator.ts` *(planned)*   | Unit  | `tests/unit/playbook.test.ts` *(planned)*  |
| `PlaybookExecutor`            | `src/lib/playbook/executor.ts` *(planned)*    | Unit  | `tests/unit/playbook.test.ts` *(planned)*  |
| `detectCycles(deps)`          | `src/lib/playbook/cycles.ts` *(planned)*      | Unit  | `tests/unit/playbook-cycles.test.ts` *(planned)* |

---

## 7. Anti-patterns to Reject in Review

These are blocking issues in code review. The list is adapted from the TDD skill reference (`C:\Users\Administrator\.agents\skills\tdd\SKILL.md`).

### 7.1 Implementation-coupled tests
A test that mocks internal collaborators, tests private methods, or asserts through a side channel (e.g., querying the D1 database to verify a function wrote a row, instead of asserting on the function's return value). **Tell**: the test breaks on refactor even though behavior is unchanged. **Fix**: assert through the public seam only.

### 7.2 Tautological tests
A test whose assertion recomputes the expected value the way the code does — `expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself. **Tell**: the test cannot disagree with the code by construction. **Fix**: derive expected values from an independent source of truth (a known-good literal, a worked example, the spec).

### 7.3 Horizontal slicing
Writing all tests for a module up front, then implementing the module. **Tell**: bulk tests verify *imagined* behavior, not real behavior; tests go insensitive to real changes; test structure is committed before the implementation is understood. **Fix**: work in vertical slices — one test → one minimal implementation → repeat. Each test is a tracer bullet.

### 7.4 Internal-state peeking
Using `vi.spyOn` on a private method, reading `module._privateState`, or asserting on a module-level cache variable. **Tell**: the test reaches inside the seam. **Fix**: assert on the public return value or observable side effect (e.g., a fetch stub being called with the right URL).

### 7.5 Mocking the system under test
`vi.mock("@/lib/data/provider")` inside `tests/unit/use-mock-switch.test.ts`. **Tell**: the test is no longer testing the real module. **Fix**: mock only external boundaries (`fetch`, `globalThis.env`, KV bindings). The module under test runs for real.

### 7.6 Untagged Real-mode tests
A test that sets `USE_MOCK=false` without tagging `@real` in the test name. **Tell**: the test pollutes the Mock-mode CI run. **Fix**: tag and isolate, or convert to a Mock-mode test.

### 7.7 Unmapped tests
A test that does not reference an ADR or TR-ID in its `describe` block. **Tell**: nobody knows why the test exists; it gets deleted silently in refactors. **Fix**: every `describe` block starts with a comment listing the ADR ID(s) and TR-ID(s) it covers.

---

## 8. Tooling

### 8.1 Vitest configuration

File: `web/vitest.config.ts`
- Environment: `jsdom`
- `globals: true` (no need to import `describe`/`it`/`expect`)
- Setup: `./tests/setup.ts`
- Includes: `tests/unit/**/*.test.{ts,tsx}`, `tests/integration/**/*.test.{ts,tsx}`
- Excludes: `node_modules/**`, `tests/e2e/**`
- Coverage: v8 provider, `src/lib/**/*.ts` only
- Alias: `@` → `./src`

### 8.2 Playwright configuration

File: `web/playwright.config.ts`
- testDir: `./tests/e2e`
- Browser: Chromium only (Firefox/WebKit planned for Phase 2)
- baseURL: `http://localhost:3000`
- webServer: `pnpm dev` (Next.js dev server, Mock mode)
- Trace: `on-first-retry`
- Screenshot: `only-on-failure`
- CI: 2 retries, 1 worker; local: 0 retries, default workers

### 8.3 Test setup

File: `web/tests/setup.ts`
- Registers `@testing-library/jest-dom` matchers.
- Snapshots `process.env` and restores it between tests.
- Defaults: `USE_MOCK=true`, `ENVIRONMENT=test`.
- Stubs `globalThis.fetch` to reject any call (Mock-mode contract: zero HTTP).

### 8.4 Helpful scripts (from `web/package.json`)

| Script                  | What it does                                   |
|-------------------------|------------------------------------------------|
| `pnpm test`             | Run Vitest in watch mode (Mock mode default).  |
| `pnpm test:coverage`    | Run Vitest with coverage (CI parity).          |
| `pnpm test:e2e`         | Run Playwright (starts dev server if needed).  |
| `pnpm run check:mock-symbols` | Verify `R2_CACHE_SYMBOLS` ↔ `web/public/mock/klines/*.json` bidirectional sync (ADR-0002). |

---

## 9. Test Naming Conventions

### 9.1 File names
- Unit: `tests/unit/{kebab-case-subject}.test.ts`
- Integration: `tests/integration/{kebab-case-scenario}.test.ts`
- E2E: `tests/e2e/{epic-kebab-case}.spec.ts` (note: `.spec.ts`, not `.test.ts`)

### 9.2 `describe`/`it` blocks
- `describe("{SeamName}", () => { ... })` — top-level always the seam.
- `it("does X when Y", () => { ... })` — behavior-focused, no "should".
- Tag Real-mode tests: `it("(@real) routes deep_research to Ark in production", ...)`.
- Tag TODO tests: `it.todo("returns MockProvider when USE_MOCK is unset")`.

### 9.3 ADR/TR mapping comment
Every `describe` block starts with:
```ts
/**
 * Covers: ADR-0003 (LLM Routing + Cost Cap)
 * TR-IDs: TR-EP03-004, TR-EP03-005, TR-EP03-006
 */
```

---

## 10. Change Log

| Date       | Change                                       | Author      |
|------------|----------------------------------------------|-------------|
| 2026-07-20 | Initial test strategy written from ADR inventory. | Engineering |
