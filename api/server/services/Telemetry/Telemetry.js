/**
 * Telemetry Service - Sistema de Telemetría y Tracing (JavaScript)
 *
 * Proporciona observabilidad completa del sistema:
 * - Tracing distribuido
 * - Logging estructurado
 * - Alertas y notificaciones
 * - Dashboard data
 */

const EventEmitter = require('events');
const { getMetricsCollector } = require('../MetricsCollector');

// Use the project's Winston logger (writes to files + console with rotation)
let _winstonLogger = null;
function _logger() {
  if (!_winstonLogger) {
    try {
      _winstonLogger = require('@librechat/data-schemas').logger;
    } catch {
      _winstonLogger = { debug: console.log, info: console.log, warn: console.warn, error: console.error };
    }
  }
  return _winstonLogger;
}
const logger = {
  debug: (...args) => _logger().debug('[Telemetry]', ...args),
  info:  (...args) => _logger().info('[Telemetry]', ...args),
  warn:  (...args) => _logger().warn('[Telemetry]', ...args),
  error: (...args) => _logger().error('[Telemetry]', ...args),
};

// Niveles de log
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

// Estados de trace
const TraceStatus = {
  OK: 'ok',
  ERROR: 'error',
  TIMEOUT: 'timeout',
};

// Tipos de alerta
const AlertType = {
  ERROR_RATE: 'error_rate',
  LATENCY: 'latency',
  MEMORY: 'memory',
  CPU: 'cpu',
  RATE_LIMIT: 'rate_limit',
  CUSTOM: 'custom',
};

// Severidad de alerta
const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

// Trace Span
class TraceSpan {
  constructor(traceId, name, parentSpanId = null) {
    this.traceId = traceId;
    this.spanId = this.generateId();
    this.parentSpanId = parentSpanId;
    this.name = name;
    this.startTime = Date.now();
    this.endTime = null;
    this.duration = null;
    this.status = TraceStatus.OK;
    this.tags = {};
    this.events = [];
    this.error = null;
  }

  generateId() {
    return Math.random().toString(16).substring(2, 18);
  }

  setTag(key, value) {
    this.tags[key] = value;
    return this;
  }

  addEvent(name, attributes = {}) {
    this.events.push({ name, timestamp: Date.now(), attributes });
    return this;
  }

  setError(error) {
    this.error = { message: error.message, stack: error.stack, name: error.name };
    this.status = TraceStatus.ERROR;
    return this;
  }

  finish() {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    return this;
  }

  toJSON() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      status: this.status,
      duration: this.duration,
      startTime: this.startTime,
      endTime: this.endTime,
      tags: this.tags,
      events: this.events,
      error: this.error,
    };
  }
}

// Trace Collection
class Trace {
  constructor(traceId) {
    this.traceId = traceId;
    this.spans = [];
    this.startTime = Date.now();
    this.endTime = null;
  }

  addSpan(span) {
    this.spans.push(span);
    return span;
  }

  finish() {
    this.endTime = Date.now();
    return this;
  }

  getDuration() {
    return this.endTime ? this.endTime - this.startTime : null;
  }
}

// Log Entry
class LogEntry {
  constructor(level, message, context = {}) {
    this.id = Math.random().toString(16).substring(2, 18);
    this.timestamp = Date.now();
    this.level = level;
    this.message = message;
    this.context = context;
    this.tags = [];
    this.traceId = null;
    this.spanId = null;
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      level: this.level,
      message: this.message,
      context: this.context,
      tags: this.tags,
      traceId: this.traceId,
      spanId: this.spanId,
    };
  }
}

// Alert
class Alert {
  constructor(type, message, severity, metadata = {}) {
    this.id = Math.random().toString(16).substring(2, 18);
    this.type = type;
    this.message = message;
    this.severity = severity;
    this.metadata = metadata;
    this.createdAt = Date.now();
    this.resolvedAt = null;
    this.status = 'active';
  }

  resolve() {
    this.resolvedAt = Date.now();
    this.status = 'resolved';
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      message: this.message,
      severity: this.severity,
      metadata: this.metadata,
      createdAt: this.createdAt,
      resolvedAt: this.resolvedAt,
      status: this.status,
    };
  }
}

