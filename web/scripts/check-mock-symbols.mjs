// CI check: verify R2_CACHE_SYMBOLS whitelist matches Mock dataset filenames.
//
// Per ADR-0002: "R2_CACHE_SYMBOLS must stay in sync with Mock dataset filenames.
// Adding/removing symbols here requires regenerating Mock data."
//
// Run via: pnpm run check:mock-symbols
// Exits 0 if sync, 1 if mismatch.

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Read R2_CACHE_SYMBOLS from src/lib/env.ts (regex parse — no TS transpilation needed)
const envPath = path.join(ROOT, "src", "lib", "env.ts");
const envSrc = await import("node:fs").then((fs) => fs.readFileSync(envPath, "utf-8"));
const whitelistMatch = envSrc.match(/R2_CACHE_SYMBOLS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
if (!whitelistMatch) {
  console.error("FAIL: could not find R2_CACHE_SYMBOLS in src/lib/env.ts");
  process.exit(1);
}
const whitelist = whitelistMatch[1]
  .match(/"([A-Z]+)"/g)
  .map((s) => s.replace(/"/g, ""));
console.log(`R2_CACHE_SYMBOLS (${whitelist.length}): ${whitelist.join(", ")}`);

// Read mock klines directory
const mockDir = path.join(ROOT, "public", "mock", "klines");
let mockFiles;
try {
  mockFiles = await readdir(mockDir);
} catch (err) {
  console.error(`FAIL: cannot read ${mockDir}: ${err.message}`);
  process.exit(1);
}

// Extract symbols from filenames like "AAPL_1d.json" (deduplicate)
const mockSymbols = [...new Set(
  mockFiles
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.split("_")[0])
    .filter((s) => /^[A-Z]+$/.test(s))
)];
console.log(`Mock dataset symbols (${mockSymbols.length}): ${mockSymbols.join(", ")}`);

// Compare: whitelist must be a subset of mock dataset (mock can have extras,
// but every whitelisted symbol must have a mock file)
const missingInMock = whitelist.filter((s) => !mockSymbols.includes(s));
const missingInWhitelist = mockSymbols.filter((s) => !whitelist.includes(s));

if (missingInMock.length > 0) {
  console.error(`\nFAIL: symbols in R2_CACHE_SYMBOLS but missing from Mock dataset:`);
  for (const s of missingInMock) {
    console.error(`  - ${s} (expected file: public/mock/klines/${s}_1d.json)`);
  }
  console.error(`\nFix: run "pnpm run mock:generate" to regenerate Mock data,`);
  console.error(`or remove the symbol from R2_CACHE_SYMBOLS in src/lib/env.ts.`);
  process.exit(1);
}

if (missingInWhitelist.length > 0) {
  console.warn(`\nWARN: symbols in Mock dataset but not in R2 whitelist:`);
  for (const s of missingInWhitelist) {
    console.warn(`  - ${s}`);
  }
  console.warn(`(Not blocking — Mock dataset can include extra symbols.)`);
}

console.log("\nPASS: R2_CACHE_SYMBOLS is in sync with Mock dataset.");
process.exit(0);
