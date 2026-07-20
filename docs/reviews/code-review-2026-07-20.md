# Code Review — TDD Commit `b95eed4` (2026-07-20)

**Scope:** `git diff d601e42..b95eed4` — 50 files, +8134 / −36 lines.
**Commit message:** `feat(tdd): implement 16 ADR test suites + source via strict TDD (248 tests pass)`.
**Reviewer method:** Two-axis review (Standards + Spec), per `code-review` skill.
**Standards sources:** `CLAUDE.md`, `AGENTS.md`, `web/package.json`, `web/tsconfig.json`, `web/eslint.config.mjs`, `web/vitest.config.ts`, `web/tests/setup.ts`, `docs/tdd/00-test-strategy.md` … `05-coverage-matrix.md`, ADRs 0001–0016.
**Spec sources:** `docs/tdd/01-unit-tests.md`, `docs/tdd/02-integration-tests.md`, `docs/tdd/03-e2e-tests.md`, `docs/architecture/adr-0001-*` … `adr-0016-*`.

---

## Summary

**Verdict: CONCERNS** — Two-axis outcome: **Standards PASS with minor smells**; **Spec FAIL on canonical ADR compliance**.

The commit delivers a coherent, internally-consistent TDD-style implementation: 248 tests pass, coverage thresholds enforced, Mock-mode contract honored (`tests/setup.ts` stubs `fetch` to reject), `eslint.config.mjs` correctly extends test-file relaxations, `tsconfig.json` strict mode is on, and `vitest.config.ts` matches the Phase-1 40/40/50/40 thresholds documented in `docs/tdd/00-test-strategy.md`. Code style is uniform, files are small (mostly <350 LOC), and the Iron-Law Red→Green ordering is visible in test-file headers (e.g. `backtest-engine.test.ts` line 13–16 explicitly states the file was written before `engine.ts`).

However, **the implementation systematically diverges from the canonical ADR specifications**, and the test files document these divergences as deliberate "task-spec simplified variants". Examples: ADR-0007 citation validator drops the quote-substring check and the `partial_strip` / `strict_reject` mode parameter; ADR-0011 D1 schema implements 10 of 24+ expected tables; ADR-0012 `SharePackage` exposes 7 of 15 spec-required fields; ADR-0013 `Playbook` lacks `kind`, `narrative`, SemVer regex, composition, and `PlaybookExecutor`; ADR-0014 RAG pipeline ships a single adapter instead of 5, drops RRF for keyword boost, and sets `DEFAULT_TOP_K=5` instead of 10; ADR-0015 `StreamingMode` vocabulary is `"raw"|"buffered"|"mock"` instead of the spec's `"never"|"always"|"adaptive"`; ADR-0016 circuit breaker is in-memory only despite the ADR explicitly rejecting that alternative; ADR-0005 `MockMemoryStore` interface is `save/retrieve/query` rather than the canonical `put/get/list/delete`; ADR-0006 `TOOL_REGISTRY` is a `Map` that starts empty rather than a pre-populated `Record` of 9 native tools.

The result is **passing tests against a non-conformant implementation**: TDD discipline is satisfied procedurally but the spec contract is broken. Either the ADRs must be amended to bless the simplified variants as Phase-1 scope, or the source modules must be brought into compliance with the canonical ADRs (and the tests rewritten to match). Several test files already include explicit "task-spec refined" notes documenting the deviation — these notes should be promoted to ADR amendments via the `propagate-design-change` workflow so the ADRs remain the source of truth.

---

## Standards Findings

