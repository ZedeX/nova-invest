# TDD Master Plan — nova-invest

> **Status**: Living document. Update whenever an ADR is added, an Epic's test seam changes, or coverage thresholds are raised.
> **Owner**: Engineering
> **Last reviewed**: 2026-07-20
> **Scope**: All production code under `web/src/` (Next.js 16.2.10 + Cloudflare Workers 4 + D1 + R2 + KV + Vectorize).

This document is the entry point for Test-Driven Development on nova-invest. It defines the high-level strategy, links to the detailed per-layer specs, and provides the quick-reference table every contributor should consult before writing a test.

---

## 1. Strategy at a Glance

nova-invest follows the **classic test pyramid** with three layers, each backed by a distinct toolchain and a distinct seam discipline:

| Layer        | Tool          | Directory                  | Count target | Current count | Run in CI |
|--------------|---------------|----------------------------|--------------|---------------|-----------|
| Unit         | Vitest        | `web/tests/unit/`          | 80+ specs    | 19 specs (263 tests) | Yes       |
| Integration  | Vitest        | `web/tests/integration/`   | 20+ specs    | 2 specs (12 tests)   | Yes       |
| E2E          | Playwright    | `web/tests/e2e/`           | 30+ specs    | 9 specs (smoke + cross-epic) | Yes       |

**The TDD iron law on this project**: no production code under `web/src/lib/` ships without a failing test that justifies it. UI widgets may be validated through Playwright E2E if unit-testing them would require mocking React internals.

See [`00-test-strategy.md`](./00-test-strategy.md) for the full strategy (environments, data, coverage progression, anti-patterns).

---

## 2. Coverage Targets

Per **EP01 acceptance criteria** the project must reach **≥ 80% unit test coverage** on `src/lib/**/*.ts`. The Vitest config at `web/vitest.config.ts` defines the progression:

| Phase   | Statements | Branches | Functions | Lines | Status        |
|---------|------------|----------|-----------|-------|---------------|
| Phase 1 | 40%        | 40%      | 50%       | 40%   | Active        |
| Phase 2 | 60%        | 60%      | 65%       | 60%   | Planned       |
| Phase 3 | 80%        | 80%      | 80%       | 80%   | Target (EP01) |

Current measured coverage: **~50% statements / ~45% branches** (gap documented in `web/vitest.config.ts`).

Files excluded from coverage:
- `src/**/*.d.ts`
- `src/**/*.test.{ts,tsx}`
- `**/types.ts` (pure type declarations)

Files included: `src/lib/**/*.ts` only. Widgets under `src/app/` and `src/components/` are validated through Playwright, not Vitest coverage.

---

## 3. Test Pyramid

```
                    ┌──────────────┐
                    │   E2E (3)    │  Playwright · Mock-mode dev server
                    └──────────────┘
                ┌──────────────────────┐
                │  Integration (1 TODO)│  Vitest · cross-ADR behavior
                └──────────────────────┘
        ┌────────────────────────────────────┐
        │        Unit (4 active)             │  Vitest · one seam per spec
        └────────────────────────────────────┘
```

**Rule of thumb**: if a behavior can be asserted at a lower layer, do not promote it. A unit test that calls `classifyIntent()` is strictly better than an E2E test that re-types the same query into a textbox.

---

## 4. Documentation Map

| File                          | Purpose                                                              | Audience                      |
|-------------------------------|----------------------------------------------------------------------|-------------------------------|
| `README.md` (this file)       | Master plan, pyramid, coverage targets, ADR→test quick reference      | All contributors              |
| [`00-test-strategy.md`](./00-test-strategy.md) | Environments, data strategy, CI, seams catalog, anti-patterns       | Test authors, reviewers       |
| [`01-unit-tests.md`](./01-unit-tests.md)      | Per-ADR unit test specs with Red→Green ordering                     | Backend / lib developers      |
| [`02-integration-tests.md`](./02-integration-tests.md) | Multi-ADR integration scenarios (Agent Loop, RAG, Router+CB, …)     | Backend / integration owners  |
| [`03-e2e-tests.md`](./03-e2e-tests.md)        | Per-Epic Playwright specs (EP01–EP08)                               | Full-stack / QA               |
| [`04-test-fixtures.md`](./04-test-fixtures.md)| Factories, stubs, D1 schema, Vectorize mock, ProviderRouter doubles | All test authors              |
| [`05-coverage-matrix.md`](./05-coverage-matrix.md) | TR-ID → ADR → test file → status → priority, grouped by Epic        | Tech leads, auditors          |

