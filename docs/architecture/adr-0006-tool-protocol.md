# ADR-0006: Tool Protocol (Static Registry + Native Function Call, Phase 1)

## Status

Accepted

## Phase-1 Simplified Variants Accepted (2026-07-20)

- **Phase-1 Accepted Variant**: Empty TOOL_REGISTRY (no tools registered) in `web/src/lib/tools/registry.ts`. Agent Loop operates without tool-calling capability.
- **Rationale**: ADR-0004 Agent Loop's `StepHandler.onExecute` returns empty `execResult.actions` when no tools are registered - the loop still completes via `onSynthesize`. EP03 Ask Agent can answer using RAG context alone (no tool augmentation) for Phase-1 demo.
- **Phase-1 Compliance**: ACCEPTED as Phase-1 compliant. ADR-0006 §Tool Registry Interface contract is satisfied (the Map exists, is typed, is exported - it just has zero entries).
- **Migration Trigger**: EP03 §2.3 lists 9 native tools (price_lookup, kline_fetch, etc.). These MUST be registered before EP03 production launch.

## Phase-2 Deferral Notes

- **Status**: Phase-1 ships empty tool registry (Phase-1 stub only); no tools registered.
- **Current Implementation**: `web/src/lib/tools/registry.ts` (TOOL_REGISTRY is empty object)
- **Phase-2 Deferrals**:
  - Register 9 Phase-1 native tools per EP03 §2.3 (price_lookup, kline_fetch, get_earnings, search_news, get_macro, plot_chart, build_strategy, run_backtest, save_dashboard)
  - MCP protocol integration (get_sentiment, brokerage, playbook_hub MCP servers)
  - Dynamic tool registration layer for plugin system
  - Tool authentication for non-public APIs (brokerage MCP server)

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 |
| **Domain** | Core (Tool Calling Layer / Agent Tools) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP01 §ID-1/§ID-2, EP03 §2.6, ADR-0001 §MarketDataProvider, ADR-0003 §tool_call intent, ADR-0004 §StepHandler.onToolCall + §executeWithFallback, `docs/registry/architecture.yaml` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `ToolCall`/`ToolResult` shapes consumed by ADR-0004 `onToolCall`; static registry contains 9 Phase 1 native tools; MCP skipped (Phase 2); Mock mode tools return seeded JSON (FP-0005); tool naming unified to `get_quote` (resolves C6) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (Mock tools return seeded JSON, Real tools call external APIs), ADR-0003 (tool_call intent routes to mid-tier LLM), ADR-0004 (StepHandler.onToolCall integration + TOOL_RETRY_LIMIT=3 + executeWithFallback) |
| **Enables** | EP01 Agent Harness stories (tool calling layer L5), EP03 Ask Agent stories (get_quote, get_earnings, search_news), EP04 Build Agent stories (build_strategy, run_backtest), EP05 Dashboard Agent stories (save_dashboard) |
| **Blocks** | EP01/EP03/EP04/EP05 implementation sprints involving tool calls |
| **Ordering Note** | ADR-0004 `StepHandler.onToolCall(ctx, tool: ToolCall) -> ToolResult` consumes this ADR's shapes. Does NOT require ADR-0004 to be Accepted (tools can be unit-tested standalone). MCP integration deferred to Phase 2 (blocks EP06 broker + EP07 playbook_hub MCP servers). |

## Context

### Problem Statement

EP01 §ID-2 specifies a hybrid tool protocol: MCP for external data sources + native function call for internal tools. It lists 10 built-in tools across 3 Sub-Agents (Ask/Build/Dashboard). EP03 §2.6 adds detail: `INTERNAL_TOOLS` (3 tools) + `MCP_SERVERS` (2 external servers, Phase 2).

ADR-0004 §StepHandler defines `onToolCall(ctx, tool: ToolCall): Promise<ToolResult>` as the integration point, with `executeWithFallback` handling retry ×3 + source switching (tool-internal per EP02 ID-4). However, the `ToolCall` and `ToolResult` shapes are undefined - ADR-0004 forward-references "future ADR-0006".

Without this ADR:

1. Sub-Agent handlers cannot implement `onToolCall` - the input/output shapes are unknown.
2. Tool naming conflict C6 (v1 review, unresolved): EP01 §ID-2 uses `get_quote`, EP03 §2.6 uses `get_current_price`. Need canonical resolution.
3. MCP vs native classification is ambiguous: EP01 §ID-2 says `search_news` is MCP, EP03 §2.6 says it's internal. Need resolution.
4. Mock mode tool behavior is undefined: should Mock tools return seeded JSON? Call MockProvider? Skip entirely?
5. Tool cost tracking is undefined: how does `ToolResult.cost_usd` propagate to `LoopContext.accumulated_cost_usd`?

### Constraints

