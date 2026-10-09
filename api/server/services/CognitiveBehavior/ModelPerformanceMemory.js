'use strict';

/**
 * ModelPerformanceMemory — Gen B Phase 11.
 * Tracks per-model performance metrics over time.
 * Used to select the best model for a given task type based on historical data.
 */

const TASK_TYPES = ['chat', 'code', 'reasoning', 'creative', 'summarization', 'translation', 'qa', 'embedding'];

class ModelPerformanceMemory {
  constructor() {
    // modelId → Map<taskType, { count, totalScore, totalLatency, totalCost, errors }>
    this._records = new Map();
    this.stats = { totalRecords: 0, models: 0 };
  }

  /**
   * Record a performance metric for a model+task.
   * @param {string} modelId
   * @param {string} task      - Task type (e.g. 'code', 'chat')
   * @param {object} metrics   - { score: 0-1, latencyMs, costUsd?, success? }
   * @returns {object} updated model stats
   */
  record(modelId, task, metrics = {}) {
    try {
      if (!modelId || !task) {
        return { error: 'modelId and task are required' };
      }

      if (!this._records.has(modelId)) {
        this._records.set(modelId, new Map());
        this.stats.models++;
      }

      const modelData = this._records.get(modelId);
      if (!modelData.has(task)) {
        modelData.set(task, { count: 0, totalScore: 0, totalLatency: 0, totalCost: 0, errors: 0, lastAt: null });
      }

      const taskData = modelData.get(task);
      taskData.count++;
      taskData.totalScore += (metrics.score || 0);
      taskData.totalLatency += (metrics.latencyMs || 0);
      taskData.totalCost += (metrics.costUsd || 0);
      if (metrics.success === false) taskData.errors++;
      taskData.lastAt = new Date().toISOString();
      this.stats.totalRecords++;

      return this.getStats(modelId);
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get the best model for a given task type (highest average score).
   * @param {string} taskType
   * @returns {object} { modelId, avgScore, avgLatency, count }
   */
  getBestModelFor(taskType) {
    try {
      let best = null;
      let bestScore = -1;

      for (const [modelId, tasks] of this._records) {
        if (!tasks.has(taskType)) continue;
        const data = tasks.get(taskType);
        if (data.count === 0) continue;
        const avgScore = data.totalScore / data.count;
        if (avgScore > bestScore) {
          bestScore = avgScore;
          best = {
            modelId,
            taskType,
            avgScore: Math.round(avgScore * 1000) / 1000,
            avgLatencyMs: Math.round(data.totalLatency / data.count),
            avgCostUsd: data.totalCost / data.count,
            count: data.count,
            errorRate: data.count > 0 ? Math.round((data.errors / data.count) * 100) / 100 : 0,
          };
        }
      }

      if (!best) return { error: `No data for taskType: ${taskType}`, taskType };
      return best;
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get stats for a specific model.
   * @param {string} modelId
   * @returns {object} { modelId, tasks: { [taskType]: { avgScore, count, ... } } }
   */
  getStats(modelId) {
    try {
      if (!modelId) {
        // Return all models summary
        const summary = {};
        for (const [mid] of this._records) {
          summary[mid] = this._summarizeModel(mid);
        }
        return { models: summary, global: { ...this.stats } };
      }

      if (!this._records.has(modelId)) return { modelId, tasks: {}, error: 'No data for this model' };
      return { modelId, tasks: this._summarizeModel(modelId) };
    } catch (err) {
      return { error: err.message };
    }
  }

  _summarizeModel(modelId) {
    const modelData = this._records.get(modelId);
    const tasks = {};
    for (const [task, data] of modelData) {
      tasks[task] = {
        count: data.count,
        avgScore: data.count > 0 ? Math.round((data.totalScore / data.count) * 1000) / 1000 : 0,
        avgLatencyMs: data.count > 0 ? Math.round(data.totalLatency / data.count) : 0,
        avgCostUsd: data.count > 0 ? Math.round(data.totalCost / data.count * 1000000) / 1000000 : 0,
        errorRate: data.count > 0 ? Math.round((data.errors / data.count) * 100) / 100 : 0,
        lastAt: data.lastAt,
      };
    }
    return tasks;
  }

  /**
   * Get ranking of models for a task, sorted by average score.
   * @param {string} taskType
   * @returns {object[]}
   */
  getRanking(taskType) {
    try {
      const ranking = [];
      for (const [modelId, tasks] of this._records) {
        if (!tasks.has(taskType)) continue;
        const data = tasks.get(taskType);
        if (data.count === 0) continue;
        ranking.push({
          modelId,
          avgScore: Math.round(data.totalScore / data.count * 1000) / 1000,
          count: data.count,
          avgLatencyMs: Math.round(data.totalLatency / data.count),
        });
      }
      ranking.sort((a, b) => b.avgScore - a.avgScore);
      return ranking;
    } catch (err) {
      return [{ error: err.message }];
    }
  }

  /**
   * List all known task types that have data.
   */
  listTaskTypes() {
    const types = new Set();
    for (const [, tasks] of this._records) {
      for (const task of tasks.keys()) types.add(task);
    }
    return Array.from(types);
  }
}

let _instance = null;
function getModelPerformanceMemory() {
  if (!_instance) _instance = new ModelPerformanceMemory();
  return _instance;
}

module.exports = { ModelPerformanceMemory, getModelPerformanceMemory, TASK_TYPES };