---

## 5. ADR → Test File → Seam Quick Reference

| ADR      | Title                          | Seam (public interface)                          | Test file                                         | Status      |
|----------|--------------------------------|--------------------------------------------------|---------------------------------------------------|-------------|
| ADR-0001 | Use-Mock Dual-Mode Switch      | `getProvider()`, `isMockMode()`, `getEnv()`      | `tests/unit/use-mock-switch.test.ts`              | 5/8 active  |
| ADR-0002 | R2 Cache Whitelist             | `shouldCacheR2(symbol)`, `R2_CACHE_SYMBOLS`      | `tests/unit/r2-cache-whitelist.test.ts`           | 8/8 active  |
| ADR-0003 | LLM Routing + Cost Cap         | `classifyIntent()`, `route(intent)`, `getLLM()`  | `tests/unit/classify-intent.test.ts`, `tests/unit/llm-route.test.ts` | 8/14 active |
| ADR-0004 | Agent Loop State Machine       | `runAgentLoop(query, ctx)`                       | `tests/integration/agent-loop.test.ts`            | 5 TODO stubs|
| ADR-0005 | Memory Layer                   | `MemoryStore` interface (KV-backed)              | `tests/unit/memory-store.test.ts` *(planned)*     | Not started |
| ADR-0006 | Tool Protocol                  | `TOOL_REGISTRY`, `ToolCall`, `ToolResult`, `ToolHandler` | `tests/unit/tool-protocol.test.ts` *(planned)* | Not started |
| ADR-0007 | Citation Validator             | `validateCitations(resp, mode)`                  | `tests/unit/citation-validator.test.ts` *(planned)* | Not started |
| ADR-0008 | Strategy DSL                   | `validateDSL(yaml)`, `parseStrategy(yaml)`       | `tests/unit/strategy-dsl.test.ts` *(planned)*     | Not started |
| ADR-0009 | Backtest Engine                | `runBacktest(strategy, data)`                    | `tests/unit/backtest-engine.test.ts` *(planned)*  | Not started |
| ADR-0010 | Dashboard Layout + Widget System | `WidgetConfig`, `WidgetType`, `DashboardGridConfig`, `DashboardSWRConfig`, `WidgetErrorBoundary` | `tests/unit/dashboard-layout.test.ts` *(planned)* | Not started |
| ADR-0011 | D1 Master Schema               | D1 migration files + DAO classes                 | `tests/unit/d1-schema.test.ts` *(planned)*        | Not started |
| ADR-0012 | Community Sharing              | `SharePackage`, `AntiAbuseFilter`                | `tests/unit/community-share.test.ts` *(planned)*  | Not started |
| ADR-0013 | Playbook System                | `PlaybookExecutor`, `validatePlaybook(yaml)`     | `tests/unit/playbook.test.ts` *(planned)*         | Not started |
| ADR-0014 | RAG Pipeline                   | `ragRetrieve(query, opts)`                       | `tests/unit/rag-pipeline.test.ts` *(planned)*     | Not started |
| ADR-0015 | SSE Streaming                  | `SSEncoder`, `resolveStreamingMode(intent, env)`, `STREAM_THRESHOLD_MS` | `tests/unit/sse-stream.test.ts` *(planned)* | Not started |
| ADR-0016 | Circuit Breaker + ProviderRouter | `CircuitBreaker.isTripped/recordFailure/recordSuccess/reset/getState`, `ProviderRouter` | `tests/unit/circuit-breaker.test.ts` *(planned)* | Not started |

**Status legend**: `n/m active` = n `it()` blocks implemented out of m total (m − n are `it.todo`). `Not started` = the spec file does not yet exist; see `01-unit-tests.md` for the planned Red→Green ordering.

---

## 6. How to Use This Plan

