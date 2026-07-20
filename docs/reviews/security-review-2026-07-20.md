# Security Review — TDD Commit `b95eed4`

- **Scope:** `git diff d601e42..b95eed4` (50 files, +8134/-36 lines)
- **Reviewer:** TRAE-security-review skill (sub-agent)
- **Date:** 2026-07-20
- **Project:** nova-invest (Cloudflare Workers + Next.js + D1, fintech/AI agent platform)
- **Methodology:** Diff-introduced surface only; source-to-sink trace required for every finding; confidence floor 0.80; no patches, review only.

---

## Executive Summary

The change set introduces 16 new ADR-aligned modules (strategy DSL, playbook system, memory store, citation validator, agent loop, circuit breaker, provider router, RAG pipeline, backtest engine, dashboard config, SSE encoder, community UGC, tool registry, D1 schema) plus their tests. The security posture is generally strong: the strategy DSL evaluator is a pure AST walk with no `eval()`/`Function()`; identifier allowlist + denylist are enforced in both `validateStrategy` and the playbook pipeline (defense-in-depth); all D1 **values** are parameterized via `?` binds; the agent loop enforces `MAX_STEPS=20`, `AGGREGATE_COST_CEILING_USD=5`, and `TOOL_RETRY_LIMIT=3`; the circuit breaker FSM matches ADR-0016; no hardcoded secrets, no `dangerouslySetInnerHTML`, no `child_process`, no actual `eval`/`new Function` calls in source.

One MEDIUM-severity SSRF finding survives the source-to-sink trace: the citation validator calls `fetch(url, { redirect: "follow" })` in production mode against an attacker-influenceable URL, allowing a trusted allowlisted host with an open redirect to pivot the fetch to internal addresses. Several ADR-compliance gaps are noted in the checklist (table-name interpolation in `D1MemoryStore`, `validateMemoryRef` not wired into save, silent Mock fallback) but none of these are directly exploitable in this diff because no caller passes attacker-controlled input to the relevant parameters.

---

## Vulnerability Findings

| # | Severity | CWE | File:Line | Description | Exploitation Scenario | Remediation |
|---|---|---|---|---|---|---|
| 1 | MEDIUM | CWE-918 | `web/src/lib/citation/validator.ts:111` | SSRF via automatic redirect following. In production mode (`USE_MOCK="false"` AND `ENVIRONMENT="production"`) the validator calls `fetch(normalized, { method: "GET", redirect: "follow" })` after only checking that the **initial** URL's hostname is in `SOURCE_ALLOWLIST`. Because `redirect: "follow"` is the fetch default, any 3xx from an allowlisted host is followed to its `Location:` header without re-checking the destination against the allowlist. | Attacker influences a citation URL (via LLM output, RAG-indexed content, or any caller of the exported `validateCitation`/`enqueueUrlChecks`) to `https://finance.yahoo.com/redirect?url=http://169.254.169.254/latest/meta-data/iam/` (or any allowlisted host with an open redirect). The allowlist check passes (hostname = `finance.yahoo.com`); the fetch follows the redirect to the cloud-metadata endpoint or an internal service. The response body is not read, but (a) `response.ok` becomes a boolean oracle for internal-service probing, (b) the GET can trigger side effects on internal endpoints, and (c) `response.url` (the post-redirect internal URL) is propagated back as `ValidationResult.final_url` and stored on the citation via `applyValidationResult`, potentially surfaced to end users as the citation's "source URL". | Switch to `redirect: "manual"` and re-validate every `Location:` response header against `SOURCE_ALLOWLIST` + `https:` before following; OR use `redirect: "error"` to reject any redirect (strictest). If redirects are legitimately needed, cap the hop count and re-run the hostname + HTTPS check on each `Location`. |

No CRITICAL findings. No HIGH findings. The single MEDIUM finding above is the only item that survived the source→sink trace at confidence ≥ 0.80.

---

## Critical Vulnerabilities

None. No CRITICAL-severity issues were identified in the reviewed change set.

The two areas initially evaluated as candidate CRITICAL findings — Strategy DSL code injection and D1 SQL injection — were both dropped after the source-to-sink trace:

