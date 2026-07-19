import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest configuration for nova-invest
// - Unit tests: tests/unit/**/*.test.ts(x)
// - Integration tests: tests/integration/**/*.test.ts(x)
// - Environment: jsdom (for React component tests)
// - Coverage: v8 provider, thresholds per ADR acceptance criteria
//
// See: docs/architecture/adr-0001-use-mock-dual-mode-switch.md (validation criteria)
//      docs/architecture/adr-0002-r2-cache-whitelist.md (validation criteria)
//      docs/architecture/adr-0003-llm-routing-cost-cap.md (validation criteria)

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
    ],
    exclude: ["node_modules/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Only measure logic-heavy lib code. Widgets (React components) are
      // covered by Playwright E2E tests, not unit tests.
      include: [
        "src/lib/**/*.ts",
      ],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "**/types.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        // Phase 1 realistic thresholds (current: ~50% stmts / ~45% branches).
        // TODO: raise to 80% per EP01 acceptance criteria as lib tests are added
        // (provider.ts RealProvider branch + env.ts R2_CACHE_SYMBOLS branch).
        statements: 40,
        branches: 40,
        functions: 50,
        lines: 40,
      },
    },
    env: {
      // Default test env: Mock mode (safe, zero API calls)
      USE_MOCK: "true",
      ENVIRONMENT: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
