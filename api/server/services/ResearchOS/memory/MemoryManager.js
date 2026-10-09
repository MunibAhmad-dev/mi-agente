'use strict';

/**
 * Face 37 — MemoryManager (plan §37, §43).
 *
 * Four separated memory layers:
 *   RAW_MEMORY      original documents (never deleted)
 *   EVIDENCE_MEMORY claims + evidence
 *   KNOWLEDGE_MEMORY consolidated knowledge
 *   WORKING_MEMORY  current research context
 * Plus ResearchMemory: question/plan/queries/sources/claims/evidence/
 * contradictions/experiments/results/answer/evaluation/failed+successful
 * strategies.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');

const MEM = () => collection('memories');
const RM = () => collection('research_memory');

const LAYERS = ['RAW_MEMORY', 'EVIDENCE_MEMORY', 'KNOWLEDGE_MEMORY', 'WORKING_MEMORY'];

async function store(layer, payload, opts = {}) {
  if (!LAYERS.includes(layer)) throw new Error(`invalid layer ${layer}`);
  return MEM().insert({
    id: uid('mem'),
    layer,
    payload,
    refs: opts.refs || [],
    session_id: opts.session_id || null,
    expires_at: opts.expires_at || null,
    created_at: nowIso(),
  });
}

async function recall(layer, pred = () => true, limit = 20) {
  const rows = await MEM().find((m) => m.layer === layer && pred(m));
  return rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit);
}

/** Persist the full story of a research session (§43). */
async function saveResearchMemory(sessionRecord) {
  return RM().insert({
    id: uid('rmem'),
    session_id: sessionRecord.id,
    question: sessionRecord.question,
    plan: sessionRecord.profile || null,
    queries: sessionRecord.queries || [],
    sources: sessionRecord.dependency_summary || null,
    claims: sessionRecord.answer ? sessionRecord.answer.claims : [],
    evidence: sessionRecord.evidence_ref || null,
    contradictions: sessionRecord.answer ? sessionRecord.answer.uncertainties.contradictions : [],
    experiments: sessionRecord.experiments || [],
    results: sessionRecord.result || null,
    answer: sessionRecord.answer || null,
    evaluation: sessionRecord.evaluation || null,
    failed_strategies: sessionRecord.failed_strategies || [],
    successful_strategies: sessionRecord.successful_strategies || [],
    created_at: nowIso(),
  });
}

module.exports = { store, recall, saveResearchMemory, LAYERS };
