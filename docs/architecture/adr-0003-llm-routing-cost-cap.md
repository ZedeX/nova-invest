# ADR-0003: LLM Routing and Cost Cap (Local + Cloud)

## Status

Accepted

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + LM Studio / Volcengine Ark |
| **Domain** | Core (LLM Layer / Agent Loop) |
| **Knowledge Risk** | LOW |
| **References Consulted** | `web/src/lib/llm/router.ts`, EP01 ID-5, EP03 §2.2/§2.6, architecture.md §9 |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `route("deep_research")` returns `cost_cap: 0.05` (not 0.50 — see A1 conflict fix); `classifyIntent` regex matches EP03 §2.2 examples |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (USE_MOCK dual-mode switch) — Mock mode returns `MockLLM` without any LLM API call |
| **Enables** | EP03 Ask Agent stories (intent classification, routing, cost enforcement) |
| **Blocks** | EP01 Agent Harness Phase 1 stories (LLM provider selection is foundational) |
| **Ordering Note** | Must be Accepted before any LLM-using story starts. ADR-0001 and ADR-0003 share the same env-var-driven switch pattern. |

## Context

### Problem Statement

The project must support three LLM runtime modes from a single codebase:

1. **Mock mode** (`USE_MOCK=true`): Zero LLM API calls. Returns pre-generated QA samples from `web/public/mock/qa_samples/*.json`. Used for demos, tests, and zero-cost local development.
2. **Local mode** (`USE_MOCK=false`, `ENVIRONMENT!="production"`): Uses LM Studio running locally with Qwen 2.5 models. Free, offline-capable, but lower quality.
3. **Cloud mode** (`USE_MOCK=false`, `ENVIRONMENT="production"`): Uses Volcengine Ark (火山引擎) with Doubao models. Higher quality, costs money per request.

Within each non-Mock mode, the LLM must be **routed by query intent** to balance cost vs quality:

- `simple_qa` ("AAPL 现在多少钱") → cheap model (haiku-tier / lite-4k)
- `deep_research` ("分析 NVDA 过去 3 年财报趋势") → expensive model (sonnet-tier / pro-32k)
- `tool_call` ("查 TSLA 最近新闻") → mid-tier model with function calling
- `clarify` ("你觉得我该怎么办") → cheap model

Each intent has a **cost cap** — if a single request would exceed the cap, the system must degrade to a cheaper model or abort. This protects against runaway costs from long contexts or expensive models.

### Constraints

- **Cost cap is a hard limit, not a target**: `cost_cap` is the maximum USD allowed per request; exceeding it must trigger degradation or abort.
- **Mock mode is free**: `cost_cap: 0` for all Mock responses; no real API call means no cost.
- **Local mode is free**: LM Studio runs locally, no per-request cost. `cost_cap: 0` for all local configs.
- **Cloud mode cost is real**: Volcengine Ark pricing is ~$0.005/1K tokens for doubao-pro-32k. A 4000-token deep_research request costs ~$0.02; cap is $0.05 (2.5× safety margin).
- **Cloudflare Workers stateless**: Module-level LLM cache (current `router.ts` `_llm` singleton) is broken — see Critical Implementation Rule.
- **Intent classifier is regex-based (Phase 1)**: No LLM call for classification (saves cost). Phase 1.5 may upgrade to LLM classifier.

### Requirements

- `route(intent)` returns the correct `LLMConfig` for the current env + intent
- `classifyIntent(query)` returns one of `"simple_qa" | "deep_research" | "tool_call" | "clarify"`
- `cost_cap` values (after A1 conflict fix):
  - `simple_qa`: cloud $0.001, local $0
  - `deep_research`: cloud $0.05, local $0
  - `tool_call`: cloud $0.01, local $0
  - `clarify`: cloud $0.0005, local $0
- Mock mode returns `MockLLM` instance with `cost_cap: 0` and no API call
- Cost caps must be enforced: before LLM call, estimate cost; if estimate > cap, degrade or abort
- Intent classifier regex must match EP03 §2.2 example queries (testable)

## Decision

**Adopt a 3-tier LLM provider model (Mock / Local / Cloud) with intent-based routing and per-intent cost caps. Use the same env-var-driven switch pattern as ADR-0001.**

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ Ask Agent / Build Agent / Dashboard Agent                    │
│                                                              │
│   const intent = classifyIntent(userQuery);                  │
│   const llm = getLLM(intent);  // request-scoped             │
│   const response = await llm.complete(userQuery, intent);    │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ getLLM(intent) — Factory (request-scoped, NO module cache)   │
│                                                              │
│   const config = route(intent);                              │
│   switch (config.provider) {                                 │
│     case "mock":     return new MockLLM();                   │
│     case "lmstudio": return new RealLLM(config);             │
│     case "ark":      return new RealLLM(config);             │
│   }                                                          │
└──────────────────────────────────────────────────────────────┘
              │                                  │
              ▼                                  ▼