// Telemetry Service
class TelemetryService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      serviceName: config.serviceName || 'mi-librechat',
      enableTracing: config.enableTracing !== false,
      enableLogging: config.enableLogging !== false,
      enableAlerts: config.enableAlerts !== false,
      logRetention: config.logRetention || 10000,
      traceRetention: config.traceRetention || 1000,
      alertRetention: config.alertRetention || 100,
      ...config,
    };

    this.metrics = getMetricsCollector();
    this.traces = new Map();
    this.activeSpans = new Map();
    this.logs = [];
    this.maxLogs = this.config.logRetention;
    this.alerts = [];
    this.maxAlerts = this.config.alertRetention;

    logger.info('[Telemetry] Service initialized: ' + this.config.serviceName);
  }

  startTrace(name, tags = {}) {
    if (!this.config.enableTracing) return null;
    const traceId = this.generateId();
    const trace = new Trace(traceId);
    this.traces.set(traceId, trace);
    const span = trace.addSpan(new TraceSpan(traceId, name));
    this.activeSpans.set(span.spanId, span);
    span.setTag('service', this.config.serviceName);
    Object.entries(tags).forEach(([key, value]) => span.setTag(key, value));
    if (this.traces.size > this.config.traceRetention) {
      const oldest = this.traces.keys().next().value;
      this.traces.delete(oldest);
    }
    return span;
  }

  startSpan(name, parentSpanId = null, tags = {}) {
    if (!this.config.enableTracing) return null;
    const traceId = parentSpanId ? this.activeSpans.get(parentSpanId).traceId : this.generateId();
    const span = new TraceSpan(traceId, name, parentSpanId);
    this.activeSpans.set(span.spanId, span);
    span.setTag('service', this.config.serviceName);
    Object.entries(tags).forEach(([key, value]) => span.setTag(key, value));
    return span;
  }

  endSpan(span, error = null) {
    if (!span) return;
    span.finish();
    if (error) span.setError(error);
    this.activeSpans.delete(span.spanId);
    if (span.duration) this.metrics.recordLatency('trace_' + span.name, span.duration);
    this.emit('span.finished', span.toJSON());
  }

  async trace(name, fn, tags = {}) {
    const span = this.startTrace(name, tags);
    try {
      const result = await fn(span);
      if (span) this.endSpan(span);
      return result;
    } catch (error) {
      if (span) this.endSpan(span, error);
      throw error;
    }
  }

  log(level, message, context = {}) {
    if (!this.config.enableLogging) return null;
    const entry = new LogEntry(level, message, context);
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.emit('log', entry.toJSON());
    return entry;
  }

  debug(message, context) {
    return this.log(LogLevel.DEBUG, message, context);
  }
  info(message, context) {
    return this.log(LogLevel.INFO, message, context);
  }
  warn(message, context) {
    return this.log(LogLevel.WARN, message, context);
  }
  error(message, context) {
    return this.log(LogLevel.ERROR, message, context);
  }
  fatal(message, context) {
    return this.log(LogLevel.FATAL, message, context);
  }

  createAlert(type, message, severity = AlertSeverity.WARNING, metadata = {}) {
    if (!this.config.enableAlerts) return null;
    const alert = new Alert(type, message, severity, metadata);
    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) this.alerts.shift();
    logger.warn('[Telemetry] Alert: [' + severity + '] ' + message);
    this.emit('alert.created', alert.toJSON());
    return alert;
  }

  resolveAlert(alertId) {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolve();
      this.emit('alert.resolved', alert.toJSON());
    }
    return alert;
  }

  getDashboardData() {
    const systemMetrics = this.metrics.getSummary();
    const recentLogs = this.logs.slice(-100).map((l) => l.toJSON());
    const activeAlerts = this.alerts.filter((a) => a.status === 'active').map((a) => a.toJSON());
    const traceStats = {
      total: this.traces.size,
      active: this.activeSpans.size,
    };

    return {
      timestamp: Date.now(),
      service: this.config.serviceName,
      system: systemMetrics.system,
      requests: systemMetrics.requests,
      errors: systemMetrics.errors,
      logs: recentLogs,
      alerts: activeAlerts,
      traces: traceStats,
      health: this.getHealthStatus(),
    };
  }

  getHealthStatus() {
    const alerts = this.alerts.filter((a) => a.status === 'active');
    const criticalAlerts = alerts.filter((a) => a.severity === AlertSeverity.CRITICAL);
    let status = 'healthy';
    if (criticalAlerts.length > 0) status = 'critical';
    else if (alerts.length > 0) status = 'degraded';
    return {
      status,
      uptime: Math.floor(process.uptime()),
      activeAlerts: alerts.length,
      criticalAlerts: criticalAlerts.length,
    };
  }

  generateId() {
    return (
      Math.random().toString(16).substring(2, 18) + Math.random().toString(16).substring(2, 18)
    );
  }
}

let telemetryInstance = null;

function getTelemetry(config) {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryService(config);
  }
  return telemetryInstance;
}

function createTelemetry(config) {
  telemetryInstance = new TelemetryService(config);
  return telemetryInstance;
}

module.exports = {
  TelemetryService,
  TraceSpan,
  Trace,
  LogEntry,
  Alert,
  LogLevel,
  TraceStatus,
  AlertType,
  AlertSeverity,
  getTelemetry,
  createTelemetry,
};