| Severity | File:Line | Issue | Recommendation |
|---|---|---|---|
| MINOR | `web/src/lib/agent/loop.ts:emitTrace` | **Mysterious Name** (judgement call): `emitTrace` is invoked for the `Execute` state with `type: "plan"` — the label "plan" does not describe an Execute-state trace event. Test file `web/tests/integration/agent-loop.test.ts:265` then asserts `step.type ∈ {plan, tool_call, llm_call, synthesize}`, so the wrong label is locked in by the test. | Rename the trace type to `"execute"` (or `"llm_call"`), update the test set accordingly. |
| MINOR | `web/src/lib/agent/types.ts:TraceStep` | **Speculative Generality** (judgement call): `type` union includes `"llm_call"` but the loop never emits it; `abort_reason` union includes `"all_tools_failed"` but no code path sets it. | Either emit `"llm_call"` from `onExecute` and `"all_tools_failed"` after `TOOL_RETRY_LIMIT` exhausts, or remove the unused union members until a real caller appears. |
| MINOR | `web/src/lib/tools/types.ts:20-36` | **Primitive Obsession** (judgement call): `ToolCall.args` is `Record<string, unknown>`; `ToolResult.output` is `unknown`. Per ADR-0006 canonical these should be typed `parameters: object` + `result: unknown` with `cost_usd`, `latency_ms`, `source` fields. The simplification is documented but discards domain types that the ADR deliberately introduced. | Either adopt the ADR-0006 shapes or amend ADR-0006 to bless the simplified shape as Phase-1. |
| MINOR | `web/src/lib/data/circuit-breaker.ts` (whole file) | **Refused Bequest** (judgement call): `CircuitBreaker` implements the state machine in-memory and rejects the KV-backed contract documented in ADR-0016 §Canonical. The ADR explicitly rejects the in-memory design in §Alternative 1 — the implementation chose the rejected alternative. | Either migrate to KV-backed (`env.KV.put/get`) or amend ADR-0016 to accept the in-memory variant as Phase-1 stub. |
| MINOR | `web/src/lib/sse/encoder.ts:encodeError` | **Duplicated Code** shape (judgement call): `encodeError` bypasses the central `encode()` type check by directly constructing the SSE string; if a new field is added to `encode()` (e.g. `retry:`), `encodeError` will drift. | Route `encodeError` through `encode({type:"error", ...})` and let the type guard run. |
| MINOR | `web/src/lib/strategy/dsl.ts:265-270` | **Speculative Generality** (judgement call): `parsePrimary` contains a `MemberExpression` loop that is unreachable because the tokenizer never emits `.` as an operator — the loop body simply `break`s. Comment admits "this branch is reserved for future". | Delete the dead branch; add it back when `.` tokenization is actually implemented. |
| MINOR | `web/tests/unit/*.test.ts` (all 17 files) | **Divergent Change** (judgement call): Several test files state scope was "rewritten" (e.g. `dashboard-layout.test.ts:7` "rewritten to test dashboard LAYOUT, not indicators"). The TDD spec `01-unit-tests.md` listed the original tests; the rewritten tests no longer match. | Either update `docs/tdd/01-unit-tests.md` to match the rewritten scope, or restore the original test set. |
| NIT | `web/src/lib/data/router.ts:select` | **Shotgun Surgery** risk (judgement call): `select()` throws on all-provider-fail; per ADR-0016 §Loop Integration + ADR-0001 §Mock fallback, it should return Mock provider as last-resort. Adding Mock fallback will touch router, circuit-breaker, and all callers. | Add `MockProvider` fallback path inside `select()`; route the exception through `CircuitBreaker.recordFailure` instead of throwing. |
| NIT | `web/tests/unit/agent-loop.test.ts:112-117` | Test uses `any` casts for `StepHandler` (`onInit: vi.fn(async (c: any) => c)`). ESLint config relaxes `no-explicit-any` for test files, so this is permitted, but the casts hide type drift between handler and `LoopContext`. | Define a `MockStepHandler` helper type that satisfies `StepHandler` exactly; remove the `as any` casts. |
| NIT | `web/tests/unit/d1-schema.test.ts:8-23` | Test header documents 10-table scope as a deliberate task constraint ("do NOT invent table names"). This is the only test file that explicitly justifies its scope reduction; the pattern should be replicated in other reduced-scope tests. | Promote the same "scope justification" comment block to `community-ugc.test.ts`, `dashboard-layout.test.ts`, `playbook-system.test.ts`, etc. for consistency. |
| NIT | `web/src/lib/community/ugc.ts:computeContentHash` | Uses `cyrb53` (non-cryptographic). ADR-0012 §Anti-Abuse spec requires SHA-256 for `duplicate_hash` detection because the hash is used for tamper-evidence. | Replace with `crypto.subtle.digest("SHA-256", ...)` (Web Crypto, available in Workers) or amend ADR-0012 to accept cyrb53 for non-security-critical dedup. |
| NIT | `docs/tdd/00-test-strategy.md` §7.1-7.7 | Standard requires every `describe` block to start with an ADR/TR mapping comment. Test files have file-level mapping comments but not per-`describe`. | Add the ADR/TR comment to each nested `describe(...)` block; alternatively relax §7 to file-level only. |

