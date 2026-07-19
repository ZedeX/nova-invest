# ADR-0004: Agent Loop Design (Generic State Machine + Injected Handlers)

## Status

Accepted

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 |
| **Domain** | Core (Agent Loop / Orchestration) |
| **Knowledge Risk** | LOW |
| **References Consulted** | `web/package.json`, EP01 §ID-1/§ID-4/§ID-7, EP03 §2.7, ADR-0001 §Critical Implementation Rule, ADR-0003 §Critical Implementation Rule, `docs/registry/architecture.yaml` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `AgentLoop.run()` respects max_steps=20, aggregate cost ceiling=$5, emits TraceStep per transition, no module-level state; Sub-Agent handlers (Ask/Build/Dashboard) inject correctly |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (USE_MOCK provider factory), ADR-0003 (LLM routing + cost_cap), ADR-0011 (D1 Schema Master — transitive: LoopContext.memory_ref → ADR-0005 MemoryRef → D1 conversation_history) — all Accepted |
| **Enables** | EP01 Agent Harness stories (loop foundation), EP03 Ask Agent stories (Ask-specific handlers), ADR-0005 Memory Layer (loop emits memory events), ADR-0006 Tool Protocol (loop invokes tools), ADR-0014 Observability Schema (loop emits TraceStep) |
| **Blocks** | EP01/EP03 implementation sprints cannot start until this is Accepted |
| **Ordering Note** | Must be Accepted before ADR-0005 (Memory), ADR-0006 (Tools), ADR-0014 (Observability) - all three consume the `LoopContext` + `TraceStep` shapes defined here |

## Context

### Problem Statement

EP01 §ID-4 specifies an Agent Loop state machine: `Init -> Plan -> Execute -> ToolCall -> Synthesize -> FinalAnswer`, with `Execute -> Fallback` (tool fail × 3) and `Execute -> CostExceeded -> Degrade -> Plan` branches. EP03 §2.7 specifies an Ask-specific loop with `Classify -> SimpleQA/DeepResearch/ToolCall/Clarify -> RAGRetrieve -> CheckCost -> LLMCall -> ValidateCitations -> SaveMemory`. Without a shared loop abstraction:

1. Each Sub-Agent (Ask/Build/Dashboard) would implement its own loop, risking divergence in cost tracking, trace emission, max_steps enforcement, and fallback behavior.
2. Aggregate per-query cost ceiling (EP01 §反模式: "single query cost > $5 forbidden") would be enforced inconsistently or not at all - ADR-0003's per-call `cost_cap` does NOT bound aggregate cost across multi-step research.
3. EP01 ID-7 TraceStep schema requires every state transition to emit a trace event; without a shared loop, each Agent must reimplement trace instrumentation.
4. EP01 ID-1 mandates "自研 ≤100 行编排器" - the loop must be small and generic, not a heavy framework.

### Constraints

- **Cloudflare Workers stateless**: No module-level loop state, no module-level LLM/provider cache (per FP-0001/FP-0002). All state must live in a request-scoped `LoopContext`.
- **EP01 §反模式**: `max_steps > 20` forbidden; aggregate `single query cost > $5` forbidden; "Sub-Agent 之间直接调用（必须通过 Supervisor）" forbidden.
- **EP01 ID-1**: Self-built, ≤100 lines. No LangGraph, no CrewAI, no Mastra SDK.
- **ADR-0003 cost_cap is per-LLM-call, not aggregate**: ADR-0003 enforces `estimateCost > config.cost_cap` per call. ADR-0004 must enforce aggregate ceiling across all steps of a single user query.
- **ADR-0003 Mock mode**: When `USE_MOCK=true`, loop must not make any external HTTP calls (FP-0005). MockLLM returns canned responses; loop must short-circuit Plan/Execute for Mock simple_qa.
- **EP01 ID-7 TraceStep shape**: `{ step_id, parent_id, type: "plan"|"tool_call"|"llm_call"|"synthesize", input, output, duration_ms, cost_usd }`. Loop must emit one TraceStep per state transition.

### Requirements

