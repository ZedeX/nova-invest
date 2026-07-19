/**
 * E2E: Playbook System (EP08).
 *
 * Covers:
 *   - EP08 (Playbook System): /playbook library page, personal playbooks,
 *     "+ New Playbook" CTA, composable kinds overview.
 *
 * TR-IDs: TR-EP08-001, TR-EP08-002
 * ADRs:   ADR-0013 (Playbook schema, SemVer, composition types)
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 * Note: /playbook page lists seeded personal playbooks and kind overview,
 * but does NOT yet expose an executor UI. Execute / execution-result
 * assertions are marked test.fixme.
 */

import { test, expect } from "@playwright/test";

test.describe("Playbook System (EP08)", () => {
  test("User navigates to /playbook, sees playbook page", async ({ page }) => {
    await page.goto("/playbook");

    await expect(page.locator("h1")).toContainText("Playbooks");
    // Composable kinds section
    await expect(page.locator("h2", { hasText: "Composable Kinds" })).toBeVisible();
  });

  test("User sees installed/personal playbooks list", async ({ page }) => {
    await page.goto("/playbook");

    await expect(page.locator("h2", { hasText: "Personal Playbooks" })).toBeVisible();
    // Seeded mock playbooks
    await expect(page.locator("text=NVDA Earnings Playbook").first()).toBeVisible();
    await expect(page.locator("text=Daily Watchlist Scraper").first()).toBeVisible();
    await expect(page.locator("text=Risk Manager v2").first()).toBeVisible();
  });

  test("User sees '+ New Playbook' button", async ({ page }) => {
    await page.goto("/playbook");

    await expect(page.locator("button", { hasText: "New Playbook" })).toBeVisible();
  });

  // GAP: The "+ New Playbook" button has no onClick handler — the playbook
  // builder (kind selector, YAML editor, narrative validator) is not
  // implemented. Marking fixme until the builder page lands per
  // ADR-0013 §"Validation criteria".
  test.fixme("User can execute a playbook (mock)", async ({ page }) => {
    await page.goto("/playbook");
    // Expected once implemented: open a saved strategy playbook;
    // click "Execute"; assert execution starts.
  });

  // GAP: No execution-result surface exists on /playbook. Marking fixme
  // until the executor UI renders equity-curve + metrics per
  // ADR-0013 §"Validation criteria" #5.
  test.fixme("User sees execution result (equity curve + metrics)", async ({ page }) => {
    await page.goto("/playbook");
    // Expected once implemented: [data-testid=execution-result] visible
    // after clicking Execute on a strategy playbook.
  });
});
