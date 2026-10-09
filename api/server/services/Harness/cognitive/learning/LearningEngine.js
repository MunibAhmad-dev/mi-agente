'use strict';

let _db = null;
function db() {
  if (!_db) {
    try {
      _db = require('~/models/ExperienceReplay');
    } catch {
      _db = { saveExperience: async () => null, getExperiences: async () => [], getLearningStats: async () => [] };
    }
  }
  return _db;
}

/**
 * LearningEngine - Reflection, root cause analysis, strategy learning, experience replay.
 * Face 9: experiences are persisted to MongoDB via ExperienceReplay model.
 */
class LearningEngine {
  constructor(config = {}) {
    this.config = config;
    this.bus = config.bus;
    this.reflections = [];
    this.lessons = [];
    this.strategies = new Map();
    this.knowledgeGaps = [];
    this.stats = { reflected: 0, learned: 0, gapsDetected: 0 };
  }

  async reflect(experience) {
    const outcome = experience.result?.success ? 'success' : 'failure';
    const reflection = {
      id: `refl_${Date.now()}`,
      experienceId: experience.id,
      task: experience.task,
      outcome,
      whatWorked: outcome === 'success' ? this._extractWhatWorked(experience) : [],
      whatFailed: outcome === 'success' ? [] : this._extractWhatFailed(experience),
      improvements: this._suggestImprovements(experience),
      timestamp: Date.now(),
    };
    this.reflections.push(reflection);
    this.stats.reflected++;

    // Persist to MongoDB (Face 9)
    try {
      await db().saveExperience({
        sessionId: experience.sessionId,
        conversationId: experience.conversationId,
        userId: experience.userId,
        agentId: experience.agentId,
        task: experience.task || '',
        taskType: this._classifyTask(experience.task),
        actions: experience.actions || [],
        result: experience.result || {},
        outcome,
        score: experience.score ?? (outcome === 'success' ? 1 : 0),
        feedback: experience.feedback || '',
        duration: experience.result?.duration || 0,
        toolCalls: experience.result?.toolCalls || 0,
        reflection,
        improvements: reflection.improvements,
      });
    } catch {
      // DB unavailable — keep in-memory only
    }

    return reflection;
  }

  async analyzeRootCause(failure) {
    const analysis = {
      id: `rca_${Date.now()}`,
      failure,
      rootCause: this._identifyRootCause(failure),
      contributingFactors: this._identifyContributingFactors(failure),
      recommendedFix: this._recommendFix(failure),
      timestamp: Date.now(),
    };
    this.lessons.push(analysis);
    return analysis;
  }

  async learnStrategy(task, result) {
    const taskType = this._classifyTask(task);
    const strategyKey = taskType;

    if (!this.strategies.has(strategyKey)) {
      this.strategies.set(strategyKey, { successes: 0, failures: 0, approaches: [] });
    }
    const strategy = this.strategies.get(strategyKey);
    if (result?.success) {
      strategy.successes++;
      strategy.approaches.push({ approach: result.approach, success: true, timestamp: Date.now() });
    } else {
      strategy.failures++;
      strategy.approaches.push({ approach: result?.approach || 'unknown', success: false, timestamp: Date.now() });
    }

    const successRate = strategy.successes / (strategy.successes + strategy.failures);
    this.stats.learned++;
    return { taskType, strategy: { successRate, totalAttempts: strategy.successes + strategy.failures } };
  }

  async detectKnowledgeGap(query) {
    const gap = {
      id: `gap_${Date.now()}`,
      query,
      confidence: 0,
      suggestion: `Research needed: ${query}`,
      detectedAt: Date.now(),
    };
    this.knowledgeGaps.push(gap);
    this.stats.gapsDetected++;
    return gap;
  }

  async experienceReplay(n = 5, filter = {}) {
    // Prefer DB experiences for replay (Face 9)
    try {
      const dbExperiences = await db().getExperiences({ ...filter, limit: n });
      if (dbExperiences.length > 0) {
        return dbExperiences;
      }
    } catch {
      // fall through to in-memory
    }
    return this.reflections.slice(-n);
  }

