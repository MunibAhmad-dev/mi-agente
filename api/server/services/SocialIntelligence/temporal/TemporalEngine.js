/**
 * TemporalEngine — Time-based analysis and trend detection
 * ==========================================================
 * Calculates velocity, growth, acceleration, persistence, decay.
 */

const { createLogger } = require('../logger');

const logger = createLogger('TemporalEngine');

class TemporalEngine {
  constructor() {
    this._dataPoints = new Map(); // key → [{timestamp, value}]
  }

  /**
   * Record a data point.
   * @param {string} key - Metric key (e.g., "signal:purchase_intent")
   * @param {number} value
   * @param {number} [timestamp]
   */
  record(key, value, timestamp = Date.now()) {
    if (!this._dataPoints.has(key)) this._dataPoints.set(key, []);
    this._dataPoints.get(key).push({ timestamp, value });
  }

  /**
   * Calculate velocity (rate of change).
   * @param {string} key
   * @param {number} windowMs - Time window (default: 24h)
   * @returns {number} Changes per hour
   */
  velocity(key, windowMs = 86400000) {
    const points = this._getWindow(key, windowMs);
    if (points.length < 2) return 0;
    const timeSpan = (points[points.length - 1].timestamp - points[0].timestamp) / 3600000;
    if (timeSpan === 0) return 0;
    const valueChange = points[points.length - 1].value - points[0].value;
    return Math.round((valueChange / timeSpan) * 100) / 100;
  }

  /**
   * Calculate growth rate.
   * @param {string} key
   * @param {number} windowMs
   * @returns {number} Growth rate (0-1)
   */
  growth(key, windowMs = 604800000) { // 7 days default
    const halfWindow = windowMs / 2;
    const now = Date.now();
    const recentPoints = this._getWindow(key, halfWindow, now);
    const olderPoints = this._getWindow(key, halfWindow, now - halfWindow);

    const recentAvg = this._average(recentPoints);
    const olderAvg = this._average(olderPoints);

    if (olderAvg === 0) return recentAvg > 0 ? 1 : 0;
    const growth = (recentAvg - olderAvg) / olderAvg;
    return Math.round(Math.max(-1, Math.min(1, growth)) * 100) / 100;
  }

  /**
   * Calculate acceleration (change in velocity).
   */
  acceleration(key, windowMs = 604800000) {
    const halfWindow = windowMs / 2;
    const now = Date.now();
    const recentVelocity = this._calculateVelocityForKey(key, halfWindow, now);
    const olderVelocity = this._calculateVelocityForKey(key, halfWindow, now - halfWindow);
    return Math.round((recentVelocity - olderVelocity) * 100) / 100;
  }

  /**
   * Calculate persistence (consistency of values).
   */
  persistence(key, windowMs = 604800000) {
    const points = this._getWindow(key, windowMs);
    if (points.length < 3) return 0;
    const values = points.map((p) => p.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg === 0) return 0;
    const variance = values.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / values.length;
    const cv = Math.sqrt(variance) / avg; // Coefficient of variation
    return Math.round(Math.max(0, 1 - cv) * 100) / 100;
  }

  /**
   * Calculate decay (how quickly value drops).
   */
  decay(key, windowMs = 86400000) {
    const points = this._getWindow(key, windowMs);
    if (points.length < 2) return 0;
    const peak = Math.max(...points.map((p) => p.value));
    if (peak === 0) return 0;
    const latest = points[points.length - 1].value;
    return Math.round((1 - latest / peak) * 100) / 100;
  }

  /**
   * Get trend summary for a key.
   */
  getTrendSummary(key) {
    return {
      velocity: this.velocity(key),
      growth: this.growth(key),
      acceleration: this.acceleration(key),
      persistence: this.persistence(key),
      decay: this.decay(key),
      dataPoints: (this._dataPoints.get(key) || []).length,
    };
  }

  /**
   * Detect trends across all keys.
   * @param {number} minGrowth - Minimum growth to consider a trend
   * @returns {object[]}
   */
  detectTrends(minGrowth = 0.2) {
    const trends = [];
    for (const [key] of this._dataPoints) {
      const growth = this.growth(key);
      if (growth >= minGrowth) {
        trends.push({
          key,
          growth,
          velocity: this.velocity(key),
          acceleration: this.acceleration(key),
          direction: growth > 0 ? 'up' : 'down',
        });
      }
    }
    return trends.sort((a, b) => b.growth - a.growth);
  }

  // ─── INTERNAL ────────────────────────────────────────────────

  _getWindow(key, windowMs, endTime = Date.now()) {
    const points = this._dataPoints.get(key) || [];
    return points.filter((p) => p.timestamp >= endTime - windowMs && p.timestamp <= endTime);
  }

  _average(points) {
    if (points.length === 0) return 0;
    return points.reduce((a, p) => a + p.value, 0) / points.length;
  }

  _calculateVelocityForKey(key, windowMs, endTime) {
    const points = this._getWindow(key, windowMs, endTime);
    if (points.length < 2) return 0;
    const timeSpan = (points[points.length - 1].timestamp - points[0].timestamp) / 3600000;
    if (timeSpan === 0) return 0;
    return (points[points.length - 1].value - points[0].value) / timeSpan;
  }
}

module.exports = TemporalEngine;
