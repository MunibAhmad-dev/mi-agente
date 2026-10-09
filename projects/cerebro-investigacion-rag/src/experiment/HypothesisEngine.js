'use strict';

/**
 * Face 35 — HypothesisEngine (plan §48).
 *
 * Research → Gap → Hypothesis. Each hypothesis carries statement,
 * assumptions, supporting/contradicting evidence, confidence, testability,
 * predicted outcome and an experiment plan. Hypotheses are NEVER conclusions
 * (plan §127).
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');

const HYPS = () => collection('hypotheses');

/** Hypothesis templates for open/optimization problems (e.g. LLM reduction). */
const TEMPLATES = {
  model_reduction: [
    { statement: 'H: structured pruning of {target} layers reduces size with bounded quality loss', technique: 'structured_pruning', test: 'measure perplexity + latency before/after pruning p% of layers' },
    { statement: 'H: low-rank factorization of attention weights preserves quality at rank r≪d', technique: 'low_rank_factorization', test: 'SVD-compress attention, measure quality delta' },
    { statement: 'H: vocabulary reduction (tokenizer merge) shrinks embedding matrix without quality collapse', technique: 'vocabulary_reduction', test: 'retrain head on merged vocab, compare' },
    { statement: 'H: distillation into a smaller student retains {pct}% task quality', technique: 'distillation', test: 'distill to half-size student, benchmark' },
    { statement: 'H: expert pruning in MoE removes rarely-routed experts safely', technique: 'expert_pruning', test: 'profile expert routing, prune bottom-k, benchmark' },
    { statement: 'H: parameter sharing across layers cuts memory with minor degradation', technique: 'parameter_sharing', test: 'share layer weights cyclically, benchmark' },
  ],
  generic_open: [
    { statement: 'H: the observed gap is explained by {missing_factor}', technique: 'factor_isolation', test: 'isolate factor, compare' },
    { statement: 'H: contradiction resolves in favor of the primary-source variant', technique: 'primary_check', test: 'locate primary document and compare' },
  ],
};

/**
 * Generate hypotheses from a session's gaps/claims.
 * @param {object} input { session, gaps, claims, domain }
 */
async function generate(input) {
  const { session, gaps = [], claims = [], domain = 'general' } = input;
  const out = [];

  const contradictionGaps = gaps.filter((g) => g.type === 'unresolved_contradictions');
  if (contradictionGaps.length) {
    out.push(_create(session.id, TEMPLATES.generic_open[1], { assumptions: ['primary documents exist and are accessible'], confidence: 0.4 }));
  }
  if (['ai', 'hardware'].includes(domain) || gaps.some((g) => /optimi|reduce|efficien/.test(g.type || '') + (g.detail || ''))) {
    for (const t of TEMPLATES.model_reduction.slice(0, 4)) {
      out.push(_create(session.id, t, { assumptions: ['model is accessible locally', 'quality metric chosen (perplexity/task acc)'], confidence: 0.35 }));
    }
  }
  if (!out.length) {
    out.push(_create(session.id, TEMPLATES.generic_open[0], { assumptions: ['identified missing factor is measurable'], confidence: 0.3 }));
  }

  // attach evidence references from session claims
  for (const h of out) {
    h.supporting_evidence = claims.slice(0, 2).map((c) => c.id);
  }
  return out;
}

function _create(sessionId, template, extra = {}) {
  const rec = {
    id: uid('hyp'),
    session_id: sessionId,
    statement: template.statement,
    technique: template.technique,
    assumptions: extra.assumptions || [],
    supporting_evidence: [],
    contradicting_evidence: [],
    confidence: extra.confidence || 0.3,
    testability: 'HIGH',
    predicted_outcome: `technique ${template.technique} achieves reduction with quality within tolerance`,
    experiment_plan: { test: template.test, metrics: ['quality', 'size', 'latency'], seed: 42 },
    status: 'PROPOSED',
    created_at: nowIso(),
  };
  eventbus.emit('HypothesisCreated', { session_id: sessionId, hypothesis_id: rec.id, technique: rec.technique });
  return rec;
}

async function save(hypotheses) {
  const saved = [];
  for (const h of hypotheses) saved.push(await HYPS().insert(h));
  return saved;
}

/** Reject a hypothesis and store WHY (failure memory, plan §53). */
async function reject(hypothesisId, reason, result = {}) {
  const h = await HYPS().get(hypothesisId);
  if (!h) return null;
  await HYPS().update(hypothesisId, {
    status: 'REJECTED',
    rejection_reason: reason,
    result,
    rejected_at: nowIso(),
  });
  return HYPS().get(hypothesisId);
}

async function forSession(sessionId) {
  return HYPS().find((h) => h.session_id === sessionId);
}

module.exports = { generate, save, reject, forSession, TEMPLATES };
