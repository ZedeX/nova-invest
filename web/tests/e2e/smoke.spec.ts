/**
 * E2E Smoke Test (Phase 1 baseline).
 *
 * Verifies the minimal "app boots + pages render" contract:
 *   1. Home page (Dashboard) loads with expected heading
 *   2. Ask Agent page loads with expected heading
 *   3. Navigation sidebar renders
 *
 * Per EP01 acceptance: "端到端 demo 跑通 Ask/Build/Dashboard 三场景"
 * This is the Phase 1 baseline; full scenario tests (Ask multi-step,
 * Build strategy, Dashboard widgets) will be added as features land.
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 */

import { test, expect } from "@playwright/test";

test.describe("Smoke - app boots + pages render", () => {
  test("home page (Dashboard) loads", async ({ page }) => {
    await page.goto("/");

    // Dashboard heading
    await expect(page.locator("h1")).toContainText("Dashboard");

    // Welcome message (proves React rendered, not just HTML shell)
    await expect(page.locator("text=Welcome back")).toBeVisible();
  });

  test("Ask Agent page loads", async ({ page }) => {
    await page.goto("/ask");

    // Ask Agent heading
    await expect(page.locator("h1")).toContainText("Ask Agent");

    // Suggested questions section (proves page-specific content rendered)
    await expect(page.locator("text=Suggested questions")).toBeVisible();
  });

  test("navigation sidebar renders on home page", async ({ page }) => {
    await page.goto("/");

    // Sidebar should contain links to main sections
    const sidebar = page.locator("nav, aside").first();
    await expect(sidebar).toBeVisible();
  });
});
