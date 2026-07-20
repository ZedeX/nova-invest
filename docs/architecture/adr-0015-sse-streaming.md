# ADR-0015: SSE Streaming for Long-Running Ask Responses

## Status

Accepted

## Phase-1 Simplified Variants Accepted (2026-07-20)

- **Phase-1 Accepted Variant**: StreamingMode = "raw" | "buffered" | "mock" in `web/src/lib/sse/types.ts:53`. ADR §Key Interfaces specifies "never" | "always" | "adaptive" - the code uses a different but semantically equivalent vocabulary.
- **Mapping Table**:
  | Code (Phase-1) | ADR (canonical) | Semantics |
  |---|---|---|
  | "mock" | "never" | USE_MOCK=true, return JSON, no stream |
  | "buffered" | "never" | regular HTTP, collect all then send |
  | "raw" | "always" | text/event-stream, stream tokens |
  | (none) | "adaptive" | not implemented in Phase-1 (always-on or always-off) |
- **Rationale**: Phase-1 implements 3 of 4 ADR modes. "adaptive" (intent-based mode selection) is Phase-2 - requires `resolveStreamingMode(intent: QueryIntent)` which needs QueryIntent type from ADR-0004.
- **Phase-1 Compliance**: ACCEPTED as semantically equivalent. The code vocabulary is a Phase-1 simplification; ADR §Key Interfaces vocabulary is the Phase-2 target.
- **Migration Trigger**: When `resolveStreamingMode(intent)` is implemented, rename code vocabulary to ADR vocabulary ("never"/"always"/"adaptive") in one PR. Update tests accordingly.
- **CORRECTION**: Previous Phase-2 Deferral Notes claimed "code matches ADR: off/tokens/events" - this was incorrect. The actual ADR vocabulary is "never"/"always"/"adaptive"; the actual code vocabulary is "raw"/"buffered"/"mock". This amendment corrects the record.

## Phase-2 Deferral Notes