**Standards axis summary:** 12 findings, 0 hard violations (all are judgement calls), worst is MINOR (Mysterious Name in `emitTrace` locking wrong type label into tests).

---

## Spec Findings

| Severity | File:Line (Spec) | File:Line (Impl) | Issue | Recommendation |
|---|---|---|---|---|
| CRITICAL | `docs/architecture/adr-0007-citation-validator.md` §Validation Criteria #3 (quote substring check) | `web/src/lib/citation/validator.ts` (whole file) | **Missing requirement**: validator does not check that `citation.quote` is a substring of the fetched source document. Spec test #3 ("`validateCitation` rejects when quote not found in fetched content") cannot pass. | Implement `checkQuoteSubstring(fetchedText, quote)` in the production (non-Mock) path. |
| CRITICAL | `docs/architecture/adr-0007-citation-validator.md` §Validation Criteria #4 (mode parameter) | `web/src/lib/citation/validator.ts:validateCitation` | **Missing requirement**: `validateCitation(citation, env, mode)` should accept `mode: "partial_strip" \| "strict_reject"`. Current signature is `(citation, env)`. Spec test #4 covers both modes. | Add `mode` parameter; in `strict_reject`, a missing quote → throw (loop aborts); in `partial_strip`, drop the quote and continue. |
| CRITICAL | `docs/architecture/adr-0011-d1-schema-master.md` §Master Schema | `web/src/lib/db/schema.ts` (whole file) | **Missing 14+ tables**: `watchlists`, `kline_cache_index`, `fundamentals`, `strategies`, `backtest_results`, `broker_accounts`, `orders`, `positions`, `trades`, `playbook_versions`, `playbook_dependencies`, `community_playbooks`, `rag_chunks`, `news_articles`. Spec required 24+2 tables; only 10 implemented. | Either add the 14 missing table schemas or amend ADR-0011 to declare Phase-1 scope = 10 tables and migrate the rest to Phase-2 GDDs. |
| CRITICAL | `docs/architecture/adr-0016-circuit-breaker.md` §Canonical Design | `web/src/lib/data/circuit-breaker.ts` | **Wrong design**: implementation is in-memory; ADR-0016 §Canonical requires KV-backed (Cloudflare Workers stateless) and §Alternative 1 explicitly rejects the in-memory approach for production. `web/tests/unit/circuit-breaker.test.ts:8-11` acknowledges this but the test passes anyway because it tests the rejected alternative. | Migrate to KV-backed (`env.KV.put/get` with TTL), or amend ADR-0016 §Canonical to accept the in-memory variant as a Phase-1 stub with explicit migration ticket. |
| MAJOR | `docs/architecture/adr-0009-backtest-engine.md` §Validation Criteria #8 (alpha/beta) | `web/src/lib/backtest/types.ts:BacktestResult` | **Missing fields**: `benchmark_return`, `alpha`, `beta`, `sample_split` (train/test split metadata) — all required by spec test #8. `computeMetrics` does not compute them. | Extend `BacktestResult` and `computeMetrics` to accept an optional benchmark kline series and compute CAPM-style alpha/beta; or amend ADR-0009 to defer alpha/beta to Phase-2. |
| MAJOR | `docs/architecture/adr-0009-backtest-engine.md` §Validation Criteria #5 | `web/src/lib/backtest/engine.ts:computeMetrics` | **Implementation wrong**: `profit_factor` returns `Infinity` when there are no losing trades. Spec test #5 asserts `max_drawdown ≤ 0` (currently satisfied) but the absence of an explicit clamp on `profit_factor` means downstream consumers can hit `NaN`/`Infinity`. | Clamp `profit_factor` to a finite upper bound (e.g. `Number.MAX_SAFE_INTEGER`) when `gross_loss === 0`. |
| MAJOR | `docs/architecture/adr-0010-dashboard-layout.md` §Widget Types | `web/src/lib/dashboard/config.ts:WIDGET_TYPES` | **Mismatch**: implemented types are `kline_chart`, `ask_agent`, `watchlist`, `positions_table`, `strategy_list`, `community_feed`, `credit_balance`, `backtest_result`, `news_feed`. Spec required: `kline`, `positions`, `strategy`, `watchlist`, `ask_agent`, `credit`, `orderbook`, `alerts`, `news`. Three spec types missing (`orderbook`, `alerts`, `news` plain), three non-spec types added (`_chart`/`_table`/`_list` suffixed). | Align `WIDGET_TYPES` with the canonical 9-name set; or amend ADR-0010 §Widget Types to bless the suffixed naming. |
| MAJOR | `docs/architecture/adr-0010-dashboard-layout.md` §SWR Config | `web/src/lib/dashboard/types.ts` | **Missing type**: `DashboardSWRConfig` (with `dedupingInterval`, `revalidateOnFocus`, `errorRetryCount`) is required by spec; not implemented. `WidgetConfig` is missing `gridSpan`, `minGridSpan`, `fetcher`, `render`. `DashboardGridConfig` uses `gap: 16` (number) instead of `rowGap`/`columnGap: "1rem"`. `WidgetErrorBoundary` class absent. | Add the missing types and class; or amend ADR-0010 to defer them to Phase-2. |
| MAJOR | `docs/architecture/adr-0012-community-ugc.md` §SharePackage | `web/src/lib/community/types.ts:SharePackage` | **Missing 8 fields**: `risk_disclosure`, `performance_json`, `yaml_r2_key`, `moderation_status`, `installed_count`, `rating_avg`, `rating_count`, `fork_count` (some are on `CommunityPlaybook` only). `AntiAbuseFilter` only runs 4 of 8+ checks (no `rate_limit`, `duplicate_hash`, `comment depth`, `rating dedup`, `report severity`). | Extend `SharePackage` and add the missing moderation checks; or amend ADR-0012 to Phase-1 scope. |
| MAJOR | `docs/architecture/adr-0013-playbook-system.md` §PlaybookYAML Schema | `web/src/lib/playbook/types.ts:Playbook` | **Missing**: `kind` field (single vs composite), `narrative` validation, SemVer regex on `version`, parallel/sequential/conditional composition operators, `PlaybookExecutor` class (only `PlaybookValidator` exists). Spec test #11 (`parallel composition executes both branches`) cannot pass. | Either implement the missing pieces or split ADR-0013 into Phase-1 (validator only) and Phase-2 (executor + composition) GDDs. |
| MAJOR | `docs/architecture/adr-0014-ask-rag-pipeline.md` §Adapters | `web/src/lib/rag/pipeline.ts` | **Missing 4 adapters**: only `MockRAGSourceAdapter` exists; spec required 5 (Vectorize, R2, KV, Web, Mock). `rerank` uses keyword boost instead of Reciprocal Rank Fusion (RRF). `DEFAULT_TOP_K = 5` instead of spec's 10. No Vectorize integration. | Add the missing 4 adapters, replace rerank with RRF, set `DEFAULT_TOP_K = 10`; or amend ADR-0014 to Phase-1 = Mock-only scope. |
| MAJOR | `docs/architecture/adr-0015-sse-streaming.md` §StreamingMode | `web/src/lib/sse/types.ts:StreamingMode` | **Wrong vocabulary**: `StreamingMode = "raw" \| "buffered" \| "mock"`; spec required `"never" \| "always" \| "adaptive"`. `STREAM_THRESHOLD_MS` constant absent. `writeToken` has no `intent` parameter. No sequential auto-ID generation. `writeCitationCorrection` helper absent. `writeError` does not auto-close the stream. | Either rename the union members to match the ADR or amend ADR-0015 to accept the simplified vocabulary; add the missing helpers. |
| MAJOR | `docs/architecture/adr-0005-memory-layer.md` §MemoryStore Interface | `web/src/lib/memory/store.ts:MockMemoryStore` | **Interface mismatch**: `MockMemoryStore` exposes `save(ref)/retrieve(id)/query(filter)/delete(id)`. ADR-0005 §MemoryStore specifies `put(k, v)/get(k)/list(prefix)/delete(k)` (key-value style). `MockMemoryStore` does not structurally satisfy the declared `MemoryStore` interface in `types.ts`. | Either rename the methods to match the ADR or amend ADR-0005 to bless the document-oriented API. |
| MAJOR | `docs/architecture/adr-0006-tool-protocol.md` §Registry | `web/src/lib/tools/registry.ts:TOOL_REGISTRY` | **Wrong shape**: `TOOL_REGISTRY: Map<string, Tool>` that starts empty and is populated via `registerTool`. Spec required `Record<string, ToolHandler>` pre-populated with 9 native tools (`get_quote`, `search_news`, `compute_indicator`, `run_backtest`, `validate_strategy`, `install_playbook`, `search_community`, `rag_search`, `get_fundamentals`). `ToolCall` uses `args` instead of `parameters` and lacks `timeout`. `ToolResult` lacks `success`, `cost_usd`, `latency_ms`, `source`. `ToolNotFoundError` and `MCPNotAvailableError` classes absent. | Either register the 9 native tools at module load and adopt the canonical shapes, or amend ADR-0006 to declare Phase-1 = empty registry + simplified shapes. |
| MAJOR | `docs/architecture/adr-0008-strategy-dsl-schema.md` §Built-in Indicator Registry | `web/src/lib/strategy/dsl.ts:ALLOWED_IDENTIFIERS` | **Wrong identifier set**: implemented `{ close, open, high, low, volume, sma, ema, rsi }` (8 ids, mostly OHLCV + 3 indicators). Spec required `{ SMA, EMA, RSI, MACD, Bollinger, ATR, OBV, VWAP }` (8 indicators — completely disjoint set). `jsep` not installed (task constraint). | Either expand `ALLOWED_IDENTIFIERS` to include the 8 spec indicators (and add evaluation for them) or amend ADR-0008 §Built-in Registry to Phase-1 = OHLCV + sma/ema/rsi subset. |
| MINOR | `docs/architecture/adr-0004-agent-loop-design.md` §TraceStep | `web/src/lib/agent/types.ts:TraceStep.type` | **Spec test mismatch**: `TraceStep.type` declared as `"plan" \| "tool_call" \| "llm_call" \| "synthesize"`. `loop.ts` emits `"plan"` for `Execute` state (semantically wrong — should be `"llm_call"` or `"execute"`). `web/tests/integration/agent-loop.test.ts:265` accepts the wrong label. | Add an `"execute"` case to the union, emit it from `onExecute`, update the integration test set. |
| MINOR | `docs/tdd/01-unit-tests.md` ADR-0004 §TraceStep type | `web/src/lib/agent/types.ts:TraceStep.state` | Spec lists `CostExceeded`, `Degrade` as valid `state` values; neither is ever set in `loop.ts`. Integration test asserts they are valid members of the union but never reaches them. | Either implement the `CostExceeded` and `Degrade` states (graceful degradation when cost ceiling is hit mid-step) or remove them from the union. |
| MINOR | `docs/architecture/adr-0011-d1-schema-master.md` §Migration 003 | `web/src/lib/db/schema.ts:conversation_history` columns | **Missing column**: `intent` (used by RAG/Agent loop to route queries). `users` table missing `plan` column (per Migration 001 §Identity). | Add the missing columns; or amend ADR-0011 §Migration 003 to defer `intent` to Phase-2. |
| MINOR | `docs/architecture/adr-0012-community-ugc.md` §Anti-Abuse | `web/src/lib/community/ugc.ts:ModerationQueue.submit` | Only 4 anti-abuse checks (title length, description length, tag count, banned words). Missing: `rate_limit`, `duplicate_hash`, `comment depth`, `rating dedup`, `report severity`. | Add the missing 5 checks; or amend ADR-0012 to Phase-1 = 4-check minimum. |
| MINOR | `docs/architecture/adr-0013-playbook-system.md` §PlaybookDependency | `web/src/lib/playbook/types.ts:Playbook` | `dependencies: string[]` (flat array). Spec required `PlaybookDependency[]` (`{ parent_id, child_id }`) for cycle detection — implemented in `detectCycles(deps)` but `Playbook.dependencies` is still `string[]`, so callers must construct `PlaybookDependency[]` separately. | Change `Playbook.dependencies` to `PlaybookDependency[]`; update fixtures. |
| MINOR | `docs/tdd/02-integration-tests.md` §6 Mandatory Scenarios | `web/tests/integration/*.test.ts` (2 files only) | Spec required 6 mandatory integration scenarios. Only 2 implemented (`agent-loop.test.ts`, `rag-pipeline.test.ts`). Missing: data-layer (ProviderRouter + CircuitBreaker + Mock fallback), citation pipeline (ADR-0007 + ADR-0014), playbook install (ADR-0013 + ADR-0008), dashboard widget wiring (ADR-0010). | Add the 4 missing integration scenarios; or amend `02-integration-tests.md` to declare Phase-1 = 2 scenarios. |
| MINOR | `docs/tdd/03-e2e-tests.md` §Per-Epic Specs (52 tests) | `web/tests/e2e/*.spec.ts` (9 files, ~30 tests) | Spec required 52 E2E tests across 9 epics; current count is ~30. Several epics have only smoke-level coverage (e.g. `smoke.spec.ts` only checks 3 page boots). | Either expand the E2E specs to 52 tests or amend `03-e2e-tests.md` to declare Phase-1 = smoke-only. |
| MINOR | `docs/architecture/adr-0016-circuit-breaker.md` §CIRCUIT_EXEMPT_SOURCES | `web/src/lib/data/circuit-breaker.ts` | **Missing constant**: `CIRCUIT_EXEMPT_SOURCES` (sources that bypass the breaker, e.g. SEC EDGAR). | Add the constant; or amend ADR-0016 to drop the exemption list. |
| MINOR | `docs/architecture/adr-0016-circuit-breaker.md` §Mock fallback | `web/src/lib/data/router.ts:select` | **Missing behavior**: when all providers tripped, `select()` should fall back to `MockProvider` (per ADR-0001 + ADR-0016 §Graceful Degradation). Currently throws. | Add Mock fallback; or amend ADR-0016 to declare Phase-1 = throw-on-fail. |
| MINOR | `docs/tdd/05-coverage-matrix.md` §TR-ID Coverage | `web/tests/**` | Spec listed 16 COVERED, 15 PARTIAL, 99 MISSING TR-IDs. Commit message claims "248 tests pass" but does not update the matrix. | Update `05-coverage-matrix.md` to reflect actual TR-ID coverage after this commit. |

