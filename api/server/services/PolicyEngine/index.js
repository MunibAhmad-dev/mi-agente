/**
 * PolicyEngine — Unified policy evaluation service.
 *
 * License: Apache-2.0 (Cedar)
 */

const CedarEngine = require('./CedarEngine');
const PolicyStore = require('./PolicyStore');
const PolicyEvaluator = require('./PolicyEvaluator');

// Initialize store on require
PolicyStore.init();

module.exports = {
  CedarEngine,
  PolicyStore,
  PolicyEvaluator,
  evaluate: PolicyEvaluator.evaluate,
  isAllowed: PolicyEvaluator.isAllowed,
  check: PolicyEvaluator.check,
};