┌──────────────────────────────┐  ┌────────────────────────────┐
│ MockLLM                      │  │ RealLLM                    │
│                              │  │                            │
│ Reads: web/public/mock/      │  │ Calls: LM Studio (local)   │
│        qa_samples/*.json     │  │   OR  Volcengine Ark (cloud)│
│                              │  │                            │
│ cost_cap: 0                  │  │ Enforces cost_cap:         │
│ Zero API calls               │  │   estimate cost before call│
│                              │  │   if > cap → degrade/abort │
└──────────────────────────────┘  └────────────────────────────┘
```

### Key Interfaces

```typescript
// web/src/lib/llm/router.ts (canonical)

export type QueryIntent = "simple_qa" | "deep_research" | "tool_call" | "clarify";

export interface LLMConfig {
  provider: "mock" | "lmstudio" | "ark";
  model: string;
  max_tokens: number;
  cost_cap: number;  // USD per request, 0 = free (local/mock)
  api_base?: string;
}

// Routing table — single source of truth for cost caps
// (After A1 conflict fix: deep_research cloud = 0.05, NOT 0.50)
export const ROUTING_RULES: Record<QueryIntent, { local: LLMConfig; cloud: LLMConfig }> = {
  simple_qa: {
    local:  { provider: "lmstudio", model: "qwen2.5-7b-instruct",  max_tokens: 500,  cost_cap: 0      },
    cloud:  { provider: "ark",      model: "doubao-lite-4k",      max_tokens: 500,  cost_cap: 0.001  },
  },
  deep_research: {
    local:  { provider: "lmstudio", model: "qwen2.5-32b-instruct", max_tokens: 4000, cost_cap: 0      },
    cloud:  { provider: "ark",      model: "doubao-pro-32k",     max_tokens: 4000, cost_cap: 0.05   },
  },
  tool_call: {
    local:  { provider: "lmstudio", model: "qwen2.5-7b-instruct",  max_tokens: 800,  cost_cap: 0      },
    cloud:  { provider: "ark",      model: "doubao-pro-32k",     max_tokens: 800,  cost_cap: 0.01   },
  },
  clarify: {
    local:  { provider: "lmstudio", model: "qwen2.5-7b-instruct",  max_tokens: 200,  cost_cap: 0      },
    cloud:  { provider: "ark",      model: "doubao-lite-4k",      max_tokens: 200,  cost_cap: 0.0005 },
  },
};

// Cost estimation helper (called before LLM API call)
export function estimateCost(config: LLMConfig, inputTokens: number): number {
  // Volcengine Ark pricing (approximate, USD per 1K tokens)
  const PRICING: Record<string, { input: number; output: number }> = {
    "doubao-lite-4k":  { input: 0.0001, output: 0.0003 },  // ~$0.0001/1K input
    "doubao-pro-32k":  { input: 0.001,  output: 0.005  },  // ~$0.001/1K input
    // LM Studio: free (local)
    // Mock: free
  };
  const price = PRICING[config.model] ?? { input: 0, output: 0 };
  const outputTokens = config.max_tokens;
  return (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
}

// Factory — request-scoped, NOT cached at module level
export function getLLM(intent: QueryIntent, env: { USE_MOCK?: string; ENVIRONMENT?: string } = process.env): MockLLM | RealLLM {
  const config = route(intent, env);
  switch (config.provider) {
    case "mock":     return new MockLLM();
    case "lmstudio":
    case "ark":      return new RealLLM(config);
  }
}

// Route — request-scoped
export function route(intent: QueryIntent, env: { USE_MOCK?: string; ENVIRONMENT?: string } = process.env): LLMConfig {
  if (isMockMode(env)) {
    return { provider: "mock", model: "mock-qa-sample", max_tokens: 0, cost_cap: 0 };
  }
  const envMode = env.ENVIRONMENT === "production" ? "cloud" : "local";
  return ROUTING_RULES[intent][envMode];
}

// Intent classifier — regex-based, no LLM call (Phase 1)
export function classifyIntent(query: string): QueryIntent {
  const q = query.toLowerCase();
  if (/\b(?:当前|现在)\b.*\b(?:价格|股价|多少钱)\b/.test(q) ||
      /\bcurrent price\b|\bhow much\b/.test(q)) {
    return "simple_qa";
  }
  if (/\b(?:分析|研究|比较|趋势|过去|历史)\b/.test(q) ||
      /\banalyze|research|compare|trend|past|history\b/.test(q)) {
    return "deep_research";
  }
  if (/\b(?:查|调用|搜索|新闻)\b/.test(q) ||
      /\bsearch|fetch|news\b/.test(q)) {
    return "tool_call";
  }
  return "clarify";
}
```

### Critical Implementation Rule (Cloudflare Workers)

**Same as ADR-0001: do NOT cache the LLM at module level.** The current `router.ts` has:

```typescript
// ❌ ANTI-PATTERN (current code, must refactor before Phase 1 ship)
let _llm: MockLLM | RealLLM | null = null;

export function getLLM(intent: QueryIntent): MockLLM | RealLLM {
  if (_llm) return _llm;  // BUG: ignores intent change on subsequent calls
  // ...
}
```

This is broken in two ways:

1. **Workers stateless violation**: Module-level `_llm` persists across requests in the same Worker instance, ignoring env var changes between deploys.
2. **Intent ignored after first call**: First call with `intent="simple_qa"` creates a `RealLLM` with simple_qa config. Second call with `intent="deep_research"` returns the cached simple_qa LLM — wrong model, wrong max_tokens, wrong cost_cap.

**Required pattern** (request-scoped + intent-aware):

```typescript
// ✅ REQUIRED — no module-level cache, intent is a parameter
export function getLLM(intent: QueryIntent, env: { USE_MOCK?: string; ENVIRONMENT?: string } = process.env): MockLLM | RealLLM {
  const config = route(intent, env);
  switch (config.provider) {
    case "mock":     return new MockLLM();
    case "lmstudio":
    case "ark":      return new RealLLM(config);
  }
}
```

If a request needs multiple LLM calls with different intents, the handler should call `getLLM(intent)` per call (cheap — just an object construction).

### Cost Cap Enforcement

Before any cloud LLM call, `RealLLM.complete()` must:

1. Estimate input tokens (cheap: `query.length / 4` as rough estimate)
2. Call `estimateCost(config, inputTokens)`
3. If `estimatedCost > config.cost_cap`:
   - **Degrade**: Switch to cheaper model (e.g., `doubao-pro-32k` → `doubao-lite-4k`)
   - **Or abort**: Return error response with `"cost_exceeded"` reason
4. Log actual cost after call (for billing / observability)

```typescript
class RealLLM {
  async complete(query: string, intent: QueryIntent): Promise<AskResponse> {
    const inputTokens = Math.ceil(query.length / 4);
    const estimatedCost = estimateCost(this.config, inputTokens);

    if (estimatedCost > this.config.cost_cap) {
      // Degrade to cheaper model
      const degradedConfig = this.degrade(this.config);
      console.warn(`Cost cap exceeded (${estimatedCost} > ${this.config.cost_cap}), degrading to ${degradedConfig.model}`);
      this.config = degradedConfig;
    }

    // ... actual LLM API call ...
  }
}
```

## Alternatives Considered

### Alternative 1: Single model for all intents

- **Description**: Use `doubao-pro-32k` for everything.
- **Pros**: Simpler routing (no intent classifier needed).
- **Cons**: 5× cost for simple_qa queries (which are 70% of traffic); slower response for simple queries.
- **Rejection Reason**: Cost-prohibitive at scale; EP01 acceptance criteria explicitly require tiered routing.

### Alternative 2: LLM-based intent classifier

- **Description**: Use a cheap LLM call to classify intent, then route.
- **Pros**: More accurate than regex; handles edge cases.
- **Cons**: Adds 1 LLM call per query (~$0.0001 per classification); adds latency.
- **Rejection Reason**: Phase 1 regex is sufficient for demo queries; revisit in Phase 1.5 if accuracy < 90%.

### Alternative 3: No cost cap (trust the model)

- **Description**: Just call the LLM with max_tokens, no cost enforcement.
- **Pros**: Simplest implementation.
- **Cons**: A single runaway request (long context + expensive model) could cost $1+; demo budget blown in one bad query.
- **Rejection Reason**: EP01 ID-5 and EP03 §3 BDD explicitly require cost cap enforcement.

### Alternative 4: Use OpenAI/Claude instead of Volcengine Ark

- **Description**: Route to OpenAI gpt-4o-mini or Claude Haiku.
- **Pros**: Better documented APIs; more reliable.
- **Cons**: Higher cost (~3-5× Ark pricing); requires overseas API access (GFW issue from China); doesn't differentiate from competitors.
- **Rejection Reason**: Project decision is Volcengine Ark for cost + China accessibility (see architecture.md §9).

## Consequences

### Positive

- Single source of truth for cost caps (`ROUTING_RULES`)
- Mock mode is free (zero API calls)
- Local mode is free (LM Studio)
- Cloud mode has bounded cost per request (cost_cap enforcement)
- Intent classifier is regex-based (no LLM call, no cost)
- Easy to add new intents or models (just edit `ROUTING_RULES`)

### Negative

- Intent classifier regex is brittle (Phase 1 limitation)
- Cost estimation is approximate (input tokens estimated from query length)
- Module-level `_llm` cache in current code must be refactored before Phase 1 ship (see Critical Implementation Rule)
- Cost cap enforcement adds 1 `estimateCost()` call per LLM request (negligible overhead)

### Risks

- **Risk**: Regex classifier misclassifies "分析下 TSLA 财报" as `tool_call` (contains "查" sound-alike).
  - **Mitigation**: Phase 1.5 upgrade to LLM classifier; golden test set (EP01 ID-6) catches misclassifications.
- **Risk**: `estimateCost` underestimates actual cost (input token count off).
  - **Mitigation**: Use 2.5× safety margin in cost_cap (e.g., `deep_research` cap is $0.05, estimated cost is ~$0.02); log actual cost and adjust caps if needed.
- **Risk**: Volcengine Ark pricing changes.
  - **Mitigation**: `PRICING` table in `estimateCost()` is a constant; update + redeploy when pricing changes.
- **Risk**: Module-level `_llm` cache leaks state in Workers (current bug).
  - **Mitigation**: Refactor to request-scoped factory before Phase 1 ship (see Critical Implementation Rule).

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP01 ID-5 | "LLM 路由策略 + ROUTING 表" | Codifies `ROUTING_RULES` as the canonical routing table |
| EP01 §验收 | "单次 query 成本 ≤ $0.01（简单）/ $0.05（深度）" (after A1 fix) | cost_cap values match acceptance criteria |
| EP03 §2.2 | "Query Understanding + classifyIntent + 路由表" | `classifyIntent()` regex matches EP03 §2.2 examples |
| EP03 §2.2 | "local / cloud 双配置" | `ROUTING_RULES[intent].local` and `.cloud` separate configs |
| EP03 §2.3 BDD | "cost_cap = $0.05" (after A1 fix) | `deep_research.cloud.cost_cap = 0.05` |
| EP03 §3 BDD | "超过 cost_cap 仍调用 LLM" listed as forbidden | Cost cap enforcement in `RealLLM.complete()` |
| EP03 ID-1 | "意图分类器 [B]" | Regex-based classifier is Phase 1 implementation |
| EP03 ID-3 | "Citation Validator" (future) | Not directly addressed, but cost_cap protects against long RAG context blowups |
| architecture.md §9 | "关键技术决策: LLM 路由" | Formalizes the inline decision as an ADR |

## Performance Implications

- **CPU**: `classifyIntent` regex: < 1ms; `estimateCost`: < 0.1ms
- **Memory**: `ROUTING_RULES` constant: ~1KB; no module-level LLM cache
- **Load Time**: Mock mode: ~10ms (JSON file read); Local mode: 200-2000ms (LM Studio, depends on model); Cloud mode: 500-3000ms (Ark API)
- **Network**: Mock mode: zero; Local mode: localhost only; Cloud mode: 1 HTTPS call to Ark per request
- **Cost**: Mock: $0; Local: $0; Cloud: $0.0005-$0.05 per request (enforced by cost_cap)

## Migration Plan

The current `router.ts` already implements most of this ADR but with the anti-pattern module-level cache. Migration steps:

1. Remove `_llm` module-level cache in `router.ts`
2. Add `env` parameter to `getLLM(intent, env)` and `route(intent, env)` (default `process.env`)
3. Update all call sites to pass `process.env` (or `getRequestContext().env` in Workers)
4. Implement `estimateCost()` function
5. Add cost cap enforcement in `RealLLM.complete()` (currently just returns placeholder)
6. Add unit tests for `classifyIntent` (assert EP03 §2.2 examples classify correctly)
7. Add unit tests for `route()` (assert cost_cap values match A1 fix: $0.05 not $0.50)
8. Add unit test asserting `getLLM("simple_qa")` and `getLLM("deep_research")` return different `RealLLM` instances (no caching across intents)
9. Add unit test asserting Mock mode returns `MockLLM` with zero `fetch()` calls

## Validation Criteria

- [ ] `classifyIntent("AAPL 现在多少钱")` returns `"simple_qa"`
- [ ] `classifyIntent("分析 NVDA 过去 3 年财报趋势")` returns `"deep_research"`
- [ ] `classifyIntent("查 TSLA 最近新闻")` returns `"tool_call"`
- [ ] `classifyIntent("你觉得我该怎么办")` returns `"clarify"`
- [ ] `route("deep_research", { USE_MOCK: "false", ENVIRONMENT: "production" }).cost_cap === 0.05` (NOT 0.50)
- [ ] `route("simple_qa", { USE_MOCK: "true" }).provider === "mock"`
- [ ] `getLLM("simple_qa", { USE_MOCK: "false", ENVIRONMENT: "development" }).config.provider === "lmstudio"`
- [ ] `getLLM("deep_research", { USE_MOCK: "false", ENVIRONMENT: "production" }).config.provider === "ark"`
- [ ] `MockLLM.complete()` makes zero `fetch()` calls to LLM API (mock QA samples are allowed)
- [ ] `RealLLM.complete()` calls `estimateCost()` before API call
- [ ] `RealLLM.complete()` degrades model when `estimateCost() > cost_cap`
- [ ] No module-level `_llm` cache (request-scoped only)
- [ ] `getLLM("simple_qa")` and `getLLM("deep_research")` return different instances

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) — same env-var-driven switch pattern; Mock mode returns `MockLLM`
- **ADR-0002** (R2 cache whitelist) — independent, but shares the "request-scoped factory" pattern
- EP01 ID-5 LLM 路由策略 — originating design doc
- EP03 §2.2/§2.3/§2.6 — detailed routing rules and BDD
- architecture.md §9 — inline decision this ADR formalizes

## TECH_DEBT — Module-Level LLM Cache Anti-Pattern

**Status**: P1 refactor item — not resolved in current iteration; deferred to a future sprint.

**Problem**: `web/src/lib/llm/router.ts` lines 127-139 use a module-level `_llm` cache:

```typescript
let _llm: MockLLM | RealLLM | null = null;
export function getLLM(intent: QueryIntent): MockLLM | RealLLM {
  if (_llm) return _llm;  // ← BUG: ignores intent change + env leak
  ...
}
```

This has **two** bugs (not just the Workers stateless violation shared with ADR-0001):

1. **Workers stateless violation**: Module-level `_llm` persists across requests in the same Worker instance, ignoring env var changes between deploys.
2. **Intent ignored after first call**: First call with `intent="simple_qa"` creates a `RealLLM` with simple_qa config. Second call with `intent="deep_research"` returns the cached simple_qa LLM — **wrong model, wrong max_tokens, wrong cost_cap**.

**Impact**:
- Cost cap enforcement is silently bypassed (deep_research query uses simple_qa's cheaper model)
- Mock/Real mode switch requires process restart
- Cross-request state pollution in Workers
- Unit tests must `vi.resetModules()` to avoid leaking state between test cases

**Pending test cases** (6 `it.todo` in `web/tests/unit/llm-route.test.ts`):

| # | Test Case | Line |
|---|-----------|------|
| TD-4 | `route(intent, env)` accepts env parameter (request-scoped) | `it.todo` block |
| TD-5 | `getLLM(intent, env)` accepts env parameter (request-scoped) | `it.todo` block |
| TD-6 | `getLLM()` does NOT cache at module level (returns fresh instance per call) | `it.todo` block |
| TD-7 | `getLLM('simple_qa')` and `getLLM('deep_research')` return different RealLLM instances | `it.todo` block |
| TD-8 | `RealLLM.complete()` calls `estimateCost()` before API call | `it.todo` block |
| TD-9 | `RealLLM.complete()` degrades model when `estimateCost() > cost_cap` | `it.todo` block |

**Refactor trigger**: When a future iteration needs to promote these `it.todo` cases to `it()`, the module-level cache must be removed, `getLLM(intent, env)` and `route(intent, env)` must accept explicit env parameters, and `estimateCost()` + cost cap enforcement must be implemented in `RealLLM.complete()`. Promoting the todos IS the refactor acceptance signal.

**Related**: ADR-0001 TECH_DEBT (same module-level cache pattern in `_provider` at `provider.ts`).
