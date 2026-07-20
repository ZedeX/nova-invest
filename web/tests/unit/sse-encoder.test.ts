/**
 * Unit tests for SSEncoder + encodeSSE + resolveStreamingMode + createSSEResponse
 * (ADR-0015 Phase-2 canonical API).
 *
 * See: web/src/lib/sse/encoder.ts
 * See: docs/architecture/adr-0015-sse-streaming.md
 */

import { describe, expect, it } from "vitest";
import {
  SSEncoder,
  createSSEResponse,
  encodeSSE,
  resolveStreamingMode,
} from "@/lib/sse/encoder";

// ---------- encodeSSE ----------

describe("encodeSSE", () => {
  it("basic event (data only)", () => {
    expect(encodeSSE({ data: "hello" })).toBe("data: hello\n\n");
  });

  it("event with type", () => {
    expect(encodeSSE({ event: "token", data: "hello" })).toBe(
      "event: token\ndata: hello\n\n",
    );
  });

  it("event with id and retry", () => {
    expect(
      encodeSSE({ event: "token", data: "hello", id: "1", retry: 3000 }),
    ).toBe("event: token\ndata: hello\nid: 1\nretry: 3000\n\n");
  });

  it("multi-line data", () => {
    expect(encodeSSE({ event: "done", data: "line1\nline2" })).toBe(
      "event: done\ndata: line1\ndata: line2\n\n",
    );
  });
});

// ---------- SSEncoder ----------

describe("SSEncoder", () => {
  it("push + close produces correct stream", async () => {
    const enc = new SSEncoder();
    enc.push({ event: "token", data: "hello" });
    enc.close();

    const reader = enc.stream.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe(
      "event: token\ndata: hello\n\n",
    );
    const { done } = await reader.read();
    expect(done).toBe(true);
    reader.releaseLock();
  });

  it("multiple events in sequence", async () => {
    const enc = new SSEncoder();
    enc.push({ event: "token", data: "a" });
    enc.push({ event: "token", data: "b" });
    enc.push({ event: "done", data: "[DONE]" });
    enc.close();

    const reader = enc.stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    reader.releaseLock();

    expect(chunks).toEqual([
      "event: token\ndata: a\n\n",
      "event: token\ndata: b\n\n",
      "event: done\ndata: [DONE]\n\n",
    ]);
  });
});

// ---------- resolveStreamingMode ----------

describe("resolveStreamingMode", () => {
  it('"adaptive" streams for deep_research', () => {
    expect(resolveStreamingMode("deep_research")).toBe("always");
  });

  it('"adaptive" returns JSON for simple_qa', () => {
    expect(resolveStreamingMode("simple_qa")).toBe("never");
  });

  it('"always" streams everything', () => {
    expect(
      resolveStreamingMode("deep_research", { ENVIRONMENT: "production" }),
    ).toBe("always");
  });

  it('"never" returns JSON', () => {
    expect(
      resolveStreamingMode("simple_qa", { ENVIRONMENT: "production" }),
    ).toBe("never");
  });
});

// ---------- createSSEResponse ----------

describe("createSSEResponse", () => {
  it("correct headers (Content-Type: text/event-stream, Cache-Control: no-cache)", () => {
    const enc = new SSEncoder();
    enc.close();
    const res = createSSEResponse(enc);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });
});
