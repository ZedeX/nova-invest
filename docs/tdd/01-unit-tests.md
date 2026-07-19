# 01 — Unit Test Specs (per ADR)

> **Owner**: Engineering
> **Last reviewed**: 2026-07-20
> **Parent**: [`README.md`](./README.md)

This document specifies, **for every one of the 16 ADRs**, the unit tests that must exist. Each ADR section provides:

- **Seam**: the public interface under test
- **File**: the test file path (real or planned)
- **Status**: what is implemented today (post-v5 architecture review)
- **Test cases (Red → Green order)**: the order in which tests must be written, one vertical slice at a time. Each case specifies Input / Expected / Why.

The order is **mandatory**: do not skip ahead. Each test teaches the implementation; jumping to test #5 without #1–#4 produces speculative code.

For shared fixtures and stubs referenced below, see [`04-test-fixtures.md`](./04-test-fixtures.md).

---

## ADR-0001 — Use-Mock Dual-Mode Switch

- **Seam**: `getProvider()`, `isMockMode()`, `getEnv()` exported from `@/lib/env` and `@/lib/data/provider`.
- **File**: `web/tests/unit/use-mock-switch.test.ts`
- **Status**: 5 active `it()` blocks + 3 `it.todo` stubs.
- **TR-IDs covered**: TR-EP01-001, TR-EP02-001, TR-EP02-002.

### Test cases (Red → Green order)

#### 1. `returns MockProvider when USE_MOCK=true` ✅ active
- **Input**: `vi.stubEnv("USE_MOCK", "true")` then `vi.resetModules()` then `import { getProvider }`.
- **Expected**: `getProvider()` returns an instance whose `.constructor.name === "MockProvider"`.
- **Why**: ADR-0001 §"Validation criteria" #1 — Mock mode is the default.

#### 2. `returns RealProvider when USE_MOCK=false` ✅ active
- **Input**: `vi.stubEnv("USE_MOCK", "false")`, `vi.resetModules()`, `import { getProvider }`.
- **Expected**: returned instance's `.constructor.name === "RealProvider"`.
- **Why**: ADR-0001 §"Validation criteria" #2 — Real mode is opt-in.

#### 3. `defaults to MockProvider when USE_MOCK is unset` ✅ active
- **Input**: `delete process.env.USE_MOCK`, `vi.resetModules()`, `import { getProvider }`.
- **Expected**: returned instance's `.constructor.name === "MockProvider"`.
- **Why**: ADR-0001 §"Decision" — USE_MOCK defaults to "true"; absence must be safe.

#### 4. `makes zero external fetch in Mock mode` ✅ active
- **Input**: `vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("must not be called")))`, `USE_MOCK=true`, call `getProvider().fetchKlines("AAPL", "1d")`.
- **Expected**: returns Mock JSON; `fetch` never resolves (no real HTTP).
- **Why**: ADR-0001 §"Validation criteria" #4 — Mock mode = zero external calls. Reinforced by `tests/setup.ts` global fetch stub.

#### 5. `MockProvider reads canonical path /mock/klines/{SYMBOL}_1d.json` ✅ active
- **Input**: stub `fetch` to capture URL; call `getProvider().fetchKlines("AAPL", "1d")`.
- **Expected**: `fetch` was called with `/mock/klines/AAPL_1d.json`.
- **Why**: ADR-0001 §"Validation criteria" #3 — canonical Mock path.

#### 6. `getProvider(env) accepts explicit env override` ⏳ `it.todo`
- **Input**: `getProvider({ USE_MOCK: "false" })` without env mutation.
- **Expected**: returns `RealProvider`.
- **Why**: ADR-0001 §"Migration plan" — eliminate module-level `_provider` cache; pass env explicitly.

#### 7. `does not cache provider across module reloads` ⏳ `it.todo`
- **Input**: `vi.resetModules()`, request provider with `USE_MOCK=true`, then `vi.resetModules()` + `USE_MOCK=false`.
- **Expected**: second call returns `RealProvider`, not cached `MockProvider`.
- **Why**: ADR-0001 §"Migration plan" — kill the module-level `_provider` anti-pattern.

#### 8. `env param overrides process.env when both present` ⏳ `it.todo`
- **Input**: `USE_MOCK=true` in env, but `getProvider({ USE_MOCK: "false" })`.
- **Expected**: `RealProvider` returned.
- **Why**: ADR-0001 §"Migration plan" — explicit param wins; supports Workers request-scoped injection.

---

## ADR-0002 — R2 Cache Whitelist

- **Seam**: `shouldCacheR2(symbol)`, `R2_CACHE_SYMBOLS` exported from `@/lib/env`.
- **File**: `web/tests/unit/r2-cache-whitelist.test.ts`
- **Status**: 8/8 active (no TODOs).
- **TR-IDs covered**: TR-EP02-003, TR-EP02-004, TR-EP02-005.

### Test cases (Red → Green order)

#### 1. `shouldCacheR2 returns true for whitelisted symbol` ✅ active
- **Input**: `shouldCacheR2("AAPL")`.
- **Expected**: `true`.
- **Why**: ADR-0002 §"Validation criteria" #1 — whitelist membership.

#### 2. `shouldCacheR2 is case-insensitive` ✅ active
- **Input**: `shouldCacheR2("aapl")`, `shouldCacheR2("AAPL")`, `shouldCacheR2("Aapl")`.
- **Expected**: all `true`.
- **Why**: ADR-0002 §"Decision" — case-insensitive lookup (Set stores uppercase).

#### 3. `shouldCacheR2 returns false for non-whitelisted symbol` ✅ active
- **Input**: `shouldCacheR2("RKLB")`.
- **Expected**: `false`.
- **Why**: ADR-0002 §"Validation criteria" #2 — non-whitelisted rejected.

#### 4. `shouldCacheR2 returns false for empty string` ✅ active
- **Input**: `shouldCacheR2("")`.
- **Expected**: `false`.
- **Why**: ADR-0002 §"Validation criteria" #2 — degenerate input safe.

#### 5. `cold symbols are rejected even if R2 has them` ✅ active
- **Input**: simulate R2 having "TSLA" but remove "TSLA" from `R2_CACHE_SYMBOLS` (via module reload with stubbed env).
- **Expected**: `shouldCacheR2("TSLA") === false`.
- **Why**: ADR-0002 §"Decision" — whitelist is the single source of truth, not R2 contents.

#### 6. `R2_CACHE_SYMBOLS has exactly 10 entries` ✅ active
- **Input**: read `R2_CACHE_SYMBOLS.size`.
- **Expected**: `10`.
- **Why**: ADR-0002 §"Validation criteria" #3 — exactly 10 symbols in Phase 1.

#### 7. `whitelist matches the 10 expected symbols` ✅ active
- **Input**: spread `R2_CACHE_SYMBOLS` into an array, sort.
- **Expected**: `["AMD", "AMZN", "AAPL", "GOOGL", "INTC", "META", "MSFT", "NFLX", "NVDA", "TSLA"]` (sorted).
- **Why**: ADR-0002 §"Validation criteria" #4 — exact symbol set.

#### 8. `bidirectional sync with mock/klines/*.json` ✅ active
- **Input**: `readdirSync("web/public/mock/klines")` → set of symbols extracted from `{SYMBOL}_1d.json`.
- **Expected**: that set equals `R2_CACHE_SYMBOLS`.
- **Why**: ADR-0002 §"Validation criteria" #5 — every whitelisted symbol has a Mock file, and vice versa. Also enforced by CI step `pnpm run check:mock-symbols`.

---

## ADR-0003 — LLM Routing + Cost Cap

- **Seam**: `classifyIntent(query)`, `route(intent)`, `getLLM(intent)` from `@/lib/llm/router`.
- **File**: `web/tests/unit/classify-intent.test.ts` + `web/tests/unit/llm-route.test.ts`
- **Status**: 13 active + 6 `it.todo`.
- **TR-IDs covered**: TR-EP03-001, TR-EP03-002, TR-EP03-003, TR-EP03-004, TR-EP03-013, TR-EP03-016. NOTE: TR-EP03-005 (Forced citation mode) is owned by ADR-0007, and TR-EP03-006 (AnswerWithCitations interface) has no owner_adr in `tr-registry.yaml` — both are Ask Agent TRs, not LLM Routing.

### classifyIntent test cases (Red → Green order)

