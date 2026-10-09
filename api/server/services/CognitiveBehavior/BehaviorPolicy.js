'use strict';

/**
 * BehaviorPolicy — Gen B Phase 27.
 *
 * Enforces behavioral guardrails on agent actions. Maintains a set of named
 * policies (each a list of rules) and evaluates them against a proposed action
 * before it is dispatched. Rules may be of type: allow, deny, require, or
 * rate_limit. The default "baseline" policy ships with sensible defaults.
 */

const BUILTIN_POLICIES = {
  baseline: {
    policyId: 'baseline',
    description: 'Default behavioral guardrails for all agent interactions',
    rules: [
      { id: 'no_pii_output',   type: 'deny',    pattern: /\b\d{3}-\d{2}-\d{4}\b/, field: 'content', reason: 'SSN pattern in output' },
      { id: 'no_password_echo', type: 'deny',   pattern: /password\s*[:=]\s*\S+/i, field: 'content', reason: 'Password echo in output' },
      { id: 'no_exec_chain',   type: 'deny',    pattern: /;\s*(rm|mkfs|dd|shutdown|reboot)\b/i, field: 'command', reason: 'Chained destructive shell command' },
      { id: 'require_intent',  type: 'require', field: 'intent', reason: 'Intent must be set before action' },
      { id: 'max_output_size', type: 'rate_limit', limit: 50000, field: 'contentLength', reason: 'Output exceeds 50 000 chars' },
    ],
  },
  strict: {
    policyId: 'strict',
    description: 'Stricter policy for high-risk contexts',
    rules: [
      { id: 'no_shell',   type: 'deny', pattern: /\b(exec|spawn|eval|Function)\s*\(/i, field: 'content', reason: 'Shell/eval pattern in output' },
      { id: 'no_urls',    type: 'deny', pattern: /https?:\/\/(?!librechat\.ai)/, field: 'content', reason: 'External URL in output (strict mode)' },
      { id: 'require_intent',  type: 'require', field: 'intent', reason: 'Intent must be set before action' },
    ],
  },
};

class BehaviorPolicy {
  constructor() {
    this._policies = new Map();
    this._loadBuiltins();
    this.stats = { checks: 0, denied: 0, allowed: 0 };
  }

  /**
   * Register a custom policy.
   * @param {string} policyId
   * @param {{ description?, rules: Array }} def
   */
  register(policyId, def) {
    try {
      if (!policyId || !def || !Array.isArray(def.rules)) return { ok: false, error: 'policyId and rules[] required' };
      this._policies.set(policyId, { policyId, description: def.description || '', rules: def.rules });
      return { ok: true, policyId, ruleCount: def.rules.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Evaluate an action against a policy.
   * @param {string} policyId
   * @param {{ content?, command?, intent?, contentLength? }} action
   * @returns {{ allowed: boolean, violations: string[], policyId: string }}
   */
  evaluate(policyId, action = {}) {
    this.stats.checks++;
    try {
      const policy = this._policies.get(policyId) || this._policies.get('baseline');
      if (!policy) return { allowed: true, violations: [], policyId };

      const violations = [];
      for (const rule of policy.rules) {
        try {
          const value = action[rule.field] || '';
          if (rule.type === 'deny' && rule.pattern) {
            const text = typeof value === 'string' ? value : String(value);
            if (rule.pattern.test(text)) violations.push(`[${rule.id}] ${rule.reason}`);
          } else if (rule.type === 'require') {
            if (!value) violations.push(`[${rule.id}] ${rule.reason}`);
          } else if (rule.type === 'rate_limit') {
            const num = typeof value === 'number' ? value : (typeof value === 'string' ? value.length : 0);
            if (num > (rule.limit || Infinity)) violations.push(`[${rule.id}] ${rule.reason}`);
          }
        } catch { /* non-fatal per-rule */ }
      }

      const allowed = violations.length === 0;
      if (allowed) this.stats.allowed++; else this.stats.denied++;
      return { allowed, violations, policyId: policy.policyId };
    } catch (err) {
      return { allowed: true, violations: [], policyId, error: err.message };
    }
  }

  /**
   * Evaluate against the baseline policy (convenience).
   */
  check(action) {
    return this.evaluate('baseline', action);
  }

  listPolicies() {
    return Array.from(this._policies.values()).map((p) => ({ policyId: p.policyId, description: p.description, ruleCount: p.rules.length }));
  }

  getStats() {
    return { ...this.stats };
  }

  _loadBuiltins() {
    for (const [id, def] of Object.entries(BUILTIN_POLICIES)) {
      this._policies.set(id, def);
    }
  }
}

let _instance = null;
function getBehaviorPolicy() {
  if (!_instance) _instance = new BehaviorPolicy();
  return _instance;
}

module.exports = { BehaviorPolicy, getBehaviorPolicy };
