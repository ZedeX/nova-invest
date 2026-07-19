/**
 * SSE Streaming types (ADR-0015).
 *
 * Per task spec: event types are "token" | "done" | "citation" | "error".
 * The "delta" event type is intentionally NOT allowed — ADR-0015 uses "token"
 * for partial text chunks (NOT "delta").
 *
 * Wire format (per task spec):
 *   data: {"type":"token","data":"hello"}\n\n
 *
 * The event type is encoded inside the JSON payload, NOT as a separate
 * `event:` SSE field. This matches the task spec's validation criteria #1.
 *
 * See: docs/architecture/adr-0015-sse-streaming.md
 */

/**
 * SSE event type. The 4 canonical types per ADR-0015:
 *   - "token":     partial text chunk from LLM
 *   - "done":      complete response with full AskResponse
 *   - "citation":  post-validation citation correction
 *   - "error":     stream aborted with reason
 *
 * NOTE: "delta" is NOT a valid type. ADR-0015 uses "token" for partial text.
 */
export type SSEEventType = "token" | "done" | "citation" | "error";

/**
 * A single SSE event.
 *
 * - `type`: one of the 4 canonical SSEEventType values
 * - `data`: string payload (for "token" = raw text; for "done"/"citation" = JSON-stringified object)
 * - `id`:   optional sequential event ID for client reconnection
 */
export interface SSEEvent {
  type: SSEEventType;
  data: string;
  id?: string;
}

/**
 * Streaming mode decision (per task spec, NOT the ADR's "never"|"always"|"adaptive").
 *
 * - "mock":     USE_MOCK=true — never stream, return JSON
 * - "raw":      client requests text/event-stream — stream tokens directly
 * - "buffered": regular HTTP — collect all then send as a single response
 */
export type StreamingMode = "raw" | "buffered" | "mock";