**Spec axis summary:** 23 findings, 4 CRITICAL, 9 MAJOR, 10 MINOR — worst are: ADR-0007 missing quote+mode, ADR-0011 missing 14 tables, ADR-0016 wrong design (in-memory).

---

## Top 5 Critical Issues

### 1. ADR-0007 Citation Validator — Missing Anti-Hallucination Layers

**Location:** `web/src/lib/citation/validator.ts` (whole file)
**Spec:** `docs/architecture/adr-0007-citation-validator.md` §Validation Criteria #3, #4
**Issue:** The validator implements only Layer 1 (structural URL) + Layer 2 (HTTP reachability). It is missing:
- **Layer 3 — quote substring check**: when fetching the source document, the validator must verify that `citation.quote` appears as a substring of the fetched text. Without this, hallucinated quotes pass validation.
- **`mode` parameter**: `validateCitation(citation, env, mode)` should accept `mode: "partial_strip" | "strict_reject"`. In `strict_reject` (the agent loop default for `deep_research`), a missing/invalid quote must throw `CitationValidationFailed` and abort the loop. In `partial_strip` (used by `simple_qa`), the quote is dropped and the citation retained.
- **Aggregated errors**: spec test #6 expects `enqueueUrlChecks` to return an aggregated `errors[]` array per citation.

