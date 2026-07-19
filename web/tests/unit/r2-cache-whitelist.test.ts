/**
 * TDD Spec — ADR-0002: R2 Cache Whitelist (10 Mockup Symbols)
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0002-r2-cache-whitelist.md
 *
 * All criteria are enforceable against the current `web/src/lib/env.ts`
 * implementation — no refactor required.
 */

import { describe, expect, it } from "vitest";
import { R2_CACHE_SYMBOLS, shouldCacheR2 } from "@/lib/env";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

describe("ADR-0002: R2 cache whitelist (10 mockup symbols)", () => {
  // ---------- §Validation Criteria — shouldCacheR2 predicate ----------

  it("shouldCacheR2('AAPL') returns true (whitelisted)", () => {
    expect(shouldCacheR2("AAPL")).toBe(true);
  });

  it("shouldCacheR2('aapl') returns true (case-insensitive)", () => {
    expect(shouldCacheR2("aapl")).toBe(true);
    expect(shouldCacheR2("AaPl")).toBe(true);
  });

  it("shouldCacheR2('RKLB') returns false (cold symbol)", () => {
    expect(shouldCacheR2("RKLB")).toBe(false);
  });

  it("shouldCacheR2('') returns false (empty string)", () => {
    expect(shouldCacheR2("")).toBe(false);
  });

  it("shouldCacheR2 rejects all non-whitelisted symbols from a sample list", () => {
    const cold = ["RKLB", "GME", "PLTR", "COIN", "MSTR", "SOFI", "HOOD"];
    for (const s of cold) {
      expect(shouldCacheR2(s)).toBe(false);
    }
  });

  // ---------- §Validation Criteria — R2_CACHE_SYMBOLS shape ----------

  it("R2_CACHE_SYMBOLS.size === 10 (bounded cache)", () => {
    expect(R2_CACHE_SYMBOLS.size).toBe(10);
  });

  it("R2_CACHE_SYMBOLS contains exactly the 10 mockup symbols", () => {
    const expected = new Set([
      "AAPL", "MSFT", "NVDA", "GOOG", "META",
      "AMZN", "TSLA", "NFLX", "AMD", "INTC",
    ]);
    expect(R2_CACHE_SYMBOLS).toEqual(expected);
  });

  // ---------- §Critical Implementation Rule — whitelist ↔ Mock dataset sync ----------

  it("R2_CACHE_SYMBOLS ⊆ Mock dataset filenames (ADR-0002 invariant)", () => {
    const mockDir = resolve(__dirname, "../../public/mock/klines");
    const files = readdirSync(mockDir)
      .filter(f => f.endsWith("_1d.json"))
      .map(f => f.replace("_1d.json", ""));
    const mockSymbolSet = new Set(files);

    // Every R2-whitelisted symbol must have a corresponding Mock JSON file.
    for (const sym of R2_CACHE_SYMBOLS) {
      expect(mockSymbolSet.has(sym)).toBe(true);
    }
  });

  it("Mock dataset filenames ⊆ R2_CACHE_SYMBOLS (no orphan Mock files)", () => {
    const mockDir = resolve(__dirname, "../../public/mock/klines");
    const files = readdirSync(mockDir)
      .filter(f => f.endsWith("_1d.json"))
      .map(f => f.replace("_1d.json", ""));

    for (const sym of files) {
      expect(R2_CACHE_SYMBOLS.has(sym)).toBe(true);
    }
  });
});
