'use strict';

/**
 * RiskAwareAutonomy — Gen B Safety Phase 2.
 * Adjusts the agent's autonomy level dynamically based on task risk.
 *
 * Autonomy levels (least to most constrained):
 *   full        — acts independently, no notification needed
 *   supervised  — acts then notifies the user
 *   collaborative — asks for approval then acts
 *   delegated   — always defers to user
 */

const VALID_LEVELS = ['full', 'supervised', 'collaborative', 'delegated'];

// Risk factors and their weight contributions (0–1 range contributions)
const RISK_FACTORS = {
  destructive: 0.30,      // delete / format / wipe
  large_scope: 0.20,      // affects many resources
  irreversible: 0.25,     // cannot be undone
  sensitive_data: 0.15,   // PII, credentials, financial
  financial_impact: 0.10, // money movement
};

function scoreToLevel(score) {
  if (score < 0.20) return 'full';
  if (score < 0.45) return 'supervised';
  if (score < 0.70) return 'collaborative';
  return 'delegated';
}

class RiskAwareAutonomy {
  constructor() {
    // sessionId → overridden level (optional)
    this._sessionLevels = new Map();
    this._baseLevel = 'supervised';
    this.stats = { assessments: 0, byLevel: { full: 0, supervised: 0, collaborative: 0, delegated: 0 } };
  }

  /**
   * Assess risk and return appropriate autonomy level.
   * @param {object} task    - { type, description, scope?, targets? }
   * @param {object} context - { irreversible?, sensitiveData?, financialImpact?, scope? }
   * @returns {{ level: string, riskScore: number, reasoning: string, requiredApprovals: string[] }}
   */
  assessAndAdjust(task = {}, context = {}) {
    try {
      this.stats.assessments++;
      const { riskScore, factors } = this._computeRisk(task, context);
      let level = scoreToLevel(riskScore);

      // Override if session has a base override
      if (this._baseLevel === 'delegated') {
        // Never go below delegated
        if (VALID_LEVELS.indexOf(level) < VALID_LEVELS.indexOf('delegated')) {
          level = 'delegated';
        }
      }

      const requiredApprovals = this._buildApprovals(level, factors, task);
      const reasoning = this._buildReasoning(riskScore, factors, level);

      this.stats.byLevel[level]++;
      return { level, riskScore: Math.round(riskScore * 100) / 100, reasoning, requiredApprovals };
    } catch (err) {
      return { level: 'delegated', riskScore: 1, reasoning: err.message, requiredApprovals: ['error-fallback'] };
    }
  }

  /**
   * Override the base autonomy level (applies as a floor).
   * @param {string} level
   */
  setBaseLevel(level) {
    try {
      if (!VALID_LEVELS.includes(level)) {
        return { ok: false, error: `Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}` };
      }
      this._baseLevel = level;
      return { ok: true, baseLevel: level };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Get the current effective autonomy level for a session.
   * @param {string} sessionId
   * @returns {{ level: string, overridden: boolean }}
   */
  getLevel(sessionId) {
    try {
      if (sessionId && this._sessionLevels.has(sessionId)) {
        return { level: this._sessionLevels.get(sessionId), overridden: true };
      }
      return { level: this._baseLevel, overridden: false };
    } catch (err) {
      return { level: 'delegated', overridden: false, error: err.message };
    }
  }

  /**
   * Set a per-session level override.
   * @param {string} sessionId
   * @param {string} level
   */
  setSessionLevel(sessionId, level) {
    try {
      if (!VALID_LEVELS.includes(level)) {
        return { ok: false, error: 'Invalid level' };
      }
      this._sessionLevels.set(sessionId, level);
      return { ok: true, sessionId, level };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  _computeRisk(task, context) {
    const factors = {};
    let score = 0;

    const desc = ((task.description || '') + ' ' + (task.type || '')).toLowerCase();

    // Destructive
    if (/delete|destroy|wipe|format|remove|purge|drop/.test(desc) || context.destructive) {
      factors.destructive = true;
      score += RISK_FACTORS.destructive;
    }

    // Large scope
    const scope = task.scope || context.scope || 0;
    if (scope > 10 || /all|every|bulk|batch|entire|mass/.test(desc)) {
      factors.large_scope = true;
      score += RISK_FACTORS.large_scope;
    }

    // Irreversible
    if (context.irreversible || /irreversible|permanent|no undo|cannot revert/.test(desc)) {
      factors.irreversible = true;
      score += RISK_FACTORS.irreversible;
    }

    // Sensitive data
    if (context.sensitiveData || /password|credential|pii|ssn|card|token|secret|private/.test(desc)) {
      factors.sensitive_data = true;
      score += RISK_FACTORS.sensitive_data;
    }

    // Financial impact
    if (context.financialImpact || /payment|charge|invoice|billing|money|transfer|fund/.test(desc)) {
      factors.financial_impact = true;
      score += RISK_FACTORS.financial_impact;
    }

    return { riskScore: Math.min(1, score), factors };
  }

  _buildApprovals(level, factors, task) {
    const approvals = [];
    if (level === 'collaborative' || level === 'delegated') {
      if (factors.destructive) approvals.push('confirm-destructive-action');
      if (factors.irreversible) approvals.push('confirm-irreversible');
      if (factors.financial_impact) approvals.push('finance-team-approval');
      if (factors.sensitive_data) approvals.push('data-privacy-review');
      if (approvals.length === 0) approvals.push('user-confirmation');
    }
    return approvals;
  }

  _buildReasoning(score, factors, level) {
    const activeFactors = Object.keys(factors).filter((k) => factors[k]);
    const parts = [`Risk score: ${Math.round(score * 100)}%`, `Autonomy level: ${level}`];
    if (activeFactors.length > 0) {
      parts.push(`Risk factors: ${activeFactors.map((f) => f.replace('_', ' ')).join(', ')}`);
    } else {
      parts.push('No significant risk factors detected');
    }
    return parts.join('. ');
  }

  getStats() {
    return { ...this.stats, baseLevel: this._baseLevel, activeSessions: this._sessionLevels.size };
  }
}

let _instance = null;
function getRiskAwareAutonomy() {
  if (!_instance) _instance = new RiskAwareAutonomy();
  return _instance;
}

module.exports = { RiskAwareAutonomy, getRiskAwareAutonomy };
