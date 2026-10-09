'use strict';

/**
 * Face 32 — ConfidenceEngine (plan §31, §32).
 *
 * NEVER a single opaque number: confidence + evidence_quality + source_quality
 * + independence + primary_evidence + freshness + contradiction + bias_risk.
 * Every change is recorded in ConfidenceHistory with reason and the evidence
 * that changed it.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');

const HISTORY = () => collection('confidence_history');

/** Map a claim-level EvidenceEngine summary into multi-dimensional metrics. */
function dimensions(summary, profile = {}) {
  const ev = summary.evidence;
  const evidence_quality = ev.total ? Math.min(1, (ev.independent_supports * 0.35 + ev.primary * 0.4 + (ev.max_level === 'E0' ? 0 : 0.15) + ev.experimental * 0.5)) : 0;
  const contradiction = ev.independent_contradicts > 0 ? 'high' : ev.contradicts > 0 ? 'medium' : ev.total ? 'low' : 'unknown';
  const independence = ev.total ? Math.min(1, ev.independent_supports / Math.max(1, ev.supports)) : 0;

  return {
    confidence: summary.confidence,
    evidence_quality: Math.round(evidence_quality * 100) / 100,
    source_quality: profile.source_quality != null ? profile.source_quality : null,
    independence: Math.round(independence * 100) / 100,
    primary_evidence: ev.primary > 0 ? Math.min(1, ev.primary) : 0,
    freshness: profile.freshness != null ? profile.freshness : null,
    contradiction,
    bias_risk: profile.bias_risk != null ? profile.bias_risk : 'unknown', // context only, never truth
  };
}

/** Record a confidence transition with the reason + evidence that changed it. */
async function record(sessionId, claimId, from, to, reason, evidenceRefs = []) {
  const rec = await HISTORY().insert({
    id: uid('cfh'),
    session_id: sessionId,
    claim_id: claimId || null,
    initial_confidence: from,
    updated_confidence: to,
    reason,
    evidence_that_changed_it: evidenceRefs,
    created_at: nowIso(),
  });
  eventbus.emit('ConfidenceUpdated', { session_id: sessionId, claim_id: claimId, from, to, reason });
  return rec;
}

/** Replay the confidence trajectory of a claim/session (95 → 62 → 81 style). */
async function history(sessionId, claimId = null) {
  const rows = await HISTORY().find((h) => h.session_id === sessionId && (claimId ? h.claim_id === claimId : true));
  return rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

module.exports = { dimensions, record, history };