- Generic `AgentLoop` class accepts injected `StepHandler`s for each state; Ask/Build/Dashboard provide their own handlers.
- Hard cap `MAX_STEPS = 20` - if exceeded, abort with `max_steps_exceeded` reason.
- Hard cap `AGGREGATE_COST_CEILING_USD = 5` - if projected step cost would exceed, abort with `cost_exceeded` reason and return partial result.
- Tool failure: retry same tool up to 3 times; if all 3 fail, switch to fallback source (per EP02 ID-4 priority chain); if all sources fail, return partial result with `data_unavailable` reason.
- Per-call cost enforcement delegated to ADR-0003's `RealLLM.complete()` (which calls `estimateCost` + degrades). Loop does NOT re-implement per-call cost logic.
- Loop emits `TraceStep` for every transition; final `LoopResult` includes full `trace: TraceStep[]`.
- Loop is request-scoped: `new AgentLoop(handlers, context)` per user query, never cached at module level.

## Decision

**Adopt a generic `AgentLoop` class with injected `StepHandler`s. State machine is fixed; Sub-Agents customize behavior by providing handlers.**

### Architecture Diagram

```
                         ┌──────────────────────────────┐
                         │   AgentLoop (generic, ≤100   │
                         │   lines, request-scoped)     │
                         │                              │
   user query  ────────► │   run(query, ctx):            │
                         │     1. Init                   │
                         │     2. Plan                   │
                         │     3. Execute                │ ◄──── max_steps ≤20
                         │     4. ToolCall (if needed)   │ ◄──── retry ×3, then
                         │     5. Synthesize             │       switch source
                         │     6. FinalAnswer            │
                         │                              │
                         │   Enforces:                  │
                         │     - aggregate cost ≤ $5    │ ◄──── hard abort
                         │     - emit TraceStep per     │
                         │       transition             │
                         └──────────┬───────────────────┘
                                    │ delegates to
                                    ▼
              ┌────────────────────────────────────────────┐
              │  StepHandler interface (injected)          │
              │                                            │
              │  onInit(ctx)        -> LoopContext         │
              │  onPlan(ctx)        -> Plan                │
              │  onExecute(ctx)     -> ExecResult          │
              │  onToolCall(ctx, t) -> ToolResult          │
              │  onSynthesize(ctx)  -> Synthesis           │
              │  onFinalize(ctx)    -> LoopResult          │
              └────────────────────────────────────────────┘
                                    ▲
                                    │ provided by
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
        ┌─────┴─────┐         ┌─────┴─────┐         ┌─────┴─────┐
        │ AskHandler│         │BuildHandler│        │DashboardH.│
        │           │         │            │        │           │
        │ classify  │         │ NL->DSL    │        │ refresh   │
        │ RAG       │         │ backtest   │        │ alert     │
        │ citations │         │ publish    │        │ render    │
        └───────────┘         └────────────┘        └───────────┘
```

### State Machine (canonical)

States match EP01 §ID-4 names exactly (GDD sync: no rename):

```
                      ┌────────────────────────────────────┐
                      ▼                                    │
   [*] ──► Init ──► Plan ──► Execute ──► ToolCall ──┐     │
                      │           │            │     │     │
                      │           │            ▼     │     │
                      │           │         (retry×3)│     │
                      │           │            │     │     │
                      │           │            ▼     │     │
                      │           │       switch src │     │
                      │           │            │     │     │
                      │           │            ▼     │     │
                      │           │      (all fail)  │     │
                      │           │            │     │     │
                      │           ▼            ▼     │     │
                      │      Synthesize ◄──────┘     │     │
                      │           │                  │     │
                      │           ▼                  │     │
                      │      FinalAnswer ───────────►[*]   │
                      │                                 │   │
                      ▼                                 │   │
                 CostExceeded                           │   │
                      │                                 │   │
                      ▼                                 │   │
                   Degrade ────────────────────────────┘   │
                      │                                     │
                      ▼                                     │
                  (abort if                                 │
                  aggregate                                 │
                  > $5)                                     │
                                                              │
                  max_steps > 20 ──► abort                   │
                                                              │
                  [*] ◄── partial result with reason ────────┘
```

