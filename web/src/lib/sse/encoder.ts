/**
 * SSE Streaming encoder + adaptive mode (ADR-0015 Phase-2).
 *
 * Implements the ADR-canonical API:
 *   - encodeSSE(event): encode a single SSE event to W3C wire format
 *   - SSEncoder: wraps a ReadableStream for SSE output (push/close/stream)
 *   - resolveStreamingMode(intent, env): "never" | "always" | "adaptive"
 *   - createSSEResponse(encoder): Response with text/event-stream headers
 *
 * Wire format follows W3C SSE spec:
 *   event: token\n
 *   data: {"text":"hello"}\n
 *   \n
 *
 * Multi-line data: each line prefixed with `data: `.
 * Termination signal: `data: [DONE]\n\n`.
 *
 * See: docs/architecture/adr-0015-sse-streaming.md
 */

import type { SSEEvent, StreamingMode } from "./types";
import type { QueryIntent } from "../types";

// ---------- encodeSSE ----------

/**
 * Encode a single SSE event to string per W3C spec.
 *
 * Output format:
 *   event: <type>\n
 *   data: <line1>\n
 *   data: <line2>\n   (for multi-line data)
 *   id: <id>\n       (if present)
 *   retry: <retry>\n (if present)
 *   \n               (blank line terminates event)
 *
 * Field order: event, data, id, retry, blank line.
 * This is a valid ordering per the W3C SSE specification.
 */
export function encodeSSE(event: SSEEvent): string {
  let out = "";

  if (event.event !== undefined) {
    out += `event: ${event.event}\n`;
  }

  // Multi-line data: each line prefixed with `data: `
  const lines = event.data.split("\n");
  for (const line of lines) {
    out += `data: ${line}\n`;
  }

  if (event.id !== undefined) {
    out += `id: ${event.id}\n`;
  }

  if (event.retry !== undefined) {
    out += `retry: ${event.retry}\n`;
  }

  out += "\n"; // blank line terminates the event
  return out;
}

// ---------- SSEncoder ----------

/**
 * SSEncoder — wraps a ReadableStream for SSE output.
 *
 * Usage:
 *   const encoder = new SSEncoder();
 *   encoder.push({ event: "token", data: "hello" });
 *   encoder.push({ event: "done", data: JSON.stringify(answer) });
 *   encoder.close();
 *   const response = createSSEResponse(encoder);
 *
 * The internal ReadableStream uses TransformStream for Cloudflare Workers
 * compatibility. Pushed events are encoded via encodeSSE() and written
 * as Uint8Array chunks to the readable side.
 */
export class SSEncoder {
  private readonly transform: TransformStream<string, Uint8Array>;
  private readonly writer: WritableStreamDefaultWriter<string>;
  private readonly textEncoder: TextEncoder;
  private closed = false;

  constructor() {
    this.textEncoder = new TextEncoder();
    this.transform = new TransformStream<string, Uint8Array>({
      transform: (chunk, controller) => {
        controller.enqueue(this.textEncoder.encode(chunk));
      },
    });
    this.writer = this.transform.writable.getWriter();
  }

  /**
   * Push an event to the stream. Encodes via encodeSSE() and writes
   * the wire-format string to the TransformStream's writable side.
   *
   * No-op if the stream has been closed.
   */
  push(event: SSEEvent): void {
    if (this.closed) return;
    const encoded = encodeSSE(event);
    // write() returns a promise but we fire-and-forget for non-blocking
    // push. The TransformStream handles backpressure internally.
    void this.writer.write(encoded);
  }

  /**
   * Signal stream completion. Releases the writer lock and closes
   * the writable side. After close(), push() is a no-op.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    void this.writer.close();
  }

  /**
   * Get the ReadableStream<Uint8Array> for piping to an HTTP Response.
   */
  get stream(): ReadableStream<Uint8Array> {
    return this.transform.readable;
  }
}

// ---------- resolveStreamingMode ----------

/**
 * Resolve streaming mode based on intent and environment.
 *
 * Decision order (per ADR-0015 §Decision):
 *   1. ENVIRONMENT === "test" → "never" (test mode, no streaming)
 *   2. intent === "deep_research" → "always" (Sonnet-tier + RAG is slow)
 *   3. intent === "simple_qa"    → "never"  (Haiku-tier is fast)
 *   4. Otherwise → "adaptive" (measure first call, switch if >5s)
 *
 * USE_MOCK is not checked here — it's handled at the route level.
 * When USE_MOCK=true, the route should not call this function at all
 * (mock returns instantly, per ADR-0001).
 */
export function resolveStreamingMode(
  intent: QueryIntent,
  env?: { ENVIRONMENT?: string },
): StreamingMode {
  if (env?.ENVIRONMENT === "test") {
    return "never";
  }
  if (intent === "deep_research") {
    return "always";
  }
  if (intent === "simple_qa") {
    return "never";
  }
  return "adaptive";
}

// ---------- createSSEResponse ----------

/**
 * Create a streaming Response with SSE body and canonical headers.
 *
 * Headers (per ADR-0015 §HTTP Response Headers):
 *   Content-Type:  text/event-stream
 *   Cache-Control: no-cache
 */
export function createSSEResponse(encoder: SSEncoder): Response {
  return new Response(encoder.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