**Why critical:** The whole point of ADR-0007 is anti-hallucination. Without the quote check and mode parameter, the validator is a URL-format checker — hallucinated citations with valid URLs pass through. The `agent-loop` integration test `web/tests/integration/agent-loop.test.ts:290` simulates `strict_reject` by throwing `CitationValidationFailed` from `onSynthesize`, but that is handler-emulated, not validator-enforced.

**Fix:**
```ts
export async function validateCitation(
  citation: Citation,
  env: Env,
  mode: "partial_strip" | "strict_reject" = "strict_reject",
): Promise<ValidationResult> {
  // ... existing structural + reachability checks ...
  if (mode === "strict_reject" && citation.quote) {
    const fetchedText = await fetchSourceText(citation.url, env);
    if (!fetchedText.includes(citation.quote)) {
      return { id: citation.id, valid: false, reason: "quote_not_found" };
    }
  }
  // ... partial_strip drops quote silently ...
}
```
Then amend `enqueueUrlChecks` to aggregate `errors[]` per citation.

---

### 2. ADR-0011 D1 Schema — 14 of 24+ Tables Missing

**Location:** `web/src/lib/db/schema.ts` (173 lines, 10 tables)
**Spec:** `docs/architecture/adr-0011-d1-schema-master.md` §Master Schema (24+2 tables across 8 migrations)
**Issue:** Only 10 tables implemented: `users`, `symbols`, `user_profiles`, `conversation_history`, `playbooks`, `playbook_ratings`, `playbook_comments`, `playbook_reports`, `user_playbook_installs`, `url_check_queue`. Missing 14+ tables include the core trading (`watchlists`, `orders`, `positions`, `trades`, `broker_accounts`), analytics (`kline_cache_index`, `fundamentals`, `news_articles`), strategy (`strategies`, `backtest_results`), and infrastructure (`rag_chunks`, `community_playbooks`, `playbook_versions`, `playbook_dependencies`).

