'use strict';

/**
 * LearningMetrics - Measures learning effectiveness and improvement
 */
class LearningMetrics {
  constructor(config = {}) {
    this.config = config;
    this.metrics = [];
    this.benchmarks = [];
  }

  /**
   * Record a metric
   */
  record(data) {
    this.metrics.push({
      timestamp: Date.now(),
      taskType: data.taskType || 'general',
      successRate: data.successRate || 0,
      errorRate: data.errorRate || 0,
      loopRate: data.loopRate || 0,
      retryRate: data.retryRate || 0,
      avgTokens: data.avgTokens || 0,
      avgLatency: data.avgLatency || 0,
      avgToolCalls: data.avgToolCalls || 0,
      userCorrections: data.userCorrections || 0,
      lessonsApplied: data.lessonsApplied || 0,
    });
  }

  /**
   * Compare before/after learning
   */
  compare(beforeMetrics, afterMetrics) {
    return {
      successRate: {
        before: beforeMetrics.successRate,
        after: afterMetrics.successRate,
        change: afterMetrics.successRate - beforeMetrics.successRate,
        improved: afterMetrics.successRate > beforeMetrics.successRate,
      },
      errorRate: {
        before: beforeMetrics.errorRate,
        after: afterMetrics.errorRate,
        change: afterMetrics.errorRate - beforeMetrics.errorRate,
        improved: afterMetrics.errorRate < beforeMetrics.errorRate,
      },
      tokens: {
        before: beforeMetrics.avgTokens,
        after: afterMetrics.avgTokens,
        change: afterMetrics.avgTokens - beforeMetrics.avgTokens,
        improved: afterMetrics.avgTokens < beforeMetrics.avgTokens,
      },
      latency: {
        before: beforeMetrics.avgLatency,
        after: afterMetrics.avgLatency,
        change: afterMetrics.avgLatency - beforeMetrics.avgLatency,
        improved: afterMetrics.avgLatency < beforeMetrics.avgLatency,
      },
    };
  }

  /**
   * Calculate Learning Quality Score
   */
  calculateLQS(data) {
    return (
      (data.successRate || 0) * 0.25 +
      ((1 - (data.errorRate || 0)) * 0.20) +
      ((1 - (data.loopRate || 0)) * 0.15) +
      ((1 - (data.retryRate || 0)) * 0.10) +
      ((1 - Math.min((data.avgTokens || 0) / 10000, 1)) * 0.10) +
      ((1 - Math.min((data.avgLatency || 0) / 10000, 1)) * 0.10) +
      (Math.min((data.userCorrections || 0) / 10, 1) * 0.05) +
      (Math.min((data.lessonsApplied || 0) / 10, 1) * 0.05)
    );
  }

  /**
   * Get recent metrics
   */
  getRecent(limit = 10) { return this.metrics.slice(-limit); }

  /**
   * Get overall stats
   */
  getStats() {
    if (this.metrics.length === 0) return { total: 0 };
    const latest = this.metrics[this.metrics.length - 1];
    const avg = {
      successRate: this.metrics.reduce((s, m) => s + m.successRate, 0) / this.metrics.length,
      errorRate: this.metrics.reduce((s, m) => s + m.errorRate, 0) / this.metrics.length,
      avgTokens: this.metrics.reduce((s, m) => s + m.avgTokens, 0) / this.metrics.length,
      avgLatency: this.metrics.reduce((s, m) => s + m.avgLatency, 0) / this.metrics.length,
    };
    return { total: this.metrics.length, latest, average: avg };
  }
}

module.exports = LearningMetrics;
