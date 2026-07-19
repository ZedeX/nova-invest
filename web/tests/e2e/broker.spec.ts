/**
 * E2E: Broker Integration (EP06).
 *
 * Covers:
 *   - EP06 (Broker Integration): /broker page, account stats, Place Order
 *     form, PositionsTable, Recent Orders history.
 *
 * TR-IDs: TR-EP06-001, TR-EP06-002
 * ADRs:   ADR-0010 (PaperBroker 5bps slippage), ADR-0011 (BrokerRiskManager)
 *
 * Runs in Mock mode (USE_MOCK=true) per playwright.config.ts webServer.env.
 * Note: broker page does not yet expose data-testid attributes; we assert
 * against visible text (headings, labels, table rows) instead. Order
 * placement is not wired to any handler, so the "place order" assertion
 * is marked test.fixme.
 */

import { test, expect } from "@playwright/test";

test.describe("Broker Integration (EP06)", () => {
  test("User navigates to /broker, sees broker page", async ({ page }) => {
    await page.goto("/broker");

    await expect(page.locator("h1")).toContainText("Paper Broker");
  });

  test("User sees positions table (paper account)", async ({ page }) => {
    await page.goto("/broker");

    // PositionsTable widget renders on /broker
    await expect(page.locator("h3", { hasText: "Positions" })).toBeVisible();
    await expect(page.locator("text=Paper Account")).toBeVisible();
    // At least one position row (AAPL)
    await expect(page.locator("a[href='/chart/AAPL']").first()).toBeVisible();
  });

  test("User sees order entry form ('Place Order')", async ({ page }) => {
    await page.goto("/broker");

    await expect(page.locator("h3", { hasText: "Place Order" })).toBeVisible();
    // Symbol, Side, Type, Qty inputs are present
    await expect(page.locator("label", { hasText: "Symbol" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Side" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Type" })).toBeVisible();
    await expect(page.locator("label", { hasText: "Qty" })).toBeVisible();
    // Submit button
    await expect(page.locator("button", { hasText: "Submit Order" })).toBeVisible();
  });

  // GAP: "Submit Order" button has no onClick handler — the PaperBroker
  // engine is not wired into the UI, so placing an order does not create
  // a new row or show a confirmation. Marking fixme until the broker
  // client + order FSM lands per ADR-0010 §"Validation criteria".
  test.fixme("Mock broker: placing an order shows confirmation + new order row", async ({ page }) => {
    await page.goto("/broker");
    // Expected once implemented:
    //   fill symbol=NVDA, qty=10, side=BUY, type=MARKET;
    //   click Submit Order;
    //   assert new order row with status "filled" appears.
  });

  test("User sees order history (Recent Orders table)", async ({ page }) => {
    await page.goto("/broker");

    await expect(page.locator("h3", { hasText: "Recent Orders" })).toBeVisible();
    // Seeded mock orders include ord_001..ord_005
    await expect(page.locator("text=ord_001")).toBeVisible();
    await expect(page.locator("text=ord_005")).toBeVisible();
    // Status badges render
    await expect(page.locator("text=FILLED").first()).toBeVisible();
    await expect(page.locator("text=PENDING")).toBeVisible();
  });
});