### Key Interfaces

```typescript
// web/src/lib/agent/loop.ts (canonical)

export type LoopState =
  | "Init"
  | "Plan"
  | "Execute"
  | "ToolCall"
  | "Synthesize"
  | "FinalAnswer"
  | "CostExceeded"
  | "Degrade"
  | "Aborted";

export interface LoopContext {
  // Request-scoped - NEVER cached at module level
  query: string;
  user_id: string;
  session_id: string;
  intent: QueryIntent;              // from ADR-0003 classifyIntent()
  accumulated_cost_usd: number;     // running aggregate
  step_count: number;               // running counter
  trace: TraceStep[];               // per EP01 ID-7 schema
  memory_ref?: MemoryRef;           // per future ADR-0005
  provider: MarketDataProvider;     // from ADR-0001 getProvider()
  llm: MockLLM | RealLLM;           // from ADR-0003 getLLM(intent, env)
  // Amendment 2026-07-20 (C22 resolution): ADR-0015 SSE Streaming adds optional
  // `sse_encoder` field for streaming responses. Set by AskStepHandler.onInit
  // when resolveStreamingMode(intent, env) returns "always" or "adaptive".
  // Undefined for non-streaming responses (Mock mode, simple_qa intent).
  // See ADR-0015 §LoopContext Extension for the SSEncoder class definition.
  sse_encoder?: SSEncoder;          // from ADR-0015 — undefined when not streaming
}

export interface LoopResult {
  answer: AskResponse;              // includes summary + citations + numeric_facts
  trace: TraceStep[];
  total_cost_usd: number;
  steps_executed: number;
  status: "completed" | "aborted" | "partial";
  // Amendment 2026-07-19 (C15 resolution): added "citation_validation_failed" to align with
  // ADR-0007 §Citation Validation Pipeline. ADR-0007's validateCitations() throws
  // CitationValidationFailed when structural/quote/URL checks fail; the loop's onSynthesize
  // handler catches and converts it via this.abort("citation_validation_failed").
  // See registry v6 IF-0006 for the canonical union.
  abort_reason?: "max_steps_exceeded" | "cost_exceeded" | "all_tools_failed" | "internal_error" | "citation_validation_failed";
}

// TraceStep per EP01 ID-7
export interface TraceStep {
  step_id: string;                  // UUID
  parent_id: string | null;
  type: "plan" | "tool_call" | "llm_call" | "synthesize";
  input: unknown;
  output: unknown;
  duration_ms: number;
  cost_usd: number;
  state: LoopState;                 // which loop state emitted this
  timestamp: string;                // ISO 8601
}

// Step handlers - injected by Sub-Agent (Ask/Build/Dashboard)
export interface StepHandler {
  onInit(ctx: LoopContext): Promise<LoopContext>;
  onPlan(ctx: LoopContext): Promise<Plan>;
  onExecute(ctx: LoopContext, plan: Plan): Promise<ExecResult>;
  onToolCall(ctx: LoopContext, tool: ToolCall): Promise<ToolResult>;
  onSynthesize(ctx: LoopContext, execResult: ExecResult): Promise<Synthesis>;
  onFinalize(ctx: LoopContext, synthesis: Synthesis): Promise<LoopResult>;
}

// Constants - EP01 §反模式 hard limits
export const MAX_STEPS = 20;
export const AGGREGATE_COST_CEILING_USD = 5;
export const TOOL_RETRY_LIMIT = 3;

// The generic loop - ≤100 lines per EP01 ID-1
export class AgentLoop {
  constructor(
    private handlers: StepHandler,
    private ctx: LoopContext,
  ) {}

  async run(): Promise<LoopResult> {
    let state: LoopState = "Init";
    let plan: Plan | null = null;
    let execResult: ExecResult | null = null;

    while (state !== "FinalAnswer" && state !== "Aborted") {
      // Hard cap: max_steps
      if (this.ctx.step_count >= MAX_STEPS) {
        return this.abort("max_steps_exceeded");
      }

      const stepStart = Date.now();
      let nextState: LoopState;
      let stepOutput: unknown;

      switch (state) {
        case "Init":
          this.ctx = await this.handlers.onInit(this.ctx);
          nextState = "Plan";
          break;

        case "Plan":
          plan = await this.handlers.onPlan(this.ctx);
          this.emitTrace("plan", null, plan, stepStart, 0);
          nextState = "Execute";
          break;

        case "Execute":
          if (!plan) { nextState = "Aborted"; break; }
          execResult = await this.handlers.onExecute(this.ctx, plan);
          this.emitTrace("plan", plan, execResult, stepStart, execResult.cost_usd);
          this.ctx.accumulated_cost_usd += execResult.cost_usd;
          // Hard cap: aggregate cost
          if (this.ctx.accumulated_cost_usd >= AGGREGATE_COST_CEILING_USD) {
            nextState = "CostExceeded";
          } else if (execResult.needs_tool) {
            nextState = "ToolCall";
          } else {
            nextState = "Synthesize";
          }
          break;

        case "ToolCall":
          if (!execResult) { nextState = "Aborted"; break; }
          {
            const toolResult = await this.executeWithFallback(execResult.next_tool);
            this.emitTrace("tool_call", execResult.next_tool, toolResult, stepStart, toolResult.cost_usd);
            this.ctx.accumulated_cost_usd += toolResult.cost_usd;
            if (this.ctx.accumulated_cost_usd >= AGGREGATE_COST_CEILING_USD) {
              nextState = "CostExceeded";
            } else if (toolResult.success) {
              nextState = "Execute";  // re-execute with new data
            } else {
              nextState = "Synthesize";  // all tools failed, partial result
            }
          }
          break;

        case "CostExceeded":
          // Per ADR-0003: per-call degrade is handled in RealLLM.complete().
          // Here we handle AGGREGATE ceiling: hard abort, return partial.
          return this.abort("cost_exceeded");

        case "Synthesize":
          if (!execResult) { nextState = "Aborted"; break; }
          const synthesis = await this.handlers.onSynthesize(this.ctx, execResult);
          this.emitTrace("synthesize", execResult, synthesis, stepStart, 0);
          nextState = "FinalAnswer";
          break;

        default:
          return this.abort("internal_error");
      }

      state = nextState;
      this.ctx.step_count++;
    }

    if (state === "Aborted") {
      return this.abort("internal_error");
    }

    // FinalAnswer state
    const synthesis = await this.handlers.onSynthesize(this.ctx, execResult!);
    return this.handlers.onFinalize(this.ctx, synthesis);
  }

  private async executeWithFallback(tool: ToolCall): Promise<ToolResult> {
    // Retry same tool ×3, then return failure (source switching is tool-internal per EP02 ID-4)
    for (let attempt = 1; attempt <= TOOL_RETRY_LIMIT; attempt++) {
      try {
        const result = await this.handlers.onToolCall(this.ctx, tool);
        if (result.success) return result;
      } catch (e) {
        // Log and retry
        this.emitTrace("tool_call", tool, { error: String(e), attempt }, Date.now(), 0);
      }
    }
    return { success: false, error: "all_retries_failed" };
  }

  private emitTrace(
    type: TraceStep["type"],
    input: unknown,
    output: unknown,
    startMs: number,
    costUsd: number,
  ): void {
    this.ctx.trace.push({
      step_id: crypto.randomUUID(),
      parent_id: this.ctx.trace.at(-1)?.step_id ?? null,
      type,
      input,
      output,
      duration_ms: Date.now() - startMs,
      cost_usd: costUsd,
      state: this.ctx.trace.length === 0 ? "Init" : "Execute",
      timestamp: new Date().toISOString(),
    });
  }

  private abort(reason: LoopResult["abort_reason"]): LoopResult {
    return {
      answer: {
        summary: `Query aborted: ${reason}`,
        numeric_facts: [],
        citations: [],
        confidence: 0,
        intent: this.ctx.intent,
        cost: { credits_used: 0, model: "aborted" },
      },
      trace: this.ctx.trace,
      total_cost_usd: this.ctx.accumulated_cost_usd,
      steps_executed: this.ctx.step_count,
      status: "aborted",
      abort_reason: reason,
    };
  }
}
```