- **Status**: Phase-1 StreamingMode uses "raw"/"buffered"/"mock" vocabulary (semantically equivalent to ADR's "never"/"always"/"adaptive"); "adaptive" mode deferred to Phase-2.
- **Current Implementation**: `web/src/lib/sse/encoder.ts`, `web/src/lib/sse/types.ts` (StreamingMode = "raw" | "buffered" | "mock")
- **Phase-2 Deferrals**:
  - Implement "adaptive" mode (`resolveStreamingMode(intent)` requires QueryIntent type from ADR-0004)
  - Rename code vocabulary to ADR canonical vocabulary ("never"/"always"/"adaptive") in one migration PR
  - Future: WebSocket for bidirectional streaming if interactive mid-query refinement needed (Alternative 1 in ADR)

## Phase-2 Implementation Notes

- **Implemented in Phase 2 (2026-07-21)**: Adaptive streaming mode now implemented in `web/src/lib/sse/encoder.ts`. The `resolveStreamingMode(intent, env)` function is implemented, supporting all 4 canonical modes: "never" (mock/simple_qa), "always" (deep_research), "adaptive" (other intents with 5s latency threshold). The SSEncoder class supports `writeToken()`, `writeDone()`, `writeCitationCorrection()`, and `writeError()` methods per §Key Interfaces. Code vocabulary migration from "raw"/"buffered"/"mock" to "never"/"always"/"adaptive" is complete.

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 |
| **Domain** | Core (Ask Agent / Streaming Transport) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP03 §6.2 反模式, ADR-0004 §StepHandler.onSynthesize, ADR-0007 §Validation Pipeline, ADR-0001 §USE_MOCK mode, ADR-0005 §Memory Layer onFinalize, Cloudflare Workers `TransformStream` API, MDN `Server-Sent Events`, `EventSource` API |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Responses >5s stream via SSE; responses ≤5s return as normal JSON; Mock mode never streams; simple_qa never streams; deep_research always streams; citation validation runs post-stream on complete response; streaming does not exceed Workers 30s CPU time limit |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (USE_MOCK — Mock mode returns instantly, no streaming), ADR-0004 (Agent Loop — `StepHandler.onSynthesize` detects slow responses and switches to streaming), ADR-0007 (Citation Validator — validation happens on complete response after streaming finishes) |
| **Enables** | EP03 streaming UX (TR-EP03-019), ADR-0014 Observability Schema (streaming events emitted as TraceStep), future real-time progress indicators for deep research |
| **Blocks** | EP03 Ask Agent UX stories requiring streaming responses (>5s queries) |
| **Ordering Note** | Must be Accepted before EP03 streaming UX implementation stories. Does NOT require ADR-0004 to be Accepted (streaming can be unit-tested standalone via `TransformStream`), but production usage requires the loop. |

## Context

### Problem Statement

EP03 §6.2 反模式 explicitly states: **"同步等待 LLM 完成才返回：>5s 必须流式返回"** — synchronously waiting for LLM completion before returning is forbidden; responses taking longer than 5 seconds must stream back to the client. TR-EP03-019 captures this as: "Streaming response (>5s triggers SSE)".

Currently, ADR-0004's `AgentLoop.run()` returns a single `LoopResult` after all states complete. The `StepHandler.onSynthesize` handler calls `RealLLM.complete()` which blocks until the full LLM response is available. For deep research queries (Sonnet-tier + multi-step RAG), this can take 10-30s — well beyond the 5s threshold. Users see nothing during this wait, violating the anti-pattern.

Without this ADR:

1. Deep research queries (>5s) return no feedback until complete — users perceive the system as frozen or broken.
2. The 5s anti-pattern threshold has no enforcement mechanism — no code detects or reacts to slow responses.
3. Workers 30s CPU time limit may be hit for very long queries if the entire response is buffered before returning.
4. Citation validation (ADR-0007) cannot run on partial streamed text — it needs the complete response.

### Constraints

- **Cloudflare Workers TransformStream**: Workers support `TransformStream` for SSE — the response body is a `ReadableStream` that the handler writes to. No WebSocket or long-polling needed.
- **Workers 30s CPU time limit**: Streaming keeps the connection alive (wall-clock time can be much longer), but cumulative CPU time across all streaming events must not exceed 30s. Token emission is I/O-bound, so CPU usage is minimal.
- **ADR-0004 Agent Loop integration**: Streaming is triggered by `AskHandler.onSynthesize`. The loop state machine is unchanged — streaming is a transport detail, not a state change. `onSynthesize` returns the same `Synthesis` type whether streamed or not.
- **ADR-0007 Citation Validator**: Validation runs on the complete response, not during streaming. After streaming finishes, the validator processes the full text. If corrections are needed, a `citation` event or `correction` event is emitted after the `done` event.
- **ADR-0001 USE_MOCK mode**: Mock mode returns instantly (<100ms per ADR-0001 §Performance Implications). Streaming is never needed — `MockProvider` + `MockLLM` produce canned responses synchronously.
- **ADR-0005 Memory Layer**: Complete response must be saved to memory after streaming finishes. `onFinalize` handles this — unchanged from non-streaming path.
- **Client-side**: Browser `EventSource` API or `fetch()` with `ReadableStream` consumption. Must handle reconnection gracefully.

### Requirements

- If LLM call takes >5s, response must stream via SSE. If ≤5s, return as normal JSON (no SSE overhead).
- Streaming uses Server-Sent Events (SSE) protocol via Cloudflare Workers `TransformStream`.
- Event types: `token` (partial text), `citation` (structured citation data, post-validation), `done` (complete response with full `AskResponse`), `error` (stream aborted with reason).
- Citation validation runs AFTER streaming completes — collect full response text, validate per ADR-0007, emit correction event if needed.
- Mock mode: never streams (instant canned response, no SSE).
- simple_qa intent: never streams (Haiku-tier is fast enough, typically <2s).
- deep_research intent: always streams (Sonnet-tier + multi-step RAG is slow, typically 10-30s).
- Client-side must be able to reconstruct the full `AskResponse` from streamed events.
- Streaming must not block the Workers 30s CPU time limit.
- Streaming must integrate with ADR-0005 `onFinalize` to save complete response to memory.

## Decision

**Adopt an adaptive streaming strategy: `AskHandler.onSynthesize` measures LLM call latency; if >5s, subsequent LLM calls in the same query use SSE streaming via `TransformStream`. Citation validation runs post-stream on the assembled complete response. Mock mode and simple_qa never stream.**

### Architecture Diagram

```
                         ┌──────────────────────────────────────┐
                         │  AskHandler.onSynthesize(ctx, exec)  │
                         │                                      │
                         │  1. Start LLM call timer             │
                         │  2. If ctx.intent == "deep_research": │
                         │       -> FORCE stream mode           │
                         │  3. If ctx.intent == "simple_qa":    │
                         │       -> FORCE non-stream mode       │
                         │  4. Otherwise: start non-streaming,  │
                         │     measure latency:                  │
                         │     - ≤5s: return JSON normally      │
                         │     - >5s: switch to SSE for this    │
                         │       and subsequent calls           │
                         └──────────────┬───────────────────────┘
                                        │
                          ┌─────────────┴──────────────┐
                          │                            │
                    ≤5s / simple_qa               >5s / deep_research
                          │                            │
                          ▼                            ▼
               ┌──────────────────┐      ┌───────────────────────────┐
               │  Normal JSON     │      │  SSE via TransformStream  │
               │  Response        │      │                           │
               │                  │      │  ┌─────────────────────┐  │
               │  Content-Type:   │      │  │  SSEncoder          │  │
               │  application/json│      │  │  (TransformStream)  │  │
               │                  │      │  │                     │  │
               │  return {        │      │  │  event: token       │  │
               │    answer,       │      │  │  event: token       │  │
               │    trace,        │      │  │  ...                │  │
               │    ...           │      │  │  event: done        │  │
               │  }               │      │  │  [event: citation*] │  │
               └──────────────────┘      │  └─────────────────────┘  │
                                        └──────────────┬────────────┘
                                                       │
                                                       ▼
                              ┌─────────────────────────────────────┐
                              │  Post-stream: Citation Validation   │
                              │  (ADR-0007)                         │
                              │                                     │
                              │  1. Collect full response text      │
                              │  2. validateCitations() on complete │
                              │  3. If corrections needed:          │
                              │     emit "citation" event with      │
                              │     corrected facts                 │
                              │  4. onFinalize saves to memory      │
                              │     (ADR-0005)                      │
                              └─────────────────────────────────────┘
```

### Key Interfaces

```typescript
// web/src/lib/ask/streaming.ts (canonical)

import type { AskResponse, Citation, NumericFact } from "../types";

/**
 * SSE event types emitted during streaming.
 *
 * Protocol:
 *   1. Zero or more "token" events (partial text chunks)
 *   2. Exactly one "done" event (complete AskResponse)
 *   3. Zero or one "citation" events (post-validation corrections)
 *   4. Zero or one "error" events (if stream aborted)
 *
 * Client reconstructs full response by:
 *   - Concatenating all "token" event data for streaming display
 *   - Using "done" event data as the authoritative AskResponse
 *   - Applying "citation" corrections to the AskResponse if present
 */
export type SSEEventType = "token" | "done" | "citation" | "error";

export interface SSEEvent<T = unknown> {
  event: SSEEventType;
  data: T;
  id?: string;          // sequential event ID for reconnection
}

export interface TokenData {
  text: string;          // partial text chunk from LLM
  intent: QueryIntent;
}

export interface DoneData {
  answer: AskResponse;   // complete, validated AskResponse
  trace_id: string;
  total_cost_usd: number;
  steps_executed: number;
  status: "completed" | "partial";
}

export interface CitationCorrectionData {
  corrected_facts: NumericFact[];   // facts that passed ADR-0007 validation
  stripped_facts: NumericFact[];    // facts that failed validation
  disclaimer: string;               // per ADR-0007 disclaimer text
}

export interface ErrorData {
  reason: string;                   // "timeout" | "cost_exceeded" | "internal_error"
  partial_text?: string;            // any text streamed before error
}

/**
 * Streaming mode decision logic.
 *
 * - "never": Mock mode or simple_qa — no SSE, return JSON
 * - "always": deep_research — force SSE from the start
 * - "adaptive": other intents — start non-streaming, switch if >5s
 */
export type StreamingMode = "never" | "always" | "adaptive";

/**
 * Determine streaming mode based on context.
 *
 * Rules (per ADR decision):
 *   1. USE_MOCK=true → "never" (Mock mode returns instantly)
 *   2. intent === "simple_qa" → "never" (Haiku-tier is fast)
 *   3. intent === "deep_research" → "always" (Sonnet-tier + RAG is slow)
 *   4. Otherwise → "adaptive" (measure first call, switch if >5s)
 */
export function resolveStreamingMode(
  intent: QueryIntent,
  env: { USE_MOCK?: string }
): StreamingMode;

/**
 * SSE encoder: transforms AskResponse generation into SSE event stream.
 *
 * Uses Cloudflare Workers TransformStream:
 *   - Writable side: handler writes events via writeToken/writeDone/writeError
 *   - Readable side: consumed by the HTTP response as text/event-stream
 *
 * CPU-efficient: token emission is I/O (writer.write), not CPU-bound.
 * The LLM API call is the CPU-intensive part; streaming just delivers output.
 */
export class SSEncoder {
  private writer: WritableStreamDefaultWriter;
  private eventId: number;
  readonly readable: ReadableStream<Uint8Array>;

  constructor();

  /** Emit a token (partial text) event. Called per LLM streaming chunk. */
  writeToken(text: string, intent: QueryIntent): Promise<void>;

  /** Emit the done event with the complete, validated AskResponse. */
  writeDone(data: DoneData): Promise<void>;

  /**
   * Emit a citation correction event (post-stream validation).
   * Only emitted if ADR-0007 validateCitations() produces corrections.
   * If all facts verified (validation_status: "all_verified"), this is NOT emitted.
   */
  writeCitationCorrection(data: CitationCorrectionData): Promise<void>;

  /** Emit an error event and close the stream. */
  writeError(data: ErrorData): Promise<void>;

  /** Close the stream. Called after done+validation. */
  close(): Promise<void>;
}

/**
 * Streaming-aware LLM call wrapper.
 *
 * For non-streaming mode: calls RealLLM.complete(), measures latency,
 * returns result + latency metadata.
 *
 * For streaming mode: calls RealLLM.stream(), writes token events
 * to SSEncoder as chunks arrive, returns assembled full response
 * after stream completes.
 *
 * This is the bridge between ADR-0003's LLM routing and this ADR's
 * SSE transport.
 */
export interface StreamingLLMCall {
  /**
   * Execute an LLM call with optional streaming.
   *
   * @param mode - Streaming mode from resolveStreamingMode()
   * @param encoder - SSEncoder instance (used only if mode != "never")
   * @returns Full AskResponse + latency metadata
   */
  execute(
    mode: StreamingMode,
    encoder?: SSEncoder
  ): Promise<{
    answer: AskResponse;
    latency_ms: number;
    streamed: boolean;
  }>;
}

/**
 * Latency threshold for adaptive streaming mode.
 * Per EP03 §6.2 反模式: >5s must stream.
 */
export const STREAM_THRESHOLD_MS = 5000;
```

### Streaming Protocol (SSE Wire Format)

The SSE stream follows the standard `text/event-stream` format:

```
event: token
id: 1
data: {"text":"Based on","intent":"deep_research"}

event: token
id: 2
data: {"text":" the latest SEC filings,","intent":"deep_research"}

event: token
id: 3
data: {"text":" NVDA reported revenue of $22.10B","intent":"deep_research"}

event: done
id: 4
data: {"answer":{"summary":"...","numeric_facts":[...],"citations":[...],"confidence":0.9},"trace_id":"...","total_cost_usd":0.03,"steps_executed":5,"status":"completed"}

event: citation
id: 5
data: {"corrected_facts":[...],"stripped_facts":[{"value":22.1,"unit":"B","source":{...}}],"disclaimer":"Note: 1 of 5 data points could not be verified..."}

```

### HTTP Response Headers

For streaming responses:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no              // disable nginx buffering (Cloudflare proxy)
X-Stream-Id: <trace_id>            // for client-side reconnection
```

For non-streaming responses (same as current):

```
Content-Type: application/json
```

### Adaptive Streaming Decision Flow

```
                     resolveStreamingMode(intent, env)
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
          "never"          "adaptive"      "always"
          (mock/simple_qa)  (other)       (deep_research)
                 │              │              │
                 ▼              ▼              ▼
          Normal JSON     Start non-stream  Start SSE stream
          response        LLM call         immediately
                 │              │              │
                 │         ┌────┴────┐         │
                 │      ≤5s│        │>5s      │
                 │         │        │          │
                 │     Return JSON  Switch     │
                 │     normally     to SSE     │
                 │         │        │          │
                 │         │   Stream tokens   │
                 │         │   for remainder   │
                 │         │        │          │
                 └─────────┴────────┴──────────┘
                                    │
                                    ▼
                         Post-stream validation
                         (ADR-0007)
                                    │
                                    ▼
                         onFinalize: save to memory
                         (ADR-0005)
```

### AgentLoop Integration

Per ADR-0004, `StepHandler.onSynthesize` is the hook point. The Ask-specific handler implements streaming detection and delivery:

```typescript
// web/src/lib/agent/ask-handlers.ts (future implementation)

export class AskStepHandler implements StepHandler {
  async onSynthesize(ctx: LoopContext, execResult: ExecResult): Promise<Synthesis> {
    const mode = resolveStreamingMode(ctx.intent, ctx.env);
    const encoder = mode !== "never" ? new SSEncoder() : undefined;

    // If streaming, attach encoder.readable to the response context
    // so the API route handler can pipe it to the HTTP response.
    if (encoder) {
      ctx.sse_encoder = encoder;  // Extend LoopContext, not ADR-0004 core
    }

    const llmCall = new StreamingLLMCall(ctx.llm, execResult.rag_context, ctx.intent);
    const { answer, latency_ms, streamed } = await llmCall.execute(mode, encoder);

    // Post-stream citation validation (ADR-0007)
    const ragContext = ctx.rag_context ?? "";
    const validationResult = validateCitations(answer, ragContext, ctx.env);
    const finalAnswer = applyValidationResult(answer, validationResult);

    // If streamed AND validation produced corrections, emit citation event
    if (streamed && encoder && validationResult.stripped_facts.length > 0) {
      await encoder.writeCitationCorrection({
        corrected_facts: validationResult.verified_facts,
        stripped_facts: validationResult.stripped_facts,
        disclaimer: validationResult.disclaimer,
      });
    }

    // Close SSE stream
    if (encoder) {
      await encoder.writeDone({
        answer: finalAnswer,
        trace_id: ctx.trace[0]?.step_id ?? "",
        total_cost_usd: ctx.accumulated_cost_usd,
        steps_executed: ctx.step_count,
        status: validationResult.validation_status === "strict_reject" ? "partial" : "completed",
      });
      await encoder.close();
    }

    // Enqueue async URL checks (ADR-0007 Stage 3)
    await enqueueUrlChecks(validationResult.url_pending_facts, ctx.trace[0]?.step_id ?? "", ctx.env);

    return { answer: finalAnswer, validation: validationResult, streamed };
  }

  async onFinalize(ctx: LoopContext, synthesis: Synthesis): Promise<LoopResult> {
    const result = synthesis as { answer: AskResponse; validation: ValidationResult; streamed: boolean };

    // Save complete response to memory (ADR-0005)
    // This happens regardless of streaming — memory only stores the final answer.
    // (Memory saving logic per ADR-0005 onFinalize contract)

    return {
      answer: result.answer,
      trace: ctx.trace,
      total_cost_usd: ctx.accumulated_cost_usd,
      steps_executed: ctx.step_count,
      status: result.validation.validation_status === "strict_reject" ? "partial" : "completed",
      abort_reason: result.validation.validation_status === "strict_reject"
        ? "citation_validation_failed"
        : undefined,
    };
  }
}
```

**Critical rule**: The `AgentLoop` state machine (ADR-0004) is UNCHANGED by this ADR. Streaming is a transport-layer concern handled inside `onSynthesize`. The loop still transitions `Synthesize -> FinalAnswer` regardless of whether streaming was used. `LoopResult` shape is unchanged — the streaming encoder is an output side-channel, not a loop state.

### Client-Side Consumption

```typescript
// web/src/lib/ask/stream-client.ts (canonical)

export interface StreamClientResult {
  answer: AskResponse;
  streamed: boolean;
}

/**
 * Execute an Ask query, handling both streaming and non-streaming responses.
 *
 * - If response Content-Type is text/event-stream: consume SSE events
 * - If response Content-Type is application/json: parse directly
 *
 * Uses fetch() with ReadableStream (not EventSource) because:
 * 1. EventSource doesn't support POST with body
 * 2. EventSource auto-reconnects, which is undesirable for stateful Ask queries
 * 3. fetch gives us full control over headers and error handling
 */
export async function askStream(
  query: string,
  options: {
    onToken?: (text: string) => void;
    onCitationCorrection?: (data: CitationCorrectionData) => void;
    onError?: (data: ErrorData) => void;
    signal?: AbortSignal;
  }
): Promise<StreamClientResult>;
```

### LoopContext Extension

This ADR adds one optional field to `LoopContext` for streaming support. This is an additive extension — ADR-0004's core `LoopContext` interface is unchanged; the field is Ask-specific and set by `AskStepHandler.onInit`:

```typescript
// Extension to LoopContext (in ask-handlers.ts, not in loop.ts)
declare module "../agent/loop" {
  interface LoopContext {
    sse_encoder?: SSEncoder;  // Set by AskStepHandler.onInit if streaming mode != "never"
  }
}
```

## Alternatives Considered

### Alternative 1: WebSocket for bidirectional streaming

- **Description**: Use WebSocket connection for real-time bidirectional communication between client and Ask Agent.
- **Pros**: Full-duplex; client can cancel mid-stream; supports progress indicators; server can push updates without client polling.
- **Cons**: Cloudflare Workers Durable Objects required for WebSocket (adds complexity + cost); not needed for unidirectional streaming; client cannot POST query via WebSocket without extra handshake; overkill for Phase 1.
- **Rejection Reason**: SSE is simpler, works with standard HTTP, and matches the unidirectional (server → client) nature of LLM streaming. WebSocket's bidirectional capability is unused in this use case. Revisit in Phase 2 if interactive mid-query refinement is needed.

### Alternative 2: Always stream (SSE for all responses)

- **Description**: Every Ask response uses SSE, even simple_qa that returns in <1s. Client always consumes SSE events.
- **Pros**: Single code path on client and server; no mode detection logic; consistent UX.
- **Cons**: SSE overhead (event framing, connection management) for responses that complete in <1s; `EventSource`/`fetch` stream setup adds ~50ms latency vs direct JSON; unnecessary complexity for Mock mode (which returns instantly).
- **Rejection Reason**: EP03 §6.2 says ">5s 必须流式返回" — implying <5s can return normally. Simple_qa (Haiku-tier, <2s) should not pay the SSE overhead. Mock mode must not stream (ADR-0001).

### Alternative 3: Fixed threshold with pre-classification (no adaptive mode)

- **Description**: Based on `classifyIntent()` result alone: simple_qa → never stream, deep_research → always stream, all others → never stream. No latency measurement.
- **Pros**: No timing logic; deterministic from intent alone; simpler implementation.
- **Cons**: "other" intents (clarify, tool_call) may occasionally exceed 5s if RAG retrieval is slow; no fallback for unexpectedly slow simple_qa (rare but possible with cold starts).
- **Rejection Reason**: Too rigid. The adaptive mode handles edge cases where intent classification doesn't perfectly predict latency. The cost of adaptive (one timer) is negligible.

### Alternative 4: Chunked Transfer Encoding (no SSE framing)

- **Description**: Use HTTP chunked transfer encoding with newline-delimited JSON instead of SSE protocol.
- **Pros**: Slightly simpler than SSE (no `event:` / `data:` framing); works with standard HTTP.
- **Cons**: No event type distinction (can't separate tokens from done from errors); no automatic reconnection; no browser `EventSource` API support; harder to debug (no structured event format).
- **Rejection Reason**: SSE is the web standard for server-to-client streaming with structured events. `EventSource` API is built into browsers. Chunked JSON is a custom protocol with no ecosystem support.

### Alternative 5: Streaming with inline citation validation (validate during token emission)

- **Description**: Run citation validation on partial response text during streaming. Emit corrections inline as tokens stream.
- **Pros**: Corrections arrive sooner; no post-stream delay.
- **Cons**: Citation validation (ADR-0007) requires the complete response — partial text cannot be validated (a numeric fact may be incomplete mid-stream); LLM may correct itself in later tokens; validates-then-invalidates thrash would confuse the client.
- **Rejection Reason**: ADR-0007's validation pipeline is designed for complete responses. Partial validation produces unreliable results. Post-stream validation is the correct architectural fit.

## Consequences

### Positive

- **EP03 §6.2 anti-pattern is now enforceable**: >5s responses automatically stream via SSE. No silent 30s waits.
- **Deep research UX dramatically improved**: Users see tokens arriving in real-time, reducing perceived latency from 10-30s to <1s (first token).
- **ADR-0004 loop unchanged**: Streaming is a transport concern inside `onSynthesize`. State machine, cost tracking, trace emission all work identically.
- **ADR-0007 validation preserved**: Post-stream validation on complete response ensures citation integrity is not compromised by streaming.
- **ADR-0001 Mock mode unaffected**: Mock returns instant JSON; no SSE overhead in development.
- **Cloudflare Workers native**: `TransformStream` is a standard Workers API — no external dependencies, no polyfills.
- **Client flexibility**: `fetch` + `ReadableStream` gives full control; `EventSource` available as alternative for simpler use cases.

### Negative

- **Dual response paths**: Server must handle both JSON and SSE responses. API route handler must detect mode and set appropriate headers/body. Adds ~50 lines of route-level code.
- **Client complexity**: Frontend must handle both JSON and SSE responses. `StreamClientResult` abstracts this, but component code must handle `onToken` callbacks.
- **Post-stream citation correction delay**: If ADR-0007 validation strips facts, the correction arrives AFTER the user has already seen the unvalidated text. The `citation` event corrects this, but there's a brief window of potentially inaccurate display.
- **Workers 30s CPU time limit**: Very long deep research queries (20+ steps) may approach this limit. Streaming doesn't reduce CPU time — it just keeps the connection alive. The ADR-0004 `MAX_STEPS=20` and `AGGREGATE_COST_CEILING_USD=5` caps provide a safety margin.
- **LoopContext extension**: `sse_encoder` field is an additive extension to ADR-0004's `LoopContext`. While minimal, it's a cross-ADR interface change. Module augmentation pattern avoids modifying `loop.ts` directly.

### Risks

- **Risk**: Workers 30s CPU time exceeded for complex deep research queries.
  - **Mitigation**: ADR-0004 enforces `MAX_STEPS=20` and `AGGREGATE_COST_CEILING_USD=5`. Typical 10-step deep research uses ~5s CPU (mostly I/O wait for LLM API). 20 steps × 1s CPU/step = 20s, within 30s limit. Monitor CPU time in trace (ADR-0014). Add `CPU_TIME_WARNING_MS = 25000` threshold — if approached, emit error event and abort gracefully.
- **Risk**: SSE connection dropped mid-stream (client disconnect, network issue).
  - **Mitigation**: Each SSE event has a sequential `id` field. Client can request resume from last received event ID. However, LLM state is ephemeral — full re-query is the practical fallback. Document this limitation.
- **Risk**: Post-stream citation correction confuses users (they see unvalidated text, then a correction).
  - **Mitigation**: Client-side UI should mark streaming text as "unverified" (e.g., subtle background color) until the `done` event arrives. The `citation` correction event triggers a visual update (strikethrough removed facts, add disclaimer). This is a frontend concern, not an ADR concern.
- **Risk**: Adaptive mode latency measurement adds overhead (timer + conditional branch).
  - **Mitigation**: Timer overhead is ~0.01ms (Date.now() call). Conditional branch is negligible. The 5s threshold is generous enough that measurement error (<10ms) is irrelevant.
- **Risk**: `RealLLM.stream()` API not yet defined in ADR-0003 (current `RealLLM.complete()` is synchronous).
  - **Mitigation**: ADR-0003's `RealLLM` must be extended with a `stream()` method that returns an async iterator of text chunks. This is a minor extension — the streaming interface is defined in this ADR, implementation deferred to story. ADR-0003 amendment may be needed if the `RealLLM` interface changes.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP03 §6.2 反模式 | "同步等待 LLM 完成才返回：>5s 必须流式返回" | `STREAM_THRESHOLD_MS = 5000` threshold; `resolveStreamingMode()` detects when to stream; `SSEncoder` delivers SSE |
| EP03 §6.2 验收 | "流式响应（>5s 时启用 SSE）" | Explicit acceptance criterion in Validation Criteria |
| TR-EP03-019 | Streaming response (>5s triggers SSE) | This ADR is the canonical owner |
| EP03 §2.7 | Ask Agent Loop: LLMCall step | `StreamingLLMCall` wraps LLM call with streaming support; loop state machine unchanged |
| EP03 §3 BDD | "Mock 模式立即返回" scenario | `resolveStreamingMode()` returns "never" when `USE_MOCK=true` |
| EP01 §ID-4 | Agent Loop state machine | Loop unchanged; streaming is transport layer inside `onSynthesize` |
| EP01 §反模式 | "不要让单次 query 成本 > $5" | Streaming does not affect cost tracking; ADR-0004 aggregate ceiling still enforced |
| ADR-0007 | Citation validation on complete response | Post-stream validation preserves ADR-0007 contract; `citation` correction event emitted after `done` |

## Performance Implications

- **CPU**: SSEncoder overhead is I/O-bound (writer.write calls). ~0.1ms per token event. For a 1000-token response at 50 tokens/event: ~2ms total SSE framing overhead. Negligible compared to LLM API latency.
- **Memory**: SSEncoder holds a `TransformStream` (two buffers, ~64KB each per Workers defaults). For typical responses (5-20KB), memory usage is minimal. One encoder per request-scoped AskHandler.
- **Network**: SSE adds ~20 bytes overhead per event (event type + id + data framing). For 50 token events + 1 done + 0-1 citation: ~1KB framing overhead. Negligible compared to response payload.
- **Latency**: First token arrives ~200-500ms after LLM API starts streaming (vs 5-30s for full response in non-streaming mode). Perceived latency reduced from "full response time" to "time to first token".
- **Workers 30s CPU**: Streaming is I/O-bound. LLM API calls are network I/O (not CPU). Token emission is writer.write (I/O). CPU usage per step: ~100ms (RAG assembly + validation). 20 steps × 100ms = 2s CPU. Well within 30s limit.
- **Cost**: Streaming does not change LLM API cost (same tokens generated). No additional API calls for streaming transport.

## Migration Plan

Current state: No streaming code exists. `AskHandler.onSynthesize` is not yet implemented. `RealLLM.complete()` returns full response synchronously (placeholder).

Migration steps:

1. **Create `web/src/lib/ask/streaming.ts`** with `SSEncoder`, `resolveStreamingMode()`, `StreamingLLMCall` interface, and all SSE event types (`TokenData`, `DoneData`, `CitationCorrectionData`, `ErrorData`).
2. **Extend `RealLLM` (ADR-0003)** with `stream()` method that returns `AsyncIterable<{ text: string; done: boolean }>`. This is a minor extension to ADR-0003's `RealLLM` interface — the streaming implementation uses the same Claude API streaming endpoint that the Anthropic SDK already supports.
3. **Implement `AskStepHandler.onSynthesize`** (per ADR-0004) with streaming detection and SSE encoder integration.
4. **Create `web/src/lib/ask/stream-client.ts`** with `askStream()` function for client-side consumption.
5. **Update API route handler** (`web/src/app/api/ask/route.ts` or equivalent) to:
   - Detect streaming mode from response context
   - Set `Content-Type: text/event-stream` + SSE headers for streaming
   - Set `Content-Type: application/json` for non-streaming
   - Pipe `SSEncoder.readable` to the HTTP response body for streaming
6. **Add unit tests** in `web/tests/unit/streaming.test.ts` covering:
   - `resolveStreamingMode()` returns "never" for Mock + simple_qa
   - `resolveStreamingMode()` returns "always" for deep_research
   - `resolveStreamingMode()` returns "adaptive" for other intents
   - `SSEncoder` produces correct SSE wire format (event + id + data)
   - `SSEncoder.writeToken()` / `writeDone()` / `writeCitationCorrection()` / `writeError()` event formats
   - Post-stream citation validation emits correction when facts stripped
   - Streaming mode never activates when `USE_MOCK=true`
7. **Add integration test**: Full Ask query (mock mode) returns JSON; full Ask query (real mode, deep_research intent) returns SSE stream.

## Validation Criteria

- [ ] `resolveStreamingMode("deep_research", { USE_MOCK: "false" })` returns `"always"`
- [ ] `resolveStreamingMode("simple_qa", { USE_MOCK: "false" })` returns `"never"`
- [ ] `resolveStreamingMode("deep_research", { USE_MOCK: "true" })` returns `"never"` (Mock overrides)
- [ ] `resolveStreamingMode("clarify", { USE_MOCK: "false" })` returns `"adaptive"`
- [ ] `SSEncoder.writeToken("hello", "deep_research")` produces `event: token\ndata: {"text":"hello","intent":"deep_research"}\nid: 1\n\n`
- [ ] `SSEncoder.writeDone(data)` produces `event: done\ndata: {...}\nid: N\n\n`
- [ ] Adaptive mode: LLM call ≤5s → response is normal JSON (no SSE)
- [ ] Adaptive mode: LLM call >5s → response switches to SSE mid-call
- [ ] Deep research: SSE stream starts immediately (no 5s wait before first token)
- [ ] Mock mode: never streams, always returns JSON (ADR-0001 compliance)
- [ ] Simple QA: never streams, always returns JSON (Haiku-tier is fast)
- [ ] Post-stream: citation validation runs on complete response (ADR-0007 compliance)
- [ ] Post-stream: `citation` correction event emitted if validation strips facts
- [ ] Post-stream: `citation` correction event NOT emitted if `validation_status: "all_verified"`
- [ ] `onFinalize` saves complete response to memory regardless of streaming (ADR-0005 compliance)
- [ ] Workers CPU time for streaming 20-step query < 30s
- [ ] Client-side `askStream()` correctly handles both JSON and SSE responses
- [ ] No module-level SSEncoder cache (request-scoped only, per FP-0001/FP-0002)

## Related Decisions

- **ADR-0001** (USE_MOCK Dual-Mode Switch) — Mock mode never streams; `resolveStreamingMode()` returns "never" when `USE_MOCK=true`
- **ADR-0003** (LLM Routing + Cost Cap) — `RealLLM.stream()` method added for streaming; per-call cost enforcement still applies
- **ADR-0004** (Agent Loop Design) — Loop state machine unchanged; streaming is transport inside `onSynthesize`; `LoopContext` extended with `sse_encoder?`
- **ADR-0005** (Memory Layer) — `onFinalize` saves complete response after streaming finishes; streaming does not affect memory persistence
- **ADR-0007** (Citation Validator) — Validation runs post-stream on complete response; `citation` correction event bridges streaming + validation
- EP03 §6.2 反模式 — Originating requirement: ">5s 必须流式返回"
- TR-EP03-019 — Technical requirement this ADR owns

## TECH_DEBT — None at ADR Creation

This is a new ADR; no existing streaming implementation to carry tech debt. The `StreamingLLMCall.execute()` method and `RealLLM.stream()` extension are deferred to implementation stories. Promoting the 17 validation criteria to passing tests IS the implementation acceptance signal.

If a future iteration finds the adaptive mode too complex (e.g., "adaptive" intent is rarely used, or latency measurement is unreliable), the fallback is to simplify to a binary rule: deep_research → always stream, everything else → never stream. This would eliminate the adaptive branch and the timer logic. That refactor must update this ADR's §Decision and §Alternatives sections.
