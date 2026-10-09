'use strict';

/**
 * Face 31 — AdversarialEngine (plan §27, §31, §33, 19A.17).
 *
 * Logical agents: SUPPORTER finds supporting evidence, CHALLENGER contrary,
 * SKEPTIC hunts errors, SOURCE_AUDITOR audits provenance, JUDGE synthesizes
 * BY EVIDENCE (never majority vote). On high confidence → CHALLENGE MODE
 * ("what would prove us wrong?") with targeted searches.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');
const { truncate } = require('../core/text');

const TASKS = () => collection('adversarial_tasks');
const VERDICTS = () => collection('adversarial_verdicts');

const AGENTS = ['SUPPORTER', 'CHALLENGER', 'SKEPTIC', 'SOURCE_AUDITOR', 'JUDGE'];

/**
 * Create the standard adversarial task set for a claim.
 * When political/contested → full protocol A-E (19A.17).
 */
async function createTasks(claim, opts = {}) {
  const political = Boolean(opts.political);
  const defs = [
    { agent: 'SUPPORTER', goal: `find the strongest evidence SUPPORTING: ${truncate(claim.text, 120)}`, search_strategy: 'supporting keywords, aligned sources, primary data' },
    { agent: 'CHALLENGER', goal: `find the strongest evidence CONTRADICTING: ${truncate(claim.text, 120)}`, search_strategy: 'negations, counter-examples, contrary data' },
    { agent: 'SKEPTIC', goal: `find methodological errors, definition mismatches or contextual traps in: ${truncate(claim.text, 120)}`, search_strategy: 'definitions, context, dates, sample sizes' },
    { agent: 'SOURCE_AUDITOR', goal: 'audit independence, bias and provenance of every source used', search_strategy: 'dependency graph, funding, ownership, originality' },
    { agent: 'JUDGE', goal: 'synthesize a verdict strictly from collected evidence', search_strategy: 'none (weighs existing evidence)' },
  ];
  if (political) {
    defs.push(
      { agent: 'SUPPORTER', goal: 'TASK A: search LEFT-leaning coverage supporting the claim', search_strategy: 'left outlets + primary' },
      { agent: 'CHALLENGER', goal: 'TASK B: search RIGHT-leaning coverage contradicting the claim', search_strategy: 'right outlets + primary' },
      { agent: 'SOURCE_AUDITOR', goal: 'TASK C: find PRIMARY evidence (documents, data, recordings)', search_strategy: 'archives, official records' },
      { agent: 'SKEPTIC', goal: 'TASK D: find INDEPENDENT sources outside the political axis', search_strategy: 'academic, international, wire services' },
      { agent: 'JUDGE', goal: 'TASK E: determine whether apparent consensus is actually independent', search_strategy: 'dependency graph analysis' },
    );
  }
  const tasks = [];
  for (const d of defs) {
    const rec = await TASKS().insert({
      id: uid('adv'),
      claim_id: claim.id,
      agent: d.agent,
      goal: d.goal,
      search_strategy: d.search_strategy,
      status: 'PENDING',
      findings: [],
      political,
      created_at: nowIso(),
    });
    tasks.push(rec);
  }
  return tasks;
}

/** Complete a task with findings (from acquisition rounds). */
async function complete(taskId, findings) {
  return TASKS().update(taskId, { status: 'COMPLETE', findings, completed_at: nowIso() });
}

/**
 * Judge synthesis. Majority of agents does NOT decide: the JUDGE weighs
 * evidence records only.
 * @param {object} input { claim, evidenceSummary, sourceAudit, contradictionCount }
 */
async function judge(input) {
  const { claim, evidenceSummary, sourceAudit, contradictionCount = 0 } = input;
  const ev = evidenceSummary || { supports: 0, contradicts: 0, independent_supports: 0, independent_contradicts: 0, primary: 0, max_level: 'E0' };

  let verdict = 'UNVERIFIED';
  let reasoning = [];

  if (ev.experimental > 0) {
    verdict = 'EXPERIMENTALLY_VERIFIED';
    reasoning.push('direct experimental verification exists');
  } else if (ev.independent_supports >= 2 && ev.primary > 0 && ev.independent_contradicts === 0) {
    verdict = 'TRUE';
    reasoning.push(`${ev.independent_supports} independent supporting sources + primary evidence`);
  } else if (ev.independent_supports >= 1 && ev.independent_contradicts === 0) {
    verdict = 'MOSTLY_TRUE';
    reasoning.push(`independent support exists (${ev.independent_supports}); no independent contradiction`);
  } else if (ev.independent_contradicts >= 1 && ev.independent_supports === 0) {
    verdict = ev.primary === 0 ? 'FALSE_CANDIDATE' : 'CONTRADICTED';
    reasoning.push(`independent contradiction exists; no independent support`);
  } else if (ev.independent_supports >= 1 && ev.independent_contradicts >= 1) {
    verdict = 'CONTRADICTED';
    reasoning.push('both independent support and contradiction exist — unresolved conflict');
    reasoning.push('escalation: primary-source search required');
  } else if (ev.supports >= 1 && ev.contradicts === 0) {
    verdict = 'PARTIALLY_TRUE';
    reasoning.push('only dependent/single-source support so far');
  } else {
    reasoning.push('insufficient evidence to conclude — saying "I don\'t know" (plan §107)');
  }

  if (sourceAudit && sourceAudit.independent_sources === 1 && ev.supports > 2) {
    reasoning.push(`false consensus: ${ev.supports} apparent sources reduce to ${sourceAudit.independent_sources} independent`);
  }

  const rec = await VERDICTS().insert({
    id: uid('vrd'),
    claim_id: claim.id,
    verdict,
    reasoning,
    evidence: ev,
    contradiction_count: contradictionCount,
    decided_by: 'JUDGE (evidence-weighted, not majority)',
    created_at: nowIso(),
  });
  return rec;
}

/** Devil's advocate (plan §33): fires when confidence exceeds threshold. */
async function challengeMode(session, confidenceEngineValue, threshold) {
  if (confidenceEngineValue < threshold) return null;
  const rec = await TASKS().insert({
    id: uid('adv'),
    session_id: session.id || session.session_id || null,
    agent: 'CHALLENGER',
    kind: 'CHALLENGE_MODE',
    goal: 'What would prove us wrong? Actively search for disconfirming evidence of the current best answer.',
    search_strategy: 'negations of key claims, edge cases, contradicting primary data',
    status: 'PENDING',
    findings: [],
    triggered_by: `confidence ${confidenceEngineValue} ≥ threshold ${threshold}`,
    created_at: nowIso(),
  });
  eventbus.emit('ConfidenceUpdated', { session_id: session.id, challenge_mode: true, confidence: confidenceEngineValue });
  return rec;
}

module.exports = { createTasks, complete, judge, challengeMode, AGENTS };