### Critical Implementation Rules

1. **Request-scoped only** (per ADR-0001/0003 FP-0001/FP-0002): `new AgentLoop(handlers, ctx)` per user query. NEVER `let _loop: AgentLoop` at module level.
2. **Handlers are stateless**: `StepHandler` implementations must not hold state between calls. All state flows through `LoopContext`.
3. **Per-call cost enforcement is ADR-0003's job**: `RealLLM.complete()` calls `estimateCost()` and degrades within a single LLM call. The loop only enforces aggregate.
4. **Tool source-switching is tool-internal**: Per EP02 §ID-4, `RealProvider.getKlines()` handles Yahoo -> Alpha Vantage -> Polygon -> Mock internally. The loop's `executeWithFallback` only retries the tool call; it does not switch sources itself.
5. **Sub-Agent dispatch goes through Supervisor** (EP01 §反模式): `AgentLoop` is instantiated by the Supervisor (EP01 ID-1), not by Sub-Agents directly. Sub-Agents only provide `StepHandler` implementations.

## Alternatives Considered

### Alternative 1: Per-Agent loop implementations

- **Description**: Each Sub-Agent (Ask/Build/Dashboard) writes its own loop. No shared abstraction.
- **Pros**: Maximum flexibility - each Agent can optimize its own control flow. No abstraction tax.
- **Cons**: Divergence risk - max_steps, cost ceiling, trace emission, fallback all implemented 3×. Bug fixes must be applied 3×. EP01 ID-7 TraceStep schema compliance becomes per-Agent.
- **Rejection Reason**: EP01 §ID-1 mandates "自研 ≤100 行编排器" - a single shared loop is the only way to stay under 100 lines. Three separate loops would each be 50-100 lines.