#### 1. `classifies "what's the current price of AAPL" as simple_qa` ✅ active
- **Input**: `classifyIntent("what's the current price of AAPL?")`.
- **Expected**: `"simple_qa"`.
- **Why**: ADR-0003 §"Validation criteria" #1 — simple_qa regex includes "current price".

#### 2. `classifies "analyze NVDA earnings trend" as deep_research` ✅ active
- **Input**: `classifyIntent("analyze NVDA earnings trend")`.
- **Expected**: `"deep_research"`.
- **Why**: ADR-0003 §"Validation criteria" #1 — deep_research regex includes "analyze" + "trend".

#### 3. `classifies "search for TSLA news" as tool_call` ✅ active
- **Input**: `classifyIntent("search for TSLA news")`.
- **Expected**: `"tool_call"`.
- **Why**: ADR-0003 §"Validation criteria" #1 — tool_call regex includes "search" + "news".

#### 4. `classifies unknown query as clarify` ✅ active
- **Input**: `classifyIntent("hello world")`.
- **Expected**: `"clarify"`.
- **Why**: ADR-0003 §"Decision" — fallback intent is `clarify`.

#### 5. `classifyIntent is case-insensitive` ✅ active
- **Input**: `classifyIntent("ANALYZE nvda EARNINGS")`.
- **Expected**: `"deep_research"`.
- **Why**: ADR-0003 §"Decision" — `q = query.toLowerCase()` is applied before regex.

#### 6. `returns one of the four canonical intents for any string` ✅ active (parameterized via `it.each`)
- **Input**: a corpus of 12 queries spanning all 4 intents.
- **Expected**: each returns a value in `["simple_qa", "deep_research", "tool_call", "clarify"]`.
- **Why**: ADR-0003 §"Validation criteria" #1 — type contract.

#### 7. `handles Chinese alternations without \\b boundary bug` ✅ active
- **Input**: `classifyIntent("当前AAPL股价")`.
- **Expected**: `"simple_qa"`.
- **Why**: ADR-0003 §"Decision" — Chinese alternations must use bare alternation, not `\b当前\b`. Documented in `router.ts` comment.

### route / getLLM test cases (Red → Green order)

#### 8. `ROUTING_RULES.simple_qa.cloud.cost_cap === 0.001` ✅ active
- **Input**: read `ROUTING_RULES.simple_qa.cloud.cost_cap`.
- **Expected**: `0.001` (USD).
- **Why**: ADR-0003 §"Validation criteria" #2 — cost tier table.

#### 9. `ROUTING_RULES.deep_research.cloud.cost_cap === 0.05` ✅ active
- **Input**: read `ROUTING_RULES.deep_research.cloud.cost_cap`.
- **Expected**: `0.05`.
- **Why**: ADR-0003 §"Validation criteria" #2 — **A1 fix**: was `$0.50`, corrected to `$0.05` per ADR revision.

#### 10. `route returns mock config in Mock mode` ✅ active
- **Input**: `USE_MOCK=true`, call `route("simple_qa")`.
- **Expected**: `{ provider: "mock", model: "mock-qa-sample", max_tokens: 0, cost_cap: 0 }`.
- **Why**: ADR-0003 §"Validation criteria" #3 — Mock mode bypasses routing table.

#### 11. `route selects local (LM Studio) when ENVIRONMENT != production` ✅ active
- **Input**: `USE_MOCK=false`, `ENVIRONMENT="test"`, `LLM_PROVIDER="lmstudio"`, call `route("deep_research")`.
- **Expected**: `provider === "lmstudio"`, `model === "qwen2.5-32b-instruct"`, `cost_cap === 0`.
- **Why**: ADR-0003 §"Validation criteria" #4 — local tier has zero cost_cap.

#### 12. `route selects cloud (Ark) when ENVIRONMENT === production` ✅ active
- **Input**: `USE_MOCK=false`, `ENVIRONMENT="production"`, call `route("deep_research")`.
- **Expected**: `provider === "ark"`, `model === "doubao-pro-32k"`, `cost_cap === 0.05`.
- **Why**: ADR-0003 §"Validation criteria" #5 — production routes to Ark.

#### 13. `getLLM returns MockLLM in Mock mode` ✅ active
- **Input**: `USE_MOCK=true`, `getLLM("simple_qa")`.
- **Expected**: returned object's `.constructor.name === "MockLLM"`.
- **Why**: ADR-0003 §"Validation criteria" #6 — factory returns correct class.

#### 14. `(@real) getLLM returns RealLLM when USE_MOCK=false` ⏳ `it.todo`
- **Input**: `USE_MOCK=false`, `ENVIRONMENT="production"`, `getLLM("deep_research")`.
- **Expected**: `.constructor.name === "RealLLM"`, `.config.provider === "ark"`.
- **Why**: ADR-0003 §"Validation criteria" #6 — real factory branch.

#### 15. `getLLM does not cache across module reloads` ⏳ `it.todo`
- **Input**: `vi.resetModules()`, getLLM with `USE_MOCK=true`; `vi.resetModules()`, getLLM with `USE_MOCK=false`.
- **Expected**: second call returns `RealLLM`, not cached `MockLLM`.
- **Why**: ADR-0003 §"Migration plan" — eliminate module-level `_llm` cache anti-pattern.

#### 16. `getLLM(intent) accepts explicit config param` ⏳ `it.todo`
- **Input**: `getLLM("simple_qa", { provider: "ark", ... })`.
- **Expected**: returns `RealLLM` regardless of env.
- **Why**: ADR-0003 §"Migration plan" — Workers request-scoped config injection.

#### 17. `(@real) route.tool_call.cloud.max_tokens === 800` ⏳ `it.todo`
- **Input**: read `ROUTING_RULES.tool_call.cloud.max_tokens`.
- **Expected**: `800`.
- **Why**: ADR-0003 §"Decision" — tool_call max_tokens is 800 (not 4000).

#### 18. `(@real) route.clarify.cloud.cost_cap === 0.0005` ⏳ `it.todo`
- **Input**: read `ROUTING_RULES.clarify.cloud.cost_cap`.
- **Expected**: `0.0005`.
- **Why**: ADR-0003 §"Decision" — clarify is the cheapest tier.

#### 19. `getLLM exposes async complete(query, intent) returning AskResponse` ⏳ `it.todo`
- **Input**: `getLLM("simple_qa").complete("hello", "simple_qa")`.
- **Expected**: resolves to an `AskResponse` with all required fields.
- **Why**: ADR-0003 §"Validation criteria" #7 — interface contract.

---

## ADR-0004 — Agent Loop State Machine

- **Seam**: `runAgentLoop(query, ctx)` exported from `@/lib/agent/loop.ts` *(planned)*.
- **File**: `web/tests/integration/agent-loop.test.ts` (currently 5 TODO stubs; will be moved to integration per [`02-integration-tests.md`](./02-integration-tests.md)). Pure FSM transitions also get unit coverage in `web/tests/unit/agent-loop-fsm.test.ts` *(planned)*.
- **Status**: 0 active; 5 TODO stubs in integration file.
- **TR-IDs covered**: TR-EP01-002, TR-EP01-003, TR-EP01-004, TR-EP01-005, TR-EP01-006.

### Unit (FSM) test cases — Red → Green order

> The integration file tests end-to-end loop behavior. The unit file tests the **pure state-transition function** `transition(state, event) → state` extracted from the loop. Pure functions make unit testing trivial.

#### 1. `transition("init", { type: "plan_ready" }) returns "plan"`
- **Input**: `transition("init", { type: "plan_ready" })`.
- **Expected**: `"plan"`.
- **Why**: ADR-0004 §"State machine" — Init → Plan transition.

#### 2. `transition("plan", { type: "execute_start" }) returns "execute"`
- **Input**: `transition("plan", { type: "execute_start" })`.
- **Expected**: `"execute"`.
- **Why**: ADR-0004 §"State machine" — Plan → Execute.

#### 3. `transition("execute", { type: "tool_call" }) returns "tool_call"`
- **Input**: `transition("execute", { type: "tool_call" })`.
- **Expected**: `"tool_call"`.
- **Why**: ADR-0004 §"State machine" — Execute → ToolCall.

#### 4. `transition("tool_call", { type: "tool_done" }) returns "execute"`
- **Input**: `transition("tool_call", { type: "tool_done" })`.
- **Expected**: `"execute"`.
- **Why**: ADR-0004 §"State machine" — ToolCall → Execute.

