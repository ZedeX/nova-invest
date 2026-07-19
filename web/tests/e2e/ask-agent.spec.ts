/**
 * E2E: Ask Agent (EP01 + EP03).
 *
 * Covers:
 *   - EP01 (Agent Harness): Ask scenario reachable end-to-end
 *   - EP03 (Ask Agent): suggested questions, submit, mock answer, citations
 *
 * TR-IDs: TR-EP01-001, TR-EP03-001, TR-EP03-002
 * ADRs:   ADR-0001 (Mock Badge), ADR-0003 (clarify intent), ADR-0007 (citations)
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 * Note: data-testid attributes are not yet added to AskAgentPanel; we use
 * resilient text/role-based selectors instead per task constraints.
 */

import { test, expect } from "@playwright/test";

test.describe("Ask Agent (EP01 + EP03)", () => {
  test("User navigates to /ask, sees 'Ask Agent' heading", async ({ page }) => {
    await page.goto("/ask");

    await expect(page.locator("h1")).toContainText("Ask Agent");
  });

  test("User sees suggested questions section", async ({ page }) => {
    await page.goto("/ask");

    // The /ask page renders a "Suggested questions" section heading
    await expect(page.locator("text=Suggested questions")).toBeVisible();
  });

  test("User clicks a suggested question chip, sees it fill the input", async ({ page }) => {
    await page.goto("/ask");

    // AskAgentPanel renders suggested query chips as <button> elements.
    // The first chip text is one of the SUGGESTED_QUERIES (e.g. "AAPL 当前价格").
    const chip = page.locator("button", { hasText: "AAPL" }).first();
    await chip.click();

    // The input should now contain the clicked chip text
    const input = page.locator("input[placeholder*='Ask anything']");
    await expect(input).toHaveValue(/AAPL/);
  });

  // GAP: Loading state is transient (button label flips to "..." while the
  // Mock fetch is in-flight). Without a test hook or artificial delay there
  // is no reliable way to assert the loading state across runs. Marking as
  // fixme until the panel exposes a data-testid="loading-indicator".
  test.fixme("User submits question, sees loading state", async ({ page }) => {
    await page.goto("/ask");
    const input = page.locator("input[placeholder*='Ask anything']");
    await input.fill("AAPL price");
    await page.locator("button", { hasText: "Ask" }).click();

    // Expected once implemented: [data-testid=loading-indicator] visible
    // or button text === "..." while in-flight.
  });

  test("Mock mode: user submits a price query and sees an answer with citations", async ({ page }) => {
    await page.goto("/ask");

    const input = page.locator("input[placeholder*='Ask anything']");
    await input.fill("AAPL price");
    await page.locator("button", { hasText: "Ask" }).click();

    // Mock aapl_price.json returns summary containing "AAPL" and a numeric value
    const answer = page.locator("text=AAPL").first();
    await expect(answer).toBeVisible({ timeout: 10000 });

    // Citations section renders when response.citations.length > 0
    await expect(page.locator("text=Citations")).toBeVisible({ timeout: 10000 });
  });
});
