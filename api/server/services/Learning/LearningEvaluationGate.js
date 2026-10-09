'use strict';

/**
 * LearningEvaluationGate — Face 10 + Face 16.
 * Quality gate that runs before deploying any learned behavior or model update.
 * Compares before/after performance metrics to decide if learning was an improvement.
 */

const METRICS = ['accuracy', 'relevance', 'helpfulness', 'safety', 'consistency'];
const DEFAULT_THRESHOLDS = { accuracy: 0.0, relevance: 0.0, helpfulness: 0.0, safety: 0.0, consistency: 0.0 };
const MINIMUM_PASS_SCORE = 0.0;

class LearningEvaluationGate {
  constructor({ thresholds = {}, min_pass_score = MINIMUM_PASS_SCORE } = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.min_pass_score = min_pass_score;
    this._evaluations = [];
  }

  /**
   * Record a before/after evaluation.
   * @param {object} opts
   * @param {string} opts.model_id - Model or skill being evaluated
   * @param {object} opts.before - { metric: score } baseline scores
   * @param {object} opts.after - { metric: score } post-learning scores
   * @param {object} opts.metadata - Context info (training data stats, etc.)
   * @returns {{ approved: boolean, score_delta, issues, evaluation_id }}
   */
  evaluate({ model_id, before, after, metadata = {} }) {
    const id = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const deltas = {};
    const issues = [];
    let approved = true;

    for (const metric of METRICS) {
      const b = before[metric] ?? null;
      const a = after[metric] ?? null;
      if (b === null || a === null) continue;
      const delta = a - b;
      deltas[metric] = { before: b, after: a, delta };

      const threshold = this.thresholds[metric] || MINIMUM_PASS_SCORE;
      if (delta < threshold) {
        approved = false;
        issues.push({ metric, issue: `Regression: ${metric} dropped by ${Math.abs(delta).toFixed(3)} (threshold: ${threshold})` });
      }
    }

    // Safety is a hard gate: any regression on safety fails regardless of other metrics
    if (deltas.safety && deltas.safety.delta < 0) {
      approved = false;
      if (!issues.find((i) => i.metric === 'safety')) {
        issues.push({ metric: 'safety', issue: 'Safety regression detected — automatic rejection' });
      }
    }

    const evaluation = {
      id,
      model_id,
      approved,
      deltas,
      issues,
      metadata,
      evaluated_at: new Date().toISOString(),
    };
    this._evaluations.push(evaluation);
    if (this._evaluations.length > 500) this._evaluations.shift();
    return evaluation;
  }

  /**
   * Simple pass/fail gate with a single score comparison.
   */
  gate({ model_id, baseline_score, new_score, metric = 'overall' }) {
    const delta = new_score - baseline_score;
    const approved = delta >= (this.thresholds[metric] || MINIMUM_PASS_SCORE);
    return { approved, delta, baseline_score, new_score, metric, model_id };
  }

  getHistory(model_id = null, limit = 50) {
    const all = model_id ? this._evaluations.filter((e) => e.model_id === model_id) : this._evaluations;
    return all.slice(-limit);
  }

  getStats() {
    const total = this._evaluations.length;
    const approved = this._evaluations.filter((e) => e.approved).length;
    return { total, approved, rejected: total - approved, approval_rate: total ? Math.round((approved / total) * 100) : null };
  }
}

let _instance = null;
function getLearningEvaluationGate(opts) {
  if (!_instance) _instance = new LearningEvaluationGate(opts);
  return _instance;
}

module.exports = { LearningEvaluationGate, getLearningEvaluationGate, METRICS };
