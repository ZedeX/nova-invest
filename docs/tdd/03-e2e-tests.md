# 03 — E2E Test Specs (per Epic)

> **Owner**: Engineering
> **Last reviewed**: 2026-07-20
> **Parent**: [`README.md`](./README.md)

End-to-end tests assert that **user-visible flows succeed** in a real Chromium browser against the Next.js dev server. They live in `web/tests/e2e/` and are executed by Playwright.

The 3 existing smoke tests (`smoke.spec.ts`) are kept as a baseline. This document specifies the additional per-Epic specs that must be added to reach the 30-spec target from [`00-test-strategy.md`](./00-test-strategy.md) §1.2.

---

## 1. Configuration Recap

File: `web/playwright.config.ts`

| Setting             | Value                                  |
|---------------------|----------------------------------------|
| `testDir`           | `./tests/e2e`                          |
| Browser             | Chromium only (Firefox/WebKit: Phase 2)|
| `baseURL`           | `http://localhost:3000`                |
| `webServer`         | `pnpm dev` (Mock mode)                 |
| `trace`             | `on-first-retry`                       |
| `screenshot`        | `only-on-failure`                      |
| CI retries          | 2                                      |
| CI workers          | 1                                      |

All E2E runs use `USE_MOCK=true` and `ENVIRONMENT=test` — no real LLM, no real market data, no real broker.

---

## 2. Smoke Tests (existing)

File: `web/tests/e2e/smoke.spec.ts`

| #  | Test name                                    | Status    |
|----|----------------------------------------------|-----------|
| 1  | Home page loads with Dashboard h1            | ✅ active |
| 2  | Ask Agent page loads with suggested questions| ✅ active |
| 3  | Navigation sidebar renders                   | ✅ active |

These remain in place. New specs below extend coverage to all 8 Epics.

---

## 3. EP01 — Agent Harness

File: `web/tests/e2e/ep01-agent-harness.spec.ts` *(planned)*

### Test cases

#### 1. `Ask Agent: user types a simple_qa query and receives a streamed answer`
- **Steps**:
  1. `page.goto("/ask")`
  2. `page.locator("textarea[name=query]").fill("What's the current price of AAPL?")`
  3. `page.locator("button[type=submit]").click()`
  4. Wait for `page.locator("[data-testid=answer-summary]")` to be visible (timeout 10s).
- **Expected**: answer summary contains "AAPL" and a numeric value; "Mock" badge is visible.
- **Why**: EP01 acceptance — Ask scenario end-to-end demo.

#### 2. `Ask Agent: deep_research query shows multi-step trace`
- **Steps**:
  1. Navigate to `/ask`.
  2. Submit "Analyze NVDA earnings trend over the past 6 months".
  3. Wait for `[data-testid=trace-step]` to render at least 3 items.
- **Expected**: trace steps visible with state labels (Plan / Execute / Synthesize); final answer has citations.
- **Why**: EP01 §"Validation criteria" — trace visibility.

#### 3. `Ask Agent: cost exceeded banner appears on simulated $5 overrun`
- **Steps**:
  1. Set up Mock LLM to return high `cost.credits_used`.
  2. Submit a query.
- **Expected**: `[data-testid=cost-exceeded-banner]` visible.
- **Why**: ADR-0004 §"Validation criteria" #3 surfaced in UI.

#### 4. `Build (Strategy) page is reachable from sidebar`
- **Steps**: click sidebar link "Build".
- **Expected**: URL becomes `/strategy`; h1 contains "Strategy Builder".
- **Why**: EP01 acceptance — Build scenario reachable.

#### 5. `Dashboard page is reachable from sidebar`
- **Steps**: click sidebar link "Dashboard".
- **Expected**: URL becomes `/`; dashboard grid renders.
- **Why**: EP01 acceptance — Dashboard scenario reachable.

---

## 4. EP02 — Data Layer

File: `web/tests/e2e/ep02-data-layer.spec.ts` *(planned)*

### Test cases

#### 1. `chart page for whitelisted symbol AAPL renders klines`
- **Steps**:
  1. `page.goto("/chart/AAPL")`
  2. Wait for `[data-testid=kline-chart]` to be visible.
- **Expected**: chart canvas has at least 10 candles; "Source: mock" badge visible.
- **Why**: EP02 acceptance — whitelisted symbol loads.

