/**
 * Lightweight Telemetry (Phase 1.5 — OpenTelemetry scaffold).
 *
 * Provides span + metric recording for API routes and LLM operations.
 * Phase 1: structured console output (JSON).
 * Phase 2: OTLP exporter → Grafana Cloud.
 *
 * Per TR-EP01-015: "Full-link trace viewable in Grafana" (Phase 2).
 * This module provides the instrumentation surface so that switching
 * to OTLP only requires changing the exporter, not the call sites.
 *
 * Usage in API routes:
 *   const span = startSpan("api.ask", { intent: "deep_research" });
 *   // ... do work ...
 *   span.end({ credits_used: 5 });
 */

// ============ Types ============

export interface SpanAttributes {
  [key: string]: string | number | boolean;
}

export interface SpanData {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: SpanAttributes;
  status: "ok" | "error";
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  attributes: SpanAttributes;
  type: "counter" | "gauge" | "histogram";
}

// ============ ID Generation ============

function randomId(length: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ============ Span ============

export class Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly startTime: number;
  readonly events: SpanEvent[] = [];
  status: "ok" | "error" = "ok";
  private endTime?: number;

  constructor(
    public readonly name: string,
    traceId: string,
    public readonly attributes: SpanAttributes = {},
    public readonly parentSpanId?: string,
  ) {
    this.traceId = traceId;
    this.spanId = randomId(16);
    this.startTime = Date.now();
  }

  /** Add a structured event to this span. */
  addEvent(name: string, attributes?: SpanAttributes): void {
    this.events.push({ name, timestamp: Date.now(), attributes });
  }

  /** Mark the span as errored. */
  setError(attributes?: SpanAttributes): void {
    this.status = "error";
    if (attributes) {
      Object.assign(this.attributes, attributes);
    }
  }

  /** End the span and record it. */
  end(extraAttributes?: SpanAttributes): SpanData {
    this.endTime = Date.now();
    if (extraAttributes) {
      Object.assign(this.attributes, extraAttributes);
    }

    const data: SpanData = {
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs: this.endTime - this.startTime,
      attributes: this.attributes,
      status: this.status,
      events: this.events,
    };

    // Record to the global sink
    recordSpan(data);

    return data;
  }
}

// ============ Global Telemetry State ============

const spans: SpanData[] = [];
const metrics: MetricPoint[] = [];
let enableConsoleExport = true;

// ============ API ============

/**
 * Start a new span. If parentSpan is provided, the new span is a child.
 *
 * @param name - Dot-separated span name (e.g., "api.ask", "llm.complete")
 * @param attributes - Initial attributes for the span
 * @param parentSpan - Optional parent span for tracing hierarchy
 */
export function startSpan(
  name: string,
  attributes?: SpanAttributes,
  parentSpan?: Span,
): Span {
  const traceId = parentSpan?.traceId ?? randomId(32);
  return new Span(name, traceId, attributes, parentSpan?.spanId);
}

/**
 * Record a metric data point.
 *
 * @param name - Metric name (e.g., "credits.charged", "llm.tokens")
 * @param value - Numeric value
 * @param type - Metric type: counter (cumulative), gauge (point-in-time), histogram (distribution)
 * @param attributes - Dimensional attributes for filtering/grouping
 */
export function recordMetric(
  name: string,
  value: number,
  type: "counter" | "gauge" | "histogram" = "gauge",
  attributes: SpanAttributes = {},
): void {
  const point: MetricPoint = {
    name,
    value,
    timestamp: Date.now(),
    attributes,
    type,
  };
  metrics.push(point);

  if (enableConsoleExport) {
    console.log(JSON.stringify({ telemetry: "metric", ...point }));
  }
}

/**
 * Get all recorded spans (for testing/export).
 */
export function getSpans(): SpanData[] {
  return [...spans];
}

/**
 * Get all recorded metrics (for testing/export).
 */
export function getMetrics(): MetricPoint[] {
  return [...metrics];
}

/**
 * Reset telemetry state (for tests).
 */
export function resetTelemetry(): void {
  spans.length = 0;
  metrics.length = 0;
}

/**
 * Configure console export (default: enabled).
 */
export function setConsoleExport(enabled: boolean): void {
  enableConsoleExport = enabled;
}

// ============ Internal ============

function recordSpan(data: SpanData): void {
  spans.push(data);

  if (enableConsoleExport) {
    console.log(JSON.stringify({ telemetry: "span", ...data }));
  }
}