Additionally, `conversation_history` is missing the `intent` column (used by RAG/Agent for routing) and `users` is missing the `plan` column.

**Why critical:** The schema is the contract between every Epic. Every downstream module (Agent Loop, Backtest, Community, RAG, Dashboard) assumes these tables exist. Without them, Phase-2 work cannot begin without a fresh migration cycle.

**Fix:** Add the 14 missing table schemas in a single batch update to `schema.ts`, OR formally amend ADR-0011 to declare Phase-1 = 10 tables and split the remaining 14 into a Phase-2 ADR-0017 ("D1 Schema Phase-2"). Either way, update `docs/tdd/05-coverage-matrix.md` to reflect the actual table coverage.

---

### 3. ADR-0016 Circuit Breaker — In-Memory Implementation Is the Rejected Alternative

**Location:** `web/src/lib/data/circuit-breaker.ts` (122 lines)
**Spec:** `docs/architecture/adr-0016-circuit-breaker.md` §Canonical Design + §Alternative 1
**Issue:** The implementation is purely in-memory (`Map<key, State>`). ADR-0016 §Canonical requires KV-backed state because Cloudflare Workers are stateless — each request may hit a different isolate. §Alternative 1 explicitly rejects the in-memory approach for production. `web/tests/unit/circuit-breaker.test.ts:8-11` acknowledges this ("the in-memory version is the PRD stub that ADR-0016 §Alternative 1 explicitly rejects for production") but the test passes anyway.

