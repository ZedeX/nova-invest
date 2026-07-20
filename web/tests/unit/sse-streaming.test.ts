/**
 * TDD Spec — ADR-0015: SSE Streaming (Phase-2 canonical API).
 *
 * Validates the Phase-2 ADR-canonical API:
 *   - encodeSSE(event): W3C SSE wire format encoding
 *   - SSEncoder: push/close/stream (ReadableStream wrapper)
 *   - resolveStreamingMode(intent, env): "never" | "always" | "adaptive"
 *   - createSSEResponse(encoder): Response with SSE headers
 *
 * Wire format follows W3C SSE spec:
 *   event: token\n
 *   data: hello\n
 *   \n
 *
 * See: docs/architecture/adr-0015-sse-streaming.md
 */

import { describe, expect, it } from "vitest";
import {
  SSEncoder,
  createSSEResponse,
  encodeSSE,
  resolveStreamingMode,
} from "@/lib/sse/encoder";
import type { SSEEvent } from "@/lib/sse/types";

// ---------- encodeSSE ----------

describe("encodeSSE", () => {
  it("encodes a basic event with data only", () => {
    const result = encodeSSE({ data: "hello" });
    expect(result).toBe("data: hello\n\n");
  });

  it("encodes an event with type", () => {
    const result = encodeSSE({ event: "token", data: "hello" });
    expect(result).toBe("event: token\ndata: hello\n\n");
  });

  it("encodes an event with id and retry", () => {
    const result = encodeSSE({ event: "token", data: "hello", id: "1", retry: 3000 });
    expect(result).toBe("event: token\ndata: hello\nid: 1\nretry: 3000\n\n");
  });

  it("encodes multi-line data with each line prefixed by data:", () => {
    const result = encodeSSE({ event: "done", data: "line1\nline2\nline3" });
    expect(result).toBe("event: done\ndata: line1\ndata: line2\ndata: line3\n\n");
  });

  it("encodes data: [DONE] termination signal", () => {
    const result = encodeSSE({ data: "[DONE]" });
    expect(result).toBe("data: [DONE]\n\n");
  });

  it("encodes event with id only (no retry)", () => {
    const result = encodeSSE({ event: "citation", data: "ref1", id: "5" });
    expect(result).toBe("event: citation\ndata: ref1\nid: 5\n\n");
  });

  it("encodes event with retry only (no id)", () => {
    const result = encodeSSE({ event: "error", data: "timeout", retry: 5000 });
    expect(result).toBe("event: error\ndata: timeout\nretry: 5000\n\n");
  });
});

// ---------- SSEncoder ----------

describe("SSEncoder", () => {
  it("push + close produces correct stream", async () => {
    const encoder = new SSEncoder();
    encoder.push({ event: "token", data: "hello" });
    encoder.close();

    const reader = encoder.stream.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toBe("event: token\ndata: hello\n\n");

    const { done } = await reader.read();
    expect(done).toBe(true);
    reader.releaseLock();
  });

  it("multiple events in sequence", async () => {
    const encoder = new SSEncoder();
    encoder.push({ event: "token", data: "a" });
    encoder.push({ event: "token", data: "b" });
    encoder.push({ event: "done", data: "[DONE]" });
    encoder.close();

    const reader = encoder.stream.getReader();
    const chunks: string[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    reader.releaseLock();

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe("event: token\ndata: a\n\n");
    expect(chunks[1]).toBe("event: token\ndata: b\n\n");
    expect(chunks[2]).toBe("event: done\ndata: [DONE]\n\n");
  });

  it("push after close is a no-op", async () => {
    const encoder = new SSEncoder();
    encoder.push({ event: "token", data: "first" });
    encoder.close();
    // push after close should be silently ignored
    encoder.push({ event: "token", data: "after-close" });

    const reader = encoder.stream.getReader();
    const chunks: string[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    reader.releaseLock();

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("event: token\ndata: first\n\n");
  });

  it("stream returns a ReadableStream", () => {
    const encoder = new SSEncoder();
    expect(encoder.stream).toBeInstanceOf(ReadableStream);
    encoder.close();
  });
});

// ---------- resolveStreamingMode ----------

describe("resolveStreamingMode", () => {
  it("adaptive mode streams for deep_research", () => {
    expect(resolveStreamingMode("deep_research")).toBe("always");
  });

  it("adaptive mode returns JSON for simple_qa", () => {
    expect(resolveStreamingMode("simple_qa")).toBe("never");
  });

  it("always mode streams everything (deep_research regardless of env)", () => {
    expect(resolveStreamingMode("deep_research", { ENVIRONMENT: "production" })).toBe("always");
  });

  it("never mode returns JSON (simple_qa regardless of env)", () => {
    expect(resolveStreamingMode("simple_qa", { ENVIRONMENT: "production" })).toBe("never");
  });

  it("other intents return adaptive", () => {
    expect(resolveStreamingMode("clarify")).toBe("adaptive");
    expect(resolveStreamingMode("tool_call")).toBe("adaptive");
  });

  it("test environment returns never regardless of intent", () => {
    expect(resolveStreamingMode("deep_research", { ENVIRONMENT: "test" })).toBe("never");
    expect(resolveStreamingMode("clarify", { ENVIRONMENT: "test" })).toBe("never");
  });

  it("production environment with deep_research returns always", () => {
    expect(resolveStreamingMode("deep_research", { ENVIRONMENT: "production" })).toBe("always");
  });

  it("production environment with simple_qa returns never", () => {
    expect(resolveStreamingMode("simple_qa", { ENVIRONMENT: "production" })).toBe("never");
  });

  it("production environment with other intents returns adaptive", () => {
    expect(resolveStreamingMode("clarify", { ENVIRONMENT: "production" })).toBe("adaptive");
  });
});

// ---------- createSSEResponse ----------

describe("createSSEResponse", () => {
  it("returns Response with Content-Type: text/event-stream", () => {
    const encoder = new SSEncoder();
    encoder.close();
    const response = createSSEResponse(encoder);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("sets Cache-Control: no-cache", () => {
    const encoder = new SSEncoder();
    encoder.close();
    const response = createSSEResponse(encoder);
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });
});