#### 2. `chart page for non-whitelisted symbol RKLB shows error`
- **Steps**: `page.goto("/chart/RKLB")`.
- **Expected**: `[data-testid=error-message]` contains "not whitelisted".
- **Why**: ADR-0002 — whitelist enforced in UI.

#### 3. `Mock badge is shown on chart when USE_MOCK=true`
- **Steps**: `page.goto("/chart/AAPL")`.
- **Expected**: `[data-testid=mock-badge]` visible with text "MOCK".
- **Why**: EP02 §"Decision" — Mock Badge per ADR-0001.

#### 4. `watchlist displays all 10 whitelisted symbols`
- **Steps**: `page.goto("/")`; inspect `[data-testid=watchlist]` items.
- **Expected**: 10 items, one per symbol in `R2_CACHE_SYMBOLS`.
- **Why**: ADR-0002 §"Validation criteria" #4 — 10 symbols.

#### 5. `changing timeframe reloads chart with new data`
- **Steps**: `page.goto("/chart/AAPL")`; click `[data-testid=timeframe-1h]`.
- **Expected**: chart reloads; URL or query param reflects `tf=1h`.
- **Why**: EP02 acceptance — timeframe switching.

---

## 5. EP03 — Ask Agent

File: `web/tests/e2e/ep03-ask-agent.spec.ts` *(planned)*

### Test cases

#### 1. `suggested questions populate on /ask page`
- **Steps**: `page.goto("/ask")`.
- **Expected**: `[data-testid=suggested-question]` count ≥ 3.
- **Why**: EP03 acceptance — suggested questions.

#### 2. `clicking a suggested question fills the textarea`
- **Steps**: `page.goto("/ask")`; click first suggested question.
- **Expected**: `textarea[name=query]` value matches the clicked question text.
- **Why**: UX contract.

#### 3. `simple_qa answer includes numeric_fact with citation`
- **Steps**: submit "current price of AAPL".
- **Expected**: answer contains `[data-testid=numeric-fact]` with value, unit, and `[data-testid=citation]`.
- **Why**: ADR-0007 §"Validation criteria" — citation surface.

#### 4. `clarify intent: query "hello" returns a clarification prompt`
- **Steps**: submit "hello".
- **Expected**: answer asks the user to clarify; no citations.
- **Why**: ADR-0003 §"Decision" — `clarify` fallback intent.

#### 5. `citation with invalid quote triggers partial_strip in default mode`
- **Steps**: submit a query whose Mock response includes a citation with mismatched quote.
- **Expected**: response renders with the bad citation stripped; `[data-testid=citation-warning]` visible.
- **Why**: ADR-0007 §"Decision" — partial_strip is the default mode.

#### 6. `RAG results panel shows source labels (Yahoo / SEC / News / Playbooks / Community)`
- **Steps**: submit a deep_research query.
- **Expected**: `[data-testid=rag-source-label]` count = 5 (one per adapter).
- **Why**: ADR-0014 §"Validation criteria" #1 — 5 source adapters surfaced.

---

## 6. EP04 — Strategy DSL

File: `web/tests/e2e/ep04-strategy-dsl.spec.ts` *(planned)*

### Test cases

#### 1. `strategy builder page loads with empty YAML editor`
- **Steps**: `page.goto("/strategy")`.
- **Expected**: `[data-testid=yaml-editor]` visible; "Validate" button visible.
- **Why**: EP04 acceptance — strategy builder reachable.

#### 2. `validating minimal YAML shows success`
- **Steps**:
  1. `page.goto("/strategy")`
  2. Fill editor with minimal valid YAML (from fixture `strategy-minimal.yaml`).
  3. Click "Validate".
- **Expected**: `[data-testid=validation-result]` shows "Valid".
- **Why**: ADR-0008 §"Validation criteria" #1 — happy path.

#### 3. `validating YAML with unknown indicator shows error`
- **Steps**: fill editor with `entry: { indicator: "foobar" }`; click Validate.
- **Expected**: error message references `indicator` enum.
- **Why**: ADR-0008 §"Validation criteria" #2.

#### 4. `running backtest renders equity curve and metrics`
- **Steps**: fill valid strategy; click "Run Backtest".
- **Expected**:
  - `[data-testid=equity-curve]` visible.
  - `[data-testid=metric-total-return]` shows a number.
  - `[data-testid=metric-sharpe]` shows a number.
- **Why**: ADR-0009 §"Validation criteria" #1 — output rendered.