- **Strategy DSL code injection (dropped):** The evaluator (`evaluateStrategy`, `web/src/lib/strategy/dsl.ts:456`) is a pure recursive AST walk — no `eval()`, no `new Function()`, no `Function.prototype.constructor` indirection. `CallExpression` calls only functions looked up from the application-supplied `context` map; the callee identifier must pass the `DISALLOWED_IDENTIFIERS` denylist (`eval`, `Function`, `window`, `global`, `process`) AND the `ALLOWED_IDENTIFIERS` allowlist (`close, open, high, low, volume, sma, ema, rsi`) in `validateStrategy` (Stage 2/3) and again in `PlaybookValidator` (Stage 4/5). No caller in this diff invokes `evaluateStrategy` on unvalidated input, and the backtest engine uses a separate `Strategy.evaluate(ctx)` seam (not the DSL evaluator). Latent risk exists if a future caller skips `validateStrategy`, but that is not demonstrably exploitable in this change set.
- **D1 SQL injection (dropped):** `D1MemoryStore.save` (`web/src/lib/memory/store.ts:154`) interpolates `${this.table}` into the SQL string. However, `this.table` defaults to the literal `"conversation_history"` and the only caller in scope — `getMemoryStore()` at `store.ts:177` — never passes a `table` argument. No attacker-controlled input reaches the `table` parameter in this diff, so the chain fails the "demonstrably exploitable" bar. Noted as a defense-in-depth gap in the compliance checklist below.

---

## Compliance Checklist

