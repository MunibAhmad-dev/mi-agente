/**
 * PolicyEvaluator — High-level policy evaluation for agent actions.
 *
 * Wraps CedarEngine + PolicyStore to provide a single evaluate() method
 * that the AgentRuntime can call before executing any tool/action.
 *
 * License: Apache-2.0 (Cedar)
 */

const CedarEngine = require('./CedarEngine');
const PolicyStore = require('./PolicyStore');

/**
 * Evaluate whether an agent action is allowed.
 * @param {object} request - { principal, action, resource }
 * @returns {Promise<{decision: 'allow'|'deny', matched: Array, source: string}>}
 */
async function evaluate(request) {
  const policies = PolicyStore.getMatching({ action: request.action });
  const allPolicies = [...policies, ...PolicyStore.getMatching({})];
  const unique = allPolicies.filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i);
  return CedarEngine.evaluate(unique, request);
}

/**
 * Evaluate and enforce: returns boolean allow/deny for simple checks.
 * @param {object} request
 * @returns {Promise<boolean>}
 */
async function isAllowed(request) {
  const result = await evaluate(request);
  return result.decision === 'allow';
}

/**
 * Evaluate with detailed info for logging.
 * @param {object} request
 * @returns {Promise<{allowed: boolean, decision: string, matched: Array, source: string}>}
 */
async function check(request) {
  const result = await evaluate(request);
  return {
    allowed: result.decision === 'allow',
    decision: result.decision,
    matched: result.matched,
    source: result.source,
  };
}

/**
 * Synchronous policy check for use in hot-path hooks.
 * Uses PolicyStore directly (no async Cedar engine) — fails open on error.
 * @param {object} request - { action, resource?, tool? }
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkSync(request) {
  try {
    const policies = PolicyStore.getMatching({ action: request.action });
    const all = [...policies, ...PolicyStore.getMatching({})];
    const unique = all.filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i);
    const denied = unique.find(
      (p) => (p.effect === 'deny' || p.decision === 'deny') &&
              (!p.action || p.action === request.action || p.action === '*'),
    );
    if (denied) {
      return { allowed: false, reason: denied.reason || `Denied by policy: ${denied.id}` };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

module.exports = {
  evaluate,
  isAllowed,
  check,
  checkSync,
};
