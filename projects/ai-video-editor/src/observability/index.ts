/**
 * AI Creative OS - Observability Engine
 * Structured logging, metrics, tracing, error tracking, task history.
 */

import type { UniqueId, Timestamp } from "../types/index.js";
import { Logger, EventBus, generateId, timestamp } from "../core/index.js";

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: Timestamp;
  tags?: Record<string, string>;
}

export interface TraceSpan {
  id: UniqueId;
  parentId?: UniqueId;
  operation: string;
  service: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  duration?: number;
  status: "ok" | "error";
  attributes?: Record<string, unknown>;
}

export class ObservabilityEngine {
  private logger = new Logger("Observability");
  private eventBus: EventBus;
  private metrics: Metric[] = [];
  private traces: TraceSpan[] = [];
  private errors: ErrorRecord[] = [];
  private maxMetrics = 10000;
  private maxTraces = 5000;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  // ─── Metrics ────────────────────────────────────────────────────────

  recordMetric(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    this.metrics.push({ name, value, unit, timestamp: timestamp(), tags });
    if (this.metrics.length > this.maxMetrics) this.metrics = this.metrics.slice(-this.maxMetrics);
  }

  getMetrics(name?: string, since?: Timestamp): Metric[] {
    let filtered = name ? this.metrics.filter((m) => m.name === name) : this.metrics;
    if (since) filtered = filtered.filter((m) => m.timestamp >= since);
    return filtered;
  }

  // ─── Tracing ────────────────────────────────────────────────────────

  startTrace(operation: string, service: string, parentId?: UniqueId): UniqueId {
    const span: TraceSpan = {
      id: generateId(),
      parentId,
      operation,
      service,
      startTime: timestamp(),
      status: "ok",
    };
    this.traces.push(span);
    return span.id;
  }

  endTrace(spanId: UniqueId, status: "ok" | "error" = "ok"): void {
    const span = this.traces.find((t) => t.id === spanId);
    if (span) {
      span.endTime = timestamp();
      span.duration = span.endTime - span.startTime;
      span.status = status;
    }
  }

  // ─── Error Tracking ─────────────────────────────────────────────────

  recordError(error: Error, context?: Record<string, unknown>): void {
    this.errors.push({
      id: generateId(),
      timestamp: timestamp(),
      message: error.message,
      stack: error.stack,
      context,
    });
    this.logger.error("Error recorded", { message: error.message, context });
  }

  getErrors(limit = 50): ErrorRecord[] {
    return this.errors.slice(-limit);
  }

  getErrorRate(since?: Timestamp): number {
    const sinceTime = since ?? timestamp() - 3600000;
    const recentErrors = this.errors.filter((e) => e.timestamp >= sinceTime);
    return recentErrors.length;
  }

  // ─── System Overview ────────────────────────────────────────────────

  getOverview(): {
    metrics: number;
    traces: number;
    errors: number;
    avgTraceDuration: number;
    errorRate: number;
  } {
    const durations = this.traces.filter((t) => t.duration).map((t) => t.duration!);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      metrics: this.metrics.length,
      traces: this.traces.length,
      errors: this.errors.length,
      avgTraceDuration: Math.round(avgDuration),
      errorRate: this.getErrorRate(),
    };
  }
}

interface ErrorRecord {
  id: UniqueId;
  timestamp: Timestamp;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}