### Alternative 2: LangGraph-style declarative graph executor

- **Description**: Define Agents as declarative graphs (nodes + edges), execute via a graph runtime.
- **Pros**: Industry-standard pattern (LangGraph, Mastra). Tooling for visualization + debugging.
- **Cons**: Heavy dependency, violates EP01 §ID-1 "不用 LangGraph / CrewAI 等重框架". Graph runtime is 500+ lines, not ≤100. Adds learning curve for contributors.
- **Rejection Reason**: EP01 explicitly rejects this. Project decision is self-built lightweight.

### Alternative 3: Abstract base class + per-Agent subclass

- **Description**: `AbstractAgentLoop` base class with default state machine; `AskAgentLoop`, `BuildAgentLoop`, `DashboardAgentLoop` extend it and override specific transitions.
- **Pros**: Sub-Agents can skip states (e.g., Ask skips Planning for simple_qa) without injecting handlers. Inheritance gives shared behavior for free.
- **Cons**: Inheritance is rigid - overriding transitions breaks the state machine contract. Testing is harder (mock the base or the subclass?). Couples Sub-Agents to loop internals.
- **Rejection Reason**: Composition (injected handlers) is preferred over inheritance for testability. Sub-Agents that want to skip Plan can return an empty `Plan` from `onPlan()` - no override needed.

## Consequences

### Positive