#### 5. `70/30 split badge shows in-sample vs out-of-sample periods`
- **Steps**: after backtest, inspect `[data-testid=sample-split]`.
- **Expected**: text like "In-sample: 2023-01-01 to 2023-09-30 · Out-of-sample: 2023-10-01 to 2023-12-31".
- **Why**: ADR-0009 §"Validation criteria" #2.

#### 6. `strategy status transitions Draft → Validated on successful validation`
- **Steps**: validate valid YAML.
- **Expected**: `[data-testid=strategy-status]` updates from "Draft" to "Validated".
- **Why**: ADR-0008 §"Decision" — FSM transition surfaced.

---

## 7. EP05 — Dashboard

File: `web/tests/e2e/ep05-dashboard.spec.ts` *(planned)*

### Test cases

#### 1. `dashboard renders 6 default widgets`
- **Steps**: `page.goto("/")`.
- **Expected**: `[data-testid=widget]` count ≥ 6.
- **Why**: EP05 acceptance — 6 default widgets.

#### 2. `widget drag-and-drop reorders layout`
- **Steps**: drag `[data-testid=widget-watchlist]` to the position of `[data-testid=widget-chart]`.
- **Expected**: order of widgets in DOM changes.
- **Why**: EP05 §"Decision" — `react-grid-layout` drag-and-drop.

#### 3. `Mock Badge visible on every widget when USE_MOCK=true`
- **Steps**: `page.goto("/")`.
- **Expected**: every `[data-testid=widget]` contains a child `[data-testid=mock-badge]`.
- **Why**: EP05 §"Decision" — Mock Badge per widget.

#### 4. `chart widget for AAPL loads within 100ms (Mock mode)`
- **Steps**: `page.goto("/")`; measure time from navigation to `[data-testid=widget-chart]` rendered.
- **Expected**: ≤ 100ms (Mock mode).
- **Why**: EP05 §"Performance budgets" — widget render <100ms Mock.

#### 5. `LCP under 2s in Mock mode`
- **Steps**: navigate to `/`; capture LCP via Playwright `page.evaluate(() => performance ...)`.
- **Expected**: LCP ≤ 2000ms.
- **Why**: EP05 §"Performance budgets" — LCP <2s Mock.

#### 6. `SWR deduplicationInterval=5000 prevents duplicate fetches within 5s`
- **Steps**: navigate to `/`; wait 2s; reload widget; inspect `fetch` stub call count.
- **Expected**: only 1 fetch per widget within 5s window.
- **Why**: EP05 §"Decision" — SWR dedup.

#### 7. `changing symbol in chart widget updates URL`
- **Steps**: in `[data-testid=widget-chart]`, click symbol picker, select "MSFT".
- **Expected**: URL changes to `/?symbol=MSFT` or similar.
- **Why**: EP05 §"Decision" — URL state sync.

---

## 8. EP06 — Broker Integration

File: `web/tests/e2e/ep06-broker.spec.ts` *(planned)*

### Test cases

#### 1. `broker page shows paper account with $100,000 default balance`
- **Steps**: `page.goto("/broker")`.
- **Expected**: `[data-testid=account-balance]` shows "$100,000.00"; `[data-testid=account-mode]` shows "Paper".
- **Why**: EP06 acceptance — PaperBroker default.

#### 2. `placing a market buy order for AAPL creates an order row`
- **Steps**:
  1. `page.goto("/broker")`
  2. Fill `[name=symbol]` with "AAPL", `[name=quantity]` with "10".
  3. Select "Market" + "Buy".
  4. Click "Place Order".
- **Expected**: `[data-testid=order-row]` count increases by 1; new row shows "filled" status.
- **Why**: EP06 §"Validation criteria" — order lifecycle.

#### 3. `paper broker applies 5bps slippage to market orders`
- **Steps**: place market buy for AAPL at $200; inspect filled price.
- **Expected**: `filled_price ≈ 200 * (1 + 0.0005) = 200.10`.
- **Why**: EP06 §"Decision" — slippage model.

#### 4. `BrokerRiskManager blocks order exceeding buying power`
- **Steps**: place order with quantity that exceeds balance.
- **Expected**: error toast "Insufficient buying power"; no order row created.
- **Why**: EP06 §"Decision" — risk rule #1.

#### 5. `order lifecycle FSM: pending → partial → filled`
- **Steps**: place large limit order; Mock fills partially then fully.
- **Expected**: order row status transitions through pending → partial → filled.
- **Why**: EP06 §"Decision" — FSM visible to user.

