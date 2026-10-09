'use strict';

/**
 * AdaptiveRouter - Learns which model/agent/tool works best for each task type
 */
class AdaptiveRouter {
  constructor(config = {}) {
    this.config = config;
    this.records = []; // { taskType, model, agent, tool, success, latency, tokens, timestamp }
    this.maxRecords = config.maxRecords || 10000;
  }

  /**
   * Record a routing decision result
   */
  record(data) {
    this.records.push({
      taskType: data.taskType || 'general',
      model: data.model || null,
      agent: data.agent || null,
      tool: data.tool || null,
      skill: data.skill || null,
      workflow: data.workflow || null,
      strategy: data.strategy || null,
      success: data.success !== false,
      latency: data.latency || 0,
      tokens: data.tokens || 0,
      cost: data.cost || 0,
      userApproval: data.userApproval !== false,
      timestamp: Date.now(),
    });
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }

  /**
   * Recommend best option for a task type
   */
  recommend(taskType, category = 'model') {
    const relevant = this.records.filter(r => r.taskType === taskType && r[category]);
    if (relevant.length === 0) return null;

    // Group by category value and calculate success rate
    const groups = {};
    for (const r of relevant) {
      const key = r[category];
      if (!groups[key]) groups[key] = { total: 0, success: 0, totalLatency: 0, totalTokens: 0 };
      groups[key].total++;
      if (r.success) groups[key].success++;
      groups[key].totalLatency += r.latency;
      groups[key].totalTokens += r.tokens;
    }

    // Score each option
    const scored = Object.entries(groups).map(([key, stats]) => ({
      [category]: key,
      successRate: stats.success / stats.total,
      avgLatency: stats.totalLatency / stats.total,
      avgTokens: stats.totalTokens / stats.total,
      totalAttempts: stats.total,
      score: (stats.success / stats.total) * 0.6 +
        (1 - Math.min(stats.totalLatency / 10000, 1)) * 0.2 +
        (1 - Math.min(stats.totalTokens / 10000, 1)) * 0.2,
    }));

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Get stats for a specific model/agent/tool
   */
  getStatsFor(category, value) {
    const relevant = this.records.filter(r => r[category] === value);
    if (relevant.length === 0) return null;
    const success = relevant.filter(r => r.success).length;
    return {
      total: relevant.length,
      successRate: success / relevant.length,
      avgLatency: relevant.reduce((s, r) => s + r.latency, 0) / relevant.length,
      avgTokens: relevant.reduce((s, r) => s + r.tokens, 0) / relevant.length,
    };
  }

  /**
   * Get overall statistics
   */
  getStats() {
    const taskTypes = {};
    const models = {};
    for (const r of this.records) {
      taskTypes[r.taskType] = (taskTypes[r.taskType] || 0) + 1;
      if (r.model) models[r.model] = (models[r.model] || 0) + 1;
    }
    return { totalRecords: this.records.length, taskTypes, models };
  }
}

module.exports = AdaptiveRouter;
