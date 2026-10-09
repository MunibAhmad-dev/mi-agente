'use strict';

/**
 * DecisionLedger — Face 8: per-decision confidence + risk tracking.
 *
 * Records every agent decision with intent, confidence, risk level,
 * outcome, and timing so the platform can audit decision quality over time.
 */

const RISK_LEVELS = ['minimal', 'low', 'medium', 'high', 'critical'];

const RISK_BY_INTENT = {
  command_execution: 'high',
  file_write: 'high',
  code_deployment: 'critical',
  web_search: 'minimal',
  chat: 'minimal',
  research: 'low',
  analysis: 'low',
  planning: 'low',
  tool_use: 'medium',
  unknown: 'medium',
};

class DecisionLedger {
  constructor({ maxRecords = 1000 } = {}) {
    this._records = [];
    this._maxRecords = maxRecords;
    this._stats = { total: 0, approved: 0, denied: 0, by_risk: {} };
    for (const r of RISK_LEVELS) this._stats.by_risk[r] = 0;
  }

  /**
   * Record a decision made by the agent.
   * @param {object} opts
   * @param {string} opts.sessionId
   * @param {string} opts.userId
   * @param {string} opts.intent - classified intent
   * @param {number} opts.confidence - 0.0–1.0 confidence score
   * @param {string} [opts.risk] - override risk level
   * @param {string} opts.outcome - 'approved' | 'denied' | 'completed' | 'failed'
   * @param {number} [opts.latencyMs]
   * @param {object} [opts.meta]
   * @returns {object} the recorded decision
   */
  record({ sessionId, userId, intent, confidence, risk, outcome, latencyMs, meta = {} }) {
    const riskLevel = risk || RISK_BY_INTENT[intent] || 'medium';
    const id = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const decision = {
      id,
      sessionId,
      userId,
      intent: intent || 'unknown',
      confidence: typeof confidence === 'number' ? Math.min(1, Math.max(0, confidence)) : null,
      riskLevel,
      outcome: outcome || 'unknown',
      latencyMs: latencyMs || null,
      meta,
      timestamp: new Date().toISOString(),
    };

    this._records.push(decision);
    if (this._records.length > this._maxRecords) this._records.shift();

    this._stats.total++;
    if (outcome === 'approved' || outcome === 'completed') this._stats.approved++;
    else if (outcome === 'denied' || outcome === 'failed') this._stats.denied++;
    if (this._stats.by_risk[riskLevel] !== undefined) this._stats.by_risk[riskLevel]++;

    return decision;
  }

  /**
   * Get decision records, optionally filtered.
   * @param {object} [filter] - { userId?, sessionId?, intent?, riskLevel?, limit? }
   */
  getRecords({ userId, sessionId, intent, riskLevel, limit = 50 } = {}) {
    let records = this._records;
    if (userId) records = records.filter((r) => r.userId === userId);
    if (sessionId) records = records.filter((r) => r.sessionId === sessionId);
    if (intent) records = records.filter((r) => r.intent === intent);
    if (riskLevel) records = records.filter((r) => r.riskLevel === riskLevel);
    return records.slice(-limit).reverse();
  }

  /**
   * Get aggregate stats for a user or overall.
   */
  getStats(userId = null) {
    if (!userId) return { ...this._stats };

    const records = this._records.filter((r) => r.userId === userId);
    const stats = { total: records.length, approved: 0, denied: 0, avg_confidence: null, by_risk: {} };
    for (const r of RISK_LEVELS) stats.by_risk[r] = 0;

    let confSum = 0;
    let confCount = 0;
    for (const r of records) {
      if (r.outcome === 'approved' || r.outcome === 'completed') stats.approved++;
      else if (r.outcome === 'denied' || r.outcome === 'failed') stats.denied++;
      if (r.riskLevel && stats.by_risk[r.riskLevel] !== undefined) stats.by_risk[r.riskLevel]++;
      if (r.confidence !== null) { confSum += r.confidence; confCount++; }
    }
    if (confCount > 0) stats.avg_confidence = Math.round((confSum / confCount) * 1000) / 1000;
    return stats;
  }

  getRiskLevel(intent) {
    return RISK_BY_INTENT[intent] || 'medium';
  }

  clear() {
    this._records = [];
    this._stats = { total: 0, approved: 0, denied: 0, by_risk: {} };
    for (const r of RISK_LEVELS) this._stats.by_risk[r] = 0;
  }
}

let _instance = null;
function getDecisionLedger(opts) {
  if (!_instance) _instance = new DecisionLedger(opts);
  return _instance;
}

module.exports = { DecisionLedger, getDecisionLedger, RISK_LEVELS, RISK_BY_INTENT };