| Security Requirement | Status | Evidence |
|---|---|---|
| **ADR-0008: Ban `Function()`, `eval()`, `new Function`, indirect eval** in Strategy DSL | PASS | `grep` over `web/src/lib/**` for `eval\s*\(\|new Function\|Function\s*\(\s*["']` returns only docstring mentions (`dsl.ts:10,39,454`; `playbook/system.ts:207`); no executable call sites. Evaluator is a pure AST walk (`dsl.ts:456-511`). |
| **ADR-0008: Identifier allowlist enforced** (close, open, high, low, volume, sma, ema, rsi ONLY) | PASS | `ALLOWED_IDENTIFIERS` set at `dsl.ts:26-35`; `validateStrategy` Stage 3 at `dsl.ts:426-430` rejects any identifier not in the allowlist. `PlaybookValidator` Stage 5 (`system.ts:218-234`) re-checks as defense-in-depth. |
| **ADR-0008: Disallowed identifiers blocked** (eval, Function, window, global, process) | PASS | `DISALLOWED_IDENTIFIERS` set at `dsl.ts:43-49`; Stage 2 in `validateStrategy` (`dsl.ts:419-423`); Stage 4 in `PlaybookValidator` (`system.ts:199-210`). The literal string `import` is NOT in the denylist (it would also be rejected by the allowlist since it's not one of the 8 allowed names). |
| **ADR-0008: Stage 4 catches Function()/eval in AST** | PASS | `PlaybookValidator.checkFunctionBan` (`system.ts:199-210`) collects all identifiers and explicitly checks for `Function` and `eval` names, independent of the allowlist. |
| **ADR-0005 / ADR-0011 / ADR-0013: All D1 queries use parameterized binds** | PARTIAL | `playbook/system.ts:263`: fully parameterized (`VALUES (?, ?, ?, ?, ?)` + `bind(...)`). `memory/store.ts:154`: all **values** are parameterized via `?` binds, BUT the **table name** is interpolated via `${this.table}` (default `"conversation_history"`). Not directly exploitable in this diff (no caller passes user input to `table`), but violates the "NEVER string concatenation" rule for identifiers. Recommend hardcoding the table name as a literal or validating it against a closed set of known D1 table constants from `db/schema.ts`. |
| **ADR-0007: Source allowlist (5 hosts)** | DISCREPANCY | Task brief lists `sec.gov, bloomberg.com, reuters.com, cnbc.com, yahoo-finance.com`. Code at `validator.ts:28-34` lists `sec.gov, finance.yahoo.com, alphavantage.co, bloomberg.com, reuters.com`. The code's set is internally consistent with the test fixtures and the RAG adapter, but diverges from the brief's `cnbc.com` / `yahoo-finance.com`. Flagging as a spec-vs-implementation mismatch for reconciliation; not a vulnerability in either direction. |
| **ADR-0007: URL normalization + HTTPS enforcement** | PASS | `normalizeUrl` (`validator.ts:61-74`) strips only `utm_*` params. `validateCitation` (`validator.ts:99-101`) rejects `protocol !== "https:"`. Hostname check uses `parsed.hostname` (lowercased by `URL`), blocking `sec.gov.evil.com`, `sec.gov@169.254.169.254`, and case-variant bypasses. |
| **ADR-0007: HTTP reachability check (production mode only)** | PASS (with SSRF caveat) | `isProductionMode` (`validator.ts:52-54`) gates the fetch behind `USE_MOCK="false"` AND `ENVIRONMENT="production"`. Mock mode makes zero HTTP calls (verified by test at `citation-validator.test.ts:96-103`). However, the production fetch uses `redirect: "follow"` — see Finding #1. |
| **ADR-0004: MAX_STEPS=20** | PASS | `MAX_STEPS=20` at `loop.ts:31`; checked at top of every loop iteration (`loop.ts:86-88`) before any handler call. |
| **ADR-0004: AGGREGATE_COST_CEILING_USD=5** | PASS | `AGGREGATE_COST_CEILING_USD=5` at `loop.ts:32`; checked after each Execute (`loop.ts:119-121`) and each ToolCall (`loop.ts:143-145`). Note: cost is checked AFTER accumulation, so a single oversized step can exceed the ceiling before abort — acceptable given ADR-0003 owns per-call enforcement. |
| **ADR-0004: Per-tool retry limit (3)** | PASS | `TOOL_RETRY_LIMIT=3` at `loop.ts:33`; `executeWithFallback` (`loop.ts:219-234`) loops `attempt = 1..3` and returns last error after exhaustion. |
| **ADR-0016: Circuit breaker FSM CLOSED→OPEN (5 failures)→HALF_OPEN (60s)→CLOSED** | PASS | `DEFAULT_CB_CONFIG` at `circuit-breaker.ts:27-30` (`threshold:5`, `cooldownMs:60000`). `recordFailure` (`circuit-breaker.ts:85-100`) transitions CLOSED→OPEN at threshold, HALF_OPEN→OPEN immediately. `entry` (`circuit-breaker.ts:50-61`) performs lazy OPEN→HALF_OPEN when cooldown elapsed. `recordSuccess` (`circuit-breaker.ts:108-113`) resets to CLOSED. |
| **ADR-0016: ProviderRouter skips tripped providers, records success/failure** | PASS | `ProviderRouter.select` (`router.ts:48-67`) calls `breaker.isTripped(provider.name)` before each attempt, `recordSuccess` on success, `recordFailure` on throw. Throws when all providers fail or are tripped. |
| **Input validation: Memory refs (type/content required, metadata object, ttl non-negative)** | PARTIAL | `validateMemoryRef` (`memory/store.ts:218-245`) correctly checks all four constraints. However, it is **exported but never called** by `MockMemoryStore.save` or `D1MemoryStore.save` — `grep validateMemoryRef` over `web/src` returns only the definition site. Validation exists but is not wired into the persistence path; callers must invoke it explicitly. Recommend calling `validateMemoryRef(ref)` at the top of both `save()` methods. |
| **Input validation: Strategy AST, Playbook shape, Dashboard config** | PASS | `validateStrategy` (`dsl.ts:401-440`) checks structural fields + identifiers + param ranges. `PlaybookValidator.validateSchema` (`system.ts:186-196`) checks required playbook fields. `validateWidgetConfig` + `validateDashboardGrid` (`dashboard/config.ts:68-149`) check widget type, grid bounds, duplicates, overlaps. |
| **Mock mode makes zero external HTTP calls (FP-0005)** | PASS | `MockMemoryStore` makes no I/O. `MockRAGSourceAdapter` reads only local JSON files. `validateCitation` skips fetch when `isMockMode(env)` is true (`validator.ts:109`). `resolveStreamingMode` returns `"mock"` instantly when `USE_MOCK="true"` (`sse/encoder.ts:151-153`). |
| **Production mode env vars (USE_MOCK, ENVIRONMENT, DB binding)** | PARTIAL | `getMemoryStore` (`memory/store.ts:177-206`) reads `USE_MOCK`/`ENVIRONMENT`/`DB` from explicit param, then `process.env`, then `globalThis.env`. Concern: when `USE_MOCK="false"` but `env.DB` is absent, the factory **silently falls back to `MockMemoryStore`** (`store.ts:200-204`) instead of throwing. In production this could cause data loss (in-memory store is not persisted) without any signal. Recommend throwing in production when `DB` binding is missing. |
| **No hardcoded API keys / secrets in code** | PASS | `grep` for `(api_key\|apikey\|secret\|password\|token\|bearer)\s*[:=]\s*["'][^"']{8,}["']` over `web/src` returns no matches. |
| **No `dangerouslySetInnerHTML` / `v-html` / `innerHTML=`** | PASS | `grep` over `web/src` returns no matches. React's default escaping is preserved. |
| **No `child_process` / `exec` / `spawn` in source** | PASS | `grep` over `web/src` returns no matches. |
| **Test fixtures: no real PII** | PASS | Spot-checked `tests/unit/citation-validator.test.ts` (uses `sec.gov/Archives/edgar/...` public URLs and generic AAPL ticker), `tests/unit/memory-layer.test.ts`, `tests/unit/strategy-dsl.test.ts` — all use synthetic ids (`mem_*`, `s-test`, `cit_sec_1`) and public market data. No emails, names, or credentials found in fixtures. |
| **Test fixtures: Mock D1 does not leak to production** | PASS | `MockMemoryStore` is a separate class; `D1MemoryStore` accepts a real D1 binding. The factory `getMemoryStore` selects based on `USE_MOCK`. Tests inject mocks via the constructor — no module-level monkey-patching of the D1 binding. `MockRAGSourceAdapter` is never instantiated in the Workers runtime (it `require`s `node:fs` which would throw in Workers). |
| **eslint config enforces eval/Function ban** | INFO | `web/eslint.config.mjs` does NOT include `no-eval` or `no-new-func` rules. The ban is enforced only at runtime via `validateStrategy` / `PlaybookValidator`. Defense-in-depth gap — a lint rule would catch regressions at commit time. Not a vulnerability (the runtime check is the load-bearing control), but recommended as a hardening measure. |

---

## Notes on Dropped Candidate Findings

The following were considered and explicitly dropped per the skill's confidence floor (≥ 0.80) and/or hard exclusions:

1. **`evaluateStrategy` MemberExpression prototype pollution** — The evaluator accesses `obj[key]` for `MemberExpression` nodes (`dsl.ts:502-510`), which is a theoretical prototype-pollution vector. Dropped because (a) the parser never emits `MemberExpression` nodes (the branch at `dsl.ts:265-270` is a no-op `break`), (b) `collectIdentifiers` traverses `MemberExpression` so `__proto__`/`constructor` would fail the allowlist, and (c) the context is application-supplied, not user-controlled. No reachable path in this diff.
2. **Agent loop trace / error message leakage** — `emitTrace` stores exception messages in `ctx.trace` (`loop.ts:162-169`), and `executeWithFallback` includes raw exception text in `ToolResult.error` (`loop.ts:227-230`). Dropped because whether `LoopResult.trace` is exposed to end users depends on the caller (not in this diff's scope); the loop itself does not log to an external sink.
3. **Cost ceiling checked after accumulation** — `accumulated_cost_usd += cost; if (>= ceiling) abort` (`loop.ts:118-121`) means a single step can overshoot the $5 ceiling before abort fires. Dropped as an availability/DoS concern (excluded by §8.1); ADR-0003 owns per-call enforcement.
4. **`cyrb53Hex` is non-cryptographic** — `community/ugc.ts:112-128` uses cyrb53 for content dedup hashing, not for security. Explicitly noted in the source comment. Not a vulnerability.
5. **`MockRAGSourceAdapter` filesystem reads** — Reads `public/mock/qa_samples/*.json` via `fs.readFileSync` with a path derived from `process.cwd()`, not user input. Files filtered by `.endsWith(".json")`. No path traversal.

---

## Review Methodology

- **Probes:** `git log d601e42..b95eed4` (1 commit), `git diff --name-only` (50 files), `git diff --stat` (+8134/-36).
- **Files read in full:** `web/src/lib/strategy/dsl.ts`, `web/src/lib/memory/store.ts`, `web/src/lib/playbook/system.ts`, `web/src/lib/citation/validator.ts`, `web/src/lib/agent/loop.ts`, `web/src/lib/data/circuit-breaker.ts`, `web/src/lib/data/router.ts`, `web/src/lib/db/schema.ts`, `web/src/lib/rag/pipeline.ts`, `web/src/lib/community/ugc.ts`, `web/src/lib/dashboard/config.ts`, `web/src/lib/sse/encoder.ts`, `web/src/lib/tools/registry.ts`, `web/src/lib/backtest/engine.ts`, `web/src/lib/strategy/types.ts`, `web/src/lib/agent/types.ts`, `web/src/lib/backtest/types.ts`, `web/src/lib/memory/types.ts`, `web/src/lib/citation/types.ts`, `web/src/lib/playbook/types.ts`, `web/eslint.config.mjs`.
- **Searches:** `validateMemoryRef` callers; `evaluateStrategy`/`parseStrategy`/`validateStrategy` callers; `eval(`/`new Function`/`Function(`; `redirect:`; `dangerouslySetInnerHTML`/`innerHTML`/`v-html`; `child_process`/`exec`/`spawn`; hardcoded secrets regex; SQL keyword interpolation.
- **Author intent (inferred):** Strict TDD scaffolding for 16 ADRs — each module is the minimal implementation that makes its test suite pass. The pattern is "export pure function + validate at boundary", which is defensively sound. The gaps found (`validateMemoryRef` not wired, silent Mock fallback, table interpolation) are consistent with incomplete Phase 1 stubs rather than intentional bypasses.
