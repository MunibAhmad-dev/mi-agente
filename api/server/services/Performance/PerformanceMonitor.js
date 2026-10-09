/**
 * Performance Monitor Service
 * ==========================
 *
 * Sistema de monitoreo de rendimiento.
 * Incluye:
 * - Métricas en tiempo real
 * - Profiling de requests
 * - Alertas de rendimiento
 * - Dashboard de métricas
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const { EventEmitter } = require('events');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  // Metrics collection
  enabled: process.env.PERFORMANCE_MONITOR_ENABLED !== 'false',
  interval: parseInt(process.env.PERFORMANCE_INTERVAL || '60000', 10), // 1 minute

  // Thresholds for alerts
  thresholds: {
    responseTime: parseInt(process.env.ALERT_RESPONSE_TIME || '5000', 10), // 5s
    memoryUsage: parseFloat(process.env.ALERT_MEMORY_USAGE || '0.85'), // 85%
    cpuUsage: parseFloat(process.env.ALERT_CPU_USAGE || '0.80'), // 80%
    errorRate: parseFloat(process.env.ALERT_ERROR_RATE || '0.05'), // 5%
    queueLength: parseInt(process.env.ALERT_QUEUE_LENGTH || '100', 10),
  },

  // Retention
  metricsRetention: parseInt(process.env.METRICS_RETENTION || '3600000', 10), // 1 hour
  detailedRetention: parseInt(process.env.DETAILED_RETENTION || '300000', 10), // 5 minutes
};

// ============================================================================
// METRICS STORAGE
// ============================================================================

class MetricsStore {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.timers = new Map();
    this.series = new Map();
  }

  // Counter: Incremental value
  incrementCounter(name, value = 1, tags = {}) {
    const key = this.makeKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    return this.counters.get(key);
  }

  getCounter(name, tags = {}) {
    return this.counters.get(this.makeKey(name, tags)) || 0;
  }

  // Gauge: Current value
  setGauge(name, value, tags = {}) {
    const key = this.makeKey(name, tags);
    this.gauges.set(key, { value, timestamp: Date.now() });
  }

  getGauge(name, tags = {}) {
    return this.gauges.get(this.makeKey(name, tags))?.value || 0;
  }

  // Histogram: Distribution
  recordHistogram(name, value, tags = {}) {
    const key = this.makeKey(name, tags);
    const hist = this.histograms.get(key) || [];
    hist.push({ value, timestamp: Date.now() });

    // Keep last 1000 entries
    if (hist.length > 1000) {
      hist.shift();
    }

    this.histograms.set(key, hist);
  }

  getHistogramStats(name, tags = {}) {
    const hist = this.histograms.get(this.makeKey(name, tags)) || [];
    if (hist.length === 0) return null;

    const values = hist.map((h) => h.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      sum,
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      p50: this.percentile(values, 50),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99),
    };
  }

  percentile(sorted, p) {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // Timer: Start/Stop
  startTimer(name, tags = {}) {
    const key = this.makeKey(name, tags);
    this.timers.set(key, Date.now());
  }

  stopTimer(name, tags = {}) {
    const key = this.makeKey(name, tags);
    const start = this.timers.get(key);
    if (!start) return null;

    const duration = Date.now() - start;
    this.timers.delete(key);
    this.recordHistogram(name, duration, tags);
    return duration;
  }

  // Time Series: Historical data
  recordSeries(name, value, tags = {}) {
    const key = this.makeKey(name, tags);
    const series = this.series.get(key) || [];

    series.push({ value, timestamp: Date.now() });

    // Keep based on retention
    const cutoff = Date.now() - config.detailedRetention;
    const filtered = series.filter((s) => s.timestamp > cutoff);

    this.series.set(key, filtered);
    return filtered;
  }

  getSeries(name, tags = {}, options = {}) {
    const { from, to, limit } = options;
    const key = this.makeKey(name, tags);
    let series = this.series.get(key) || [];

    if (from) {
      series = series.filter((s) => s.timestamp >= from);
    }
    if (to) {
      series = series.filter((s) => s.timestamp <= to);
    }
    if (limit) {
      series = series.slice(-limit);
    }

    return series;
  }

  makeKey(name, tags) {
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return tagStr ? `${name}{${tagStr}}` : name;
  }

  // Get all metrics
  getAll() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(Array.from(this.gauges.entries()).map(([k, v]) => [k, v.value])),
    };
  }

  // Clear old data
  cleanup() {
    const now = Date.now();
    const cutoff = now - config.metricsRetention;

    for (const [key, hist] of this.histograms.entries()) {
      const filtered = hist.filter((h) => h.timestamp > cutoff);
      if (filtered.length === 0) {
        this.histograms.delete(key);
      } else {
        this.histograms.set(key, filtered);
      }
    }

    for (const [key, series] of this.series.entries()) {
      const filtered = series.filter((s) => s.timestamp > cutoff);
      if (filtered.length === 0) {
        this.series.delete(key);
      } else {
        this.series.set(key, filtered);
      }
    }
  }
}

const metrics = new MetricsStore();

// ============================================================================
// PERFORMANCE MONITOR
// ============================================================================

class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.intervalId = null;
    this.requestStats = new Map();
    this._history = [];
  }

  /**
   * Inicia el monitoreo
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Collect system metrics periodically
    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
      metrics.cleanup();
      this.checkThresholds();
      this.pushHistory();
    }, config.interval);

    // Initial collection
    this.collectSystemMetrics();
    this.pushHistory();

    logger.info('[Performance] Monitor started');
  }

  /**
   * Detiene el monitoreo
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('[Performance] Monitor stopped');
  }

  /**
   * Recolecta métricas del sistema
   */
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Memory
    metrics.setGauge('system.memory.heapUsed', memUsage.heapUsed);
    metrics.setGauge('system.memory.heapTotal', memUsage.heapTotal);
    metrics.setGauge('system.memory.rss', memUsage.rss);
    metrics.setGauge('system.memory.external', memUsage.external);

    const heapUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
    metrics.setGauge('system.memory.heapUsagePercent', heapUsagePercent);

    // CPU
    metrics.setGauge('system.cpu.user', cpuUsage.user);
    metrics.setGauge('system.cpu.system', cpuUsage.system);

    // Event Loop Lag
    const lag = this.getEventLoopLag();
    metrics.setGauge('system.eventLoop.lag', lag);

    // Uptime
    metrics.setGauge('system.uptime', process.uptime());

    // Active Handles/Requests
    metrics.setGauge('system.handles.active', process.resourceUsage()?.maxRSS || 0);

    // Record series
    metrics.recordSeries('system.memory.heapUsed', memUsage.heapUsed);
    metrics.recordSeries('system.memory.heapUsagePercent', heapUsagePercent);
    metrics.recordSeries('system.eventLoop.lag', lag);
  }

  /**
   * Obtiene el lag del event loop
   */
  getEventLoopLag() {
    const start = process.hrtime.bigint();

    // Small async operation
    return new Promise((resolve) =>
      setImmediate(() => {
        const end = process.hrtime.bigint();
        const lagMs = Number(end - start) / 1000000;
        resolve(lagMs);
      }),
    );
  }

  /**
   * Inicia tracking de un request
   */
  trackRequest(req) {
    req._startTime = Date.now();
    req._requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    metrics.incrementCounter('http.requests.total', 1, {
      method: req.method,
      path: this.normalizePath(req.path),
    });
  }

  /**
   * Finaliza tracking de un request
   */
  trackResponse(req, res) {
    const duration = Date.now() - req._startTime;
    const path = this.normalizePath(req.path);

    // Increment success/error counter
    const status = res.statusCode;
    const statusClass = Math.floor(status / 100) + 'xx';

    metrics.incrementCounter('http.responses.total', 1, {
      method: req.method,
      path,
      status: statusClass,
    });

    // Record histogram
    metrics.recordHistogram('http.request.duration', duration, {
      method: req.method,
      path,
    });

    // Record series
    metrics.recordSeries('http.request.duration', duration, { path });

    // Check threshold
    if (duration > config.thresholds.responseTime) {
      this.emit('slowRequest', {
        requestId: req._requestId,
        duration,
        method: req.method,
        path,
      });
    }

    return duration;
  }

  /**
   * Registra un error
   */
  trackError(error, context = {}) {
    metrics.incrementCounter('errors.total', 1, {
      type: error.name || 'Error',
      code: error.code,
    });

    this.emit('error', {
      error,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Verifica thresholds y emite alertas
   */
  checkThresholds() {
    // Memory usage
    const memUsage = metrics.getGauge('system.memory.heapUsagePercent');
    if (memUsage > config.thresholds.memoryUsage) {
      this.emit('alert', {
        type: 'memory',
        level: 'warning',
        message: `Memory usage at ${(memUsage * 100).toFixed(1)}%`,
        value: memUsage,
        threshold: config.thresholds.memoryUsage,
      });
    }

    // Event loop lag
    const lag = metrics.getGauge('system.eventLoop.lag');
    if (lag > 100) {
      // 100ms is concerning
      this.emit('alert', {
        type: 'eventLoop',
        level: lag > 500 ? 'critical' : 'warning',
        message: `Event loop lag at ${lag.toFixed(1)}ms`,
        value: lag,
        threshold: 100,
      });
    }

    // Error rate
    const totalRequests = metrics.getCounter('http.requests.total');
    const totalErrors = metrics.getCounter('errors.total');
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    if (errorRate > config.thresholds.errorRate) {
      this.emit('alert', {
        type: 'errorRate',
        level: 'warning',
        message: `Error rate at ${(errorRate * 100).toFixed(1)}%`,
        value: errorRate,
        threshold: config.thresholds.errorRate,
      });
    }
  }

  /**
   * Normaliza path para evitar cardinalidad excesiva
   */
  normalizePath(path) {
    // Replace IDs with placeholders
    return path
      .replace(/\/[0-9a-f]{24}/gi, '/:id')
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
      .replace(/\/\d+/g, '/:num')
      .substring(0, 100); // Limit length
  }

  /**
   * Obtiene dashboard de métricas
   */
  getDashboard() {
    const memUsage = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: this.formatBytes(memUsage.heapUsed),
        heapTotal: this.formatBytes(memUsage.heapTotal),
        heapPercent: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1),
        rss: this.formatBytes(memUsage.rss),
      },
      http: {
        requests: {
          total: metrics.getCounter('http.requests.total'),
        },
        responses: {
          total: metrics.getCounter('http.responses.total'),
          byStatus: {
            '2xx': metrics.getCounter('http.responses.total', { status: '2xx' }),
            '3xx': metrics.getCounter('http.responses.total', { status: '3xx' }),
            '4xx': metrics.getCounter('http.responses.total', { status: '4xx' }),
            '5xx': metrics.getCounter('http.responses.total', { status: '5xx' }),
          },
        },
        latency: metrics.getHistogramStats('http.request.duration'),
      },
      errors: {
        total: metrics.getCounter('errors.total'),
      },
      system: {
        eventLoop: {
          lag: metrics.getGauge('system.eventLoop.lag'),
        },
      },
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ==========================================================================
  // FIX (R35): la ruta /api/performance/* esperaba getSummary/getSnapshot,
  // que no existían en el monitor → 500. Adaptadores sobre getDashboard() y
  // los histogramas reales (sin placeholders).
  // ==========================================================================
  getSummary() {
    const dash = this.getDashboard();
    const hist = dash.http.latency || {};
    const byStatus = dash.http.responses?.byStatus || {};
    const total = dash.http.requests?.total || 0;
    const success = (byStatus['2xx'] || 0) + (byStatus['3xx'] || 0);
    const errors = (byStatus['4xx'] || 0) + (byStatus['5xx'] || 0) + (dash.errors?.total || 0);

    return {
      status: 'healthy',
      requests: {
        total,
        success,
        errors,
        errorRate: total > 0 ? `${((errors / total) * 100).toFixed(1)}%` : '0%',
      },
      latency: {
        count: hist.count || 0,
        avg: Math.round(hist.avg || 0),
        min: Math.round(hist.min || 0),
        max: Math.round(hist.max || 0),
        p50: Math.round(hist.p50 || 0),
        p90: Math.round(hist.p90 || 0),
        p95: Math.round(hist.p95 || 0),
        p99: Math.round(hist.p99 || 0),
      },
      memory: {
        heapUsed: this.parseMemBytes(dash.memory?.heapUsed),
        heapTotal: this.parseMemBytes(dash.memory?.heapTotal),
        heapPercent: parseFloat(dash.memory?.heapPercent) || 0,
        rss: this.parseMemBytes(dash.memory?.rss),
      },
      uptime: Math.round(dash.uptime || 0),
    };
  }

  getSnapshot() {
    const summary = this.getSummary();
    return {
      timestamp: Date.now(),
      requests: {
        total: summary.requests.total,
        success: summary.requests.success,
        errors: summary.requests.errors,
        byStatus: this.getDashboard().http.responses?.byStatus || {},
      },
      latency: summary.latency,
      memory: summary.memory,
      endpoints: [],
      slowEndpoints: [],
    };
  }

  get history() {
    return this._history;
  }

  pushHistory() {
    this._history.push(this.getSnapshot());
    if (this._history.length > 120) {
      this._history.shift();
    }
  }

  parseMemBytes(bytes) {
    if (typeof bytes === 'number') return Math.round(bytes / (1024 * 1024));
    const match = /^([\d.]+)\s*([KMGTP]?B)$/i.exec(String(bytes || '').trim());
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, PB: 1024 ** 5 };
    return Math.round((value * (mult[unit] || 1)) / (1024 * 1024));
  }
}

// Singleton
const monitor = new PerformanceMonitor();

// ============================================================================
// MIDDLEWARE
// ============================================================================

function performanceMiddleware(req, res, next) {
  if (!config.enabled) return next();

  monitor.trackRequest(req);

  const originalEnd = res.end;
  res.end = function (...args) {
    monitor.trackResponse(req, res);
    return originalEnd.apply(this, args);
  };

  // Track uncaught errors
  req.on('error', (error) => {
    monitor.trackError(error, { requestId: req._requestId });
  });

  next();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Monitor
  monitor,
  performanceMiddleware,

  // Metrics store
  metrics,

  // Configuration
  config,

  // Helpers
  getDashboard: () => monitor.getDashboard(),
  getPerformanceMonitor: () => monitor,
  trackError: (error, context) => monitor.trackError(error, context),

  // Start/Stop
  start: () => monitor.start(),
  stop: () => monitor.stop(),
};
