'use strict';

/**
 * CounterfactualChecker — Gen B reasoning quality.
 * Generates "what if" scenarios to stress-test a decision.
 *
 * Always generates exactly 3 counterfactuals:
 *   best-case              — optimistic scenario
 *   worst-case             — pessimistic / failure scenario
 *   most-likely-alternative — realistic deviation from the decision
 *
 * riskScore > 0.8 → shouldBlock returns true.
 */

// Risk indicators in decision text — each increases the overall risk score
const RISK_SIGNALS = [
  { pattern: /\b(?:irreversible|permanent|delete|destroy|drop|purge|erase|wipe)\b/i, weight: 0.4 },
  { pattern: /\b(?:production|live|critical|mission.critical|customer.facing)\b/i, weight: 0.35 },
  { pattern: /\b(?:all users?|everyone|entire|whole)\b/i, weight: 0.3 },
  { pattern: /\b(?:financial|money|payment|transfer|withdraw|deposit|bank)\b/i, weight: 0.45 },
  { pattern: /\b(?:security|auth|password|credential|token|secret|key)\b/i, weight: 0.35 },
  { pattern: /\b(?:compliance|legal|regulatory|gdpr|hipaa|pci)\b/i, weight: 0.3 },
  { pattern: /\b(?:migration|schema change|downtime|outage)\b/i, weight: 0.3 },
  { pattern: /\b(?:no rollback|no backup|unrecoverable)\b/i, weight: 0.5 },
  { pattern: /\b(?:automated|auto|batch|bulk|mass)\b/i, weight: 0.2 },
  { pattern: /\b(?:bypass|skip|override|ignore|disable|remove.*check)\b/i, weight: 0.35 },
];

// Domain-aware counterfactual templates
const TEMPLATES = {
  default: {
    bestCase: (decision) =>
      `Everything proceeds as planned: the decision "${decision.substring(0, 60)}" succeeds with no unexpected side-effects, goals are fully met, and stakeholders are satisfied.`,
    worstCase: (decision) =>
      `The decision "${decision.substring(0, 60)}" fails catastrophically: the primary objective is not achieved, unintended consequences cascade into critical failures, and recovery takes significant time/resources.`,
    alternative: (decision) =>
      `A middle-ground path: the decision "${decision.substring(0, 60)}" partially succeeds but requires significant adjustment mid-way, delaying the outcome and consuming extra resources.`,
  },
  financial: {
    bestCase: (decision) =>
      `Financial operation completes successfully: funds are transferred correctly, all validations pass, and the transaction is recorded without discrepancy.`,
    worstCase: (decision) =>
      `Financial operation fails: incorrect amounts are processed, transactions are partially applied creating an inconsistent state, triggering compliance alerts and requiring manual reconciliation.`,
    alternative: (decision) =>
      `Transaction succeeds but triggers additional review flags, causing a temporary hold and requiring manual approval before final settlement.`,
  },
  security: {
    bestCase: (decision) =>
      `Security change is applied cleanly: access is correctly scoped, no legitimate users are blocked, and the attack surface is reduced as intended.`,
    worstCase: (decision) =>
      `Security misconfiguration occurs: legitimate users lose access, or conversely the change introduces a privilege escalation vulnerability, leading to a security incident.`,
    alternative: (decision) =>
      `Security change is applied but with overly broad permissions, granting more access than intended and requiring a follow-up audit.`,
  },
  data: {
    bestCase: (decision) =>
      `Data operation completes fully: all records are correctly modified, indexes remain consistent, and no data is lost.`,
    worstCase: (decision) =>
      `Data operation fails mid-execution: partial writes leave the database in an inconsistent state. No rollback was available, requiring point-in-time recovery.`,
    alternative: (decision) =>
      `Data operation succeeds but performance is degraded during execution, causing downstream service timeouts that require manual intervention.`,
  },
};

function detectDomain(text) {
  const lower = (text || '').toLowerCase();
  if (/financial|payment|money|bank|transaction|fund/.test(lower)) return 'financial';
  if (/security|auth|credential|token|password|permission/.test(lower)) return 'security';
  if (/database|sql|migration|schema|data|record|row/.test(lower)) return 'data';
  return 'default';
}

function computeRiskScore(decision, context) {
  const combined = `${decision || ''} ${context || ''}`;
  let score = 0;
  for (const signal of RISK_SIGNALS) {
    if (signal.pattern.test(combined)) {
      score += signal.weight;
    }
  }
  return Math.min(1, score);
}

function estimateProbability(type, riskScore) {
  switch (type) {
    case 'best-case':
      return Math.round((1 - riskScore) * 100) / 100;
    case 'worst-case':
      return Math.round(riskScore * 0.6 * 100) / 100;
    case 'most-likely-alternative':
      return Math.round(Math.min(0.9, riskScore * 0.5 + 0.2) * 100) / 100;
    default:
      return 0.5;
  }
}

class CounterfactualChecker {
  constructor() {
    this.stats = { checks: 0, blocked: 0 };
  }

  /**
   * Generate counterfactuals for a decision.
   * @param {string} decision  — the decision being made
   * @param {string} [context] — additional context
   * @returns {{ counterfactuals: Array<{scenario,outcome,probability}>, riskScore: number }}
   */
  check(decision, context) {
    try {
      if (!decision || typeof decision !== 'string') {
        return {
          counterfactuals: [],
          riskScore: 0,
          error: 'Decision text is required',
        };
      }

      this.stats.checks++;
      const riskScore = computeRiskScore(decision, context);
      const domain = detectDomain(`${decision} ${context || ''}`);
      const tpl = TEMPLATES[domain] || TEMPLATES.default;

      const counterfactuals = [
        {
          scenario: 'best-case',
          outcome: tpl.bestCase(decision),
          probability: estimateProbability('best-case', riskScore),
        },
        {
          scenario: 'worst-case',
          outcome: tpl.worstCase(decision),
          probability: estimateProbability('worst-case', riskScore),
        },
        {
          scenario: 'most-likely-alternative',
          outcome: tpl.alternative(decision),
          probability: estimateProbability('most-likely-alternative', riskScore),
        },
      ];

      return {
        counterfactuals,
        riskScore: Math.round(riskScore * 100) / 100,
      };
    } catch (err) {
      return { counterfactuals: [], riskScore: 0, error: err.message };
    }
  }

  /**
   * Returns true if the riskScore of the decision exceeds 0.8.
   * @param {string} decision
   * @param {string} [context]
   * @returns {boolean}
   */
  shouldBlock(decision, context) {
    try {
      const { riskScore } = this.check(decision, context);
      const block = riskScore > 0.8;
      if (block) this.stats.blocked++;
      return block;
    } catch (err) {
      return false;
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getCounterfactualChecker() {
  if (!_instance) _instance = new CounterfactualChecker();
  return _instance;
}

module.exports = { CounterfactualChecker, getCounterfactualChecker };
