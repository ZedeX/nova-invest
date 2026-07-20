/**
 * Unit tests for Telemetry module (Phase 1.5).
 *
 * Covers:
 *   - Span lifecycle: start → addEvent → end
 *   - Span hierarchy (parent → child)
 *   - Metric recording (counter, gauge, histogram)
 *   - Error marking
 *   - Console export toggle
 *   - Reset for test isolation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  startSpan,
  recordMetric,
  getSpans,
  getMetrics,
  resetTelemetry,
  setConsoleExport,
} from "@/lib/telemetry";

beforeEach(() => {
  resetTelemetry();
  setConsoleExport(false); // Silence console during tests
});

describe("Telemetry: Span lifecycle", () => {
  it("startSpan creates a span with correct name and attributes", () => {
    const span = startSpan("api.ask", { intent: "deep_research" });
    expect(span.name).toBe("api.ask");
    expect(span.attributes.intent).toBe("deep_research");
    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();
    expect(span.status).toBe("ok");
  });

  it("span.end() records duration and returns SpanData", () => {
    const span = startSpan("test.op");
    const data = span.end({ result: "success" });

    expect(data.name).toBe("test.op");
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
    expect(data.attributes.result).toBe("success");
    expect(data.status).toBe("ok");
  });

  it("span.addEvent() records events with timestamps", () => {
    const span = startSpan("test.op");
    span.addEvent("step_1", { key: "value" });
    span.addEvent("step_2");
    const data = span.end();

    expect(data.events).toHaveLength(2);
    expect(data.events[0].name).toBe("step_1");
    expect(data.events[0].attributes?.key).toBe("value");
    expect(data.events[1].name).toBe("step_2");
  });

  it("span.setError() marks the span as error", () => {
    const span = startSpan("test.op");
    span.setError({ error_code: "TIMEOUT" });
    const data = span.end();

    expect(data.status).toBe("error");
    expect(data.attributes.error_code).toBe("TIMEOUT");
  });
});

describe("Telemetry: Span hierarchy", () => {
  it("child span inherits parent traceId", () => {
    const parent = startSpan("api.ask");
    const child = startSpan("llm.complete", { intent: "deep_research" }, parent);

    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  it("spans without parent have different traceIds", () => {
    const span1 = startSpan("op1");
    const span2 = startSpan("op2");

    expect(span1.traceId).not.toBe(span2.traceId);
  });
});

describe("Telemetry: Metrics", () => {
  it("recordMetric stores metric points", () => {
    recordMetric("credits.charged", 5, "counter", { action: "ask_deep" });

    const metrics = getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe("credits.charged");
    expect(metrics[0].value).toBe(5);
    expect(metrics[0].type).toBe("counter");
    expect(metrics[0].attributes.action).toBe("ask_deep");
  });

  it("recordMetric defaults to gauge type", () => {
    recordMetric("latency.ms", 120);

    const metrics = getMetrics();
    expect(metrics[0].type).toBe("gauge");
  });

  it("multiple metrics accumulate", () => {
    recordMetric("requests", 1, "counter");
    recordMetric("latency", 50, "gauge");
    recordMetric("tokens", 100, "histogram");

    expect(getMetrics()).toHaveLength(3);
  });
});

describe("Telemetry: getSpans/getMetrics", () => {
  it("getSpans returns all completed spans", () => {
    startSpan("op1").end();
    startSpan("op2").end();

    expect(getSpans()).toHaveLength(2);
  });

  it("incomplete spans are not returned", () => {
    startSpan("incomplete"); // Not ended

    expect(getSpans()).toHaveLength(0);
  });
});

describe("Telemetry: Console export", () => {
  it("setConsoleExport(true) logs spans to console", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setConsoleExport(true);

    startSpan("test.op").end();

    expect(logSpy).toHaveBeenCalled();
    const logged = JSON.parse(logSpy.mock.calls[0][0]) as { telemetry: string; name: string };
    expect(logged.telemetry).toBe("span");
    expect(logged.name).toBe("test.op");

    logSpy.mockRestore();
    setConsoleExport(false);
  });

  it("setConsoleExport(false) does not log", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setConsoleExport(false);

    startSpan("test.op").end();

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe("Telemetry: resetTelemetry", () => {
  it("clears all spans and metrics", () => {
    startSpan("op").end();
    recordMetric("m", 1);

    expect(getSpans()).toHaveLength(1);
    expect(getMetrics()).toHaveLength(1);

    resetTelemetry();

    expect(getSpans()).toHaveLength(0);
    expect(getMetrics()).toHaveLength(0);
  });
});