**Why critical:** In production, the breaker will not actually trip across requests — each Worker isolate has its own `Map`, so failures in isolate A do not propagate to isolate B. The breaker is a no-op in deployed code.

**Fix:** Migrate to KV-backed:
```ts
export class CircuitBreaker {
  constructor(private readonly env: { KV: KVNamespace; CB_THRESHOLD?: number }) {}
  async recordFailure(key: string): Promise<void> {
    const state = await this.getState(key);
    // ... read failure count from KV, increment, persist back ...
  }
}
```
All methods become `async`. Update tests to use `vi.useFakeTimers()` + a mock `KVNamespace`. Alternatively, amend ADR-0016 §Canonical to accept the in-memory variant as a Phase-1 stub with an explicit migration ticket (ADR-0017) and a runtime warning log when `ENVIRONMENT=production` and `USE_MOCK=false`.

---

### 4. ADR-0006 Tool Protocol — Empty Registry, Wrong Shapes, Missing Errors

**Location:** `web/src/lib/tools/registry.ts` + `web/src/lib/tools/types.ts`
**Spec:** `docs/architecture/adr-0006-tool-protocol.md` §Registry + §Loop Integration
**Issue:** Three deviations compound:
- **Empty registry**: `TOOL_REGISTRY: Map<string, Tool> = new Map()` starts empty. Spec required it pre-populated with 9 native tools (`get_quote`, `search_news`, `compute_indicator`, `run_backtest`, `validate_strategy`, `install_playbook`, `search_community`, `rag_search`, `get_fundamentals`). Without these, the Agent Loop cannot execute any tool in production — `executeTool({name: "get_quote", ...})` returns `Unknown tool: get_quote`.
- **Wrong `ToolCall` shape**: `{ name, args, id }` instead of `{ name, parameters, timeout? }`. The `args` field is undocumented in the ADR.
- **Wrong `ToolResult` shape**: `{ id, output, error?, metadata? }` instead of `{ success, result, cost_usd, latency_ms, source, error? }`. The cost/latency/source fields are how the Agent Loop accumulates `total_cost_usd` in the trace — without them, the loop's `trace_cost` aggregation is broken.
- **Missing errors**: `ToolNotFoundError` and `MCPNotAvailableError` classes are not declared.