### Before writing any test
1. Read [`00-test-strategy.md`](./00-test-strategy.md) § "Seams Catalog" to confirm the seam is pre-agreed.
2. Find your ADR in [`01-unit-tests.md`](./01-unit-tests.md) and follow the Red→Green ordering written there. Do not invent new test cases without writing them down first.
3. If your test crosses ADR boundaries, find the matching scenario in [`02-integration-tests.md`](./02-integration-tests.md).
4. Pull fixtures from [`04-test-fixtures.md`](./04-test-fixtures.md). Do not construct ad-hoc JSON inline.

### Before opening a PR
1. Run `pnpm test:coverage` locally — the CI gate at `.github/workflows/tests.yml` will reject PRs that drop below the active thresholds.
2. Update the row in [`05-coverage-matrix.md`](./05-coverage-matrix.md) for any TR-ID whose status changed.
3. Update the `Status` column in §5 above if a `it.todo` became an `it()`.

### Before merging to main
- CI runs lint + tsc + `check:mock-symbols` + `test:coverage` + `build` on every push and PR.
- E2E (Playwright) runs as a separate job gated on the lint-and-test job.
- Both jobs set `USE_MOCK=true` and `ENVIRONMENT=test`. Real-provider tests are opt-in only and never run in CI.

---

## 7. Iron Rules

These rules are non-negotiable. PRs that break them must be blocked in review.

1. **Red before green.** No production code is written without a failing test that justifies it. Speculation is forbidden — see [`01-unit-tests.md`](./01-unit-tests.md) for the planned ordering.
2. **Vertical slices.** One test → one minimal implementation → repeat. Never write all tests up front. The horizontal-slicing anti-pattern is documented in [`00-test-strategy.md`](./00-test-strategy.md) § "Anti-patterns".
3. **Test only at pre-agreed seams.** A "seam" is the public boundary where behavior is observable. Tests never reach inside a module. New seams must be added to [`00-test-strategy.md`](./00-test-strategy.md) before a test is written against them.
4. **No tautological tests.** Expected values must come from an independent source of truth (a known-good literal, a worked example, the spec). Recomputing the answer the way the code does is forbidden.
5. **No implementation coupling.** Tests must not assert on internal collaborator calls, private methods, or DB state reachable only through a side channel.
6. **Mock mode is the default.** `USE_MOCK=true` is set in `web/vitest.config.ts`, `web/playwright.config.ts`, and the CI workflow. Tests that need a real provider must opt in explicitly via `vi.stubEnv("USE_MOCK", "false")` and clean up after themselves.
7. **Every test maps to a TR-ID or an ADR validation criterion.** Unmapped tests are noise; they get deleted in refactorings because nobody knows why they exist.
8. **Zero external HTTP in Mock mode.** `web/tests/setup.ts` stubs `globalThis.fetch` to reject. Any test that triggers a real fetch in Mock mode is a bug, not a test.

---

## 8. Glossary

- **Seam**: a public interface boundary where behavior is observable without reaching into implementation (e.g., `getProvider()` is a seam; the module-level `_provider` cache inside `provider.ts` is not).
- **TR-ID**: a Traceability Requirement ID from `docs/architecture/tr-registry.yaml`. Format: `TR-EP{NN}-{NNN}` (e.g., `TR-EP01-001`).
- **Vertical slice**: a single Red→Green cycle that delivers one observable behavior end-to-end.
- **Mock mode**: the project's default test environment, in which `USE_MOCK=true` and all external providers are replaced with file-backed stubs under `web/public/mock/`.
- **Cost cap**: per-request USD ceiling enforced by the LLM router (ADR-0003). Aggregate ceiling enforced by the agent loop (ADR-0004) is `$5`.

---

## 9. Change Log

| Date       | Change                                                                  | Author      |
|------------|-------------------------------------------------------------------------|-------------|
| 2026-07-20 | Initial TDD master plan created from ADR-0001..0016 and tr-registry v7. | Engineering |
| 2026-07-20 | Updated: 19 unit specs (263 tests), 2 integration specs (12 tests), 9 e2e specs. ADR-0007 Stage 2 citation validator implemented. | Engineering |
