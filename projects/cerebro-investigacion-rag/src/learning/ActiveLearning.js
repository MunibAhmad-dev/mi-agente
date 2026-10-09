'use strict';

/**
 * Face 37 — ActiveLearning + PolicyManager gate (plan §80, §81).
 *
 * After research: what worked / what failed / which source or query was
 * useful → ResearchPolicy proposals. STRICT GATE: proposals are stored and
 * evaluated but NEVER auto-applied to production behavior. Path is
 * propose → evaluate → test → benchmark → approval → deployment → rollback.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');

const POLICIES = () => collection('research_policies');
const STRATS = () => collection('strategy_memory');

/** Learn strategy memory per domain from a completed session. */
async function learnStrategy(session, evaluation) {
  const s = evaluation ? evaluation.ResearchScore : {};
  const effective = (s.factuality || 0) >= 0.5;
  const rec = await STRATS().insert({
    id: uid('str'),
    domain: session.profile ? session.profile.domain : 'general',
    mode: session.mode,
    strategy: {
      source_types: session.profile ? session.profile.source_types : [],
      queries_used: session.queries || 1,
      adversarial_used: Boolean(session.stop_reasons),
    },
    outcome: {
      factuality: s.factuality || 0,
      independence: s.independence || 0,
      coverage: s.coverage || 0,
    },
    what_worked: effective ? ['multi-provider acquisition', 'independence-aware evidence'] : [],
    what_failed: effective ? [] : ['insufficient evidence gathered for threshold'],
    created_at: nowIso(),
  });
  return rec;
}

/** Propose a policy change (from evaluation deltas). Proposals start PROPOSED. */
async function propose(policyDraft) {
  return POLICIES().insert({
    id: uid('pol'),
    ...policyDraft,
    status: 'PROPOSED',
    proposed_at: nowIso(),
    gate: {
      required_path: ['propose', 'evaluate', 'test', 'benchmark', 'approval', 'deployment', 'rollback_plan'],
      approved: false,
    },
  });
}

/** Advance a proposal through the gate — approval is EXPLICIT. */
async function gate(policyId, action, opts = {}) {
  const p = await POLICIES().get(policyId);
  if (!p) return { ok: false, reason: 'not_found' };
  if (action === 'approve') {
    if (!opts.approved_by) return { ok: false, reason: 'approval requires approved_by (no silent auto-approval)' };
    return POLICIES().update(policyId, { status: 'APPROVED', gate: { ...p.gate, approved: true, approved_by: opts.approved_by, approved_at: nowIso() } });
  }
  if (action === 'reject') return POLICIES().update(policyId, { status: 'REJECTED', gate: { ...p.gate, approved: false } });
  if (action === 'evaluate') return POLICIES().update(policyId, { status: 'EVALUATED', evaluation: opts.evaluation || {} });
  return { ok: false, reason: `unknown action ${action}` };
}

/** Any policy not APPROVED must NOT be applied by the orchestrator. */
async function activePolicies() {
  return POLICIES().find((p) => p.status === 'APPROVED');
}

module.exports = { learnStrategy, propose, gate, activePolicies };
