import { defineConfig, devices } from "@playwright/test";

// Playwright configuration for nova-invest
// - E2E tests: tests/e2e/**/*.spec.ts
// - Dev server: Next.js on port 3000
// - Browsers: Chromium only (Phase 1; add Firefox/WebKit in Phase 2)
//
// Per EP01 acceptance: "端到端 demo 跑通 Ask/Build/Dashboard 三场景"
// Per EP05 acceptance: dashboard widget rendering

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      // E2E tests run in Mock mode (no external APIs)
      USE_MOCK: "true",
      ENVIRONMENT: "test",
    },
  },
});
