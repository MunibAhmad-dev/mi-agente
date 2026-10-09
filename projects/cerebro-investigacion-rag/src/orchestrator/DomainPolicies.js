'use strict';

/**
 * Face 34/68 — DomainPolicies (plan §68).
 *
 * Per-domain priorities, configurable. Policies bias SOURCE RANKING and
 * SEARCH STRATEGY only — never truth assessment.
 */

const POLICIES = {
  news: { source_priority: ['primary', 'independent_journalism', 'local', 'international'], freshness: 'critical', adversarial_political: true, min_independence: 0.6 },
  politics: { source_priority: ['primary', 'left', 'center', 'right', 'academic', 'international'], freshness: 'high', adversarial_political: true, min_independence: 0.7 },
  ai: { source_priority: ['papers', 'technical_docs', 'github', 'benchmarks', 'community'], freshness: 'high', adversarial_political: false, min_independence: 0.5 },
  hardware: { source_priority: ['manufacturer', 'technical_documentation', 'independent_benchmarks', 'community'], freshness: 'normal', adversarial_political: false, min_independence: 0.5 },
  ceramics: { source_priority: ['academic', 'historical', 'museum', 'practitioner', 'community'], freshness: 'static', adversarial_political: false, min_independence: 0.4 },
  anime: { source_priority: ['original_source', 'official', 'episode', 'reliable_database', 'community'], freshness: 'normal', adversarial_political: false, min_independence: 0.3 },
  science: { source_priority: ['papers', 'replications', 'datasets', 'reviews'], freshness: 'normal', adversarial_political: false, min_independence: 0.6 },
  general: { source_priority: ['web', 'community', 'academic'], freshness: 'normal', adversarial_political: false, min_independence: 0.4 },
};

function forDomain(domain) {
  return POLICIES[domain] || POLICIES.general;
}

/** User-defined heuristics (19A.24): allowed actions are search/verify/priority —
 *  never truth verdicts from orientation. */
function userHeuristic(rule) {
  const ALLOWED = ['SEARCH_MORE', 'VERIFY_MORE', 'REQUIRE_PRIMARY_SOURCE', 'LOWER_PRIORITY', 'SHOW_WARNING'];
  const FORBIDDEN = ['MARK_FALSE', 'MARK_TRUE', 'REDUCE_TRUST_BY_ORIENTATION'];
  if (FORBIDDEN.includes(rule.action)) {
    return { accepted: false, reason: 'orientation/popularity can never decide truth (prohibited heuristic 19A.13/19A.24)' };
  }
  if (!ALLOWED.includes(rule.action)) return { accepted: false, reason: `unknown action ${rule.action}` };
  return { accepted: true, rule: { ...rule, status: 'ACTIVE' } };
}

module.exports = { forDomain, userHeuristic, POLICIES };
