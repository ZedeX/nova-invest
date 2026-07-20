/**
 * SSE Streaming types (ADR-0015).
 *
 * ADR-canonical vocabulary (Phase-2):
 *   - SSEEventType: "token" | "citation" | "metric" | "done" | "error"
 *   - StreamingMode: "never" | "always" | "adaptive"
 *
 * The "metric" event type is added per task spec for streaming metrics
 * (latency, cost, step count) during deep research.
 *
 * Wire format follows W3C SSE spec:
 *   event: token\n
 *   data: {"text":"hello"}\n
 *   \n
 *
 * See: docs/architecture/adr-0015-sse-streaming.md
 */

/**
 * SSE event types for Ask Agent streaming.
 *
 *   - "token":    partial text chunk from LLM
 *   - "citation": post-validation citation correction
 *   - "metric":   streaming metrics (latency, cost, step count)
 *   - "done":     complete response with full AskResponse
 *   - "error":    stream aborted with reason
 */
export type SSEEventType = "token" | "citation" | "metric" | "done" | "error";

/**
 * A single SSE event per W3C spec.
 *
 *   - `event`: SSE event type (becomes `event:` line in wire format)
 *   - `data`:  string payload (becomes `data:` line(s))
 *   - `id`:    optional sequential event ID for client reconnection
 *   - `retry`: optional reconnection time in milliseconds
 */
export interface SSEEvent {
  event?: SSEEventType;
  data: string;
  id?: string;
  retry?: number;
}

/**
 * Streaming mode decision (ADR-canonical vocabulary).
 *
 *   - "never":    Mock mode or simple_qa — no SSE, return JSON
 *   - "always":   deep_research — force SSE from the start
 *   - "adaptive": other intents — start non-streaming, switch if >5s
 */
export type StreamingMode = "never" | "always" | "adaptive";
