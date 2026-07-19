/**
 * E2E: Dashboard (EP05).
 *
 * Covers:
 *   - EP05 (Dashboard): default landing page, widget grid, sidebar nav,
 *     global MockBadge, CreditBalance widget.
 *
 * TR-IDs: TR-EP05-001, TR-EP05-002, TR-EP05-003
 * ADRs:   ADR-0001 (Mock Badge), ADR-0002 (whitelist)
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 * Note: widgets do not yet expose data-testid="widget" wrappers; we assert
 * against widget headings (Watchlist, Positions, Credits, Ask Agent, etc.)
 * rendered by src/components/widgets/*.tsx.
 */

import { test, expect } from "@playwright/test";

test.describe("Dashboard (EP05)", () => {
  test("User navigates to /, sees Dashboard heading", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toContainText("Dashboard");
    await expect(page.locator("text=Welcome back")).toBeVisible();
  });

  test("User sees multiple widgets (KlineChart, Watchlist, Positions, Credits, Ask Agent, Strategies, Community)", async ({ page }) => {
    await page.goto("/");

    // Each widget renders a heading with its name; assert at least 6 are visible
    await expect(page.locator("h3", { hasText: "Watchlist" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "Positions" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "Credits" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "Ask Agent" }).first()).toBeVisible();
    await expect(page.locator("h3", { hasText: "Strategies" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "Community Playbooks" })).toBeVisible();
  });

  test("Widgets render with mock data (AAPL chart + positions table)", async ({ page }) => {
    await page.goto("/");

    // KlineChart for AAPL loads mock klines and shows last close price
    await expect(page.locator("text=Daily · Last")).toBeVisible({ timeout: 10000 });

    // PositionsTable renders at least one position row (AAPL)
    await expect(page.locator("a[href='/chart/AAPL']").first()).toBeVisible();
  });

  test("User can navigate between sections via sidebar (Watchlist → /chart/NVDA)", async ({ page }) => {
    await page.goto("/");

    // Sidebar renders Watchlist items as <a href="/chart/{ticker}">
    const nvdaLink = page.locator("aside a[href='/chart/NVDA']").first();
    await expect(nvdaLink).toBeVisible();
    await nvdaLink.click();

    await expect(page).toHaveURL(/\/chart\/NVDA/);
    await expect(page.locator("h1")).toContainText("NVDA");
  });

  test("MockBadge shows 'MOCK MODE' indicator in the header", async ({ page }) => {
    await page.goto("/");

    // Header renders MockBadge globally when USE_MOCK=true
    await expect(page.locator("text=MOCK MODE")).toBeVisible();
  });

  test("CreditBalance widget shows remaining balance", async ({ page }) => {
    await page.goto("/");

    // CreditBalance renders "847 / 1000" (remaining / granted) per MOCK_BALANCE
    await expect(page.locator("h3", { hasText: "Credits" })).toBeVisible();
    await expect(page.locator("text=847")).toBeVisible();
    await expect(page.locator("text=/ 1000")).toBeVisible();
  });
});