#### 5. `transition("execute", { type: "synthesize" }) returns "synthesize"`
- **Input**: `transition("execute", { type: "synthesize" })`.
- **Expected**: `"synthesize"`.
- **Why**: ADR-0004 §"State machine" — Execute → Synthesize.

#### 6. `transition("synthesize", { type: "final_answer" }) returns "final_answer"`
- **Input**: `transition("synthesize", { type: "final_answer" })`.
- **Expected**: `"final_answer"`.
- **Why**: ADR-0004 §"State machine" — Synthesize → FinalAnswer.

#### 7. `transition("execute", { type: "max_steps_exceeded" }) returns "aborted"`
- **Input**: simulate step counter at MAX_STEPS=20, `transition("execute", { type: "max_steps_exceeded" })`.
- **Expected**: `"aborted"`.
- **Why**: ADR-0004 §"Validation criteria" #2 — MAX_STEPS=20 hard cap.

#### 8. `transition("execute", { type: "cost_exceeded" }) returns "aborted"`
- **Input**: simulate aggregate cost > $5 (AGGREGATE_COST_CEILING_USD), `transition("execute", { type: "cost_exceeded" })`.
- **Expected**: `"aborted"`.
- **Why**: ADR-0004 §"Validation criteria" #3 — $5 aggregate ceiling.

#### 9. `transition("synthesize", { type: "citation_validation_failed" }) returns "aborted"`
- **Input**: `transition("synthesize", { type: "citation_validation_failed" })`.
- **Expected**: `"aborted"`.
- **Why**: ADR-0004 §"Validation criteria" #4 — citation failure aborts.

#### 10. `transition throws on illegal transition`
- **Input**: `transition("init", { type: "execute_start" })` (skipping Plan).
- **Expected**: throws `IllegalTransitionError`.
- **Why**: ADR-0004 §"Decision" — FSM rejects out-of-order events.

---

## ADR-0005 — Memory Layer

- **Seam**: `MemoryStore` interface (KV-backed) exported from `@/lib/agent/memory.ts` *(planned)*.
- **File**: `web/tests/unit/memory-store.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP03-007, TR-EP03-008, TR-EP03-009.

### Test cases (Red → Green order)

#### 1. `MemoryStore.put writes a value under key`
- **Input**: `store.put("user:1:conv:1", { role: "user", content: "hi" })`, then `store.get("user:1:conv:1")`.
- **Expected**: returns the stored object.
- **Why**: ADR-0005 §"Validation criteria" #1 — KV-backed read/write.

#### 2. `MemoryStore.get returns null for missing key`
- **Input**: `store.get("user:1:conv:999")`.
- **Expected**: `null`.
- **Why**: ADR-0005 §"Validation criteria" #2 — missing keys return null, not throw.

#### 3. `MemoryStore.list returns keys with prefix`
- **Input**: put 3 keys under `user:1:conv:*`, call `store.list("user:1:conv:")`.
- **Expected**: array of 3 keys.
- **Why**: ADR-0005 §"Validation criteria" #3 — prefix listing.

#### 4. `MemoryStore.delete removes a key`
- **Input**: put key, delete it, get it.
- **Expected**: `get` returns `null`.
- **Why**: ADR-0005 §"Validation criteria" #4 — explicit delete.

#### 5. `MemoryStore.put respects TTL`
- **Input**: `store.put(k, v, { ttl: 1 })`, advance fake timers by 2s, `store.get(k)`.
- **Expected**: `null`.
- **Why**: ADR-0005 §"Decision" — conversation TTL.

#### 6. `MemoryStore.list limits to 100 results`
- **Input**: put 150 keys, `store.list(prefix, { limit: 100 })`.
- **Expected**: array length ≤ 100.
- **Why**: ADR-0005 §"Decision" — KV list pagination cap.

---

## ADR-0006 — Tool Protocol

- **Seam**: `TOOL_REGISTRY` static map, `ToolCall` / `ToolResult` interfaces, `ToolHandler` type from `@/lib/tools/registry.ts` *(planned)*.
- **File**: `web/tests/unit/tool-protocol.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP01-004 (Hybrid tool protocol: MCP + native function call), TR-EP03-011 (MCP + Function Call protocol), TR-EP02-008 (co-owned with ADR-0016 — multi-source fallback uses Tool Protocol to dispatch provider tools).

### Test cases (Red → Green order)

#### 1. `TOOL_REGISTRY is a static Record<string, ToolHandler>`
- **Input**: read `typeof TOOL_REGISTRY`.
- **Expected**: `object` with string keys; `TOOL_REGISTRY.get_quote` is a `function`.
- **Why**: ADR-0006 §"Key Interfaces" — registry is a static map, not dynamic lookup.

#### 2. `TOOL_REGISTRY contains exactly 9 Phase 1 native tools`
- **Input**: `Object.keys(TOOL_REGISTRY).sort()`.
- **Expected**: `["build_strategy", "get_earnings", "get_macro", "get_ohlc", "get_quote", "plot_chart", "run_backtest", "save_dashboard", "search_news"]` (9 tools).
- **Why**: ADR-0006 §"Decision" — 9 Phase 1 native tools; MCP deferred to Phase 2.

#### 3. `ToolCall interface shape: name + parameters + optional timeout`
- **Input**: construct `const call: ToolCall = { name: "get_quote", parameters: { symbol: "AAPL" }, timeout: 5000 }`.
- **Expected**: TypeScript compiles; `call.name === "get_quote"`.
- **Why**: ADR-0006 §"Key Interfaces" — ToolCall shape.

#### 4. `ToolResult interface shape: success + result + cost_usd + latency_ms + source + optional error`
- **Input**: construct `const res: ToolResult = { success: true, result: { price: 150.0 }, cost_usd: 0.001, latency_ms: 120, source: "yahoo" }`.
- **Expected**: TypeScript compiles; `res.success === true`.
- **Why**: ADR-0006 §"Key Interfaces" — ToolResult shape includes cost + latency for ADR-0003 cost tracking.

#### 5. `ToolHandler signature: (params, env) => Promise<ToolResult>`
- **Input**: define `const handler: ToolHandler = async (params, env) => ({ success: true, result: params, cost_usd: 0, latency_ms: 1, source: "test" })`.
- **Expected**: TypeScript compiles; `await handler({ x: 1 }, {} as Env)` resolves to ToolResult.
- **Why**: ADR-0006 §"Key Interfaces" — ToolHandler is the canonical handler type.

#### 6. `unknown tool name throws ToolNotFoundError`
- **Input**: dispatch `{ name: "nonexistent_tool", parameters: {} }` through registry.
- **Expected**: throws `ToolNotFoundError` with message containing `"nonexistent_tool"`.
- **Why**: ADR-0006 §"Decision" — closed tool registry; unknown tools are programming errors, not user errors.

#### 7. `get_quote tool returns ToolResult with source field`
- **Input**: `TOOL_REGISTRY.get_quote({ symbol: "AAPL" }, mockEnv)`.
- **Expected**: `result.success === true`; `result.source` is one of `"mock" | "yahoo" | "alpha_vantage" | "polygon"`; `result.cost_usd >= 0`.
- **Why**: ADR-0006 §"Decision" — every tool returns ToolResult with cost + source for traceability.

#### 8. `get_ohlc tool returns OHLC bars with timeframe parameter`
- **Input**: `TOOL_REGISTRY.get_ohlc({ symbol: "AAPL", timeframe: "1d" }, mockEnv)`.
- **Expected**: `result.success === true`; `result.result` is array of `{ date, open, high, low, close, volume }`.
- **Why**: ADR-0006 §"Decision" — get_ohlc is one of 9 native tools.

#### 9. `search_news tool returns array of news items`
- **Input**: `TOOL_REGISTRY.search_news({ query: "NVDA earnings", limit: 5 }, mockEnv)`.
- **Expected**: `result.success === true`; `result.result` is array with `length <= 5`.
- **Why**: ADR-0006 §"Decision" — search_news is one of 9 native tools.

#### 10. `tool handler timeout propagates as ToolResult.error`
- **Input**: `TOOL_REGISTRY.get_quote({ symbol: "AAPL" }, mockEnvWith500msTimeout)`; stub fetch to take 1000ms.
- **Expected**: `result.success === false`; `result.error` contains `"timeout"`.
- **Why**: ADR-0006 §"Decision" — tool timeouts are recoverable, not exceptions.

