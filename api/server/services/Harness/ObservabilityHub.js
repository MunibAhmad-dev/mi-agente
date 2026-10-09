/**
 * ObservabilityHub — Central observability for the agent harness.
 *
 * Provides:
 *   - Structured event logging (every significant action)
 *   - Execution tracing (trace ID → timeline of events)
 *   - Metrics collection (counters, gauges, histograms)
 *   - Performance tracking (latency per operation)
 *   - Dashboard-ready data export
 *   - Error aggregation
 *
 * All data is in-memory (no external dependency).
 * Export as JSON for dashboards, Langfuse, OpenTelemetry, etc.
 */

const crypto = require('crypto');

const logger = {
  info: (...args) => console.info('[ObservabilityHub]', ...args),
};

/**
 * ObservabilityHub — central observability.
 */
class ObservabilityHub {
  constructor(config = {}) {
    this.config = {
      maxEvents: config.maxEvents || 10000,
      maxTraces: config.maxTraces || 500,
      enableConsoleLog: config.enableConsoleLog || false,
      ...config,
    };

    this._events = [];
    this._traces = new Map();       // traceId → events[]
    this._counters = new Map();     // name → number
    this._gauges = new Map();       // name → number
    this._histograms = new Map();   // name → number[]
    this._errors = [];
    this._startTime = Date.now();
  }

  // ============================================================
  // EVENT LOGGING
  // ============================================================

  /**
   * Log a structured event.
   */
  logEvent(event) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: event.type || 'info',
      source: event.source || 'unknown',
      message: event.message || '',
      data: event.data || null,
      traceId: event.traceId || null,
    };

    this._events.push(entry);
    if (this._events.length > this.config.maxEvents) {
      this._events = this._events.slice(-Math.floor(this.config.maxEvents / 2));
    }

    // Add to trace if traceId provided
    if (entry.traceId) {
      if (!this._traces.has(entry.traceId)) {
        this._traces.set(entry.traceId, []);
      }
      this._traces.get(entry.traceId).push(entry);
    }

    if (this.config.enableConsoleLog) {
      const logFn = entry.type === 'error' ? console.error :
                    entry.type === 'warn' ? console.warn : console.log;
      logFn(`[${entry.source}] ${entry.message}`);
    }

    return entry;
  }

  // ============================================================
  // TRACING
  // ============================================================

  /**
   * Start a new trace.
   */
  startTrace(name) {
    const traceId = crypto.randomUUID();
    const trace = {
      id: traceId,
      name,
      startedAt: Date.now(),
      events: [],
      status: 'running',
    };
    this._traces.set(traceId, [trace]);

    this.logEvent({
      type: 'trace_start',
      source: name,
      message: `Trace started: ${name}`,
      traceId,
    });

    return traceId;
  }

  /**
   * Add an event to a trace.
   */
  traceEvent(traceId, event) {
    this.logEvent({
      ...event,
      traceId,
    });
  }

  /**
   * End a trace.
   */
  endTrace(traceId, status = 'completed') {
    const events = this._traces.get(traceId);
    if (events && events.length > 0) {
      const trace = events[0];
      trace.endedAt = Date.now();
      trace.duration = trace.endedAt - trace.startedAt;
      trace.status = status;
    }

    this.logEvent({
      type: 'trace_end',
      source: 'trace',
      message: `Trace ended: ${status}`,
      traceId,
      data: { duration: events?.[0]?.duration },
    });
  }

  // ============================================================
  // METRICS
  // ============================================================

  /**
   * Increment a counter.
   */
  counter(name, value = 1) {
    this._counters.set(name, (this._counters.get(name) || 0) + value);
  }

  /**
   * Set a gauge value.
   */
  gauge(name, value) {
    this._gauges.set(name, value);
  }

  /**
   * Record a histogram value (for latency, token counts, etc.)
   */
  histogram(name, value) {
    if (!this._histograms.has(name)) {
      this._histograms.set(name, []);
    }
    const hist = this._histograms.get(name);
    hist.push(value);
    if (hist.length > 1000) hist.shift();
  }

  // ============================================================
  // ERROR TRACKING
  // ============================================================

  /**
   * Record an error.
   */
  recordError(error, context = {}) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: error.message || String(error),
      stack: error.stack?.slice(0, 500),
      source: context.source || 'unknown',
      category: context.category || 'unknown',
      recoverable: context.recoverable !== false,
    };

    this._errors.push(entry);
    if (this._errors.length > 500) {
      this._errors = this._errors.slice(-250);
    }

    this.counter('errors');
    this.counter(`errors.${entry.category}`);

    this.logEvent({
      type: 'error',
      source: entry.source,
      message: entry.message,
      data: { category: entry.category, stack: entry.stack },
    });

    return entry;
  }

  // ============================================================
  // EXPORTS
  // ============================================================

  /**
   * Get recent events.
   */
  getEvents(limit = 50, type = null) {
    let events = this._events;
    if (type) events = events.filter(e => e.type === type);
    return events.slice(-limit);
  }

  /**
   * Get a trace by ID.
   */
  getTrace(traceId) {
    return this._traces.get(traceId) || null;
  }

  /**
   * Get recent traces.
   */
  getTraces(limit = 20) {
    const traces = [];
    for (const [, events] of this._traces) {
      if (events.length > 0 && events[0].name) {
        traces.push(events[0]);
      }
    }
    return traces.slice(-limit);
  }

  /**
   * Get all metrics.
   */
  getMetrics() {
    const counters = {};
    for (const [k, v] of this._counters) counters[k] = v;

    const gauges = {};
    for (const [k, v] of this._gauges) gauges[k] = v;

    const histograms = {};
    for (const [k, v] of this._histograms) {
      const sorted = [...v].sort((a, b) => a - b);
      histograms[k] = {
        count: v.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: v.reduce((a, b) => a + b, 0) / v.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
      };
    }

    return { counters, gauges, histograms };
  }

  /**
   * Get error summary.
   */
  getErrorSummary() {
    const byCategory = {};
    for (const err of this._errors) {
      byCategory[err.category] = (byCategory[err.category] || 0) + 1;
    }
    return {
      total: this._errors.length,
      byCategory,
      recent: this._errors.slice(-10),
    };
  }

  /**
   * Export full dashboard data.
   */
  exportDashboard() {
    return {
      uptime: Date.now() - this._startTime,
      metrics: this.getMetrics(),
      errors: this.getErrorSummary(),
      recentEvents: this.getEvents(30),
      recentTraces: this.getTraces(10),
      traceCount: this._traces.size,
      eventCount: this._events.length,
    };
  }

  /**
   * Clear all data.
   */
  clear() {
    this._events = [];
    this._traces.clear();
    this._counters.clear();
    this._gauges.clear();
    this._histograms.clear();
    this._errors = [];
  }
}

module.exports = { ObservabilityHub };
