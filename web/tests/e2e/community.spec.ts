/**
 * E2E: Community (EP07, Sprint 8).
 *
 * Covers:
 *   - EP07 (Share & Community): /community page, search, sort, categories,
 *     playbook detail page, install, rate, comment, report.
 *
 * TR-IDs: TR-EP07-001 through TR-EP07-008
 * ADRs:   ADR-0012 (comment moderation, depth limit, report tiers)
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 */

import { test, expect } from "@playwright/test";

test.describe("Community (EP07)", () => {
  test("User navigates to /community, sees community page", async ({ page }) => {
    await page.goto("/community");

    await expect(page.locator("h1")).toContainText("Community");
    // Search bar
    await expect(page.locator("input[placeholder*='Search']")).toBeVisible();
    // Category sidebar
    await expect(page.locator("text=Momentum")).toBeVisible();
  });

  test("User sees a list of shared playbooks (CommunityFeed)", async ({ page }) => {
    await page.goto("/community");

    // Wait for API data to load — at least one playbook card
    await expect(page.locator("li a[href*='/community/playbook/']").first()).toBeVisible({ timeout: 10000 });
    // Verify sort tabs
    await expect(page.locator("button", { hasText: "Trending" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Top Rated" })).toBeVisible();
  });

  test("User can search playbooks by keyword", async ({ page }) => {
    await page.goto("/community");

    // Type search and submit
    await page.locator("input[placeholder*='Search']").fill("NVDA");
    await page.locator("button", { hasText: "Search" }).click();

    // Wait for filtered results
    await expect(page.locator("li a[href*='/community/playbook/']").first()).toBeVisible({ timeout: 10000 });
    // All visible cards should contain NVDA
    const cards = page.locator("li a[href*='/community/playbook/']");
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).toContainText("NVDA");
    }
  });

  test("User can filter by category (tag)", async ({ page }) => {
    await page.goto("/community");

    // Click "Momentum" category
    await page.locator("aside button", { hasText: "Momentum" }).click();

    // Wait for filtered results
    await expect(page.locator("li a[href*='/community/playbook/']").first()).toBeVisible({ timeout: 10000 });
  });

  test("User can sort by Top Rated", async ({ page }) => {
    await page.goto("/community");

    // Click "Top Rated" sort
    await page.locator("button", { hasText: "Top Rated" }).click();

    // Wait for sorted results
    await expect(page.locator("li a[href*='/community/playbook/']").first()).toBeVisible({ timeout: 10000 });
  });

  test("User can click a playbook to see detail page", async ({ page }) => {
    await page.goto("/community");

    // Wait for feed and click first card
    const firstCard = page.locator("li a[href*='/community/playbook/']").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/community\/playbook\//);

    // Detail page should have Install button and rating UI
    await expect(page.locator("button", { hasText: "Install" })).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
  });

  test("User sees rating UI on detail page", async ({ page }) => {
    await page.goto("/community");

    const firstCard = page.locator("li a[href*='/community/playbook/']").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();

    // Star rating buttons
    await expect(page.locator("text=Rate this Playbook")).toBeVisible();
    const stars = page.locator("button", { hasText: "★" });
    await expect(stars.first()).toBeVisible();
  });

  test("User can see comment section on detail page", async ({ page }) => {
    await page.goto("/community");

    const firstCard = page.locator("li a[href*='/community/playbook/']").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();

    // Comment section (use heading to avoid matching "Comments" in stats card or empty state)
    await expect(page.locator("h3", { hasText: "Comments" })).toBeVisible();
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("User can see report link on detail page", async ({ page }) => {
    await page.goto("/community");

    const firstCard = page.locator("li a[href*='/community/playbook/']").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();

    // Report link
    await expect(page.locator("text=Report this Playbook")).toBeVisible();
  });
});