#### 11. `MCP external tool dispatch is a no-op stub in Phase 1`
- **Input**: attempt to call `dispatchMCPTool("external_search", {})`.
- **Expected`: throws `MCPNotAvailableError` with message `"MCP tools are Phase 2"`.
- **Why**: ADR-0006 §"Decision" — MCP deferred to Phase 2; Phase 1 has 9 native tools only.

#### 12. `every tool handler records cost_usd for ADR-0003 cost cap enforcement`
- **Input**: dispatch all 9 tools with mock env; collect `cost_usd` from each ToolResult.
- **Expected**: every result has `cost_usd >= 0` (Mock tools return 0; real-provider tools return actual cost).
- **Why**: ADR-0006 §"Decision" — tool cost feeds into ADR-0003 $5 ceiling.

---

## ADR-0007 — Citation Validator

- **Seam**: `validateCitations(response, mode)` exported from `@/lib/llm/citations.ts` *(planned)*.
- **File**: `web/tests/unit/citation-validator.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP03-010, TR-EP03-011, TR-EP03-012.

### Test cases (Red → Green order)

#### 1. `passes when all citations have source, url, quote`
- **Input**: `validateCitations({ citations: [{ source: "Yahoo", url: "https://yahoo.com", quote: "AAPL $200" }], ... }, "strict")`.
- **Expected**: `{ valid: true, errors: [] }`.
- **Why**: ADR-0007 §"Validation criteria" #1 — structural stage.

#### 2. `fails when citation.url is not a URL`
- **Input**: citation with `url: "not a url"`.
- **Expected**: `{ valid: false, errors: [{ stage: "structural", ... }] }`.
- **Why**: ADR-0007 §"Validation criteria" #1.

#### 3. `fails when quote is not a substring of source document`
- **Input**: citation claims `quote: "AAPL is $200"` but fetched source text contains "AAPL is $190".
- **Expected**: `{ valid: false, errors: [{ stage: "quote_substring", ... }] }`.
- **Why**: ADR-0007 §"Validation criteria" #2 — quote substring stage.

#### 4. `passes in partial_strip mode by removing unverified citations`
- **Input**: 2 citations, one fails substring check; `mode: "partial_strip"`.
- **Expected**: `{ valid: true, stripped: [bad_citation], remaining: [good_citation] }`.
- **Why**: ADR-0007 §"Decision" — partial_strip keeps the response valid.

#### 5. `fails in strict_reject mode when any citation fails`
- **Input**: same as above, `mode: "strict_reject"`.
- **Expected**: `{ valid: false }`.
- **Why**: ADR-0007 §"Decision" — strict_reject aborts the response.

#### 6. `URL reachability check is async and does not block response`
- **Input**: citation with reachable URL.
- **Expected**: response resolves within 100ms; reachability result recorded separately.
- **Why**: ADR-0007 §"Decision" — URL reachability is fire-and-forget post-stream.

#### 7. `URL reachability check tolerates network errors`
- **Input**: citation with URL that returns 500.
- **Expected**: validation passes (URL is reachable, just erroring); flag recorded.
- **Why**: ADR-0007 §"Decision" — reachability = " responds", not "200 OK".

#### 8. `returns all errors aggregated (not first-only)`
- **Input**: 3 citations, 2 invalid in different ways.
- **Expected**: `errors.length === 2`.
- **Why**: ADR-0007 §"Validation criteria" #3 — aggregate errors for the user.

---

## ADR-0008 — Strategy DSL

- **Seam**: `validateDSL(yaml)`, `parseStrategy(yaml)` from `@/lib/strategy/validator.ts` *(planned)*.
- **File**: `web/tests/unit/strategy-dsl.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP04-001 through TR-EP04-008.

### Test cases (Red → Green order)

#### 1. `validateDSL accepts a minimal valid strategy`
- **Input**: minimal YAML with `name`, `symbols`, `timeframe`, `entry`, `exit`.
- **Expected**: `{ valid: true }`.
- **Why**: ADR-0008 §"Validation criteria" #1 — happy path.

#### 2. `validateDSL rejects YAML missing required field "name"`
- **Input**: YAML without `name`.
- **Expected**: `{ valid: false, errors: [{ path: "name", ... }] }`.
- **Why**: ADR-0008 §"Decision" — JSON Schema strict mode.

#### 3. `validateDSL rejects unknown indicator "foobar"`
- **Input**: `entry: { indicator: "foobar", ... }`.
- **Expected**: error referencing `indicator.enum`.
- **Why**: ADR-0008 §"Validation criteria" #2 — closed enum of 8 indicators.

#### 4. `validateDSL accepts all 8 indicators`
- **Input**: 8 strategies, each using one of SMA/EMA/RSI/MACD/Bollinger/ATR/OBV/VWAP.
- **Expected**: all 8 valid.
- **Why**: ADR-0008 §"Decision" — full indicator whitelist.

#### 5. `validateDSL rejects position_sizing method outside enum`
- **Input**: `position_sizing: { method: "martingale" }`.
- **Expected**: error.
- **Why**: ADR-0008 §"Decision" — only 3 methods allowed (fixed_fractional, kelly, fixed_amount).

#### 6. `parseStrategy returns a typed Strategy object`
- **Input**: valid YAML.
- **Expected**: returns object matching `Strategy` interface from `types.ts`.
- **Why**: ADR-0008 §"Validation criteria" #3 — typed parse output.

#### 7. `validateDSL transitions status Draft → Validated on success`
- **Input**: valid YAML with `status: "draft"`.
- **Expected**: returned strategy has `status: "validated"`.
- **Why**: ADR-0008 §"Decision" — 5-state FSM (Draft → Validated → Backtested → PaperTrading → Live).

#### 8. `validateDSL rejects illegal status transition (Draft → Live)`
- **Input**: YAML with `status: "draft"`, request transition to `"live"`.
- **Expected`: error.
- **Why**: ADR-0008 §"Decision" — FSM rejects skipping states.

#### 9. `validateDSL uses jsep for expression parsing (not Function())`
- **Input**: `entry: { when: "rsi < 30 && close > sma(20)" }`.
- **Expected**: parsed via jsep AST, no `Function()` constructor called.
- **Why**: ADR-0008 §"Security" — no `eval`-style code execution. (Per v5 review: ADR-0013 documents the Function()→jsep migration; same applies here.)

---

## ADR-0009 — Backtest Engine

