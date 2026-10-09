/**
 * PolicyEngine — Face 8 Phase 10: Risk levels 0–7 per step.
 *
 * Risk Level:
 *   0 — Read-only observation  (always execute)
 *   1 — Text generation        (always execute)
 *   2 — Structured analysis    (always execute)
 *   3 — Multi-source synthesis (checkpoint before)
 *   4 — Code/file modification (checkpoint + dry-run flag)
 *   5 — External API / network (simulate first)
 *   6 — System/DB changes      (simulate + event log)
 *   7 — Irreversible / security (block until manual approval)
 */

'use strict';

const RISK = {
  OBSERVE: 0,
  GENERATE: 1,
  ANALYSE: 2,
  SYNTHESISE: 3,
  MODIFY: 4,
  EXTERNAL: 5,
  SYSTEM: 6,
  CRITICAL: 7,
};

const RISK_SIGNALS = [
  {
    level: 7,
    patterns: ['delete all', 'drop table', 'rm -rf', 'wipe', 'irreversible', 'production secret', 'revoke'],
  },
  {
    level: 6,
    patterns: ['write to database', 'update database', 'system config', 'create user', 'grant permission', 'sudo', 'chmod'],
  },
  {
    level: 5,
    patterns: ['call api', 'http request', 'fetch url', 'send email', 'post to', 'upload', 'external service', 'webhook'],
  },
  {
    level: 4,
    patterns: [
      'write implementation', 'write code', 'write tests', 'write file',
      'implement', 'refactor', 'modify', 'edit', 'handle edge', 'design data model',
    ],
  },
  {
    level: 3,
    patterns: ['search primary', 'research:', 'synthesize', 'extract key', 'multiple sources', 'verify accuracy'],
  },
  {
    level: 2,
    patterns: ['analyze', 'analyse', 'decompose', 'break query', 'plan', 'design', 'structure'],
  },
  {
    level: 1,
    patterns: ['understand', 'generate answer', 'generate a', 'summarize', 'explain', 'describe'],
  },
  { level: 0, patterns: ['read', 'observe', 'check status'] },
];

const GATE = {
  ALLOW: 'allow',
  CHECKPOINT: 'checkpoint_first',
  SIMULATE: 'simulate_first',
  BLOCK: 'blocked',
};

const RISK_LABELS = {
  0: 'Safe — read-only',
  1: 'Safe — generation',
  2: 'Safe — analysis',
  3: 'Low risk — checkpoint required',
  4: 'Medium risk — checkpoint + dry-run flag',
  5: 'High risk — simulate first',
  6: 'High risk — system change, simulate + audit',
  7: 'Critical — manual approval required',
};

function assessRisk(stepName) {
  const lower = stepName.toLowerCase();
  for (const { level, patterns } of RISK_SIGNALS) {
    if (patterns.some((p) => lower.includes(p))) {
      return level;
    }
  }
  return 1;
}

function gateForLevel(riskLevel) {
  if (riskLevel <= 2) return GATE.ALLOW;
  if (riskLevel === 3) return GATE.CHECKPOINT;
  if (riskLevel <= 6) return GATE.SIMULATE;
  return GATE.BLOCK;
}

/**
 * Assess a step and return its risk policy.
 * @param {string} stepName
 * @returns {{ riskLevel: number, gate: string, label: string, requiresCheckpoint: boolean, requiresSimulation: boolean, blocked: boolean }}
 */
function assessStep(stepName) {
  const riskLevel = assessRisk(stepName);
  return {
    riskLevel,
    gate: gateForLevel(riskLevel),
    label: RISK_LABELS[riskLevel] || 'Unknown',
    requiresCheckpoint: riskLevel >= 3,
    requiresSimulation: riskLevel >= 4 && riskLevel < 7,
    blocked: riskLevel === 7,
  };
}

module.exports = { assessStep, assessRisk, RISK, GATE };
