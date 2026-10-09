'use strict';

/**
 * ConstitutionEngine — Face 8.
 * Enforces project constitution — a set of principles, constraints, and values
 * that all agent outputs must satisfy. Validates responses against the constitution.
 */

const DEFAULT_CONSTITUTION = {
  id: 'default',
  name: 'Default Constitution',
  version: '1.0.0',
  principles: [
    { id: 'P1', text: 'Be honest and accurate. Do not fabricate facts.', severity: 'critical' },
    { id: 'P2', text: 'Respect user privacy. Do not expose personal information unnecessarily.', severity: 'critical' },
    { id: 'P3', text: 'Avoid harmful content. Do not generate instructions for violence, self-harm, or illegal activities.', severity: 'critical' },
    { id: 'P4', text: 'Be helpful. Always attempt to address the user\'s actual need.', severity: 'warning' },
    { id: 'P5', text: 'Acknowledge uncertainty. Flag low-confidence claims.', severity: 'advisory' },
    { id: 'P6', text: 'Preserve existing functionality. Do not break working systems.', severity: 'critical' },
  ],
  constraints: [
    { id: 'C1', type: 'no_pii', description: 'Do not include email addresses, phone numbers, or SSNs in responses', severity: 'critical' },
    { id: 'C2', type: 'no_credentials', description: 'Do not include passwords, API keys, or secrets', severity: 'critical' },
    { id: 'C3', type: 'cite_uncertainty', description: 'Use hedging language for uncertain claims', severity: 'advisory' },
  ],
};

const VIOLATION_PATTERNS = [
  { id: 'C1', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, description: 'Contains email address' },
  { id: 'C1', re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, description: 'Contains phone number' },
  { id: 'C1', re: /\b\d{3}-\d{2}-\d{4}\b/, description: 'Contains SSN pattern' },
  { id: 'C2', re: /\b(password|passwd|api[_-]?key|secret[_-]?key|token)\s*[:=]\s*\S+/i, description: 'Contains credential assignment' },
  { id: 'C2', re: /sk-[A-Za-z0-9]{20,}/, description: 'Contains OpenAI API key pattern' },
];

class ConstitutionEngine {
  constructor(constitution = DEFAULT_CONSTITUTION) {
    this._constitution = { ...DEFAULT_CONSTITUTION, ...constitution };
    this._custom_violations = new Map();
    this._audit_log = [];
  }

  getConstitution() {
    return { ...this._constitution };
  }

  updatePrinciple(id, updates) {
    const p = this._constitution.principles.find((p) => p.id === id);
    if (!p) throw new Error(`Principle not found: ${id}`);
    Object.assign(p, updates);
    return p;
  }

  addPrinciple(principle) {
    if (!principle.id || !principle.text) throw new Error('Principle requires id and text');
    this._constitution.principles.push({ severity: 'advisory', ...principle });
    return principle;
  }

  addViolationPattern(id, pattern, description) {
    this._custom_violations.set(id, { id, re: pattern, description });
  }

  /**
   * Validate response text against the constitution.
   * @param {string} text
   * @returns {{ passed: boolean, violations: Array, warnings: Array, score: number }}
   */
  validate(text) {
    if (!text || typeof text !== 'string') return { passed: true, violations: [], warnings: [], score: 100 };

    const violations = [];
    const warnings = [];

    // Pattern-based checks
    const allPatterns = [
      ...VIOLATION_PATTERNS,
      ...Array.from(this._custom_violations.values()),
    ];

    for (const { id, re, description } of allPatterns) {
      if (re.test(text)) {
        const constraint = this._constitution.constraints.find((c) => c.id === id);
        const severity = constraint ? constraint.severity : 'critical';
        const entry = { id, description, severity };
        if (severity === 'critical') violations.push(entry);
        else warnings.push(entry);
      }
    }

    // Check for uncertainty language when text has absolute-sounding claims
    const hasAbsoluteClaims = /\b(always|never|definitely|certainly|guaranteed|100%)\b/i.test(text);
    const hasHedging = /\b(may|might|could|probably|typically|usually|often|sometimes|I believe|I think|it appears|it seems)\b/i.test(text);
    if (hasAbsoluteClaims && !hasHedging) {
      warnings.push({ id: 'C3', description: 'Absolute claims without uncertainty hedging', severity: 'advisory' });
    }

    const passed = violations.length === 0;
    const score = Math.max(0, 100 - (violations.length * 20) - (warnings.length * 5));

    const result = { passed, violations, warnings, score, checked_at: new Date().toISOString() };
    this._audit_log.push({ text: text.substring(0, 100), ...result });
    if (this._audit_log.length > 500) this._audit_log.shift();
    return result;
  }

  getAuditLog(limit = 50) {
    return this._audit_log.slice(-limit);
  }

  getStats() {
    const total = this._audit_log.length;
    const failed = this._audit_log.filter((r) => !r.passed).length;
    return { total_validations: total, violations_detected: failed, pass_rate: total ? Math.round(((total - failed) / total) * 100) : 100 };
  }
}

let _instance = null;
function getConstitutionEngine() {
  if (!_instance) _instance = new ConstitutionEngine();
  return _instance;
}

module.exports = { ConstitutionEngine, getConstitutionEngine, DEFAULT_CONSTITUTION };
