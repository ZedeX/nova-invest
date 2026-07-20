/**
 * E2E: Cross-Epic User Journey (Demo flow).
 *
 * Covers:
 *   - EP01 acceptance: "端到端 demo 跑通 Ask/Build/Dashboard 三场景"
 *   - Extended journey across EP03 (Ask) → EP04 (Strategy) → EP05 (Dashboard)
 *
 * TR-IDs: TR-EP01-001, TR-EP03-001, TR-EP04-001, TR-EP05-001
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 * Note: the full create-strategy-from-answer → backtest → dashboard-result
 * loop is not yet wired end-to-end. Steps that depend on unimplemented UI
 * are marked test.fixme.
 */

import { test, expect } from "@playwright/test";

test.describe("Cross-Epic Journey (Ask → Build → Dashboard)", () => {
  test("User starts at Dashboard, sees Ask Agent widget", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toContainText("Dashboard");
    // AskAgentPanel widget is rendered on the dashboard
    await expect(page.locator("h3", { hasText: "Ask Agent" }).first()).toBeVisible();
  });

  test("User asks a question on the Dashboard, sees an answer", async ({ page }) => {
    await page.goto("/");

    const input = page.locator("input[placeholder*='Ask anything']");
    await input.fill("AAPL price");
    await page.locator("button", { hasText: "Ask" }).click();

    // Mock aapl_price.json returns summary mentioning AAPL + a citations block
    await expect(page.locator("text=Citations")).toBeVisible({ timeout: 10000 });
  });

  // GAP: There is no "create strategy from answer" affordance in
  // AskAgentPanel — the answer renders as static text without a
  // "Convert to Strategy" CTA. Marking fixme until the answer → strategy
  // bridge lands.
  test.fixme("User navigates to Strategy and creates a strategy from the answer", async ({ page }) => {
    await page.goto("/");
    // Expected once implemented:
    //   submit a query; click "Create Strategy from Answer";
    //   /strategy/new opens with the answer pre-filled in the DSL editor.
  });

  test("User navigates to /backtest and sees the Run Backtest control", async ({ page }) => {
    await page.goto("/backtest");

    await expect(page.locator("h1")).toContainText("Backtest");
    // Configuration sidebar with Run Backtest button
    await expect(page.locator("button", { hasText: "Run Backtest" })).toBeVisible();
    // Configuration panel is visible
    await expect(page.locator("text=Configuration")).toBeVisible();
    // Strategy selector dropdown is present
    await expect(page.locator("select").first()).toBeVisible();
  });

  // GAP: Backtest results are not surfaced on the Dashboard — they live
  // only on /backtest. Marking fixme until a "Last Backtest" widget lands
  // on the dashboard grid per EP05 §"Dashboard widgets".
  test.fixme("User sees backtest result surfaced on the Dashboard", async ({ page }) => {
    await page.goto("/");
    // Expected once implemented: a dashboard widget showing the last
    // backtest's equity curve + total return metric.
  });
});
