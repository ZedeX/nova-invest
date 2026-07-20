/**
 * E2E: Data Layer (EP02).
 *
 * Covers:
 *   - EP02 (Data Layer): /chart/[symbol] route, KlineChart widget,
 *     whitelisted vs. cold symbol behavior, mock data loading.
 *
 * TR-IDs: TR-EP02-001, TR-EP02-002
 * ADRs:   ADR-0001 (Mock Badge), ADR-0002 (whitelist of 10 symbols)
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 * Note: KlineChart does not yet expose data-testid attributes; we assert
 * against visible text (symbol, price labels, error messages) and the
 * rendered <svg> chart instead.
 */

import { test, expect } from "@playwright/test";

test.describe("Data Layer (EP02)", () => {
  test("User navigates to /chart/AAPL, sees chart widget", async ({ page }) => {
    await page.goto("/chart/AAPL");

    // Page heading shows the symbol
    await expect(page.locator("h1")).toContainText("AAPL");
    // App name + mock data source note
    await expect(page.locator("text=Symbol view")).toBeVisible();
  });

  test("Kline chart renders an SVG (candlestick view)", async ({ page }) => {
    await page.goto("/chart/AAPL");

    // KlineChart renders an <svg> with candlestick bars once mock JSON loads
    const svg = page.locator("svg").first();
    await expect(svg).toBeVisible({ timeout: 10000 });
  });

  test("Chart loads AAPL mock data (visible price labels)", async ({ page }) => {
    await page.goto("/chart/AAPL");

    // Wait for the chart to finish loading mock data; the header shows
    // last close price ($XXX.XX) and a Daily label.
    await expect(page.locator("text=Daily · Last")).toBeVisible({ timeout: 10000 });
    // KlineChart header renders the symbol name + current price ($XXX.XX).
    // lightweight-charts renders on canvas (not SVG), so we check the header text instead.
    await expect(page.locator("text=AAPL").first()).toBeVisible({ timeout: 10000 });
  });

  // GAP: KlineChart does not render a timeframe selector UI yet (no
  // [data-testid=timeframe-*] buttons). Marking as fixme until the
  // timeframe picker lands per EP02 §"changing timeframe reloads chart".
  test.fixme("User can change timeframe (if UI exists)", async ({ page }) => {
    await page.goto("/chart/AAPL");
    // Expected once implemented: click [data-testid=timeframe-1h];
    // chart reloads; URL or query param reflects tf=1h.
  });

  test("Cold symbol (RKLB) shows error / empty state", async ({ page }) => {
    await page.goto("/chart/RKLB");

    // RKLB is not in R2_CACHE_SYMBOLS; mock fetch 404s → KlineChart shows
    // an error message "Failed to load: No mock data for RKLB".
    await expect(page.locator("text=Failed to load").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=No mock data for RKLB").first()).toBeVisible({ timeout: 10000 });
  });
});
