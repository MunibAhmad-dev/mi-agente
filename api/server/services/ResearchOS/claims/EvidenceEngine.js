'use strict';

/**
 * Face 29 — EvidenceEngine (plan §22, §39).
 *
 * Evidence levels:
 *   E0 unsupported | E1 single secondary source | E2 dependent repetition
 *   E3 independent corroboration | E4 primary evidence | E5 direct/experimental
 *
 * SUPPORTS / CONTRADICTS / QUALIFIES / UNKNOWN relations. Independence comes
 * from the DependencyAnalyzer graph — repetition is NEVER counted as
 * corroboration.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');
const { jaccard, contentWords } = require('../core/text');

const EVIDENCE = () => collection('evidence');
const RELATIONS = () => collection('evidence_relations');

const LEVELS = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];

/** Relevance of a document to a claim (lexical overlap). */
function relevance(docText, claimText) {
  return jaccard(contentWords(docText), contentWords(claimText));
}

/**
 * Add an evidence record linking a document to a claim.
 * @param {object} input { claim, doc, relation, dependency_graph, is_primary, experiment }
 */
async function add(input) {
  const { claim, doc, relation = 'SUPPORTS', dependency_graph = null, is_primary = false, experiment = null } = input;
  const rel = relevance((doc.content || doc.text || ''), claim.text);
  if (rel < 0.08) return null; // not actually about this claim

  // Determine independence: same dependency component as another evidence?
  let independent = true;
  if (dependency_graph && dependency_graph.edges) {
    const { componentOf } = require('../sources/DependencyAnalyzer');
    const myRoot = componentOf(dependency_graph, doc.id);
    const others = await EVIDENCE().find((ev) => ev.claim_id === claim.id);
    for (const other of others) {
      if (other.doc_id !== doc.id && componentOf(dependency_graph, other.doc_id) === myRoot) {
        independent = false;
        break;
      }
    }
  }

  let level = 'E0';
  if (experiment) level = 'E5';
  else if (is_primary) level = 'E4';
  else if (relation === 'CONTRADICTS' && independent) level = 'E3';
  else if (independent) level = 'E3';
  else level = 'E2';

  const rec = await EVIDENCE().insert({
    id: uid('ev'),
    claim_id: claim.id,
    doc_id: doc.id,
    source_id: doc.source_id || null,
    relation,
    level,
    independent,
    is_primary,
    relevance: Math.round(rel * 100) / 100,
    video_ts: claim.video_ts || null,
    created_at: nowIso(),
  });

  await RELATIONS().insert({ claim_id: claim.id, evidence_id: rec.id, relation, level });
  claim.evidence_ids.push(rec.id);

  eventbus.emit('EvidenceAdded', { claim_id: claim.id, evidence_id: rec.id, relation, level, session_id: claim.session_id || null });
  return rec;
}

/** Aggregate evidence state for a claim after all evidence is in. */
async function summarize(claimId) {
  const evs = await EVIDENCE().find((e) => e.claim_id === claimId);
  const supports = evs.filter((e) => e.relation === 'SUPPORTS');
  const contradicts = evs.filter((e) => e.relation === 'CONTRADICTS');
  const independent_support = supports.filter((e) => e.independent);
  const independent_contra = contradicts.filter((e) => e.independent);
  const primary = evs.filter((e) => e.is_primary);
  const experimental = evs.filter((e) => e.level === 'E5');

  let status = 'UNVERIFIED';
  let confidence = 0;

  if (experimental.length) { status = 'EXPERIMENTALLY_VERIFIED'; confidence = 0.95; }
  else if (primary.length && independent_support.length) { status = 'TRUE'; confidence = 0.9; }
  else if (independent_support.length && !independent_contra.length) {
    status = 'MOSTLY_TRUE';
    confidence = 0.55 + Math.min(0.3, independent_support.length * 0.1);
  }
  else if (supports.length && !independent_contra.length) {
    status = independent_support.length ? 'MOSTLY_TRUE' : 'PARTIALLY_TRUE';
    confidence = 0.35 + 0.05 * supports.length;
  }
  else if (independent_contra.length && !independent_support.length) {
    status = contradicts.length && !independent_support.length && !primary.length ? 'FALSE_CANDIDATE' : 'CONTRADICTED';
    confidence = 0.6;
  }
  else if (independent_contra.length && independent_support.length) {
    status = 'CONTRADICTED';
    confidence = 0.3 + 0.1 * Math.max(independent_support.length, independent_contra.length);
  }
  else if (supports.length || contradicts.length) {
    status = 'PARTIALLY_TRUE';
    confidence = 0.3;
  }
  if (status === 'UNVERIFIED') confidence = 0.1;

  return {
    claim_id: claimId,
    status,
    confidence: Math.round(Math.min(0.97, confidence) * 100) / 100,
    evidence: {
      total: evs.length,
      supports: supports.length,
      contradicts: contradicts.length,
      independent_supports: independent_support.length,
      independent_contradicts: independent_contra.length,
      primary: primary.length,
      experimental: experimental.length,
      max_level: evs.length ? evs.map((e) => e.level).sort((a, b) => LEVELS.indexOf(b) - LEVELS.indexOf(a))[0] : 'E0',
    },
  };
}

async function forClaim(claimId) {
  return EVIDENCE().find((e) => e.claim_id === claimId);
}

module.exports = { add, summarize, forClaim, relevance, LEVELS };
