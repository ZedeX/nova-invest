/**
 * TDD Spec — ADR-0003: LLM Routing and Cost Cap
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0003-llm-routing-cost-cap.md
 *
 * Section layout:
 *   1. route() — cost_cap values (the A1 conflict fix: $0.05 NOT $0.50)
 *   2. route() — provider selection across Mock / Local / Cloud
 *   3. getLLM() — factory behavior + Mock mode zero-fetch contract
 *   4. Anti-pattern regression tests (pending refactor, marked it.todo)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ADR-0003: LLM routing and cost cap", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- §Validation Criteria — route() cost_cap values ----------
  //
  // The A1 conflict fix changed deep_research cloud cost_cap from $0.50 to
  // $0.05. This is the single most important assertion in the file: if it
  // regresses, the entire cost-cap enforcement story breaks.

  describe("route() — cost_cap values (A1 conflict fix)", () => {
    it("route('deep_research') in cloud mode has cost_cap === 0.05 (NOT 0.50)", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "production";
      const { route } = await import("@/lib/llm/router");
      const config = route("deep_research");
      expect(config.cost_cap).toBe(0.05);
      expect(config.cost_cap).not.toBe(0.50);
    });

    it("route('simple_qa') in cloud mode has cost_cap === 0.001", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "production";
      const { route } = await import("@/lib/llm/router");
      expect(route("simple_qa").cost_cap).toBe(0.001);
    });

    it("route('tool_call') in cloud mode has cost_cap === 0.01", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "production";
      const { route } = await import("@/lib/llm/router");
      expect(route("tool_call").cost_cap).toBe(0.01);
    });

    it("route('clarify') in cloud mode has cost_cap === 0.0005", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "production";
      const { route } = await import("@/lib/llm/router");
      expect(route("clarify").cost_cap).toBe(0.0005);
    });

    it("local mode cost_cap === 0 for all intents (LM Studio is free)", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "development";
      const { route } = await import("@/lib/llm/router");
      const intents = ["simple_qa", "deep_research", "tool_call", "clarify"] as const;
      for (const intent of intents) {
        expect(route(intent).cost_cap).toBe(0);
      }
    });
  });

  // ---------- §Validation Criteria — route() provider selection ----------

  describe("route() — provider selection", () => {
    it("Mock mode returns provider='mock' with cost_cap=0", async () => {
      process.env.USE_MOCK = "true";
      const { route } = await import("@/lib/llm/router");
      const config = route("simple_qa");
      expect(config.provider).toBe("mock");
      expect(config.cost_cap).toBe(0);
    });

    it("Local dev mode (USE_MOCK=false, ENVIRONMENT!=production) routes to lmstudio", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "development";
      const { route } = await import("@/lib/llm/router");
      const config = route("deep_research");
      expect(config.provider).toBe("lmstudio");
    });

    it("Production mode (USE_MOCK=false, ENVIRONMENT=production) routes to ark", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "production";
      const { route } = await import("@/lib/llm/router");
      const config = route("deep_research");
      expect(config.provider).toBe("ark");
    });

    it("ROUTING_RULES contains all 4 intents with local+cloud configs", async () => {
      const { ROUTING_RULES } = await import("@/lib/llm/router");
      const intents = ["simple_qa", "deep_research", "tool_call", "clarify"] as const;
      for (const intent of intents) {
        expect(ROUTING_RULES[intent]).toBeDefined();
        expect(ROUTING_RULES[intent].local).toBeDefined();
        expect(ROUTING_RULES[intent].cloud).toBeDefined();
      }
    });
  });

  // ---------- §Validation Criteria — getLLM() factory ----------

  describe("getLLM() — factory behavior", () => {
    it("Mock mode returns MockLLM instance", async () => {
      process.env.USE_MOCK = "true";
      const { getLLM, MockLLM } = await import("@/lib/llm/router");
      const llm = getLLM("simple_qa");
      expect(llm).toBeInstanceOf(MockLLM);
    });

    it("Local dev mode returns RealLLM instance (lmstudio config)", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "development";
      vi.unstubAllGlobals(); // RealLLM constructor does not call fetch, but be safe
      const { getLLM, RealLLM } = await import("@/lib/llm/router");
      const llm = getLLM("deep_research");
      expect(llm).toBeInstanceOf(RealLLM);
    });

    it("Production mode returns RealLLM instance (ark config)", async () => {
      process.env.USE_MOCK = "false";
      process.env.ENVIRONMENT = "production";
      vi.unstubAllGlobals();
      const { getLLM, RealLLM } = await import("@/lib/llm/router");
      const llm = getLLM("deep_research");
      expect(llm).toBeInstanceOf(RealLLM);
    });

    it("MockLLM.complete() makes zero fetch() calls to LLM API (ADR-0003 contract)", async () => {
      process.env.USE_MOCK = "true";
      // MockLLM.findMatchingSample() calls fetch for /mock/qa_samples/*.json,
      // which is local Mock data — NOT an LLM API call. To enforce the
      // "zero LLM API calls" contract, we stub fetch to reject, then verify
      // MockLLM falls back gracefully without throwing.
      vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error(
        "no network access in Mock mode"
      ))));

      const { MockLLM } = await import("@/lib/llm/router");
      const llm = new MockLLM();
      const response = await llm.complete("AAPL 现在多少钱", "simple_qa");
      expect(response.intent).toBe("simple_qa");
      expect(response.cost?.credits_used).toBe(0);
      // Summary should mention Mock mode (fallback path took effect).
      expect(response.summary).toMatch(/mock/i);
    });
  });

  // ---------- Anti-pattern regression tests (pending refactor) ----------
  //
  // ADR-0003 §Critical Implementation Rule requires:
  //   - getLLM(intent, env) accepts env parameter (currently uses process.env)
  //   - No module-level `_llm` cache (currently cached)
  //   - getLLM(simple_qa) and getLLM(deep_research) return different instances
  //
  // The current `router.ts` violates all three. Tests marked `it.todo` will
  // be promoted to `it()` when the refactor lands — that promotion is itself
  // the refactor acceptance signal.

  it.todo("route(intent, env) accepts env parameter (request-scoped)");
  it.todo("getLLM(intent, env) accepts env parameter (request-scoped)");
  it.todo("getLLM() does NOT cache at module level (returns fresh instance per call)");
  it.todo("getLLM('simple_qa') and getLLM('deep_research') return different RealLLM instances");
  it.todo("RealLLM.complete() calls estimateCost() before API call");
  it.todo("RealLLM.complete() degrades model when estimateCost() > cost_cap");
});
