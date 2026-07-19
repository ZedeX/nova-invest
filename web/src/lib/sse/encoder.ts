/**
 * SSE Streaming encoder + stream wrapper (ADR-0015).
 *
 * Implements the task-spec API (NOT the ADR's canonical StreamingMode values):
 *   - SSEncoder: pure encoder (no I/O) returning SSE wire-format strings
 *   - resolveStreamingMode(request, env): "mock" | "raw" | "buffered"
 *   - SSEStream: writable wrapper around ReadableStreamDefaultController
 *   - createSSEResponse: returns Response with text/event-stream headers
 *
 * Wire format (per task spec):
 *   data: {"type":"token","data":"hello"}\n\n
 *
 * With an id:
 *   id: <id>\n
 *   data: {"type":"token","data":"hello"}\n\n
 *
 * The event type is encoded inside the JSON payload (NOT as a separate
 * `event:` SSE field). This matches the task spec's validation criteria #1.
 *
 * See: docs/architecture/adr-0015-sse-streaming.md
 */

import type { SSEEvent, SSEEventType, StreamingMode } from "./types";

/**
 * Canonical list of valid SSE event types. Used by `encode()` to reject
 * invalid types at runtime (e.g., "delta").
 */
const VALID_EVENT_TYPES: readonly SSEEventType[] = [
  "token",
  "done",
  "citation",
  "error",
];

/**
 * SSE protocol encoder. Pure (no I/O) — methods return SSE wire-format strings.
 *
 * Usage:
 *   const enc = new SSEncoder();
 *   const chunk = enc.encodeToken("hello"); // 'data: {"type":"token","data":"hello"}\n\n'
 *
 * For streaming to a ReadableStream, use SSEStream instead (it wraps a
 * controller and calls encode + enqueue internally).
 */
export class SSEncoder {
  /** Internal buffer for any buffered output. Currently unused by encode*
   * methods (they return strings directly); flush() drains and returns it. */
  private buffer = "";

  /**
   * Encode an SSEEvent into the SSE wire format.
   *
   * Output:
   *   data: {"type":"<type>","data":"<data>"}\n\n
   *
   * With an id:
   *   id: <id>\n
   *   data: {"type":"<type>","data":"<data>"}\n\n
   *
   * Throws if `event.type` is not one of the 4 canonical types
   * (token | done | citation | error). "delta" is rejected.
   */
  encode(event: SSEEvent): string {
    if (!VALID_EVENT_TYPES.includes(event.type)) {
      throw new Error(
        `Invalid SSE event type: ${String(event.type)}. ` +
          `Allowed: token | done | citation | error (NOT "delta").`,
      );
    }
    const payload = { type: event.type, data: event.data };
    let out = "";
    if (event.id !== undefined) {
      out += `id: ${event.id}\n`;
    }
    out += `data: ${JSON.stringify(payload)}\n\n`;
    return out;
  }

  /**
   * Convenience: encode a "token" event with raw text.
   * Returns: `data: {"type":"token","data":"<text>"}\n\n`
   */
  encodeToken(text: string): string {
    return this.encode({ type: "token", data: text });
  }

  /**
   * Convenience: encode a "done" event with a JSON-serialized payload.
   * The payload is JSON.stringify'd into the `data` field of the SSE JSON.
   * Returns: `data: {"type":"done","data":"<JSON>"}\n\n`
   */
  encodeDone(payload: object): string {
    return this.encode({ type: "done", data: JSON.stringify(payload) });
  }

  /**
   * Convenience: encode a "citation" event with a JSON-serialized citation.
   * Returns: `data: {"type":"citation","data":"<JSON>"}\n\n`
   */
  encodeCitation(citation: object): string {
    return this.encode({ type: "citation", data: JSON.stringify(citation) });
  }

  /**
   * Convenience: encode an "error" event with message + optional code.
   * The `code` field is included in the JSON payload when provided.
   * Returns: `data: {"type":"error","data":"<msg>","code":"<code>"}\n\n`
   */
  encodeError(message: string, code?: string): string {
    const payload: Record<string, string> = {
      type: "error",
      data: message,
    };
    if (code !== undefined) {
      payload.code = code;
    }
    return `data: ${JSON.stringify(payload)}\n\n`;
  }