- **Cloudflare Workers stateless**: No module-level tool caches (per FP-0001/FP-0002/FP-0006/FP-0018 pattern). Tool handlers are stateless functions; all state flows through `LoopContext`.
- **Mock mode zero external HTTP (FP-0005)**: Mock tools MUST NOT call external APIs. They return seeded JSON from `web/public/mock/` or delegate to `MockProvider` (ADR-0001).
- **ADR-0004 TOOL_RETRY_LIMIT=3**: Loop retries same tool ×3; if all fail, returns partial result. Source switching (per EP02 ID-4) is tool-internal - the tool handler itself decides fallback chain.
- **EP01 §ID-1 "自研 ≤100 行编排器"**: Tool registry must be simple; no heavy framework. Static const map is sufficient for Phase 1.
- **EP01 §反模式 "Sub-Agent 之间直接调用"**: Tools are invoked by the loop (via `onToolCall`), not by Sub-Agents directly calling each other. `build_strategy` tool is invoked by Ask Agent's loop when user asks "build a strategy for NVDA" - the tool handler dispatches to Build Agent's logic, but the call goes through the loop, not direct Sub-Agent invocation.
- **Phase 1 scope**: MCP protocol adds complexity (JSON-RPC, external server lifecycle). Phase 1 query volume low; all 9 Phase 1 tools can be native. MCP deferred to Phase 2.
- **ADR-0003 tool_call intent**: `tool_call` intent routes to mid-tier LLM (doubao-pro-32k, max_tokens 800, cost_cap $0.01). Tools are invoked when LLM classifies intent as `tool_call` OR when `onExecute` plan requires tool data.

### Requirements

- `ToolCall` shape: `{ name: string; parameters: Record<string, unknown>; timeout?: number }`
- `ToolResult` shape: `{ success: boolean; result: unknown; cost_usd: number; latency_ms: number; source: string; error?: string }`
- `ToolHandler` type: `(params: Record<string, unknown>, env: Env) => Promise<ToolResult>`
- Static `TOOL_REGISTRY`: `Record<string, ToolHandler>` containing 9 Phase 1 native tools
- 9 Phase 1 native tools (per EP01 §ID-2 + EP03 §2.6 reconciliation):
  - Ask: `get_quote`, `get_ohlc`, `get_earnings`, `search_news`, `get_macro`, `plot_chart`
  - Build: `build_strategy`, `run_backtest`
  - Dashboard: `save_dashboard`
- 2 Phase 2 MCP tools (deferred): `get_sentiment`, `brokerage` MCP server, `playbook_hub` MCP server
- Mock mode: all 9 tools return seeded JSON or delegate to `MockProvider` (ADR-0001). Zero external HTTP.
- Real mode: tools call external APIs (Yahoo, SEC EDGAR, etc.) via `RealProvider` (ADR-0001) or direct fetch (for non-market-data tools like `build_strategy`).
- Tool naming: `get_quote` is canonical (resolves C6 conflict; EP01 §ID-2 is authoritative).
- `search_news` classification: native in Phase 1 (per EP03 §2.6 `INTERNAL_TOOLS`), not MCP (overrides EP01 §ID-2 for Phase 1).
- Source switching: each tool handler implements its own fallback chain (per EP02 ID-4). Loop does NOT switch sources; loop only retries ×3.
- Cost tracking: `ToolResult.cost_usd` is added to `LoopContext.accumulated_cost_usd` by the loop (ADR-0004). Tools must report their cost (0 for Mock/local, actual API cost for Cloud).

## Decision

**Adopt a static tool registry with rich ToolCall/ToolResult shapes. Phase 1 implements 9 native function call tools. MCP protocol is deferred to Phase 2. Tool naming unified to `get_quote` (resolves C6). `search_news` is native in Phase 1 (per EP03 §2.6).**

### Architecture Diagram

```
                    ┌──────────────────────────────────────────┐
                    │  AgentLoop.run() (per ADR-0004)          │
                    │                                          │
                    │  case "ToolCall":                        │
                    │    result = executeWithFallback(tool)    │
                    │      -> retry ×3 (same tool)             │
                    │      -> source switching is tool-internal│
                    │    ctx.accumulated_cost += result.cost   │
                    │    emit TraceStep(type: "tool_call")     │
                    └──────────────────┬───────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │  StepHandler.onToolCall(ctx, tool)       │
                    │  (Sub-Agent specific, per ADR-0004)      │
                    │                                          │
                    │  const handler = TOOL_REGISTRY[tool.name]│
                    │  if (!handler) return ToolResult.failure │
                    │  return handler(tool.parameters, ctx.env)│
                    └──────────────────┬───────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │  TOOL_REGISTRY (static const map)        │
                    │                                          │
                    │  Phase 1 native tools (9):               │
                    │  - get_quote      -> getQuoteHandler     │
                    │  - get_ohlc       -> getOhlcHandler      │
                    │  - get_earnings   -> getEarningsHandler  │
                    │  - search_news    -> searchNewsHandler   │
                    │  - get_macro      -> getMacroHandler     │
                    │  - plot_chart     -> plotChartHandler    │
                    │  - build_strategy -> buildStrategyHandler│
                    │  - run_backtest   -> runBacktestHandler  │
                    │  - save_dashboard -> saveDashboardHandler│
                    │                                          │
                    │  Phase 2 MCP tools (deferred):           │
                    │  - get_sentiment  -> MCP server          │
                    │  - brokerage      -> MCP server          │
                    │  - playbook_hub   -> MCP server          │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                     │
                    ▼                                     ▼
       ┌─────────────────────────┐         ┌─────────────────────────┐
       │  Mock Mode              │         │  Real Mode              │
       │  (USE_MOCK=true)        │         │  (USE_MOCK=false)       │
       │                         │         │                         │
       │  - Returns seeded JSON  │         │  - Calls external APIs  │
       │    from web/public/mock/│         │    via RealProvider     │
       │  - Delegates to         │         │    (ADR-0001) or direct │
       │    MockProvider         │         │    fetch                │
       │    (ADR-0001)           │         │  - Reports actual cost  │
       │  - cost_usd: 0          │         │  - Source switching:    │
       │  - Zero external HTTP   │         │    Yahoo -> Alpha ->    │
       │    (FP-0005)            │         │    Mock fallback        │
       └─────────────────────────┘         └─────────────────────────┘
```