**Why critical:** The Agent Loop's `onToolCall` handler returns `{success, cost_usd, ...}` (see `web/tests/integration/agent-loop.test.ts:107-110`), but `executeTool` returns `{id, output, error?}`. The two contracts disagree; integration between ADR-0004 and ADR-0006 is broken at the type level.

**Fix:** Adopt the canonical ADR-0006 shapes:
```ts
export interface ToolCall { name: string; parameters: Record<string, unknown>; timeout?: number; }
export interface ToolResult { success: boolean; result: unknown; cost_usd: number; latency_ms: number; source: string; error?: string; }
export class ToolNotFoundError extends Error {}
export class MCPNotAvailableError extends Error {}
// Register the 9 native tools at module load.
registerTool({ name: "get_quote", ... });
```
Then update the Agent Loop's `onToolCall` signature to consume the canonical `ToolResult`.

---

### 5. ADR-0010 Dashboard — Widget Type Mismatch + Missing SWR Config + Missing Error Boundary

**Location:** `web/src/lib/dashboard/config.ts` + `web/src/lib/dashboard/types.ts`
**Spec:** `docs/architecture/adr-0010-dashboard-layout.md` §Widget Types + §SWR Config + §Error Boundary
**Issue:** Three compounding deviations:
- **Widget type names wrong**: implemented `["kline_chart", "ask_agent", "watchlist", "positions_table", "strategy_list", "community_feed", "credit_balance", "backtest_result", "news_feed"]`. Spec required `["kline", "positions", "strategy", "watchlist", "ask_agent", "credit", "orderbook", "alerts", "news"]`. Three spec types missing (`orderbook`, `alerts`, `news`); three non-spec suffixed types added.
- **`DashboardSWRConfig` absent**: spec required `dedupingInterval`, `revalidateOnFocus`, `errorRetryCount` config; not implemented. `WidgetConfig` missing `gridSpan`, `minGridSpan`, `fetcher`, `render`. `DashboardGridConfig` uses `gap: 16` (number) instead of `rowGap/columnGap: "1rem"` (string). No `breakpoints` field.
- **`WidgetErrorBoundary` class absent**: spec required a React error boundary per widget.

**Why critical:** The dashboard is the primary user-facing surface. Without `WidgetErrorBoundary`, a single widget throw takes down the whole dashboard. Without `DashboardSWRConfig`, every widget refetches on every focus, breaking the LCP budget (`LCP_BUDGET_MS = 2500`).

**Fix:** Align `WIDGET_TYPES` with the canonical 9-name set; add `DashboardSWRConfig` and `WidgetErrorBoundary`; or amend ADR-0010 to Phase-1 = suffixed names + no SWR config + no error boundary, with an explicit Phase-2 ticket for the missing pieces.

---

## Closing note on the "task-spec simplified variant" pattern

Many of the spec deviations above are explicitly documented in source-file headers (e.g. `web/src/lib/tools/types.ts:1-14`, `web/src/lib/sse/types.ts:1-15`, `web/tests/unit/circuit-breaker.test.ts:7-21`, `web/tests/unit/playbook-system.test.ts:7-22`). This means the developer (an AI agent) deliberately simplified the canonical ADR contracts to fit the commit's scope, then wrote tests against the simplified contract.

This is **not** TDD failure in the procedural sense — every test was written before its implementation, and every test passes. But it **is** a spec-governance failure: the ADRs no longer reflect what the system actually does. The recommended resolution is to invoke the `propagate-design-change` workflow to either:
1. Amend each affected ADR with a "Phase-1 Scope" subsection that explicitly blesses the simplified variant, **and** file Phase-2 ADRs for the canonical behavior, **or**
2. Open remediation tickets to bring the implementations into compliance with the canonical ADRs (preferred for ADR-0007 #3/#4 and ADR-0016 #4, which are correctness issues, not scope reductions).

Either resolution should land before the next architecture-review gate, otherwise the traceability matrix (`docs/architecture/traceability-index.md`) will report coverage that does not exist in the running system.