  /**
   * Return any buffered output. The encode* methods do not buffer (they
   * return strings directly), so flush() returns "" unless something has
   * explicitly written to the internal buffer.
   *
   * SSEStream.close() calls flush() before closing the controller to ensure
   * any trailing buffered bytes are emitted.
   */
  flush(): string {
    const out = this.buffer;
    this.buffer = "";
    return out;
  }
}

/**
 * Determine the streaming mode based on the request + environment.
 *
 * Decision order (per task spec):
 *   1. USE_MOCK=true → "mock" (Mock mode returns instantly, no streaming)
 *   2. Accept: text/event-stream header present → "raw" (stream tokens directly)
 *   3. Otherwise → "buffered" (collect all then send as a single response)
 *
 * USE_MOCK takes precedence over ENVIRONMENT — even in production, Mock mode
 * returns instantly without streaming (ADR-0001 compliance).
 */
export function resolveStreamingMode(
  request: Request,
  env: { USE_MOCK: string; ENVIRONMENT: string },
): StreamingMode {
  if (env.USE_MOCK === "true") {
    return "mock";
  }
  const accept = request.headers.get("Accept");
  if (accept !== null && accept.includes("text/event-stream")) {
    return "raw";
  }
  return "buffered";
}

/**
 * Writable stream wrapper around a ReadableStreamDefaultController.
 *
 * Usage (inside a ReadableStream's `start(controller)` callback):
 *   const sse = new SSEStream(controller);
 *   sse.write({ type: "token", data: "hello" });
 *   sse.close();
 *
 * For backpressure handling:
 *   sse.onBackpressure(() => { /* pause producer *\/ });
 *
 * For cancellation cleanup:
 *   const readable = new ReadableStream({
 *     start(controller) { sse = new SSEStream(controller); },
 *     cancel() { sse.cancel(); },
 *   });
 */
export class SSEStream {
  private readonly controller: ReadableStreamDefaultController<Uint8Array>;
  private backpressureHandler: (() => void) | null = null;
  private readonly encoder = new SSEncoder();
  private readonly textEncoder = new TextEncoder();

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  /**
   * Encode `event` and enqueue the bytes on the underlying controller.
   * After enqueue, if desiredSize < 0 (backpressure signal), invoke the
   * registered backpressure handler (if any).
   */
  write(event: SSEEvent): void {
    const encoded = this.encoder.encode(event);
    this.controller.enqueue(this.textEncoder.encode(encoded));
    const desired = this.controller.desiredSize;
    if (desired !== null && desired < 0) {
      this.backpressureHandler?.();
    }
  }

  /**
   * Flush any buffered output and close the underlying controller.
   * After close(), the stream is sealed — further writes will throw.
   */
  close(): void {
    const flushed = this.encoder.flush();
    if (flushed.length > 0) {
      this.controller.enqueue(this.textEncoder.encode(flushed));
    }
    this.controller.close();
  }

  /**
   * Register a backpressure handler. Invoked from `write()` whenever
   * `controller.desiredSize < 0` (the consumer is slower than the producer).
   *
   * The handler should pause the producer (e.g., stop pulling from the
   * upstream LLM stream) until the consumer catches up.
   */
  onBackpressure(handler: () => void): void {
    this.backpressureHandler = handler;
  }

  /**
   * Cancel hook — called when the underlying ReadableStream is cancelled
   * by the consumer (e.g., user navigates away, network drops).
   *
   * Delegates to close() to flush + close the controller. Wire this into
   * the ReadableStream constructor's `cancel` callback:
   *
   *   new ReadableStream({ cancel() { sseStream.cancel(); } })
   */
  cancel(): void {
    this.close();
  }
}

/**
 * Create an SSE HTTP Response wrapping a ReadableStream.
 *
 * Sets the canonical SSE headers:
 *   Content-Type:  text/event-stream
 *   Cache-Control: no-cache
 *   Connection:    keep-alive
 *
 * Per ADR-0015 §HTTP Response Headers (X-Accel-Buffering and X-Stream-Id
 * are optional and not set here — they're transport concerns for the
 * route handler, not the SSE response factory).
 */
export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