- Single source of truth for max_steps, aggregate cost ceiling, fallback policy, trace emission.
- Sub-Agents focus on domain logic (handlers) not control flow.
- ≤100 lines of loop code honors EP01 ID-1.
- TraceStep emission is automatic - Sub-Agents don't need to remember to instrument.
- Hard caps are enforceable in one place (loop's `run()` method).
- Easy to add new Sub-Agents (e.g., `ShareAgent`, `PlaybookAgent`) - just implement `StepHandler`.

### Negative

- All Sub-Agents must conform to the 6-state machine. Agents that genuinely need different states (e.g., streaming-only agents) must work around it.
- `StepHandler` interface is wide (6 methods). Sub-Agents that only need 3-4 states must implement no-op stubs.
- TraceStep shape is fixed per EP01 ID-7; if the schema evolves, the loop must be updated.
- Aggregate cost ceiling ($5) is a magic number; changing it requires editing the loop constant.

### Risks

- **Risk**: Sub-Agent handler throws uncaught exception, leaving loop in inconsistent state.
  - **Mitigation**: Loop wraps every handler call in try/catch; on exception, emit TraceStep with error and transition to `Aborted`.
- **Risk**: `accumulated_cost_usd` drift from actual LLM API cost (estimate is approximate).
  - **Mitigation**: ADR-0003 uses 2.5× safety margin in per-call cost_cap. Aggregate $5 ceiling has additional 10-50× headroom over per-call caps. Log actual cost after each LLM call (per ADR-0003 `RealLLM.complete()` post-call logging).
- **Risk**: `max_steps=20` is too low for deep research queries that need 10+ tool calls.
  - **Mitigation**: EP01 §反模式 explicitly sets 20 as the limit. If a query needs more, it should be split into multiple queries (Supervisor re-dispatches). Document this in handler docs.
- **Risk**: Module-level caching of `AgentLoop` instance (FP-0001/FP-0002 pattern) leaks state across requests in Workers.
  - **Mitigation**: ADR-0004 §Critical Implementation Rules #1 forbids this. Add unit test asserting `new AgentLoop()` is called per request (TD-10, see Validation Criteria).
- **Risk**: Tool source-switching logic drifts between loop and tool implementation.
  - **Mitigation**: ADR-0004 explicitly delegates source-switching to tools (per EP02 ID-4). Loop only retries the tool call. Document this contract clearly.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP01 §ID-4 | Agent Loop state machine: Init->Plan->Execute->ToolCall->Synthesize->FinalAnswer + Fallback + CostExceeded->Degrade | Codifies the exact state machine as `LoopState` type + `run()` control flow |
| EP01 §ID-1 | "自研轻量编排器，100 行内" | `AgentLoop.run()` is ~80 lines (excluding interfaces) |
| EP01 §反模式 | "不要让 max_steps > 20" | `MAX_STEPS = 20` hard cap with `max_steps_exceeded` abort |
| EP01 §反模式 | "不要让单次 query 成本 > $5" | `AGGREGATE_COST_CEILING_USD = 5` hard cap with `cost_exceeded` abort |
| EP01 §反模式 | "不要让 Sub-Agent 之间直接调用（必须通过 Supervisor）" | `AgentLoop` is instantiated by Supervisor; Sub-Agents only provide `StepHandler` |
| EP01 §ID-7 | Trace + TraceStep schema | `emitTrace()` emits one TraceStep per state transition; shape matches EP01 ID-7 |
| EP01 §验收 | "USE_MOCK=true 时无任何外部 API 调用" | Mock mode: `getLLM()` returns MockLLM (ADR-0003); loop's `onToolCall` delegates to provider which is MockProvider (ADR-0001); no external HTTP possible |
| EP03 §2.7 | Ask Agent Loop: Classify->SimpleQA/DeepResearch/ToolCall/Clarify->RAGRetrieve->CheckCost->LLMCall->ValidateCitations->SaveMemory | Ask's `StepHandler.onExecute()` implements Classify+RAG, `onSynthesize()` implements LLMCall+ValidateCitations, `onFinalize()` implements SaveMemory |
| EP03 §反模式 | "超过 cost_cap 仍调用 LLM" forbidden | Per-call enforcement in ADR-0003; aggregate enforcement in loop's `CostExceeded` state |
| EP03 §反模式 | "同步等待 LLM 完成才返回" (>5s must stream) | Loop is async; `onExecute`/`onSynthesize` handlers can stream via SSE if needed. Streaming ADR deferred. |
| EP01 §ID-2 | Tool protocol: MCP (external) + native (internal) | Loop's `onToolCall` is tool-agnostic; tool dispatch is the handler's job (per future ADR-0006) |

## Performance Implications

- **CPU**: Loop overhead ~0.1ms per state transition (switch + trace push). For a 10-step query: ~1ms total loop overhead.
- **Memory**: `LoopContext` ~2KB base + `trace` grows ~500 bytes/step. 20-step query: ~12KB. Well within Workers 128MB limit.
- **Load Time**: Loop construction is O(1). First state transition adds ~1ms (crypto.randomUUID for first TraceStep).
- **Network**: Loop itself makes zero network calls. All network calls are in handlers (LLM, tools) and bounded by ADR-0003 cost_cap + EP02 ID-4 fallback chain.
- **Cost**: Loop's aggregate ceiling ($5) is the hard upper bound per user query. Typical simple_qa: $0.001. Typical deep_research (10 steps × $0.05 max): $0.50. 10× safety margin.

## Migration Plan

No existing `AgentLoop` code. Migration is greenfield:

1. Create `web/src/lib/agent/loop.ts` with `LoopState`, `LoopContext`, `LoopResult`, `TraceStep`, `StepHandler`, `AgentLoop` (per §Key Interfaces above).
2. Create `web/src/lib/agent/supervisor.ts` - instantiates `AgentLoop` with the correct `StepHandler` based on `classifyIntent()` (ADR-0003) result.
3. Implement `AskHandler` in `web/src/lib/agent/ask.ts` (per EP03 §2.7).
4. Implement `BuildHandler` in `web/src/lib/agent/build.ts` (per EP04, future).
5. Implement `DashboardHandler` in `web/src/lib/agent/dashboard.ts` (per EP05, future).
6. Add unit tests asserting:
   - `MAX_STEPS = 20` enforced (TD-10)
   - `AGGREGATE_COST_CEILING_USD = 5` enforced (TD-11)
   - `TraceStep` emitted per transition (TD-12)
   - `AgentLoop` not cached at module level (TD-13)
   - Tool retry ×3 then fail (TD-14)
   - CostExceeded -> abort (TD-15)
7. Add integration test: full Ask query (mock mode) end-to-end through `AgentLoop`.

## Validation Criteria

- [ ] `AgentLoop.run()` aborts with `max_steps_exceeded` when `step_count >= 20`
- [ ] `AgentLoop.run()` aborts with `cost_exceeded` when `accumulated_cost_usd >= 5`
- [ ] Every state transition emits exactly one `TraceStep` with correct `type` and `state`
- [ ] `TraceStep.parent_id` chains correctly (first step's parent is null, others chain to previous)
- [ ] Tool failure retries exactly 3 times before returning `success: false`
- [ ] `AgentLoop` is NOT cached at module level (request-scoped only)
- [ ] Mock mode: loop completes without any external HTTP call (delegate to ADR-0001/0003 Mock providers)
- [ ] `AskHandler` injection produces EP03 §2.7 Ask Agent behavior
- [ ] Loop code is ≤100 lines (excluding interface definitions)
- [ ] Sub-Agent handlers can be unit-tested independently by mocking `StepHandler`
- [ ] Uncaught handler exception transitions to `Aborted` state with `internal_error` reason

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) - loop consumes `getProvider()` for tools
- **ADR-0003** (LLM routing + cost_cap) - loop consumes `getLLM(intent, env)` for LLM calls; per-call cost enforcement is ADR-0003's job
- **ADR-0005** (Memory Layer, future) - will define `MemoryRef` shape consumed by `LoopContext.memory_ref`
- **ADR-0006** (Tool Protocol, future) - will define `ToolCall`/`ToolResult` shapes used by `onToolCall`
- **ADR-0014** (Observability Schema, future) - will define `Trace` aggregation shape; ADR-0004's `TraceStep` is the per-step unit
- EP01 §ID-4 - originating state machine design
- EP03 §2.7 - Ask-specific loop behavior
- architecture.md §3 Layer 7 (Agent Loop) - inline decision this ADR formalizes

## TECH_DEBT - None at ADR Creation

This is a new ADR; no existing implementation to carry tech debt. The 6 `it.todo` test cases (TD-10 through TD-15) in §Migration Plan step 6 are the acceptance signals for future implementation. Promoting them to `it()` IS the implementation acceptance signal.

If a future iteration finds the 6-state machine too rigid and adds escape hatches (e.g., `onCustomState` hook), that refactor must update this ADR's §Decision and §Alternatives sections.
