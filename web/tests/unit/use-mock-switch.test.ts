/**
 * TDD Spec — ADR-0001: USE_MOCK Dual-Mode Switch
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0001-use-mock-dual-mode-switch.md
 *
 * Test strategy:
 *   - Each test resets module state (vi.resetModules) to bypass the current
 *     module-level `_provider` cache anti-pattern flagged in ADR-0001.
 *   - This file will keep passing after the ADR-0001 refactor (env param +
 *     request-scoped factory) without modification.
 *   - Tests marked `it.todo` cover criteria that require the refactor; they
 *     will be promoted to `it()` once the refactor lands.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ADR-0001: USE_MOCK dual-mode switch", () => {
  beforeEach(() => {
    // Force fresh module state so the module-level `_provider` cache doesn't
    // leak between tests. (Anti-pattern flagged in ADR-0001 — once refactored,
    // this reset is no longer necessary but remains harmless.)
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- Validation Criteria (ADR-0001 §Validation Criteria) ----------

  it("returns MockProvider when USE_MOCK=true", async () => {
    process.env.USE_MOCK = "true";
    const { getProvider, MockProvider } = await import("@/lib/data/provider");
    const provider = getProvider();
    expect(provider).toBeInstanceOf(MockProvider);
    expect(provider.name).toBe("mock");
  });

  it("returns RealProvider when USE_MOCK=false", async () => {
    process.env.USE_MOCK = "false";
    // RealProvider calls fetch in its constructor path? No — only on getKlines.
    // Unstub fetch so the test infrastructure doesn't reject incidental calls.
    vi.unstubAllGlobals();
    const { getProvider, RealProvider } = await import("@/lib/data/provider");
    const provider = getProvider();
    expect(provider).toBeInstanceOf(RealProvider);
    expect(provider.name).toBe("real");
  });

  it("defaults to MockProvider when USE_MOCK is unset (safe demo default)", async () => {
    delete process.env.USE_MOCK;
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    const { getProvider, MockProvider } = await import("@/lib/data/provider");
    const provider = getProvider();
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it("MockProvider.getKlines() makes zero EXTERNAL fetch() calls (ADR-0001 contract)", async () => {
    process.env.USE_MOCK = "true";
    // ADR-0001 §Validation Criteria says "zero fetch() calls" but §Requirements
    // says "Mock mode reads JSON from web/public/mock/klines/*.json" — those
    // are contradictory. MockProvider MUST fetch /mock/klines/*.json (local
    // Next.js-served static file). The ADR's intent is clearly "zero EXTERNAL
    // HTTP calls" (no Yahoo/Alpha Vantage/Polygon). This test enforces the
    // intent: any fetch() call must target /mock/* (local), never http(s)://.
    const fetchSpy = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        ticker: "AAPL",
        timeframe: "1d",
        source: "mock",
        data: [{ t: "2024-01-02", o: 1, h: 1, l: 1, c: 1, v: 1 }],
      }),
    } as Response));
    vi.stubGlobal("fetch", fetchSpy);

    const { MockProvider } = await import("@/lib/data/provider");
    const mock = new MockProvider();
    await mock.getKlines("AAPL", "1d", new Date("2020-01-01"), new Date("2030-12-31"));

    // Every fetch call must be to a local /mock/* path, never external.
    for (const call of fetchSpy.mock.calls) {
      const url = String(call[0]);
      expect(url).toMatch(/^\/mock\//);
      expect(url).not.toMatch(/^https?:\/\//);
    }
  });

  it("MockProvider reads from /mock/klines/{SYMBOL}_1d.json (canonical path)", async () => {
    process.env.USE_MOCK = "true";
    const capturedUrls: string[] = [];
    // Replace the rejecting stub with a stub that records URLs and returns
    // a minimal valid KlineResponse so MockProvider.getKlines resolves.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      capturedUrls.push(url);
      return {
        ok: true,
        json: async () => ({
          ticker: "AAPL",
          timeframe: "1d",
          source: "mock",
          data: [
            { t: "2024-01-02", o: 1, h: 1, l: 1, c: 1, v: 1 },
          ],
        }),
      } as Response;
    }));

    const { MockProvider } = await import("@/lib/data/provider");
    const mock = new MockProvider();
    await mock.getKlines("AAPL", "1d", new Date("2020-01-01"), new Date("2030-12-31"));

    expect(capturedUrls).toContain("/mock/klines/AAPL_1d.json");
  });

  // ---------- Anti-pattern regression tests (post-refactor) ----------
  //
  // These tests cover the ADR-0001 "Critical Implementation Rule":
  // the factory accepts `env` as an explicit parameter and does NOT
  // cache the provider at module level. These tests are now active
  // after the refactor that made the factory request-scoped.

  it("getProvider(env) accepts env parameter (request-scoped factory)", async () => {
    const { getProvider, MockProvider, RealProvider } = await import("@/lib/data/provider");

    const mockEnv = { USE_MOCK: "true", ENVIRONMENT: "development" as const };
    const mockProvider = getProvider(mockEnv);
    expect(mockProvider).toBeInstanceOf(MockProvider);

    const realEnv = { USE_MOCK: "false", ENVIRONMENT: "production" as const };
    const realProvider = getProvider(realEnv);
    expect(realProvider).toBeInstanceOf(RealProvider);
  });

  it("getProvider() does NOT cache at module level (returns fresh instance when env changes)", async () => {
    const { getProvider, MockProvider, RealProvider } = await import("@/lib/data/provider");

    // First call: Mock mode.
    process.env.USE_MOCK = "true";
    const provider1 = getProvider();
    expect(provider1).toBeInstanceOf(MockProvider);

    // Second call: Real mode — must NOT return the cached MockProvider.
    process.env.USE_MOCK = "false";
    vi.unstubAllGlobals();
    const provider2 = getProvider();
    expect(provider2).toBeInstanceOf(RealProvider);
    expect(provider1).not.toBe(provider2);
  });

  it("getProvider({USE_MOCK:'true'}) returns MockProvider regardless of process.env", async () => {
    // process.env says Real mode, but explicit env param says Mock.
    process.env.USE_MOCK = "false";
    vi.unstubAllGlobals();
    const { getProvider, MockProvider } = await import("@/lib/data/provider");

    const explicitMockEnv = { USE_MOCK: "true", ENVIRONMENT: "development" as const };
    const provider = getProvider(explicitMockEnv);
    expect(provider).toBeInstanceOf(MockProvider);
  });
});
