/**
 * E2E: Strategy DSL (EP04).
 *
 * Covers:
 *   - EP04 (Strategy DSL): /strategy list page, /strategy/[id] editor,
 *     "+ New Strategy" CTA, Validate / Save buttons.
 *
 * TR-IDs: TR-EP04-001, TR-EP04-002
 * ADRs:   ADR-0008 (Strategy DSL schema + FSM), ADR-0009 (Backtest 70/30 split)
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 * Note: strategy editor does not yet expose data-testid attributes; we assert
 * against visible text (headings, button labels, DSL textarea) instead.
 */

import { test, expect } from "@playwright/test";

test.describe("Strategy DSL (EP04)", () => {
  test("User navigates to /strategy, sees strategy list page", async ({ page }) => {
    await page.goto("/strategy");

    await expect(page.locator("h1")).toContainText("Strategies");
    // The list page renders a table of seeded mock strategies
    await expect(page.locator("text=NVDA MA Cross").first()).toBeVisible();
  });

  test("User sees '+ New Strategy' button", async ({ page }) => {
    await page.goto("/strategy");

    // Rendered as a Next.js <Link> styled as a button
    await expect(page.locator("a", { hasText: "New Strategy" })).toBeVisible();
  });

  test("User clicks '+ New Strategy', sees the editor form", async ({ page }) => {
    await page.goto("/strategy");

    await page.locator("a", { hasText: "New Strategy" }).click();
    await expect(page).toHaveURL(/\/strategy\/new/);

    // Editor page shows Edit Strategy heading + DSL textarea + action buttons
    await expect(page.locator("h1")).toContainText("Edit Strategy");
    await expect(page.locator("textarea")).toBeVisible();
    await expect(page.locator("button", { hasText: "Validate" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Save" })).toBeVisible();
  });

  // GAP: The "Validate" button has no onClick handler — the validation
  // panel renders static ✓/⚠ messages, not the result of validating the
  // current textarea contents. Marking fixme until interactive validation
  // is wired up per ADR-0008 §"Validation criteria" #1/#2.
  test.fixme("Validation: invalid strategy shows error", async ({ page }) => {
    await page.goto("/strategy/new");
    // Expected once implemented: fill textarea with entry: { indicator: "foobar" };
    // click Validate; assert error message references the indicator enum.
  });

  // GAP: The "Save" button has no onClick handler — saving is not wired
  // to any store or API. Marking fixme until persist-strategy flow lands.
  test.fixme("Valid strategy can be saved (mock)", async ({ page }) => {
    await page.goto("/strategy/new");
    // Expected once implemented: fill valid YAML; click Save;
    // assert success toast / redirect to /strategy with new row.
  });
});