  async getDbStats() {
    try {
      return await db().getLearningStats();
    } catch {
      return [];
    }
  }

  getStats() {
    return {
      ...this.stats,
      reflections: this.reflections.length,
      lessons: this.lessons.length,
      strategies: this.strategies.size,
      knowledgeGaps: this.knowledgeGaps.length,
    };
  }

  _extractWhatWorked(experience) {
    return experience.result?.tools?.filter(t => t.success).map(t => t.name) || [];
  }

  _extractWhatFailed(experience) {
    return experience.result?.tools?.filter(t => !t.success).map(t => ({ name: t.name, error: t.error })) || [];
  }

  _suggestImprovements(experience) {
    const improvements = [];
    if (experience.result?.duration > 30000) improvements.push('Consider faster approach');
    if (experience.result?.toolCalls > 10) improvements.push('Reduce tool calls');
    return improvements;
  }

  _identifyRootCause(failure) {
    if (failure.error?.includes('timeout')) return 'Timeout - task too slow';
    if (failure.error?.includes('not found')) return 'Missing resource';
    if (failure.error?.includes('permission')) return 'Insufficient permissions';
    return 'Unknown root cause - needs investigation';
  }

  _identifyContributingFactors(failure) {
    const factors = [];
    if (failure.context?.toolCalls > 5) factors.push('Too many tool calls');
    if (failure.context?.retries > 2) factors.push('Multiple retries needed');
    return factors;
  }

  _recommendFix(failure) {
    if (failure.error?.includes('timeout')) return 'Increase timeout or optimize approach';
    if (failure.error?.includes('not found')) return 'Check resource availability';
    return 'Review error details for specific fix';
  }

  _classifyTask(task) {
    const t = (task || '').toLowerCase();
    if (t.includes('search') || t.includes('find')) return 'search';
    if (t.includes('code') || t.includes('program')) return 'coding';
    if (t.includes('analyze') || t.includes('research')) return 'analysis';
    if (t.includes('create') || t.includes('generate')) return 'creation';
    return 'general';
  }

  /**
   * Face 15: Auto-Learning Engine — schedule periodic fine-tune job when accumulated
   * experiences exceed `thresholdExperiences`.
   *
   * @param {number} intervalMs          - check interval, default 3 600 000 (1 h)
   * @param {number} thresholdExperiences - how many new experiences trigger a run, default 50
   * @param {object} ftOpts              - options forwarded to FineTuningManager.startJob()
   */
  scheduleRetraining(intervalMs = 3_600_000, thresholdExperiences = 50, ftOpts = {}) {
    if (this._retrainingTimer) return { scheduled: false, reason: 'already running' };
    this._retrainingThreshold = thresholdExperiences;
    this._retrainingFtOpts = ftOpts;
    this._retrainingLastCount = 0;

    this._retrainingTimer = setInterval(() => {
      this._checkAndRetrain().catch(() => {});
    }, intervalMs);

    // Don't keep the Node.js process alive just for this timer
    if (this._retrainingTimer.unref) this._retrainingTimer.unref();

    return { scheduled: true, intervalMs, thresholdExperiences };
  }

  stopRetraining() {
    if (!this._retrainingTimer) return { stopped: false, reason: 'not running' };
    clearInterval(this._retrainingTimer);
    this._retrainingTimer = null;
    return { stopped: true };
  }

  async _checkAndRetrain() {
    const threshold = this._retrainingThreshold || 50;
    const ftOpts = this._retrainingFtOpts || {};
    let experiences = [];
    try {
      experiences = await db().getExperiences({ limit: threshold });
    } catch { return; }

    if (experiences.length < threshold) return;

    // Lazy-load FineTuningManager to avoid circular deps at module init time
    try {
      const { FineTuningManager } = require('~/server/services/Harness/cognitive/llm/FineTuningManager');
      const ftm = new FineTuningManager();
      const job = await ftm.startJob({ ...ftOpts, triggeredBy: 'auto-retraining' });
      await ftm.runJob(job.jobId || job.id).catch(() => {});
    } catch { /* FineTuningManager unavailable — skip silently */ }
  }
}

module.exports = { LearningEngine };
