/**
 * TDD Spec — ADR-0015: SSE Streaming
 *
 * Validates the validation criteria in:
 *   docs/architecture/adr-0015-sse-streaming.md
 *
 * Implementation per task spec (NOT the ADR's canonical StreamingMode):
 *   - SSEEventType = "token" | "done" | "citation" | "error"  (NO "delta")
 *   - SSEncoder: pure encoder (no I/O) returning SSE wire-format strings
 *   - resolveStreamingMode(request, env): "mock" | "raw" | "buffered"
 *   - SSEStream: writable wrapper around ReadableStreamDefaultController
 *   - createSSEResponse: returns Response with text/event-stream headers
 *
 * Wire format (per task spec test #1):
 *   data: {"type":"token","data":"hello"}\n\n
 * (type encoded inside JSON payload, NOT as a separate `event:` line)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SSEncoder,
  SSEStream,
  createSSEResponse,
  resolveStreamingMode,
} from "@/lib/sse/encoder";
import type { SSEEvent, SSEEventType, StreamingMode } from "@/lib/sse/types";

describe("ADR-0015: SSE Streaming", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ---------- SSEncoder.encode* (tests 1-6, 18, 20) ----------

  it("SSEncoder.encodeToken returns data: {\"type\":\"token\",\"data\":\"hello\"}\\n\\n", () => {
    const enc = new SSEncoder();
    const payload = JSON.stringify({ type: "token", data: "hello" });
    expect(enc.encodeToken("hello")).toBe(`data: ${payload}\n\n`);
  });

  it("SSEncoder.encodeDone serializes payload as JSON string in data field", () => {
    const enc = new SSEncoder();
    const payload = JSON.stringify({
      type: "done",
      data: JSON.stringify({ answer: "test" }),
    });
    expect(enc.encodeDone({ answer: "test" })).toBe(`data: ${payload}\n\n`);
  });

  it("SSEncoder.encodeCitation produces SSE format with type citation", () => {
    const enc = new SSEncoder();
    const out = enc.encodeCitation({ url: "https://example.com" });
    expect(out.startsWith("data: ")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(true);
    // Outer SSE envelope: { type: "citation", data: "<JSON-stringified citation>" }
    const jsonStr = out.slice("data: ".length, out.length - 2); // strip "data: " and "\n\n"
    const envelope = JSON.parse(jsonStr);
    expect(envelope.type).toBe("citation");
    // Inner data field: the citation object, JSON-stringified
    const inner = JSON.parse(envelope.data);
    expect(inner.url).toBe("https://example.com");
  });

  it("SSEncoder.encodeError includes code field when provided", () => {
    const enc = new SSEncoder();
    const payload = JSON.stringify({
      type: "error",
      data: "fail",
      code: "TIMEOUT",
    });
    expect(enc.encodeError("fail", "TIMEOUT")).toBe(`data: ${payload}\n\n`);
  });

  it("SSEncoder.encode with id field includes `id: ...\\n` line", () => {
    const enc = new SSEncoder();
    const out = enc.encode({ type: "token", data: "x", id: "abc" });
    expect(out).toContain("id: abc\n");
    expect(out).toContain('data: {"type":"token","data":"x"}');
    expect(out.endsWith("\n\n")).toBe(true);
  });

  it("SSEncoder.flush returns empty string when nothing buffered", () => {
    const enc = new SSEncoder();
    expect(enc.flush()).toBe("");
  });

  it("Multiple encodeToken calls produce concatenated SSE chunks", () => {
    const enc = new SSEncoder();
    const out = enc.encodeToken("a") + enc.encodeToken("b");
    const chunkA = `data: ${JSON.stringify({ type: "token", data: "a" })}\n\n`;
    const chunkB = `data: ${JSON.stringify({ type: "token", data: "b" })}\n\n`;
    expect(out).toBe(chunkA + chunkB);
  });

  it("encode throws on invalid event type", () => {
    const enc = new SSEncoder();
    expect(() =>
      enc.encode({ type: "delta" as unknown as SSEEventType, data: "x" }),
    ).toThrow();
    expect(() =>
      enc.encode({ type: "invalid" as unknown as SSEEventType, data: "x" }),
    ).toThrow();
  });

  // ---------- SSEEventType type contract (test 19) ----------

  it("SSEEventType only allows token | done | citation | error (no delta)", () => {
    const validTypes: SSEEventType[] = ["token", "done", "citation", "error"];
    expect(validTypes).toEqual(["token", "done", "citation", "error"]);
    expect(validTypes).not.toContain("delta");

    // Compile-time check: "delta" is not assignable to SSEEventType
    // @ts-expect-error - "delta" is intentionally not a valid SSEEventType
    const _invalid: SSEEventType = "delta";
    expect(_invalid).toBe("delta");
  });

  // ---------- resolveStreamingMode (tests 7-10) ----------

  it("resolveStreamingMode returns mock when USE_MOCK=true", () => {
    const request = new Request("https://example.com", {
      headers: { Accept: "text/event-stream" },
    });
    const mode = resolveStreamingMode(request, {
      USE_MOCK: "true",
      ENVIRONMENT: "test",
    });
    expect(mode).toBe<"mock">("mock");
  });

  it("resolveStreamingMode returns raw when Accept: text/event-stream header present", () => {
    const request = new Request("https://example.com", {
      headers: { Accept: "text/event-stream" },
    });
    const mode = resolveStreamingMode(request, {
      USE_MOCK: "false",
      ENVIRONMENT: "test",
    });
    expect(mode).toBe<"raw">("raw");
  });

  it("resolveStreamingMode returns buffered for regular HTTP requests", () => {
    const request = new Request("https://example.com", {
      headers: { Accept: "application/json" },
    });
    const mode = resolveStreamingMode(request, {
      USE_MOCK: "false",
      ENVIRONMENT: "test",
    });
    expect(mode).toBe<"buffered">("buffered");
  });

  it("resolveStreamingMode returns mock for production env when USE_MOCK=true (precedence)", () => {
    const request = new Request("https://example.com", {
      headers: { Accept: "text/event-stream" },
    });
    const mode = resolveStreamingMode(request, {
      USE_MOCK: "true",
      ENVIRONMENT: "production",
    });
    expect(mode).toBe<"mock">("mock");
  });

  // ---------- SSEStream (tests 11-13, 17) ----------

  it("SSEStream.write calls controller.enqueue with encoded bytes", () => {
    const controller = {
      enqueue: vi.fn(),
      close: vi.fn(),
      desiredSize: 1,
    };
    const stream = new SSEStream(
      controller as unknown as ReadableStreamDefaultController<Uint8Array>,
    );
    stream.write({ type: "token", data: "hello" });
    expect(controller.enqueue).toHaveBeenCalledTimes(1);
    const arg = controller.enqueue.mock.calls[0][0];
    // TextEncoder().encode() returns Node's Uint8Array; in jsdom the global
    // Uint8Array is a different constructor, so toBeInstanceOf(Uint8Array)
    // is unreliable. Verify by constructor name + decoded content instead.
    expect((arg as Uint8Array).constructor.name).toBe("Uint8Array");
    const expected =
      `data: ${JSON.stringify({ type: "token", data: "hello" })}\n\n`;
    expect(new TextDecoder().decode(arg as Uint8Array)).toBe(expected);
  });

  it("SSEStream.close calls controller.close", () => {
    const controller = {
      enqueue: vi.fn(),
      close: vi.fn(),
      desiredSize: 1,
    };
    const stream = new SSEStream(
      controller as unknown as ReadableStreamDefaultController<Uint8Array>,
    );
    stream.close();
    expect(controller.close).toHaveBeenCalledTimes(1);
  });

  it("SSEStream.onBackpressure invokes handler when desiredSize < 0", () => {
    const handler = vi.fn();
    const controller = {
      enqueue: vi.fn(),
      close: vi.fn(),
      desiredSize: -1,
    };
    const stream = new SSEStream(
      controller as unknown as ReadableStreamDefaultController<Uint8Array>,
    );
    stream.onBackpressure(handler);
    stream.write({ type: "token", data: "x" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("Connection cleanup: SSEStream.close called when stream cancelled", async () => {
    const controller = {
      enqueue: vi.fn(),
      close: vi.fn(),
      desiredSize: 1,
    };
    const sseStream = new SSEStream(
      controller as unknown as ReadableStreamDefaultController<Uint8Array>,
    );

    // Wire SSEStream.cancel into a ReadableStream's cancel hook
    const readable = new ReadableStream<Uint8Array>({
      cancel() {
        sseStream.cancel();
      },
    });

    await readable.cancel("user disconnected");
    expect(controller.close).toHaveBeenCalledTimes(1);
  });

  // ---------- createSSEResponse (tests 14-16) ----------

  it("createSSEResponse returns Response with Content-Type: text/event-stream", () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: test\n\n"));
        controller.close();
      },
    });
    const response = createSSEResponse(stream);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("createSSEResponse sets Cache-Control: no-cache", () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const response = createSSEResponse(stream);
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("createSSEResponse sets Connection: keep-alive", () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const response = createSSEResponse(stream);
    expect(response.headers.get("Connection")).toBe("keep-alive");
  });
});