#### 6. `positions table updates after fill`
- **Steps**: place buy order; wait for fill.
- **Expected**: `[data-testid=position-row]` for that symbol appears with quantity and avg_price.
- **Why**: EP06 §"Validation criteria" — positions persistence.

---

## 9. EP07 — Share & Community

File: `web/tests/e2e/ep07-community.spec.ts` *(planned)*

### Test cases

#### 1. `community page shows 10 preloaded Mock playbooks`
- **Steps**: `page.goto("/community")`.
- **Expected**: `[data-testid=playbook-card]` count === 10.
- **Why**: EP07 acceptance — 10 preloaded samples.

#### 2. `installing a community playbook creates a row in user_playbooks`
- **Steps**:
  1. `page.goto("/community")`
  2. Click "Install" on first playbook card.
- **Expected**: button changes to "Installed"; `[data-testid=installed-badge]` appears.
- **Why**: EP07 §"Validation criteria" — install flow.

#### 3. `rating a playbook updates the average`
- **Steps**:
  1. Install a playbook.
  2. Click 5-star rating.
- **Expected**: `[data-testid=rating-avg]` updates to reflect new rating.
- **Why**: EP07 §"Decision" — rating dedup + aggregate.

#### 4. `comment depth limited to 2: reply to depth-2 comment is rejected`
- **Steps**: navigate to a playbook with depth-2 comment chain; click "Reply" on the depth-2 comment.
- **Expected**: error toast "Max comment depth reached".
- **Why**: EP07 §"Decision" + ADR-0012 §"Validation criteria".

#### 5. `comment with forbidden word is rejected with toast`
- **Steps**: type "PUMP AND DUMP" in comment box; submit.
- **Expected**: error toast "Comment blocked"; no comment row added.
- **Why**: ADR-0012 §"Validation criteria" #3.

#### 6. `report flow creates a report row and auto-hides on high severity`
- **Steps**:
  1. Click "Report" on a playbook.
  2. Select "High severity" + reason.
  3. Submit.
- **Expected**: 3 high-severity reports (simulate) auto-hide the playbook; card shows "Hidden pending review".
- **Why**: EP07 §"Decision" — severity tiers.

---

## 10. EP08 — Playbook System

File: `web/tests/e2e/ep08-playbook.spec.ts` *(planned)*

### Test cases

#### 1. `playbook builder page loads with kind selector`
- **Steps**: `page.goto("/playbook")`.
- **Expected**: `[data-testid=kind-selector]` visible with 6 options (strategy/composite/data_fetcher/risk_manager/alert/narrative).
- **Why**: EP08 acceptance — 6 playbook kinds.

#### 2. `creating a strategy playbook requires narrative.why/how/risks`
- **Steps**:
  1. Select "strategy" kind.
  2. Fill YAML without `narrative.why`.
  3. Click "Save".
- **Expected**: validation error on `narrative.why` field.
- **Why**: ADR-0013 §"Decision" — narrative mandatory.

#### 3. `composite playbook with cyclic dependencies is rejected`
- **Steps**:
  1. Select "composite" kind.
  2. Add dependencies A→B→A.
  3. Click "Save".
- **Expected**: error toast "Cycle detected: A → B → A".
- **Why**: ADR-0013 §"Validation criteria" #6.

#### 4. `parallel composition weight sum != 1.0 is rejected`
- **Steps**: add 2 children with weights 0.4 and 0.3.
- **Expected**: error "Weights must sum to 1.0 (current: 0.7)".
- **Why**: ADR-0013 §"Validation criteria" #3.

#### 5. `SemVer validation rejects "1.0"`
- **Steps**: enter version "1.0".
- **Expected**: error "Version must be MAJOR.MINOR.PATCH".
- **Why**: ADR-0013 §"Decision" — strict SemVer.

#### 6. `executing a strategy playbook shows backtest result`
- **Steps**: open a saved strategy playbook; click "Execute".
- **Expected**: `[data-testid=execution-result]` shows equity curve and metrics.
- **Why**: ADR-0013 §"Validation criteria" #5 — executor runs.

