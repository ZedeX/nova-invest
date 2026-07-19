/**
 * E2E: Community (EP07).
 *
 * Covers:
 *   - EP07 (Share & Community): /community page, CommunityFeed widget,
 *     playbook cards, ratings, detail link.
 *
 * TR-IDs: TR-EP07-001, TR-EP07-002
 * ADRs:   ADR-0012 (comment moderation, depth limit, report tiers)
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 * Note: CommunityFeed loads from /mock/community/index.json (10 playbooks).
 * Fork button is not yet implemented; that assertion is marked test.fixme.
 */

import { test, expect } from "@playwright/test";

test.describe("Community (EP07)", () => {
  test("User navigates to /community, sees community page", async ({ page }) => {
    await page.goto("/community");

    await expect(page.locator("h1")).toContainText("Community");
    // Filter chips
    await expect(page.locator("button", { hasText: "Trending" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Top Rated" })).toBeVisible();
  });

  test("User sees a list of shared playbooks (CommunityFeed)", async ({ page }) => {
    await page.goto("/community");

    // CommunityFeed widget heading
    await expect(page.locator("h3", { hasText: "Community Playbooks" })).toBeVisible();
    // First mock playbook title from /mock/community/index.json
    await expect(page.locator("text=NVDA Momentum Master").first()).toBeVisible({ timeout: 10000 });
  });

  test("User can click a playbook to see details", async ({ page }) => {
    await page.goto("/community");

    // Wait for mock data to load, then click the first playbook card link.
    const firstCard = page.locator("a[href*='/playbook/']").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();

    // Navigates to /playbook/{playbook_id}
    await expect(page).toHaveURL(/\/playbook\//);
  });

  test("User sees rating UI (star rating per playbook)", async ({ page }) => {
    await page.goto("/community");

    // CommunityFeed renders "★ {rating_avg}" for each playbook card
    await expect(page.locator("text=/★ [0-9]/").first()).toBeVisible({ timeout: 10000 });
  });

  // GAP: CommunityFeed does not render a "Fork" button — only an href to
  // /playbook/{id}. Marking fixme until the fork (clone-to-personal)
  // action lands per EP07 §"Validation criteria".
  test.fixme("Fork button visible on a community playbook card", async ({ page }) => {
    await page.goto("/community");
    // Expected once implemented: a button labeled "Fork" or "Remix"
    // appears on each playbook card.
  });
});