### Key Interfaces

```typescript
// web/src/lib/tools/types.ts (canonical)

/**
 * Tool call request shape. Consumed by ADR-0004 StepHandler.onToolCall.
 */
export interface ToolCall {
  name: string;                              // tool name, e.g. "get_quote"
  parameters: Record<string, unknown>;       // tool-specific params
  timeout?: number;                          // optional timeout in ms (default: 5000)
}

/**
 * Tool call result shape. Returned by tool handlers.
 * Rich shape includes trace fields (latency_ms, source) for ADR-0004 TraceStep.
 */
export interface ToolResult {
  success: boolean;
  result: unknown;                           // tool-specific output
  cost_usd: number;                          // actual cost (0 for Mock/local)
  latency_ms: number;                        // execution time
  source: string;                            // data source, e.g. "yahoo" | "alpha_vantage" | "mock" | "r2_cache"
  error?: string;                            // error message if success=false
}

/**
 * Tool handler function type. Stateless; all state via env parameter.
 */
export type ToolHandler = (
  params: Record<string, unknown>,
  env: Env
) => Promise<ToolResult>;

/**
 * Static tool registry. Phase 1: 9 native tools.
 * Phase 2 will add MCP tools (get_sentiment, brokerage, playbook_hub).
 */
export const TOOL_REGISTRY: Record<string, ToolHandler> = {
  // Ask Agent tools (6)
  get_quote: getQuoteHandler,
  get_ohlc: getOhlcHandler,
  get_earnings: getEarningsHandler,
  search_news: searchNewsHandler,
  get_macro: getMacroHandler,
  plot_chart: plotChartHandler,

  // Build Agent tools (2)
  build_strategy: buildStrategyHandler,
  run_backtest: runBacktestHandler,

  // Dashboard Agent tools (1)
  save_dashboard: saveDashboardHandler,
};

/**
 * Tool metadata for LLM function calling.
 * Used to generate the "tools" array in LLM API request.
 */
export interface ToolMetadata {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

/**
 * Tool metadata for all Phase 1 tools.
 * Used by LLM to select which tool to call (function calling).
 */
export const TOOL_METADATA: ToolMetadata[] = [
  {
    name: "get_quote",
    description: "Get current price quote for a stock ticker",
    parameters: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Stock ticker symbol, e.g. 'AAPL'" }
      },
      required: ["ticker"]
    }
  },
  {
    name: "get_ohlc",
    description: "Get OHLC (open/high/low/close) K-line data for a ticker",
    parameters: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        timeframe: { type: "string", description: "1m | 5m | 15m | 1h | 1d | 1w" },
        from: { type: "string", description: "ISO date" },
        to: { type: "string", description: "ISO date" }
      },
      required: ["ticker", "timeframe"]
    }
  },
  {
    name: "get_earnings",
    description: "Get latest earnings report for a ticker",
    parameters: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        period: { type: "string", description: "e.g. '2024-Q4'" }
      },
      required: ["ticker"]
    }
  },
  {
    name: "search_news",
    description: "Search recent news for a ticker",
    parameters: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        days: { type: "number", description: "Number of days to look back (default 7)" }
      },
      required: ["ticker"]
    }
  },
  {
    name: "get_macro",
    description: "Get macroeconomic data (GDP, CPI, interest rates) from FRED",
    parameters: {
      type: "object",
      properties: {
        indicator: { type: "string", description: "e.g. 'GDP', 'CPI', 'FED_FUNDS_RATE'" }
      },
      required: ["indicator"]
    }
  },
  {
    name: "plot_chart",
    description: "Generate a price chart image for a ticker",
    parameters: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        timeframe: { type: "string" },
        chart_type: { type: "string", description: "candlestick | line | area" }
      },
      required: ["ticker", "timeframe"]
    }
  },
  {
    name: "build_strategy",
    description: "Convert natural language to Strategy DSL YAML",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Natural language strategy description" }
      },
      required: ["description"]
    }
  },
  {
    name: "run_backtest",
    description: "Run backtest on a strategy",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" }
      },
      required: ["strategy_id", "start_date", "end_date"]
    }
  },
  {
    name: "save_dashboard",
    description: "Save dashboard configuration for a user",
    parameters: {
      type: "object",
      properties: {
        config: { type: "object", description: "Dashboard layout configuration" }
      },
      required: ["config"]
    }
  },
];

// Helper: create success result
export function toolSuccess(result: unknown, source: string, costUsd: number, latencyMs: number): ToolResult {
  return { success: true, result, cost_usd: costUsd, latency_ms: latencyMs, source };
}

// Helper: create failure result
export function toolFailure(error: string, source: string, latencyMs: number): ToolResult {
  return { success: false, result: null, cost_usd: 0, latency_ms: latencyMs, source, error };
}
```