#### 7. `playbook list shows status badges (Draft/Published/Archived)`
- **Steps**: `page.goto("/playbook")`.
- **Expected**: `[data-testid=status-badge]` count ≥ 1 with text in the 4 status values.
- **Why`: EP08 §"Decision" — playbook status lifecycle.

---

## 11. Cross-Epic User Journey

File: `web/tests/e2e/cross-epic-journey.spec.ts` *(planned)*

### Test cases

#### 1. `user creates a strategy → backtests → publishes to community → installs on another account`
- **Steps**:
  1. Navigate to `/strategy`; create and validate a strategy.
  2. Run backtest; assert equity curve renders.
  3. Click "Publish to Community"; fill SharePackage form.
  4. Switch user (mock auth); navigate to `/community`.
  5. Find the published playbook; click "Install".
  6. Navigate to `/playbook`; assert the installed playbook appears.
- **Expected**: end-to-end flow succeeds across EP04 → EP07 → EP08.
- **Why**: EP01 acceptance — three-scenario demo (Ask/Build/Dashboard) extended to full journey.

---

## 12. Conventions

### 12.1 File naming
- `tests/e2e/{ep-kebab-case}-{subject}.spec.ts` (note: `.spec.ts`, not `.test.ts`).
- One file per Epic; cross-Epic journeys in `cross-epic-*.spec.ts`.

### 12.2 `test`/`expect` blocks
- `test("{Epic}: {behavior}", async ({ page }) => { ... })`.
- Use `page.locator("[data-testid=...]")` for all selectors — never CSS classes or text content alone (brittle).
- Use `page.getByTestId("...")` shorthand where available.

### 12.3 ADR/TR mapping comment
Every `test.describe` block starts with:
```ts
/**
 * Covers: EP05 (Dashboard), ADR-0001 (Mock Badge), ADR-0002 (whitelist)
 * TR-IDs: TR-EP05-001, TR-EP05-002, TR-EP05-003
 */
```

### 12.4 Mock mode only
All E2E tests run in Mock mode (per `playwright.config.ts` `webServer.env`). Tests that require real APIs are out of scope for Phase 1 and must be tagged `@real` and skipped in CI.

### 12.5 Timeouts
- Default: 30s per test (Playwright default).
- Navigation: 10s.
- Wait for `[data-testid=...]`: 10s with `{ timeout: 10000 }`.
- Long-running queries (deep_research): bump to 20s.

### 12.6 Selectors
Every interactive element in `src/app/**` and `src/components/**` must expose a `data-testid` attribute matching the kebab-case name used in this document. PRs that add UI without `data-testid` are blocked.

---

## 13. CI Integration

E2E tests run as the `e2e` job in `.github/workflows/tests.yml` (lines 80–126):

```yaml
e2e:
  name: E2E Tests (Mock Mode)
  needs: lint-and-test
  steps:
    - run: pnpm exec playwright install --with-deps chromium
    - run: pnpm test:e2e
      env:
        USE_MOCK: "true"
        ENVIRONMENT: "test"
    - uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: web/playwright-report/
        retention-days: 30
```

The job is gated on `lint-and-test` — unit/integration failures skip E2E to save CI minutes.

---

## 14. Coverage Summary

| Epic   | File                                | Test count | Status      |
|--------|-------------------------------------|------------|-------------|
| Smoke  | `smoke.spec.ts`                     | 3          | ✅ active   |
| EP01   | `ep01-agent-harness.spec.ts`        | 5          | Planned     |
| EP02   | `ep02-data-layer.spec.ts`           | 5          | Planned     |
| EP03   | `ep03-ask-agent.spec.ts`            | 6          | Planned     |
| EP04   | `ep04-strategy-dsl.spec.ts`         | 6          | Planned     |
| EP05   | `ep05-dashboard.spec.ts`            | 7          | Planned     |
| EP06   | `ep06-broker.spec.ts`               | 6          | Planned     |
| EP07   | `ep07-community.spec.ts`            | 6          | Planned     |
| EP08   | `ep08-playbook.spec.ts`             | 7          | Planned     |
| Cross  | `cross-epic-journey.spec.ts`        | 1          | Planned     |
| **Total** |                                  | **52**     |             |

52 specs exceeds the 30-spec target from [`00-test-strategy.md`](./00-test-strategy.md) §1.2; the surplus accounts for likely test consolidation as the suite matures.

---

## 15. Change Log

| Date       | Change                                                              | Author      |
|------------|---------------------------------------------------------------------|-------------|
| 2026-07-20 | Initial per-Epic E2E specs (8 Epics + 1 cross-Epic journey).        | Engineering |
