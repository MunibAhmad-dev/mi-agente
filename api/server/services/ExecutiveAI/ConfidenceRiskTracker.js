'use strict';

/**
 * ConfidenceRiskTracker — Face 8.
 * Per-decision confidence and risk record. Tracks every agent decision with
 * its confidence level, risk factors, and outcome (when known).
 */

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
const RISK_THRESHOLDS = { low: 0.2, medium: 0.5, high: 0.75 };

class ConfidenceRiskTracker {
  constructor() {
    this._decisions = new Map();
    this._stats = { total: 0, high_risk: 0, low_confidence: 0, outcomes_recorded: 0 };
  }

  /**
   * Record a new decision with its confidence and risk assessment.
   * @param {object} opts
   * @returns {object} decision record
   */
  record({ id, decision, confidence = 0.5, risk_factors = [], context = {}, agent_id = null }) {
    const decisionId = id || `dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const risk_score = this._computeRiskScore(confidence, risk_factors);
    const risk_level = this._scoreToLevel(risk_score);

    const record = {
      id: decisionId,
      decision: decision || '',
      confidence: Math.min(Math.max(confidence, 0), 1),
      risk_score,
      risk_level,
      risk_factors: Array.isArray(risk_factors) ? risk_factors : [],
      context,
      agent_id,
      outcome: null,
      recorded_at: new Date().toISOString(),
    };

    this._decisions.set(decisionId, record);
    this._stats.total++;
    if (risk_level === 'high' || risk_level === 'critical') this._stats.high_risk++;
    if (confidence < 0.5) this._stats.low_confidence++;
    return record;
  }

  /**
   * Record the outcome of a previous decision.
   * @param {string} id - Decision ID
   * @param {object} outcome - { success: boolean, actual_result: string, notes: string }
   */
  recordOutcome(id, outcome) {
    const record = this._decisions.get(id);
    if (!record) throw new Error(`Decision not found: ${id}`);
    record.outcome = { ...outcome, recorded_at: new Date().toISOString() };
    this._stats.outcomes_recorded++;
    return record;
  }

  get(id) {
    return this._decisions.get(id) || null;
  }

  listByRisk(level) {
    if (!RISK_LEVELS.includes(level)) throw new Error(`Invalid risk level: ${level}`);
    return Array.from(this._decisions.values()).filter((d) => d.risk_level === level);
  }

  listHighRisk() {
    return Array.from(this._decisions.values()).filter((d) => ['high', 'critical'].includes(d.risk_level));
  }

  listLowConfidence(threshold = 0.4) {
    return Array.from(this._decisions.values()).filter((d) => d.confidence < threshold);
  }

  getStats() {
    const decisions = Array.from(this._decisions.values());
    const withOutcomes = decisions.filter((d) => d.outcome !== null);
    const successful = withOutcomes.filter((d) => d.outcome?.success === true);
    return {
      ...this._stats,
      decisions_with_outcomes: withOutcomes.length,
      success_rate: withOutcomes.length ? Math.round((successful.length / withOutcomes.length) * 100) : null,
      avg_confidence: decisions.length ? decisions.reduce((s, d) => s + d.confidence, 0) / decisions.length : 0,
    };
  }

  clear() {
    this._decisions.clear();
    this._stats = { total: 0, high_risk: 0, low_confidence: 0, outcomes_recorded: 0 };
  }

  _computeRiskScore(confidence, risk_factors) {
    const baseRisk = 1 - confidence;
    const factorBoost = Math.min(risk_factors.length * 0.1, 0.5);
    return Math.min(baseRisk + factorBoost, 1);
  }

  _scoreToLevel(score) {
    if (score >= RISK_THRESHOLDS.high) return 'high';
    if (score >= RISK_THRESHOLDS.medium) return 'medium';
    if (score >= RISK_THRESHOLDS.low) return 'low';
    return 'low';
  }
}

let _instance = null;
function getConfidenceRiskTracker() {
  if (!_instance) _instance = new ConfidenceRiskTracker();
  return _instance;
}

module.exports = { ConfidenceRiskTracker, getConfidenceRiskTracker, RISK_LEVELS };