### Tool Handler Implementations (Phase 1)

```typescript
// web/src/lib/tools/handlers/get-quote.ts

import { getProvider } from "../../data/provider";
import type { ToolResult } from "../types";

export async function getQuoteHandler(
  params: Record<string, unknown>,
  env: Env
): Promise<ToolResult> {
  const start = Date.now();
  const ticker = params.ticker as string;
  if (!ticker) return toolFailure("Missing required parameter: ticker", "validation", 0);

  try {
    const provider = getProvider(env);  // ADR-0001: Mock or Real
    const quote = await provider.getQuote(ticker);

    // Source switching is tool-internal (per EP02 ID-4):
    // - MockProvider returns seeded JSON (source: "mock")
    // - RealProvider tries Yahoo -> Alpha Vantage -> error (source: "yahoo" | "alpha_vantage")
    return toolSuccess(quote, quote.source, 0, Date.now() - start);
    // cost_usd: 0 because market data is free (Yahoo/Alpha Vantage free tier)
  } catch (e) {
    return toolFailure(String(e), "error", Date.now() - start);
  }
}

// web/src/lib/tools/handlers/get-ohlc.ts
// (Similar pattern: delegates to provider.getKlines())

// web/src/lib/tools/handlers/get-earnings.ts
// (Similar pattern: delegates to provider.getEarnings() or fetches SEC EDGAR)

// web/src/lib/tools/handlers/search-news.ts
// (Native in Phase 1 per EP03 §2.6; fetches RSS feeds directly, not MCP)
// (Phase 2 may upgrade to MCP if external news API requires it)

// web/src/lib/tools/handlers/build-strategy.ts
// (Delegates to Build Agent's NL->DSL conversion logic; not a market data tool)

// web/src/lib/tools/handlers/run-backtest.ts
// (Delegates to Backtest Engine per future ADR-0009)
```

### Source Switching (Tool-Internal, per EP02 ID-4)

Each tool handler implements its own fallback chain. The loop (ADR-0004 `executeWithFallback`) retries the same tool ×3; if all 3 fail, returns partial result. Source switching happens WITHIN a single tool call - the handler tries source A, if fail tries source B, etc.

```typescript
// Example: getQuoteHandler source switching
async function getQuoteHandler(params, env): Promise<ToolResult> {
  const ticker = params.ticker as string;
  const start = Date.now();

  if (isMockMode(env)) {
    // Mock: return seeded JSON (FP-0005 compliance)
    return toolSuccess(await MockProvider.getQuote(ticker), "mock", 0, Date.now() - start);
  }

  // Real: try Yahoo -> Alpha Vantage -> error
  try {
    const quote = await YahooProvider.getQuote(ticker);
    return toolSuccess(quote, "yahoo", 0, Date.now() - start);
  } catch (yahooError) {
    try {
      const quote = await AlphaVantageProvider.getQuote(ticker);
      return toolSuccess(quote, "alpha_vantage", 0, Date.now() - start);
    } catch (alphaError) {
      return toolFailure(`All sources failed: Yahoo (${yahooError}), Alpha (${alphaError})`, "error", Date.now() - start);
    }
  }
}
```

**Critical**: The loop's `executeWithFallback` retries the SAME tool ×3 (e.g., `get_quote` called 3 times). Each call internally tries all sources (Yahoo -> Alpha). If a source is rate-limited, the retry ×3 may help (rate limit may clear). If all 3 retries fail, loop returns partial result.

### ProviderRouter: Canonical Source-Switching Abstraction (ADR-0016 integration)

> **Note (2026-07-20 amendment)**: The inline `try/catch` source-switching pattern shown above in `getQuoteHandler` is the conceptual model — each tool handler owns its fallback chain (per EP02 ID-4). For market-data tools (`get_quote`, `get_klines`, `get_fundamentals`), the canonical implementation of this pattern is the `ProviderRouter` class defined in [ADR-0016](adr-0016-circuit-breaker.md) §ProviderRouter Integration.

`ProviderRouter` consolidates the fallback chain `[yahoo, alpha_vantage, polygon, mock]` into a single `MarketDataProvider` implementation, with these additions over the inline pattern:

1. **Circuit-breaker integration**: Each source is wrapped by ADR-0016's `CircuitBreaker.isTripped(source)` check. Tripped sources are skipped without attempting a network call (saves 5–30s timeout latency).
2. **R2 cache bypass**: Per ADR-0002, R2 cache hits bypass the circuit breaker and provider chain entirely — `ProviderRouter` checks R2 first for whitelisted symbols.
3. **Mock source exemption**: `ProviderRouter` always falls back to `MockProvider` (ADR-0001) as the final option. Mock source is circuit-breaker-exempt per ADR-0016 §Critical Implementation Rules #5.
4. **Single-flight half-open probe**: When a source is in HALF-OPEN state, only one probe request is allowed; concurrent requests skip (ADR-0016 §Critical Implementation Rules #4).

**Tool handler integration**: Market-data tool handlers delegate to `ProviderRouter` instead of inlining the fallback chain:

```typescript
// Canonical pattern for market-data tools (post-ADR-0016)
async function getQuoteHandler(params, env): Promise<ToolResult> {
  const ticker = params.ticker as string;
  const start = Date.now();
  const router = new ProviderRouter(sources, circuitBreaker, r2);
  try {
    const quote = await router.getQuote(ticker);
    return toolSuccess(quote, router.lastSourceUsed, 0, Date.now() - start);
  } catch (error) {
    return toolFailure(error.message, "error", Date.now() - start);
  }
}
```

**Non-market-data tools** (e.g., `search_news`, `get_earnings`, `build_strategy`, `run_backtest`) continue to use inline fallback chains because their sources are not interchangeable in the same way (e.g., `search_news` queries RSS feeds, not market-data APIs). The `ProviderRouter` pattern applies only to the `MarketDataProvider` interface (klines/quote/fundamentals/earnings/searchSymbols).

**Conflict resolution (C20)**: ADR-0016's `ProviderRouter` is the canonical implementation of this ADR's "tool-internal source switching" pattern for market-data tools. Both ADRs are consistent: ADR-0006 defines the pattern (tool-internal, loop doesn't switch), ADR-0016 refines the implementation (ProviderRouter class + circuit breaker).

### Mock Mode Tool Behavior

All 9 Phase 1 tools in Mock mode:
- Return seeded JSON from `web/public/mock/` (per ADR-0001 §API-0002)
- OR delegate to `MockProvider` (ADR-0001) which reads the same JSON
- `cost_usd: 0` (Mock is free)
- `source: "mock"`
- Zero external HTTP calls (FP-0005 compliance)

Mock data files (existing + new):
- `web/public/mock/qa_samples/*.json` (existing, ADR-0001)
- `web/public/mock/klines/*.json` (existing, ADR-0001)
- `web/public/mock/community/*.json` (existing, ADR-0001)
- `web/public/mock/user_profile.json` (new, ADR-0005)
- `web/public/mock/news/*.json` (new, this ADR - for `search_news` tool)
- `web/public/mock/macro/*.json` (new, this ADR - for `get_macro` tool)

### Loop Integration

Per ADR-0004, `StepHandler.onToolCall` is the integration point:

```typescript
// web/src/lib/agent/ask-handlers.ts (future, not yet implemented)

export class AskStepHandler implements StepHandler {
  async onToolCall(ctx: LoopContext, tool: ToolCall): Promise<ToolResult> {
    const handler = TOOL_REGISTRY[tool.name];
    if (!handler) {
      return toolFailure(`Unknown tool: ${tool.name}`, "validation", 0);
    }

    // Set default timeout if not specified
    const timeout = tool.timeout ?? 5000;

    // Execute with timeout
    try {
      const result = await Promise.race([
        handler(tool.parameters, ctx.env),
        new Promise<ToolResult>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool ${tool.name} timed out after ${timeout}ms`)), timeout)
        ),
      ]);
      return result;
    } catch (e) {
      return toolFailure(String(e), "timeout", timeout);
    }
  }
}
```

### Phase 2 MCP Integration (Deferred)

Phase 2 will add MCP protocol support for:
- `get_sentiment` (X/Reddit sentiment analysis via MCP server)
- `brokerage` MCP server (place_order, get_positions - per EP06)
- `playbook_hub` MCP server (search_playbooks, install - per EP07)

Phase 2 MCP design will be a separate ADR (ADR-0006 amendment or ADR-0006b) covering:
- `McpClient` class (JSON-RPC over HTTP/SSE)
- `MCP_SERVER_REGISTRY` (dynamic discovery)
- MCP tool naming convention (`mcp.{server_name}.{tool_name}`)
- MCP authentication (per-server)
- MCP fallback to native (if MCP server down, try native equivalent)

The current `TOOL_REGISTRY` static map will remain for native tools; MCP tools will be added via dynamic registration in Phase 2.

## Alternatives Considered

### Alternative 1: Full MCP for all tools (no native function call)

- **Description**: Use MCP protocol for all tools, including internal ones like `get_quote`. Every tool is an MCP server.
- **Pros**: Uniform protocol; easy to swap implementations; ecosystem-friendly.
- **Cons**: JSON-RPC serialization overhead (~2-5ms per call); requires running MCP servers (even for internal tools); adds operational complexity; EP01 §ID-1 "自研 ≤100 行编排器" implies minimal deps.
- **Rejection Reason**: Performance + complexity. Native function call is ~0.1ms (direct function invocation); MCP is ~2-5ms (serialize -> HTTP -> deserialize). For 9 internal tools, native is correct.

### Alternative 2: Dynamic tool registry (runtime registration)

- **Description**: Tools registered at runtime via `registerTool(name, handler)`. Allows plugins, user-defined tools.
- **Pros**: Extensible; supports user-defined tools; MCP tools can be registered dynamically.
- **Cons**: Loses type safety (handler signature not checked at compile time); harder to test (tool set varies); Phase 1 has fixed 9 tools - no need for dynamic registration; adds complexity for hypothetical future requirements.
- **Rejection Reason**: Phase 1 simplicity. Static registry is type-safe and testable. Phase 2 MCP can add a dynamic layer on top without breaking the static base.

### Alternative 3: Full MCP from Phase 1 (include external servers)

- **Description**: Implement MCP protocol from Phase 1, including brokerage and playbook_hub servers.
- **Pros**: Complete EP01 §ID-2 implementation; MCP testable from day 1.
- **Cons**: Brokerage (EP06) and Playbook Hub (EP07) are Phase 2+ Epics - their MCP servers don't exist yet; MCP adds JSON-RPC client + server lifecycle management; Phase 1 query volume doesn't justify external tool calls.
- **Rejection Reason**: Phase 2 Epics not ready. MCP for non-existent servers is premature.

### Alternative 4: Minimal ToolResult (no trace fields)

- **Description**: `ToolResult = { success, result, cost_usd, error? }`. No `latency_ms` or `source`.
- **Pros**: Simpler shape; less data to serialize.
- **Cons**: Loses trace observability (can't track which source was used or how long tool took); ADR-0004 TraceStep needs `latency_ms` and `source` for debugging; harder to diagnose tool failures in production.
- **Rejection Reason**: Trace fields are essential for observability (ADR-0014 future). `latency_ms` and `source` are cheap to collect (Date.now() diff + string field).

### Alternative 5: Keep both `get_quote` and `get_current_price` as aliases

- **Description**: `get_quote` and `get_current_price` both map to the same handler. LLM can use either name.
- **Pros**: Backward-compatible with both EP01 and EP03 docs; no GDD sync needed.
- **Cons**: Ambiguous; LLM may use both names interchangeably causing confusion; alias maintenance burden; violates "single canonical name" principle.
- **Rejection Reason**: C6 conflict resolution requires a single canonical name. `get_quote` is chosen (EP01 §ID-2 authoritative). EP03 §2.6 will be updated.

### Alternative 6: `search_news` as MCP (per EP01 §ID-2)

- **Description**: Classify `search_news` as MCP tool, defer to Phase 2.
- **Pros**: Consistent with EP01 §ID-2 tool table.
- **Cons**: EP03 §2.6 explicitly lists `search_news` in `INTERNAL_TOOLS` (native); Phase 1 needs news search capability for Ask Agent demos; deferring would break EP03 Job Story 6 ("通过 function call 调用 search_news").
- **Rejection Reason**: EP03 §2.6 overrides EP01 §ID-2 for `search_news` classification. Native in Phase 1; may upgrade to MCP in Phase 2 if external news API requires it.

## Consequences

### Positive

- **EP01 §ID-2 hybrid tool protocol formalized**: Native (Phase 1) + MCP (Phase 2) clearly separated.
- **ADR-0004 `onToolCall` integration point defined**: Sub-Agent handlers can now implement tool dispatch via `TOOL_REGISTRY[tool.name]`.
- **C6 conflict resolved**: `get_quote` is canonical; EP03 §2.6 will be updated.
- **`search_news` classification resolved**: Native in Phase 1 (per EP03 §2.6), overriding EP01 §ID-2.
- **9 Phase 1 tools with full metadata**: LLM function calling can use `TOOL_METADATA` array to select tools.
- **Source switching is tool-internal**: Each handler implements its own fallback chain (Yahoo -> Alpha -> Mock). Loop only retries ×3.
- **Mock mode compliant**: All tools return seeded JSON or delegate to MockProvider. Zero external HTTP (FP-0005).
- **Trace-ready**: `ToolResult.latency_ms` + `source` fields feed directly into ADR-0004 TraceStep.
- **Phase 2 MCP path clear**: Static registry + dynamic MCP layer can coexist in Phase 2 without breaking changes.

### Negative

- **9 tools only in Phase 1**: `get_sentiment`, `brokerage`, `playbook_hub` MCP tools deferred. EP06/EP07 MCP integration blocked until Phase 2.
- **Static registry lacks extensibility**: User-defined tools not supported in Phase 1. Phase 2 dynamic layer needed for plugin system.
- **Tool cost tracking is approximate**: `cost_usd: 0` for most tools (market data is free). Only LLM-based tools (e.g., `build_strategy` if it calls LLM) have non-zero cost. Actual API costs (Alpha Vantage premium, SEC EDGAR rate limits) not tracked per-call.
- **`search_news` native implementation requires RSS fetching**: Not a simple Mock JSON read. Needs RSS parser + feed URLs. May add 50-200ms latency per call.
- **EP01 §ID-2 vs EP03 §2.6 `search_news` classification discrepancy**: GDD sync needed to clarify `search_news` is native in Phase 1.
- **No tool authentication in Phase 1**: Tools assume public APIs (Yahoo, SEC EDGAR). Authenticated APIs (brokerage) deferred to Phase 2 MCP.

### Risks

- **Risk**: Yahoo Finance API rate-limits or breaks (no SLA on free tier).
  - **Mitigation**: Source switching to Alpha Vantage (free tier 25 calls/day); R2 cache (ADR-0002) for whitelisted symbols; Mock fallback for demo continuity.
- **Risk**: `search_news` RSS feeds change format or go offline.
  - **Mitigation**: Multiple RSS sources per ticker (Yahoo News + Google News + StockTwits); Mock fallback JSON for demo.
- **Risk**: Tool timeout (5s default) too short for slow APIs (SEC EDGAR XBRL parsing).
  - **Mitigation**: Per-tool timeout configurable via `ToolCall.timeout`; `get_earnings` may set 10s timeout.
- **Risk**: LLM hallucinates tool name not in registry.
  - **Mitigation**: `onToolCall` returns `toolFailure("Unknown tool: ...")` for unregistered names; LLM should use `TOOL_METADATA` for function calling.
- **Risk**: Phase 2 MCP integration breaks static registry assumptions.
  - **Mitigation**: MCP tools will use `mcp.{server}.{tool}` naming convention, avoiding collision with native tool names. Dynamic layer added on top, not replacing static registry.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP01 §ID-2 | "混合：MCP（外部数据源）+ 原生 function call（内部）" | Phase 1: 9 native tools; Phase 2: MCP for external servers. Hybrid model formalized. |
| EP01 §ID-2 | 10 built-in tools table (get_quote, get_ohlc, etc.) | 9 tools in Phase 1 TOOL_REGISTRY (search_news reclassified native per EP03 §2.6); get_sentiment deferred to Phase 2 MCP. |
| EP01 §ID-2 | `get_quote` tool name | Canonical name `get_quote` (resolves C6 conflict with EP03 §2.6 `get_current_price`). |
| EP01 §L5 Tool Calling | "Tool Calling" architecture layer | Static TOOL_REGISTRY + ToolHandler type define this layer. |
| EP01 §反模式 | "Sub-Agent 之间直接调用（必须通过 Supervisor）" | Tools invoked via loop's `onToolCall`, not direct Sub-Agent calls. `build_strategy` tool dispatches to Build Agent logic but goes through loop. |
| EP03 §2.6 | `INTERNAL_TOOLS` (get_current_price, get_earnings, search_news) | All 3 are in Phase 1 TOOL_REGISTRY. `get_current_price` renamed to `get_quote` (C6 resolution). |
| EP03 §2.6 | `MCP_SERVERS` (brokerage, playbook_hub, Phase 2) | Deferred to Phase 2 MCP integration. |
| EP03 §2.6 | `search_news` listed as INTERNAL_TOOLS | `search_news` is native in Phase 1 (per EP03 §2.6), overriding EP01 §ID-2 MCP classification. |
| EP03 Job Story 6 | "通过 function call 调用 `get_current_price`" | `get_quote` tool (renamed from `get_current_price` per C6 resolution) implements this. |
| ADR-0004 §onToolCall | `onToolCall(ctx, tool: ToolCall): Promise<ToolResult>` | This ADR defines `ToolCall` and `ToolResult` shapes consumed by ADR-0004. |
| ADR-0004 §executeWithFallback | "retry ×3, then switch source" | Retry ×3 is loop's job (ADR-0004); source switching is tool-internal (this ADR, per EP02 ID-4). |
| ADR-0004 §TOOL_RETRY_LIMIT=3 | Loop retries same tool ×3 | Tool handlers must be idempotent (same params → same result, or retriable failure). |
| TR-EP01-004 | Hybrid tool protocol: MCP (external) + native function call (internal) | Phase 1: 9 native; Phase 2: MCP. Hybrid model defined. |
| TR-EP03-011 | MCP + Function Call protocol (internal native, external MCP Phase 2) | Phase 1: native function call (9 tools); Phase 2: MCP protocol (deferred). |
| TR-EP06-013 | MCP broker server placeholder (Phase 2) | Phase 2 MCP integration will add brokerage server. Not in Phase 1 TOOL_REGISTRY. |

## Performance Implications

- **CPU**: Tool handler invocation: ~0.1ms (function call + param validation). Tool execution: varies (Mock ~1ms, Yahoo API ~200-500ms, SEC EDGAR ~1-3s).
- **Memory**: `TOOL_REGISTRY` static map: ~2KB (9 entries × ~200 bytes each). `TOOL_METADATA` array: ~3KB. Negligible.
- **Load Time**: Mock mode: ~1-10ms per tool (JSON file read). Real mode: 200ms-3s per tool (external API call).
- **Network**: Mock mode: zero (FP-0005). Real mode: 1 HTTP call per tool invocation (Yahoo/Alpha/SEC EDGAR/RSS). Source switching may add 2-3 calls if primary fails.
- **Cost**: Mock: $0. Real: $0 for free-tier APIs (Yahoo, Alpha Vantage 25/day, SEC EDGAR, FRED, RSS). Premium APIs (Alpha Vantage premium, Polygon) not used in Phase 1.

## Migration Plan

Current state: No tool layer exists. `web/src/lib/data/provider.ts` has `MockProvider` and `RealProvider` with `getKlines()`, `getQuote()`, `getEarnings()` methods - these are the data access layer, not the tool layer. ADR-0004 `StepHandler.onToolCall` is undefined.

Migration steps:

1. **Create `web/src/lib/tools/types.ts`** with `ToolCall`, `ToolResult`, `ToolHandler`, `ToolMetadata`, `toolSuccess()`, `toolFailure()` helpers.
2. **Create `web/src/lib/tools/registry.ts`** with `TOOL_REGISTRY` static map + `TOOL_METADATA` array.
3. **Create tool handler files** in `web/src/lib/tools/handlers/`:
   - `get-quote.ts` (delegates to `provider.getQuote()`)
   - `get-ohlc.ts` (delegates to `provider.getKlines()`)
   - `get-earnings.ts` (delegates to `provider.getEarnings()` or fetches SEC EDGAR)
   - `search-news.ts` (fetches RSS feeds - Yahoo News + Google News)
   - `get-macro.ts` (fetches FRED API)
   - `plot-chart.ts` (generates chart image via lightweight-charts SSR)
   - `build-strategy.ts` (delegates to Build Agent NL->DSL logic)
   - `run-backtest.ts` (delegates to Backtest Engine per future ADR-0009)
   - `save-dashboard.ts` (saves to D1 or KV)
4. **Create Mock data files**:
   - `web/public/mock/news/{ticker}.json` (seeded news for 10 mock symbols)
   - `web/public/mock/macro/{indicator}.json` (seeded GDP/CPI/rate data)
5. **Add unit tests** in `web/tests/unit/tool-registry.test.ts`:
   - `TOOL_REGISTRY` contains all 9 Phase 1 tools
   - `TOOL_METADATA` matches `TOOL_REGISTRY` keys
   - `getQuoteHandler({ ticker: "AAPL" }, mockEnv)` returns success with source: "mock"
   - `getQuoteHandler({ ticker: "INVALID" }, mockEnv)` returns failure
   - Unknown tool name returns `toolFailure("Unknown tool: ...")`
   - Mock mode: zero external HTTP calls (FP-0005)
   - Source switching: `getQuoteHandler` tries Yahoo, then Alpha, then fails (Real mode)
6. **Implement `AskStepHandler.onToolCall`** (per ADR-0004) with timeout enforcement.
7. **Update `web/src/lib/llm/router.ts`** to include `TOOL_METADATA` in LLM API request when intent is `tool_call`.
8. **Phase 2 (future)**: Implement `McpClient` + dynamic MCP tool registration. Add `get_sentiment`, `brokerage`, `playbook_hub` MCP tools.

## Validation Criteria

- [ ] `TOOL_REGISTRY` contains exactly 9 entries (Phase 1 native tools)
- [ ] `TOOL_METADATA` array has 9 entries matching `TOOL_REGISTRY` keys
- [ ] `getQuoteHandler({ ticker: "AAPL" }, mockEnv)` returns `{ success: true, source: "mock", cost_usd: 0 }`
- [ ] `getQuoteHandler({ ticker: "AAPL" }, realEnv)` returns `{ success: true, source: "yahoo" | "alpha_vantage" }`
- [ ] `getQuoteHandler({}, mockEnv)` returns `{ success: false, error: "Missing required parameter: ticker" }`
- [ ] `TOOL_REGISTRY["nonexistent_tool"]` returns `undefined`
- [ ] `onToolCall(ctx, { name: "nonexistent_tool", parameters: {} })` returns `toolFailure("Unknown tool: ...")`
- [ ] Mock mode: all 9 tool handlers make zero external HTTP calls (FP-0005)
- [ ] `getQuoteHandler` in Real mode tries Yahoo first, then Alpha Vantage on failure
- [ ] `ToolResult.cost_usd` is 0 for Mock mode and free-tier APIs
- [ ] `ToolResult.latency_ms` is populated (Date.now() diff)
- [ ] `ToolResult.source` reflects actual data source ("mock" | "yahoo" | "alpha_vantage" | "sec_edgar" | "fred" | "rss")
- [ ] Tool timeout (default 5000ms) enforced by `onToolCall` wrapper
- [ ] `search_news` handler returns seeded JSON in Mock mode (from `web/public/mock/news/{ticker}.json`)
- [ ] No module-level state in `registry.ts` or handler files (pure functions + static const)

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) - Accepted. Mock tools delegate to `MockProvider`; Real tools delegate to `RealProvider` or fetch directly.
- **ADR-0003** (LLM routing + cost_cap) - Accepted. `tool_call` intent routes to mid-tier LLM. `TOOL_METADATA` is included in LLM API request for function calling.
- **ADR-0004** (Agent Loop Design) - Proposed. `StepHandler.onToolCall` consumes `ToolCall`/`ToolResult` from this ADR. `executeWithFallback` retries ×3.
- **ADR-0009** (Backtest Engine, future) - `run_backtest` tool will delegate to Backtest Engine.
- **ADR-0014** (Observability Schema, future) - `ToolResult.latency_ms` + `source` feed into TraceStep.
- **EP01 §ID-2** - Originating design doc (hybrid tool protocol + 10 built-in tools).
- **EP03 §2.6** - `INTERNAL_TOOLS` + `MCP_SERVERS` definitions.
- **EP02 §ID-4** - Source switching priority chain (Yahoo -> Alpha -> Mock).
