/**
 * MetricsCollector — Performance metrics collection and analysis
 * License: MIT — Zero cost
 */

class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.histograms = new Map();
    this.initialized = false;
  }

  initialize() { this.initialized = true; return { status: 'ok', module: 'MetricsCollector' }; }

  /**
   * Record a metric value
   */
  record(name, value, { tags = {} } = {}) {
    if (!this.metrics.has(name)) this.metrics.set(name, []);
    const entry = { value, tags, timestamp: Date.now() };
    this.metrics.get(name).push(entry);
    // Keep only last 10000 entries per metric
    if (this.metrics.get(name).length > 10000) {
      this.metrics.set(name, this.metrics.get(name).slice(-5000));
    }
  }

  /**
   * Increment a counter
   */
  increment(name, value = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }

  /**
   * Record histogram value
   */
  histogram(name, value) {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name).push(value);
    if (this.histograms.get(name).length > 10000) {
      this.histograms.set(name, this.histograms.get(name).slice(-5000));
    }
  }

  /**
   * Get metric summary
   */
  getSummary(name) {
    const values = (this.metrics.get(name) || []).map(e => e.value);
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * Get histogram summary
   */
  getHistogramSummary(name) {
    const values = this.histograms.get(name) || [];
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)]
    };
  }

  getStats() {
    return {
      metrics: this.metrics.size,
      counters: Object.fromEntries(this.counters),
      histograms: this.histograms.size,
      initialized: this.initialized
    };
  }
}

module.exports = MetricsCollector;
