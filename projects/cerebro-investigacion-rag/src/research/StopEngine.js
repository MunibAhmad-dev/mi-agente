'use strict';

/**
 * Face 32 — StopEngine (plan §30).
 *
 * Stops when evidence_sufficiency + source_independence + primary_evidence +
 * contradiction_resolution + freshness + coverage exceed domain thresholds.
 * NEVER researches indefinitely: hard round cap and resource cap always apply.
 */

const { config } = require('../core/config');

/**
 * @param {object} input { round, mode, docs, claims, evidenceSummaries, contradictions, budgetUsed, budgetMax }
 */
function shouldStop(input) {
  const { round, mode = 'STANDARD', docs = [], claims = [], evidenceSummaries = [], contradictions = [], budgetUsed = 0, budgetMax = 30 } = input;
  const reasons = [];
  const maxRounds = { QUICK: 1, STANDARD: 2, DEEP: 3, FORENSIC: 4, EXPERIMENTAL: 4 }[mode] || 3;

  // Hard caps first — never infinite
  if (round >= maxRounds) reasons.push(`round cap reached (${round}/${maxRounds})`);
  if (budgetUsed >= budgetMax) reasons.push(`source budget exhausted (${budgetUsed}/${budgetMax})`);

  if (!claims.length) {
    return { stop: reasons.length > 0, reasons: reasons.length ? reasons : ['no claims yet — continue'], metrics: null };
  }

  const withEvidence = evidenceSummaries.filter((s) => s.evidence.total > 0);
  const independentOk = evidenceSummaries.filter((s) => s.evidence.independent_supports > 0 || s.evidence.contradicts > 0);
  const primaryOk = evidenceSummaries.filter((s) => s.evidence.primary > 0);
  const resolved = contradictions.filter((c) => c.resolved).length;
  const contradictionResolution = contradictions.length === 0 ? 1 : resolved / contradictions.length;

  const coverage = claims.length ? withEvidence.length / claims.length : 0;
  const independence = evidenceSummaries.length ? independentOk.length / evidenceSummaries.length : 0;
  const primary = claims.length ? primaryOk.length / claims.length : 0;
  const sufficiency = evidenceSummaries.length
    ? evidenceSummaries.reduce((acc, s) => acc + Math.min(1, s.confidence), 0) / evidenceSummaries.length
    : 0;

  const metrics = {
    evidence_sufficiency: Math.round(sufficiency * 100) / 100,
    source_independence: Math.round(independence * 100) / 100,
    primary_evidence: Math.round(primary * 100) / 100,
    contradiction_resolution: Math.round(contradictionResolution * 100) / 100,
    coverage: Math.round(coverage * 100) / 100,
    round,
  };

  const thresholds = {
    confidence: config.STOP_MIN_CONFIDENCE,
    independence: config.STOP_MIN_INDEPENDENCE,
    primary: config.STOP_MIN_PRIMARY,
  };

  if (metrics.evidence_sufficiency >= thresholds.confidence
      && metrics.source_independence >= thresholds.independence
      && metrics.primary_evidence >= thresholds.primary
      && metrics.contradiction_resolution >= 1
      && metrics.coverage >= 0.5) {
    reasons.push('all stop thresholds exceeded — evidence sufficient');
  }

  return { stop: reasons.length > 0, reasons, metrics, thresholds };
}

module.exports = { shouldStop };
