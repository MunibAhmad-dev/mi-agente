'use strict';

/**
 * Face 37 — EvaluationEngine (plan §78, §79).
 *
 * After each research: factuality, citation accuracy/completeness, source
 * quality, independence, coverage, contradiction handling, freshness,
 * hallucination check, reasoning quality → ResearchScore. Measurements come
 * from the run's own records — never invented.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');

const EVALS = () => collection('evaluation_runs');

const HALLUCINATION_MARKERS = ['according to my intuition', 'i believe that', 'everyone knows', 'obviamente todos saben', 'sin duda alguna'];

/**
 * @param {object} input { session, claims, summaries, contradictions, docs, dependencySummary }
 */
async function evaluate(input) {
  const { session, claims = [], summaries = [], contradictions = [], docs = [], dependencySummary } = input;

  const verified = summaries.filter((s) => ['TRUE', 'MOSTLY_TRUE', 'EXPERIMENTALLY_VERIFIED', 'PARTIALLY_TRUE'].includes(s.status));
  const factuality = summaries.length ? verified.length / summaries.length : 0;

  const withSources = claims.filter((c) => c.source_ids && c.source_ids.length);
  const citation_accuracy = claims.length ? Math.min(1, withSources.length / claims.length) : 0;
  const citation_completeness = summaries.length
    ? summaries.filter((s) => s.evidence.total > 0).length / summaries.length
    : 0;

  const hostSet = new Set(docs.map((d) => { try { return new URL(d.canonical_url).hostname; } catch { return d.canonical_url; } }));
  const source_quality = docs.length ? Math.min(1, hostSet.size / Math.max(1, Math.min(docs.length, 5))) : 0;
  const independence = dependencySummary && dependencySummary.apparent_sources
    ? dependencySummary.independent_sources / dependencySummary.apparent_sources
    : 0;

  const resolvedOrNone = contradictions.length === 0 || contradictions.some((c) => c.resolved);
  const contradiction_handling = contradictions.length ? (contradictions.filter((c) => c.resolved || c.escalation_task).length / contradictions.length) : 1;

  const freshnessHits = docs.filter((d) => d.fetched_at && (Date.now() - Date.parse(d.fetched_at)) < 7 * 86400000).length;
  const freshness = docs.length ? freshnessHits / docs.length : 0;

  const hallucination = claims.filter((c) => HALLUCINATION_MARKERS.some((m) => (c.text || '').toLowerCase().includes(m))).length;
  const reasoning_quality = Math.max(0, Math.min(1,
    0.5 * factuality + 0.3 * citation_completeness + 0.2 * (hallucination === 0 ? 1 : 0)));

  const score = {
    id: uid('eval'),
    session_id: session.id,
    ResearchScore: {
      factuality: round(factuality),
      evidence: round(citation_completeness),
      source_quality: round(source_quality),
      independence: round(independence),
      coverage: round(summaries.length ? summaries.filter((s) => s.evidence.total > 0).length / summaries.length : 0),
      freshness: round(freshness),
      contradiction_handling: round(contradiction_handling),
      efficiency: round(Math.min(1, docs.length ? 1 / Math.log2(docs.length + 2) : 0.5)),
      reasoning_quality: round(reasoning_quality),
      hallucination_detected: hallucination,
      citation_accuracy: round(citation_accuracy),
    },
    measured: true,
    created_at: nowIso(),
  };
  await EVALS().insert(score);
  return score;
}

function round(x) { return Math.round((Number(x) || 0) * 100) / 100; }

module.exports = { evaluate };
