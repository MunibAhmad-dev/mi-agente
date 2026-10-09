/**
 * DistributedTracer.js — Distributed Tracing System
 * 
 * Tracks operations across the system:
 * - Create traces
 * - Add spans
 * - Track timing
 * - Track dependencies
 * - Export traces
 * 
 * License: MIT
 * RAM: ~3MB
 */

const { EventEmitter } = require('events');

// Use the project's Winston logger so traces land in the rotating log files
let _winstonLogger = null;
function _wl() {
  if (!_winstonLogger) {
    try { _winstonLogger = require('@librechat/data-schemas').logger; }
    catch { _winstonLogger = { debug: console.log, info: console.info, warn: console.warn, error: console.error }; }
  }
  return _winstonLogger;
}
const logger = {
  debug: (...args) => _wl().debug('[DistributedTracer]', ...args),
  info:  (...args) => _wl().info('[DistributedTracer]', ...args),
  warn:  (...args) => _wl().warn('[DistributedTracer]', ...args),
  error: (...args) => _wl().error('[DistributedTracer]', ...args),
};

class DistributedTracer extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'DistributedTracer';
        this._traces = new Map();
        this._maxTraces = config.maxTraces || 1000;
    }

    /**
     * Start a new trace.
     */
    startTrace(name, metadata = {}) {
        const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

        const trace = {
            id: traceId,
            name,
            metadata,
            spans: [],
            startTime: Date.now(),
            endTime: null,
            status: 'active',
        };

        this._traces.set(traceId, trace);
        this._pruneOldTraces();
        this.emit('traceStarted', { traceId, name });
        return traceId;
    }

    /**
     * Start a span within a trace.
     */
    startSpan(traceId, spanName, metadata = {}) {
        const trace = this._traces.get(traceId);
        if (!trace) return null;

        const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        const span = {
            id: spanId,
            name: spanName,
            metadata,
            startTime: Date.now(),
            endTime: null,
            status: 'active',
            events: [],
        };

        trace.spans.push(span);
        return spanId;
    }

    /**
     * End a span.
     */
    endSpan(traceId, spanId, status = 'ok') {
        const trace = this._traces.get(traceId);
        if (!trace) return false;

        const span = trace.spans.find(s => s.id === spanId);
        if (!span) return false;

        span.endTime = Date.now();
        span.status = status;
        span.duration = span.endTime - span.startTime;
        return true;
    }

    /**
     * Add an event to a span.
     */
    addEvent(traceId, spanId, eventName, data = {}) {
        const trace = this._traces.get(traceId);
        if (!trace) return false;

        const span = trace.spans.find(s => s.id === spanId);
        if (!span) return false;

        span.events.push({
            name: eventName,
            data,
            timestamp: Date.now(),
        });
        return true;
    }

    /**
     * End a trace.
     */
    endTrace(traceId, status = 'ok') {
        const trace = this._traces.get(traceId);
        if (!trace) return false;

        trace.endTime = Date.now();
        trace.duration = trace.endTime - trace.startTime;
        trace.status = status;
        this.emit('traceCompleted', { traceId, duration: trace.duration });
        return true;
    }

    /**
     * Get a trace.
     */
    getTrace(traceId) {
        return this._traces.get(traceId) || null;
    }

    /**
     * Get recent traces.
     */
    getRecentTraces(limit = 10) {
        return [...this._traces.values()]
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);
    }

    /**
     * Get trace summary.
     */
    getSummary() {
        const traces = [...this._traces.values()];
        return {
            totalTraces: traces.length,
            activeTraces: traces.filter(t => t.status === 'active').length,
            completedTraces: traces.filter(t => t.status === 'ok').length,
            failedTraces: traces.filter(t => t.status === 'error').length,
            avgDuration: traces.length > 0
                ? Math.round(traces.filter(t => t.duration).reduce((sum, t) => sum + t.duration, 0) / traces.length)
                : 0,
        };
    }

    _pruneOldTraces() {
        if (this._traces.size > this._maxTraces) {
            const sorted = [...this._traces.entries()].sort((a, b) => a[1].startTime - b[1].startTime);
            const toDelete = sorted.slice(0, sorted.length - this._maxTraces);
            for (const [id] of toDelete) {
                this._traces.delete(id);
            }
        }
    }
}

module.exports = { DistributedTracer };
module.exports.default = DistributedTracer;
