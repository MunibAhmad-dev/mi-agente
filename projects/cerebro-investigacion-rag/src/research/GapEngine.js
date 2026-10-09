'use strict';

/**
 * Face 32 — GapEngine (plan §29).
 *
 * After each research round: WHAT DON'T WE KNOW? Detects missing sources,
 * missing primary evidence, unresolved contradictions, unknown dates/authors,
 * unverified claims, insufficient samples — and creates follow-up tasks
 * automatically.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');

const GAPS = () => collection('research_gaps');

/**
 * @param {object} input { session, docs, claims, contradictions, evidenceSummaries, round }
 * @returns { gaps: Gap[], tasks: Task[] }
 */
async function detect(input) {
  const { session, docs = [], claims = [], contradictions = [], evidenceSummaries = [], round = 1 } = input;
  const gaps = [];
  const tasks = [];

  const hostSet = new Set(docs.map((d) => { try { return new URL(d.canonical_url).hostname; } catch { return d.canonical_url; } }));

  // Missing source diversity
  if (docs.length > 0 && hostSet.size < Math.min(3, docs.length)) {
    gaps.push({ type: 'missing_source_diversity', detail: `only ${hostSet.size} distinct hosts`, severity: 'medium' });
  }
  // Missing primary evidence
  const hasPrimary = evidenceSummaries.some((s) => s.evidence.primary > 0);
  if (claims.length && !hasPrimary) {
    gaps.push({ type: 'missing_primary_evidence', detail: 'no primary document among evidence', severity: 'high' });
    tasks.push({ id: uid('task'), session_id: session.id, type: 'PRIMARY_SOURCE_SEARCH', status: 'PENDING', round, created_at: nowIso(), detail: 'escalate claims to primary documents/data' });
  }
  // Unresolved contradictions
  const unresolved = contradictions.filter((c) => !c.resolved);
  if (unresolved.length) {
    gaps.push({ type: 'unresolved_contradictions', detail: `${unresolved.length} contradiction(s) open`, severity: 'high' });
    for (const c of unresolved.slice(0, 3)) {
      tasks.push({ id: uid('task'), session_id: session.id, type: 'CONTRADICTION_RESOLUTION', status: 'PENDING', round, created_at: nowIso(), detail: `resolve ${c.type}: ${c.detail}`, contradiction_id: c.id });
    }
  }
  // Unknown dates/authors
  const unknownDate = claims.filter((c) => !c.time && /\b(19|20)\d{2}\b/.test(c.text) === false).length;
  if (unknownDate > claims.length * 0.6 && claims.length > 2) {
    gaps.push({ type: 'temporal_uncertainty', detail: 'most claims lack temporal anchoring', severity: 'low' });
  }
  // Unverified claims
  const unverified = claims.filter((c) => c.status === 'UNVERIFIED');
  if (unverified.length && round < 5) {
    gaps.push({ type: 'unverified_claims', detail: `${unverified.length} claims unverified`, severity: unverified.length > 3 ? 'medium' : 'low' });
    tasks.push({ id: uid('task'), session_id: session.id, type: 'MORE_RESEARCH', status: 'PENDING', round, created_at: nowIso(), detail: `verify ${Math.min(3, unverified.length)} open claims` });
  }

  for (const g of gaps) {
    await GAPS().insert({ id: uid('gap'), session_id: session.id, round, resolved: false, ...g, created_at: nowIso() });
  }
  for (const t of tasks) {
    await collection('research_tasks').insert(t);
  }
  return { gaps, tasks };
}

module.exports = { detect };
