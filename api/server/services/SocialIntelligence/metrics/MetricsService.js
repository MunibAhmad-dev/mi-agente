/**
 * MetricsService — Lightweight observability
 * ===========================================
 * Tracks request counts, response times, errors, and connector performance.
 * No external dependencies — in-memory metrics with periodic flush.
 */

const { createLogger } = require('../logger');
const logger = createLogger('Metrics');

class MetricsService {
  constructor() {
    this._counters = new Map();   // key → number
    this._histograms = new Map(); // key → [values]
    this._gauges = new Map();     // key → number
    this._startTime = Date.now();
    this._requestCount = 0;
    this._errorCount = 0;
    this._totalResponseTime = 0;
  }

  // ─── COUNTERS ────────────────────────────────────────────

  increment(name, value = 1) {
    this._counters.set(name, (this._counters.get(name) || 0) + value);
  }

  decrement(name, value = 1) {
    this._counters.set(name, (this._counters.get(name) || 0) - value);
  }

  getCounter(name) {
    return this._counters.get(name) || 0;
  }

  // ─── HISTOGRAMS ──────────────────────────────────────────

  observe(name, value) {
    if (!this._histograms.has(name)) this._histograms.set(name, []);
    const hist = this._histograms.get(name);
    hist.push(value);
    // Keep last 1000 values
    if (hist.length > 1000) hist.shift();
  }

  getHistogram(name) {
    const values = this._histograms.get(name) || [];
    if (values.length === 0) return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      count: sorted.length,
      avg: Math.round(sum / sorted.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
    };
  }

  // ─── GAUGES ──────────────────────────────────────────────

  setGauge(name, value) {
    this._gauges.set(name, value);
  }

  getGauge(name) {
    return this._gauges.get(name) || 0;
  }

  // ─── REQUEST TRACKING ────────────────────────────────────

  recordRequest(method, path, statusCode, durationMs) {
    this._requestCount++;
    this._totalResponseTime += durationMs;

    const key = `${method} ${path}`;
    this.increment(`requests.${key}`);
    this.increment(`status.${statusCode}`);
    this.observe('response_time', durationMs);

    if (statusCode >= 400) {
      this._errorCount++;
      this.increment('errors.total');
    }
  }

  recordConnectorRequest(connector, success, durationMs) {
    this.increment(`connector.${connector}.requests`);
    this.observe(`connector.${connector}.time`, durationMs);
    if (success) {
      this.increment(`connector.${connector}.success`);
    } else {
      this.increment(`connector.${connector}.errors`);
    }
  }

  // ─── METRICS ENDPOINT ────────────────────────────────────

  getMetrics() {
    const uptime = Math.floor((Date.now() - this._startTime) / 1000);
    return {
      uptime,
      requests: {
        total: this._requestCount,
        errors: this._errorCount,
        errorRate: this._requestCount > 0 ? Math.round((this._errorCount / this._requestCount) * 10000) / 100 : 0,
        avgResponseTime: this._requestCount > 0 ? Math.round(this._totalResponseTime / this._requestCount) : 0,
      },
      responseTime: this.getHistogram('response_time'),
      counters: Object.fromEntries(this._counters),
      gauges: Object.fromEntries(this._gauges),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  // ─── REQUEST LOGGING MIDDLEWARE ──────────────────────────

  middleware() {
    const self = this;
    return (req, res, next) => {
      const start = Date.now();
      const originalEnd = res.end;
      res.end = function (...args) {
        const duration = Date.now() - start;
        self.recordRequest(req.method, req.path, res.statusCode, duration);
        originalEnd.apply(res, args);
      };
      next();
    };
  }
}

// Singleton
let _instance = null;
function getMetricsService() {
  if (!_instance) _instance = new MetricsService();
  return _instance;
}

module.exports = { MetricsService, getMetricsService };
