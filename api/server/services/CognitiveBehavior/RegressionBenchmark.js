'use strict';

/**
 * RegressionBenchmark — Gen B Safety Phase 5.
 * Detects quality regressions in agent behavior over time.
 * Uses simple moving-average comparison: current window vs previous window.
 *
 * Built-in metrics: response_length, quality_score, confidence, relevance
 */

const DEFAULT_WINDOW_SIZE = 5;
const REGRESSION_THRESHOLD = 0.10; // 10% drop = regression
const IMPROVEMENT_THRESHOLD = 0.10;
const MAX_OBSERVATIONS_PER_METRIC = 500;

const BUILTIN_METRICS = ['response_length', 'quality_score', 'confidence', 'relevance'];

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

class RegressionBenchmark {
  constructor() {
    // sessionId → { metricName → [values] }
    this._data = new Map();
    this.stats = { records: 0, regressions: 0, improvements: 0 };
  }

  /**
   * Record a metric observation for a session.
   * @param {string} sessionId
   * @param {string} metric
   * @param {number} value
   */
  record(sessionId, metric, value) {
    try {
      if (!sessionId || !metric || value == null) {
        return { ok: false, error: 'sessionId, metric, and value are required' };
      }

      const session = this._getOrCreate(sessionId);
      if (!session[metric]) session[metric] = [];
      session[metric].push(Number(value));
      if (session[metric].length > MAX_OBSERVATIONS_PER_METRIC) {
        session[metric].shift();
      }
      this.stats.records++;
      return { ok: true, sessionId, metric, value };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Detect regression for a specific metric in a session.
   * @param {string} sessionId
   * @param {string} metric
   * @param {number} windowSize
   * @returns {{ regression: boolean, magnitude: number, trend: string, prevAvg: number, currAvg: number }}
   */
  detectRegression(sessionId, metric, windowSize = DEFAULT_WINDOW_SIZE) {
    try {
      const session = this._data.get(sessionId);
      if (!session || !session[metric] || session[metric].length < 2) {
        return { regression: false, magnitude: 0, trend: 'stable', prevAvg: null, currAvg: null, reason: 'insufficient data' };
      }

      const values = session[metric];
      const ws = Math.max(2, Math.min(windowSize, Math.floor(values.length / 2)));
      const prevWindow = values.slice(-(ws * 2), -ws);
      const currWindow = values.slice(-ws);

      const prevAvg = avg(prevWindow);
      const currAvg = avg(currWindow);

      if (prevAvg === 0) {
        return { regression: false, magnitude: 0, trend: 'stable', prevAvg, currAvg };
      }

      const change = (currAvg - prevAvg) / Math.abs(prevAvg);
      const magnitude = Math.abs(change);

      let trend = 'stable';
      if (change <= -REGRESSION_THRESHOLD) {
        trend = 'degrading';
        this.stats.regressions++;
      } else if (change >= IMPROVEMENT_THRESHOLD) {
        trend = 'improving';
        this.stats.improvements++;
      }

      return {
        regression: trend === 'degrading',
        magnitude: Math.round(magnitude * 100) / 100,
        trend,
        prevAvg: Math.round(prevAvg * 1000) / 1000,
        currAvg: Math.round(currAvg * 1000) / 1000,
      };
    } catch (err) {
      return { regression: false, magnitude: 0, trend: 'stable', error: err.message };
    }
  }

  /**
   * Full regression report across all recorded metrics for a session.
   * @param {string} sessionId
   * @returns {{ sessionId, metrics: object, regressions: string[], report: string }}
   */
  getReport(sessionId) {
    try {
      const session = this._data.get(sessionId);
      if (!session) {
        return { sessionId, metrics: {}, regressions: [], report: 'No data for this session' };
      }

      const metrics = {};
      const regressions = [];

      for (const metric of Object.keys(session)) {
        const result = this.detectRegression(sessionId, metric);
        metrics[metric] = {
          observations: session[metric].length,
          latest: session[metric][session[metric].length - 1],
          ...result,
        };
        if (result.regression) regressions.push(metric);
      }

      const report = regressions.length > 0
        ? `Regressions detected in: ${regressions.join(', ')}`
        : 'No regressions detected';

      return { sessionId, metrics, regressions, report };
    } catch (err) {
      return { sessionId, metrics: {}, regressions: [], report: err.message };
    }
  }

  /**
   * Get the names of the built-in tracked metrics.
   */
  getBuiltinMetrics() {
    return BUILTIN_METRICS.slice();
  }

  _getOrCreate(sessionId) {
    if (!this._data.has(sessionId)) {
      this._data.set(sessionId, {});
    }
    return this._data.get(sessionId);
  }

  getStats() {
    return { ...this.stats, activeSessions: this._data.size };
  }
}

let _instance = null;
function getRegressionBenchmark() {
  if (!_instance) _instance = new RegressionBenchmark();
  return _instance;
}

module.exports = { RegressionBenchmark, getRegressionBenchmark };