- **Seam**: `runBacktest(strategy, data)` from `@/lib/backtest/engine.ts` *(planned)*.
- **File**: `web/tests/unit/backtest-engine.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP04-009 through TR-EP04-017.

### Test cases (Red → Green order)

#### 1. `runBacktest returns trades, equity_curve, metrics, benchmark_return, alpha, beta`
- **Input**: simple SMA-cross strategy on AAPL 1y daily klines.
- **Expected**: result matches `BacktestResult` interface in `types.ts`.
- **Why**: ADR-0009 §"Validation criteria" #1 — output shape.

#### 2. `equity_curve starts at 1.0 (normalized)`
- **Input**: any strategy.
- **Expected**: `equity_curve[0].equity === 1.0`.
- **Why**: ADR-0009 §"Decision" — normalized equity.

#### 3. `splits data 70/30 in-sample / out-of-sample`
- **Input**: 100 klines.
- **Expected**: `sample_split.in_sample.period` covers first 70, `out_of_sample.period` covers last 30.
- **Why**: ADR-0009 §"Validation criteria" #2 — 70/30 split.

#### 4. `metrics.total_return equals last equity minus 1`
- **Input**: equity_curve ending at 1.10.
- **Expected**: `total_return === 0.10`.
- **Why**: ADR-0009 §"Decision" — return definition.

#### 5. `metrics.max_drawdown is non-positive`
- **Input**: any strategy with realistic drawdown.
- **Expected**: `max_drawdown <= 0`.
- **Why**: ADR-0009 §"Decision" — drawdown sign convention.

#### 6. `metrics.sharpe_ratio is annualized`
- **Input**: daily klines, sharpe computed from daily returns.
- **Expected**: `sharpe_ratio ≈ daily_sharpe * sqrt(252)` (within tolerance 1e-6).
- **Why**: ADR-0009 §"Decision" — annualization.

#### 7. `benchmark_return is buy-and-hold of underlying`
- **Input**: AAPL klines from $100 to $110.
- **Expected**: `benchmark_return === 0.10`.
- **Why**: ADR-0009 §"Decision" — benchmark definition.

#### 8. `alpha = total_return - benchmark_return`
- **Input**: total_return 0.15, benchmark 0.10.
- **Expected**: `alpha === 0.05`.
- **Why**: ADR-0009 §"Decision" — alpha formula.

#### 9. `beta is covariance(strategy, benchmark) / variance(benchmark)`
- **Input**: known worked example (textbook values).
- **Expected**: matches textbook value within 1e-6.
- **Why**: ADR-0009 §"Validation criteria" #3 — formula correctness.

#### 10. `paper trading mode does not execute real orders`
- **Input**: strategy with `status: "paper"`.
- **Expected**: no broker calls; result is simulated.
- **Why**: ADR-0009 §"Decision" — paper vs live.

---

## ADR-0010 — Dashboard Layout + Widget System

- **Seam**: `WidgetConfig`, `WidgetType`, `DashboardGridConfig`, `DashboardSWRConfig`, `WidgetErrorBoundary` from `@/lib/dashboard/types.ts` and `@/lib/dashboard/widget-error-boundary.tsx` *(planned)*.
- **File**: `web/tests/unit/dashboard-layout.test.ts` *(planned)* + `web/tests/unit/widget-error-boundary.test.tsx` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP05-001 through TR-EP05-019 (19 TRs — all Dashboard Layout).

### Test cases (Red → Green order)

#### WidgetConfig schema validation
1. `WidgetConfig accepts a valid config object with all required fields`
   - **Input**: `{ id: "kline", title: "K线", gridSpan: { desktop: 8, mobile: 12 }, minGridSpan: 4, fetcher, render: lazy(() => import(...)) }`.
   - **Expected**: `validateWidgetConfig(cfg).valid === true`.
   - **Why**: ADR-0010 §"Key Interfaces" — WidgetConfig shape.

2. `WidgetConfig rejects missing gridSpan.mobile`
   - **Input**: config with `gridSpan: { desktop: 8 }` (no mobile).
   - **Expected**: validation error path `gridSpan.mobile`.
   - **Why**: ADR-0010 §"Key Interfaces" — responsive grid requires both breakpoints.

3. `WidgetConfig rejects render that is not a React lazy component`
   - **Input**: `render: () => <div />` (non-lazy).
   - **Expected**: validation error.
   - **Why**: ADR-0010 §"Decision" — lazy-loading for code-splitting.

#### WidgetType closed enum (9 types)
4. `WidgetType enum has exactly 9 members`
   - **Input**: read `Object.keys(WidgetType)`.
   - **Expected**: 9 entries: `kline`, `positions`, `strategy`, `watchlist`, `ask_agent`, `credit`, `orderbook`, `alerts`, `news`.
   - **Why**: ADR-0010 §"Key Interfaces" — 9 widget types (6 Phase 1 + 3 Phase 2).

5. `Phase 1 widget set (6 widgets) is enabled by default`
   - **Input**: `DEFAULT_DASHBOARD_LAYOUT`.
   - **Expected**: contains `kline`, `positions`, `strategy`, `watchlist`, `ask_agent`, `credit` (Phase 1); `orderbook`, `alerts`, `news` absent (Phase 2).
   - **Why**: ADR-0010 §"Decision" — Phase 1 ships 6 widgets, Phase 2 adds 3.

#### DashboardGridConfig (12-column CSS grid)
6. `DashboardGridConfig.columns === 12`
   - **Input**: read `DashboardGridConfig.columns`.
   - **Expected**: `12`.
   - **Why**: ADR-0010 §"Key Interfaces" — 12-column grid.

7. `DashboardGridConfig rowGap and columnGap equal "1rem"`
   - **Input**: read `DashboardGridConfig.rowGap`, `.columnGap`.
   - **Expected**: both `"1rem"`.
   - **Why**: ADR-0010 §"Key Interfaces" — fixed gap spec.

8. `DashboardGridConfig.breakpoints define desktop and mobile widths`
   - **Input**: read `DashboardGridConfig.breakpoints`.
   - **Expected**: object with `desktop` and `mobile` keys (numerical min-widths).
   - **Why**: ADR-0010 §"Key Interfaces" — responsive breakpoints.

#### DashboardSWRConfig (dedupingInterval=5000ms)
9. `DashboardSWRConfig.dedupingInterval === 5000`
   - **Input**: read `DashboardSWRConfig.dedupingInterval`.
   - **Expected**: `5000` (ms).
   - **Why**: ADR-0010 §"Key Interfaces" — SWR dedup interval.

10. `DashboardSWRConfig.revalidateOnFocus === false`
    - **Input**: read `DashboardSWRConfig.revalidateOnFocus`.
    - **Expected**: `false`.
    - **Why**: ADR-0010 §"Key Interfaces" — focus revalidation disabled.

11. `DashboardSWRConfig.errorRetryCount === 2`
    - **Input**: read `DashboardSWRConfig.errorRetryCount`.
    - **Expected**: `2`.
    - **Why**: ADR-0010 §"Key Interfaces" — bounded retry.

#### WidgetErrorBoundary (React ErrorBoundary)
12. `WidgetErrorBoundary catches render errors and renders fallback`
    - **Input**: render a widget that throws; wrap in `<WidgetErrorBoundary>`.
    - **Expected**: fallback UI renders; error captured by `getDerivedStateFromError`.
    - **Why**: ADR-0010 §"Decision" — per-widget isolation.

13. `WidgetErrorBoundary logs error to console.error (or telemetry hook)`
    - **Input**: throw inside widget render.
    - **Expected**: `console.error` called with error + componentStack.
    - **Why**: ADR-0010 §"Decision" — observability.

14. `WidgetErrorBoundary fallback includes widget id for debugging`
    - **Input**: thrown error, widget id `"kline"`.
    - **Expected**: fallback UI contains `"kline"` (or `widgetId` prop).
    - **Why**: ADR-0010 §"Decision" — debugging surface.

#### LCP budget enforcement
15. `dashboard LCP under 2s in Mock mode`
    - **Input**: render dashboard with `USE_MOCK=true`, measure LCP via `web-vitals` mock.
    - **Expected**: LCP ≤ 2000ms.
    - **Why**: ADR-0010 §"Decision" — LCP budget <2s Mock.

16. `dashboard LCP under 3s in Real mode`
    - **Input**: render dashboard with `USE_MOCK=false`, mock fetcher resolves in 800ms.
    - **Expected**: LCP ≤ 3000ms.
    - **Why**: ADR-0010 §"Decision" — LCP budget <3s Real.

17. `individual widget render time under 100ms`
    - **Input**: render each of 6 Phase 1 widgets in isolation, measure with `performance.now()`.
    - **Expected**: each widget render ≤ 100ms.
    - **Why**: ADR-0010 §"Decision" — per-widget render budget.

#### Grid placement
18. `widgets placed on grid do not overflow 12-column desktop width`
    - **Input**: a layout config with kline=8 + positions=4 = 12.
    - **Expected**: layout solver returns 2 rows when kline + watchlist(8) + positions(4) exceed 12.
    - **Why**: ADR-0010 §"Decision" — 12-col constraint enforcement.

19. `mobile breakpoint stacks all widgets in single column (gridSpan.mobile = 12)`
    - **Input**: 6 Phase 1 widgets, mobile viewport.
    - **Expected**: every widget `gridSpan.mobile === 12` (full-width stack).
    - **Why**: ADR-0010 §"Decision" — responsive mobile layout.

---

## ADR-0011 — D1 Master Schema

- **Seam**: D1 migration files + DAO classes from `src/lib/db/*.ts` *(planned)*.
- **File**: `web/tests/unit/d1-schema.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP02-009 through TR-EP02-017 (and EP01/EP03/EP07 D1 tables).

### Test cases (Red → Green order)

#### 1. `migrations define all required tables`
- **Input**: read migration SQL files.
- **Expected**: tables include `users`, `symbols`, `watchlists`, `watchlist_items`, `kline_cache_index`, `fundamentals`, `user_profiles`, `conversation_history`, `strategies`, `backtest_results`, `broker_accounts`, `orders`, `positions`, `trades`, `playbooks`, `playbook_versions`, `playbook_dependencies`, `community_playbooks`, `user_playbook_installs`, `playbook_ratings`, `playbook_comments`, `playbook_reports`, `url_check_queue`, `rag_chunks`, `news_articles`.
- **Why**: ADR-0011 §"Validation criteria" #1 — 24+2 tables per master schema.

#### 2. `migrations include indexes on foreign keys`
- **Input**: parse `CREATE INDEX` statements.
- **Expected**: every FK column has an index.
- **Why**: ADR-0011 §"Decision" — D1 query performance.

#### 3. `community_playbooks.content_hash column exists`
- **Input**: PRAGMA on `community_playbooks`.
- **Expected**: `content_hash TEXT NOT NULL` column present.
- **Why**: ADR-0011 §"Validation criteria" #2 (C16 fix from v4 review) — content hash for dedup.

#### 4. `playbooks.current_version is TEXT (semver)`
- **Input**: PRAGMA on `playbooks`.
- **Expected**: `current_version TEXT NOT NULL`.
- **Why**: ADR-0011 §"Decision" — SemVer string, not integer.

#### 5. `playbook_dependencies table has cycle-detection-friendly schema`
- **Input**: PRAGMA on `playbook_dependencies`.
- **Expected**: columns `(parent_id, child_id)` with composite PK and `dependency_type` column.
- **Why**: ADR-0011 §"Decision" — supports topological sort queries; column names align with parent/child composition semantics.

#### 6. `conversation_history stores role + intent for multi-turn memory`
- **Input**: PRAGMA on `conversation_history`.
- **Expected**: columns `user_id`, `role`, `content`, `intent`, `created_at`.
- **Why**: ADR-0011 §"Decision" — conversation_history table replaces per-step agent_traces; consumed by ADR-0005 Memory Layer.

#### 7. `users table has plan column with enum values`
- **Input**: PRAGMA.
- **Expected**: `plan TEXT CHECK(plan IN ('free','pro','team','enterprise'))`.
- **Why**: ADR-0011 §"Decision" — plan tier enum.

#### 8. `user_playbook_installs tracks install references (not content copies)`
- **Input**: PRAGMA on `user_playbook_installs`.
- **Expected**: columns `(user_id, playbook_id, installed_at)` with composite PK.
- **Why**: ADR-0011 §"Decision" — install creates reference, supports ADR-0012 share-flow semantics.

---

## ADR-0012 — Community Sharing

- **Seam**: `SharePackage`, `AntiAbuseFilter` from `src/lib/community/*.ts` *(planned)*.
- **File**: `web/tests/unit/community-share.test.ts` *(planned)* + `web/tests/unit/anti-abuse-filter.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP07-001 through TR-EP07-014.

### SharePackage test cases (Red → Green order)

> Per ADR-0012 §"Share Package Structure", `SharePackage` has NO `signature` and NO `license` field. Author signing and CC-BY-NC licensing are explicitly Phase 2 (out of scope for Phase 1 tests).

#### 1. `SharePackage includes all 15 fields per ADR-0012 interface`
- **Input**: construct SharePackage from a Playbook + perf data.
- **Expected**: object has `package_id`, `playbook_id`, `version`, `author_id`, `title`, `description`, `tags`, `risk_disclosure`, `performance_json`, `yaml_r2_key`, `moderation_status`, `installed_count`, `rating_avg`, `rating_count`, `created_at`.
- **Why**: ADR-0012 §"Validation criteria" #1 — package structure.

#### 2. `SharePackage rejects risk_disclosure shorter than 50 chars`
- **Input**: construct SharePackage with `risk_disclosure: "short"`.
- **Expected**: throws `RiskDisclosureTooShort` error.
- **Why**: ADR-0012 §"Decision" — Step 5 of publish flow enforces ≥50 chars.

#### 3. `installSharePackage deduplicates by content_hash`
- **Input**: install same package twice.
- **Expected**: second install returns existing `playbook_id`, no duplicate row.
- **Why**: ADR-0012 §"Validation criteria" #2 — content-hash dedup.

#### 4. `SharePackage.performance_json is a snapshot taken at publish time`
- **Input**: construct SharePackage, then update BacktestResult later.
- **Expected**: `performance_json` unchanged (snapshot semantics).
- **Why**: ADR-0012 §"Decision" — PerformanceSnapshot does NOT auto-update.

### AntiAbuseFilter test cases

#### 5. `AntiAbuseFilter rejects post containing forbidden word`
- **Input**: comment with "PUMP AND DUMP".
- **Expected**: `{ allowed: false, reason: "forbidden_word" }`.
- **Why**: ADR-0012 §"Validation criteria" #3 — forbidden word list.

#### 6. `AntiAbuseFilter rejects duplicate content_hash within 24h`
- **Input**: post same hash twice within 24h.
- **Expected**: second rejected with `reason: "duplicate_hash"`.
- **Why**: ADR-0012 §"Validation criteria" #4 — duplicate detection.

#### 7. `AntiAbuseFilter rate-limits user to 5 posts per day`
- **Input**: post 6 times in 24h.
- **Expected**: 6th rejected with `reason: "rate_limit"`.
- **Why**: ADR-0012 §"Decision" — 5/day limit.

#### 8. `comment depth max 2`
- **Input**: comment on a comment on a comment (depth 3).
- **Expected**: rejected with `reason: "max_depth"`.
- **Why**: ADR-0012 §"Decision" — thread depth limit.

#### 9. `rating dedup: one rating per user per playbook`
- **Input**: user rates same playbook twice.
- **Expected**: second rating updates the first (no duplicate row).
- **Why**: ADR-0012 §"Decision" — rating dedup.

#### 10. `report severity tiers: low / medium / high`
- **Input**: 3 reports with severity values.
- **Expected**: each stored with correct tier; high triggers auto-hide.
- **Why**: ADR-0012 §"Decision" — severity tier handling.

---

## ADR-0013 — Playbook System

- **Seam**: `validatePlaybook(yaml)`, `PlaybookExecutor`, `detectCycles(deps)` from `src/lib/playbook/*.ts` *(planned)*.
- **File**: `web/tests/unit/playbook.test.ts` *(planned)* + `web/tests/unit/playbook-cycles.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP08-001 through TR-EP08-014.

### validatePlaybook test cases (Red → Green order)

#### 1. `accepts valid strategy-kind playbook`
- **Input**: minimal Playbook YAML with `kind: strategy`, `name`, `dsl`, `narrative.why/how/risks`.
- **Expected**: `{ valid: true }`.
- **Why**: ADR-0013 §"Validation criteria" #1 — happy path.

#### 2. `rejects playbook missing narrative.why`
- **Input**: omit `narrative.why`.
- **Expected**: error path includes `narrative.why`.
- **Why**: ADR-0013 §"Decision" — narrative is mandatory for strategy kind.

#### 3. `accepts all 6 playbook kinds`
- **Input**: 6 playbooks, one per kind (strategy/composite/data_fetcher/risk_manager/alert/narrative).
- **Expected**: all 6 valid.
- **Why**: ADR-0013 §"Validation criteria" #2 — closed kind enum.

#### 4. `rejects invalid SemVer version`
- **Input**: `version: "1.0"`.
- **Expected**: error.
- **Why**: ADR-0013 §"Decision" — strict SemVer `MAJOR.MINOR.PATCH`.

#### 5. `accepts valid SemVer "1.0.0" and "2.3.7-beta.1"`
- **Input**: two valid SemVer strings.
- **Expected**: both valid.
- **Why**: ADR-0013 §"Decision" — SemVer regex.

### Composition test cases

#### 6. `parallel composition: weights must sum to 1.0`
- **Input**: `composition: { type: "parallel", allocation: [{weight: 0.6}, {weight: 0.3}] }`.
- **Expected**: error (sum = 0.9).
- **Why**: ADR-0013 §"Validation criteria" #3 — parallel weight invariant.

#### 7. `sequential composition: depends_on chain must be acyclic`
- **Input**: A→B→C→A.
- **Expected**: error `cycle_detected`.
- **Why**: ADR-0013 §"Decision" — topological sort rejects cycles.

#### 8. `conditional composition: if/then/else all reference valid playbook_ids`
- **Input**: `if.then` references missing playbook.
- **Expected**: error.
- **Why**: ADR-0013 §"Validation criteria" #4 — referential integrity.

### PlaybookExecutor test cases

#### 9. `executor runs a single strategy playbook end-to-end`
- **Input**: strategy playbook + AAPL klines.
- **Expected**: returns backtest result.
- **Why**: ADR-0013 §"Validation criteria" #5 — executor invokes backtest engine.

#### 10. `executor runs parallel composition by invoking each child and merging`
- **Input**: composite with 2 strategy playbooks, weights 0.5/0.5.
- **Expected**: merged result with weighted-average equity curve.
- **Why**: ADR-0013 §"Decision" — parallel merge semantics.

#### 11. `executor runs sequential composition by feeding output of A as input to B`
- **Input**: A produces signals, B uses signals to size positions.
- **Expected**: B receives A's output.
- **Why**: ADR-0013 §"Decision" — sequential data flow.

### detectCycles test cases

#### 12. `detectCycles returns empty array for DAG`
- **Input**: deps `[(A,B), (B,C), (A,C)]` (no cycle).
- **Expected**: `[]`.
- **Why**: ADR-0013 §"Validation criteria" #6 — happy path.

#### 13. `detectCycles returns cycle path for A→B→C→A`
- **Input**: deps `[(A,B), (B,C), (C,A)]`.
- **Expected**: `[A, B, C, A]` (or rotation).
- **Why**: ADR-0013 §"Decision" — topological sort detects cycle.

#### 14. `detectCycles handles self-loop A→A`
- **Input**: deps `[(A,A)]`.
- **Expected**: `[A, A]`.
- **Why**: ADR-0013 §"Decision" — self-dependency is a cycle.

---

## ADR-0014 — RAG Pipeline

- **Seam**: `ragRetrieve(query, opts)` from `src/lib/rag/pipeline.ts` *(planned)*.
- **File**: `web/tests/unit/rag-pipeline.test.ts` *(planned)* (cross-ADR integration in `tests/integration/rag-pipeline.test.ts`).
- **Status**: Not started.
- **TR-IDs covered**: TR-EP03-008 (the canonical RAG TR per `tr-registry.yaml` — owner_adr: ADR-0014). NOTE: TR-EP03-013..017 are NOT RAG TRs (TR-EP03-013 = Cost Budget degrade chain/ADR-0003; TR-EP03-014 = Prompt template versioning; TR-EP03-015 = Mock QA samples; TR-EP03-016 = Mock zero LLM calls; TR-EP03-017 = Multi-turn memory/ADR-0005).

### Test cases (Red → Green order)

#### 1. `ragRetrieve returns documents from each of 5 source adapters`
- **Input**: query "NVDA earnings", all 5 adapters mocked.
- **Expected**: result contains 1+ doc per source (Yahoo / SEC / News / Playbooks / Community).
- **Why**: ADR-0014 §"Validation criteria" #1 — 5 source adapters.

#### 2. `each adapter respects its own source weight`
- **Input**: Yahoo weight 0.4, SEC 0.3, News 0.2, Playbooks 0.05, Community 0.05.
- **Expected**: fused ranking reflects weights (Yahoo docs rank higher on ties).
- **Why**: ADR-0014 §"Decision" — source-weighted RRF.

#### 3. `Reciprocal Rank Fusion produces deterministic ordering`
- **Input**: fixed adapter outputs.
- **Expected**: same input → same fused ranking across runs.
- **Why**: ADR-0014 §"Validation criteria" #2 — determinism.

#### 4. `ragRetrieve limits to top-K results (default 10)`
- **Input**: 100 docs from adapters.
- **Expected**: `results.length <= 10`.
- **Why**: ADR-0014 §"Decision" — K cap.

#### 5. `ragRetrieve attaches Vectorize similarity score`
- **Input**: query with Vectorize mock returning 0.87.
- **Expected**: each result has `score: 0.87` (or computed).
- **Why**: ADR-0014 §"Decision" — Vectorize integration.

#### 6. `adapter failure does not abort retrieval`
- **Input**: Yahoo adapter throws, others succeed.
- **Expected**: results from other 4 adapters, error logged.
- **Why**: ADR-0014 §"Validation criteria" #3 — graceful degradation.

#### 7. `Vectorize uses bge-small-en-v1.5 (384-dim)`
- **Input**: read Vectorize index metadata.
- **Expected**: `dimensions: 384`, `model: "bge-small-en-v1.5"`.
- **Why**: ADR-0014 §"Decision" — fixed embedding model.

---

## ADR-0015 — SSE Streaming

- **Seam**: `SSEncoder` class, `resolveStreamingMode(intent, env)`, `STREAM_THRESHOLD_MS` from `src/lib/ask/streaming.ts` *(planned)*.
- **File**: `web/tests/unit/sse-stream.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP03-019 (the canonical SSE TR per `tr-registry.yaml` — owner_adr: ADR-0015). NOTE: TR-EP03-018 = Memory (ADR-0005), TR-EP03-020 = Citation array (ADR-0007), TR-EP03-021 = disclaimer text (ADR-0007) — none of those are SSE.

### Test cases (Red → Green order)

#### 1. `resolveStreamingMode returns "never" for USE_MOCK=true`
- **Input**: `resolveStreamingMode("deep_research", { USE_MOCK: "true" })`.
- **Expected**: `"never"`.
- **Why**: ADR-0015 §"Decision" — Mock mode returns instantly, no streaming.

#### 2. `resolveStreamingMode returns "never" for simple_qa intent`
- **Input**: `resolveStreamingMode("simple_qa", { USE_MOCK: "false" })`.
- **Expected**: `"never"`.
- **Why**: ADR-0015 §"Decision" — Haiku-tier is fast (<2s typical).

#### 3. `resolveStreamingMode returns "always" for deep_research intent`
- **Input**: `resolveStreamingMode("deep_research", { USE_MOCK: "false" })`.
- **Expected**: `"always"`.
- **Why**: ADR-0015 §"Decision" — Sonnet-tier + multi-step RAG is slow (10-30s).

#### 4. `resolveStreamingMode returns "adaptive" for other intents`
- **Input**: `resolveStreamingMode("tool_call", { USE_MOCK: "false" })`.
- **Expected**: `"adaptive"`.
- **Why**: ADR-0015 §"Decision" — measure first call, switch if >5s.

#### 5. `STREAM_THRESHOLD_MS === 5000`
- **Input**: read `STREAM_THRESHOLD_MS`.
- **Expected**: `5000`.
- **Why**: ADR-0015 §"Decision" — 5s adaptive threshold per EP03 §6.2 反模式.

#### 6. `SSEncoder exposes readable ReadableStream<Uint8Array>`
- **Input**: `const enc = new SSEncoder(); const { readable } = enc;`.
- **Expected**: `readable` is a `ReadableStream<Uint8Array>` with `getReader()` method.
- **Why**: ADR-0015 §"Key Interfaces" — SSEncoder.readable consumed by HTTP response.

#### 7. `SSEncoder.writeToken emits "token" event with text + intent`
- **Input**: `enc.writeToken("hello", "deep_research")`; drain reader.
- **Expected**: SSE wire format `event: token\ndata: {"text":"hello","intent":"deep_research"}\n\n`.
- **Why**: ADR-0015 §"Key Interfaces" — TokenData shape, SSE wire format.

#### 8. `SSEncoder.writeDone emits "done" event with complete AskResponse`
- **Input**: `enc.writeDone({ answer, trace_id, total_cost_usd, steps_executed, status: "completed" })`.
- **Expected**: SSE event `done` with `DoneData` payload.
- **Why**: ADR-0015 §"Key Interfaces" — DoneData shape; exactly one "done" event per stream.

#### 9. `SSEncoder.writeCitationCorrection emits "citation" event (post-validation)`
- **Input**: `enc.writeCitationCorrection({ corrected_facts, stripped_facts, disclaimer })`.
- **Expected**: SSE event `citation` with `CitationCorrectionData` payload.
- **Why**: ADR-0015 §"Decision" — post-stream ADR-0007 validation emits corrections.

#### 10. `SSEncoder.writeError emits "error" event and closes stream`
- **Input**: `enc.writeError({ reason: "timeout", partial_text: "..." })`.
- **Expected**: SSE event `error` with `ErrorData` payload; subsequent writes throw.
- **Why**: ADR-0015 §"Key Interfaces" — ErrorData shape; terminal event on failure.

#### 11. `SSEncoder.close releases writer and seals stream`
- **Input**: `enc.close()`; attempt `enc.writeToken(...)` after.
- **Expected**: post-close writes throw; reader receives EOF.
- **Why**: ADR-0015 §"Decision" — connection cleanup.

#### 12. `SSEncoder event IDs are sequential integers starting at 1`
- **Input**: write 3 token events; drain and parse `id:` fields.
- **Expected**: IDs are `1`, `2`, `3`.
- **Why**: ADR-0015 §"Key Interfaces" — `SSEEvent.id` for client reconnection.

#### 13. `adaptive mode: non-streaming first call measured; >5s triggers SSE for subsequent calls`
- **Input**: mock first call returns in 6s; second call should stream.
- **Expected**: second call returns a `ReadableStream` (SSEncoder active), not buffered JSON.
- **Why**: ADR-0015 §"Decision" — adaptive threshold (STREAM_THRESHOLD_MS = 5000).

#### 14. `backpressure: writer awaits if reader is slow (no unbounded buffering)`
- **Input**: reader drains 1 chunk per 100ms; writer emits 100 chunks at 0ms interval.
- **Expected**: `writeToken` returns a Promise that resolves only after the chunk is consumed; peak memory bounded.
- **Why**: ADR-0015 §"Decision" — Workers TransformStream backpressure.

---

## ADR-0016 — Circuit Breaker + ProviderRouter

- **Seam**: `CircuitBreaker` class (`isTripped`, `recordFailure`, `recordSuccess`, `reset`, `getState`), `ProviderRouter` class, `CIRCUIT_EXEMPT_SOURCES` from `src/lib/data/circuit-breaker.ts` and `src/lib/data/provider-router.ts` *(planned)*.
- **File**: `web/tests/unit/circuit-breaker.test.ts` *(planned)* + `web/tests/unit/provider-router.test.ts` *(planned)*
- **Status**: Not started.
- **TR-IDs covered**: TR-EP02-009 (CircuitBreaker 5 failures → 60s cooldown, owner_adr: ADR-0016), TR-EP02-008 (multi-source fallback, co-owned with ADR-0006). NOTE: TR-EP02-018..021 DO NOT EXIST in the registry (EP02 caps at 017).

### CircuitBreaker test cases (Red → Green order)

#### 1. `fresh source is CLOSED (no KV key)`
- **Input**: `cb.getState("yahoo")` with empty KV mock.
- **Expected**: `"closed"`.
- **Why**: ADR-0016 §"Decision" — no KV key = CLOSED state.

#### 2. `isTripped returns false for CLOSED source`
- **Input**: `cb.isTripped("yahoo")` on fresh breaker.
- **Expected**: `false`.
- **Why**: ADR-0016 §"Key Interfaces" — isTripped returns true only for OPEN state.

#### 3. `recordFailure increments count; 5th consecutive failure trips to OPEN`
- **Input**: 5 sequential `cb.recordFailure("yahoo")` calls.
- **Expected**: after 5th call, `cb.getState("yahoo") === "open"`; `cb.isTripped("yahoo") === true`.
- **Why**: ADR-0016 §"Decision" — threshold=5 consecutive failures.

#### 4. `OPEN state KV key written with 60s TTL (cooldown)`
- **Input**: trip the circuit; inspect KV mock `circuit:yahoo` key.
- **Expected**: key has `expirationTtl: 60`; value `status: "open"`, `trippedAt` set.
- **Why**: ADR-0016 §"Decision" — KV TTL = cooldown.

#### 5. `recordSuccess on CLOSED source deletes KV key (resets count)`
- **Input**: 3 failures, then 1 success.
- **Expected**: KV key absent; `getState === "closed"`; failure count reset to 0.
- **Why**: ADR-0016 §"Key Interfaces" — recordSuccess on CLOSED resets count.

#### 6. `after 60s TTL expiry, state transitions to HALF-OPEN on next isTripped`
- **Input**: trip circuit, advance fake timers by 61s, `cb.isTripped("yahoo")`.
- **Expected**: `false` (HALF-OPEN allows probe); `getState === "half-open"`.
- **Why**: ADR-0016 §"Decision" — KV TTL expiry = cooldown end → HALF-OPEN.

#### 7. `HALF-OPEN probe success → CLOSED (KV key deleted)`
- **Input**: HALF-OPEN state, `cb.recordSuccess("yahoo")`.
- **Expected**: `getState === "closed"`; KV key absent.
- **Why**: ADR-0016 §"Key Interfaces" — probe success deletes key.

#### 8. `HALF-OPEN probe failure → OPEN (re-trip with fresh TTL)`
- **Input**: HALF-OPEN state, `cb.recordFailure("yahoo")`.
- **Expected**: `getState === "open"`; `trippedAt` updated; fresh 60s TTL.
- **Why**: ADR-0016 §"Key Interfaces" — probe failure re-trips.

#### 9. `Mock source is exempt (CIRCUIT_EXEMPT_SOURCES)`
- **Input**: 100 `cb.recordFailure("mock")` calls; `cb.isTripped("mock")`.
- **Expected**: `false` always; no KV key written for `"mock"`.
- **Why**: ADR-0016 §"Key Interfaces" — `CIRCUIT_EXEMPT_SOURCES = new Set(["mock"])`.

#### 10. `reset(source) force-deletes KV key regardless of state`
- **Input**: OPEN circuit; `cb.reset("yahoo")`.
- **Expected**: `getState === "closed"`; KV key absent.
- **Why**: ADR-0016 §"Key Interfaces" — reset for admin/monitoring use.

#### 11. `per-source independent state (yahoo vs alpha_vantage)`
- **Input**: trip "yahoo"; `cb.getState("alpha_vantage")`.
- **Expected**: `"alpha_vantage"` is `"closed"`; `cb.isTripped("alpha_vantage") === false`.
- **Why**: ADR-0016 §"Decision" — per-source tracking.

#### 12. `KV key format is circuit:{source_name} (no other formats)`
- **Input**: trip "yahoo"; list KV mock keys.
- **Expected**: exactly one key `circuit:yahoo`.
- **Why**: ADR-0016 §"Critical Implementation Rules" #2 — canonical key format.

### ProviderRouter integration test cases

#### 13. `ProviderRouter skips tripped sources in fallback chain`
- **Input**: trip "yahoo"; `router.getKlines("AAPL", "1d")`.
- **Expected**: "yahoo" not attempted; "alpha_vantage" tried first; fallback continues.
- **Why**: ADR-0016 §"ProviderRouter Integration" — circuitBreaker.isTripped consulted before each source.

#### 14. `ProviderRouter calls recordSuccess on source success`
- **Input**: "alpha_vantage" returns 200.
- **Expected**: `cb.recordSuccess("alpha_vantage")` called; circuit stays CLOSED.
- **Why**: ADR-0016 §"ProviderRouter Integration" — success resets count.

#### 15. `ProviderRouter falls back to Mock on all real sources tripped`
- **Input**: trip yahoo, alpha_vantage, polygon; `router.getKlines("AAPL", "1d")`.
- **Expected**: returns Mock data (Mock is exempt, always attempted).
- **Why**: ADR-0016 §"ProviderRouter Integration" — Mock is final fallback.

#### 16. `R2 cache hit bypasses circuit breaker entirely`
- **Input**: R2 cache has "AAPL_1d.json"; trip "yahoo".
- **Expected**: `cb.isTripped` NOT called; R2 data returned directly.
- **Why**: ADR-0016 §"ProviderRouter Integration" — R2 hit short-circuits before circuit breaker check.

---

## Summary

| ADR      | Active tests | TODO tests | Total | File exists? |
|----------|--------------|------------|-------|--------------|
| ADR-0001 | 5            | 3          | 8     | Yes          |
| ADR-0002 | 8            | 0          | 8     | Yes          |
| ADR-0003 | 13           | 6          | 19    | Yes (×2)     |
| ADR-0004 | 0            | 5          | 5     | Planned      |
| ADR-0005 | 0            | 6          | 6     | Planned      |
| ADR-0006 | 0            | 12         | 12    | Planned      |
| ADR-0007 | 0            | 8          | 8     | Planned      |
| ADR-0008 | 0            | 9          | 9     | Planned      |
| ADR-0009 | 0            | 10         | 10    | Planned      |
| ADR-0010 | 0            | 19         | 19    | Planned      |
| ADR-0011 | 0            | 8          | 8     | Planned      |
| ADR-0012 | 0            | 10         | 10    | Planned      |
| ADR-0013 | 0            | 14         | 14    | Planned      |
| ADR-0014 | 0            | 7          | 7     | Planned      |
| ADR-0015 | 0            | 14         | 14    | Planned      |
| ADR-0016 | 0            | 16         | 16    | Planned      |
| **Total**| **26**       | **147**    | **173**|              |

All 16 ADRs have unit test specs defined. The Red→Green ordering above is the mandatory implementation order — do not skip ahead.

---

## Change Log

| Date       | Change                                                                  | Author      |
|------------|-------------------------------------------------------------------------|-------------|
| 2026-07-20 | Initial per-ADR unit test specs from ADR-0001..0016 + tr-registry v7.   | Engineering |
