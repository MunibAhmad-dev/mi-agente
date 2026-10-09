'use strict';

/**
 * DecisionLog — Face 8 FASE 15: Structured per-decision records.
 *
 * Records confidence, risk, evidence, assumptions, reversibility, and
 * MultiModelJudge verdict for every major executive decision. Persists
 * to an append-only JSONL so the full decision history is auditable.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_PATH = path.join(process.cwd(), 'data', 'decision_log.jsonl');

const REVERSIBILITY = {
  REVERSIBLE: 'reversible',
  PARTIAL: 'partial',
  IRREVERSIBLE: 'irreversible',
};

class DecisionLog {
  constructor(options = {}) {
    this._logPath = options.logPath || LOG_PATH;
    this._inMemory = [];
    this._maxMemory = 500;
  }

  /**
   * Record a decision with full context.
   * @param {object} opts
   * @param {string} [opts.decisionId]
   * @param {string} opts.intent       - classified intent string
   * @param {string} opts.approach     - director approach (e.g. 'plan_and_execute')
   * @param {number} [opts.risk]       - 0–10 numeric risk score
   * @param {number} [opts.confidence] - 0–1 confidence from classifier
   * @param {string[]} [opts.evidence]      - facts used to make this decision
   * @param {string[]} [opts.assumptions]   - what we assume to be true
   * @param {string} [opts.reversibility]   - one of REVERSIBILITY values
   * @param {string} [opts.judgeVerdict]    - 'approve'|'deny'|'abstain'|null
   * @param {string} [opts.stepName]   - step this decision belongs to
   * @param {string} [opts.userId]
   * @returns {object} the persisted entry
   */
  record({
    decisionId,
    intent,
    approach,
    risk = 0,
    confidence = 0,
    evidence = [],
    assumptions = [],
    reversibility = REVERSIBILITY.PARTIAL,
    judgeVerdict = null,
    judgeConfidence = null,
    judgeReasoning = [],
    stepName = null,
    userId = 'default',
    sessionId = null,
  } = {}) {
    const entry = {
      id: decisionId || crypto.randomUUID(),
      ts: new Date().toISOString(),
      sessionId,
      userId,
      intent,
      approach,
      risk,
      confidence,
      evidence: evidence.slice(0, 5),
      assumptions: assumptions.slice(0, 5),
      reversibility,
      judgeVerdict,
      judgeConfidence,
      judgeReasoning: judgeReasoning.slice(0, 3),
      stepName,
    };

    this._inMemory.push(entry);
    if (this._inMemory.length > this._maxMemory) this._inMemory.shift();
    this._appendToDisk(entry);

    return entry;
  }

  /**
   * Query decision log.
   * @param {object} [opts] { userId, intent, riskMin, sessionId, limit }
   */
  query({ userId, intent, riskMin, sessionId, limit = 50 } = {}) {
    let results = [...this._inMemory];
    if (userId) results = results.filter((e) => e.userId === userId);
    if (intent) results = results.filter((e) => e.intent === intent);
    if (sessionId) results = results.filter((e) => e.sessionId === sessionId);
    if (typeof riskMin === 'number') results = results.filter((e) => (e.risk || 0) >= riskMin);
    return results.slice(-limit).reverse();
  }

  getStats() {
    const all = this._inMemory;
    if (all.length === 0) return { total: 0, avgRisk: 0, avgConfidence: 0, denials: 0, approvals: 0 };
    const avgRisk = all.reduce((s, e) => s + (e.risk || 0), 0) / all.length;
    const avgConf = all.reduce((s, e) => s + (e.confidence || 0), 0) / all.length;
    return {
      total: all.length,
      avgRisk: +avgRisk.toFixed(2),
      avgConfidence: +avgConf.toFixed(2),
      denials: all.filter((e) => e.judgeVerdict === 'deny').length,
      approvals: all.filter((e) => e.judgeVerdict === 'approve').length,
    };
  }

  _appendToDisk(entry) {
    try {
      const dir = path.dirname(this._logPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this._logPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch { /* non-fatal */ }
  }
}

let _instance = null;
function getDecisionLog(opts) {
  if (!_instance) _instance = new DecisionLog(opts);
  return _instance;
}

module.exports = { DecisionLog, getDecisionLog, REVERSIBILITY };
