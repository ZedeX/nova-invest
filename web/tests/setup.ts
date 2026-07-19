// Vitest global setup
// Loaded before every test file via vitest.config.ts setupFiles
//
// Responsibilities:
// 1. Register @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
// 2. Reset process.env between tests (critical for USE_MOCK / ENVIRONMENT tests)
// 3. Stub globalThis.fetch by default (Mock mode contract: zero HTTP calls)
//    Tests that need real fetch must explicitly unstub.

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

// Snapshot of process.env at module load — used to restore between tests
const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
  // Restore env snapshot (tests can mutate process.env freely)
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_SNAPSHOT)) delete process.env[key];
  }
  Object.assign(process.env, ENV_SNAPSHOT);

  // Default: Mock mode + test environment (matches vitest.config.ts env block)
  process.env.USE_MOCK = "true";
  process.env.ENVIRONMENT = "test";

  // Default: stub globalThis.fetch — Mock mode must not call external APIs
  // (Per ADR-0001: "USE_MOCK=true must produce zero external HTTP requests")
  // Tests for RealProvider must explicitly restore fetch via vi.unstubAllGlobals()
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error(
    "fetch() called in Mock mode — this violates ADR-0001. " +
    "If this test needs real fetch, call vi.unstubAllGlobals() in the test."
  ))));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
