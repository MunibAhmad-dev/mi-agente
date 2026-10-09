'use strict';

/**
 * Face 34 — CheckpointManager (plan §59, §60).
 *
 * Stages: RESEARCH_STARTED → SEARCH_COMPLETED → SOURCES_COLLECTED →
 * CLAIMS_EXTRACTED → EVIDENCE_BUILT → VERIFICATION_COMPLETED →
 * EXPERIMENT_STARTED → EXPERIMENT_COMPLETED → ANSWER_GENERATED.
 * On failure: RESUME FROM LAST VALID CHECKPOINT.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');

const CHECKPOINTS = () => collection('checkpoints');

const STAGES = [
  'RESEARCH_STARTED', 'SEARCH_COMPLETED', 'SOURCES_COLLECTED', 'CLAIMS_EXTRACTED',
  'EVIDENCE_BUILT', 'VERIFICATION_COMPLETED', 'EXPERIMENT_STARTED',
  'EXPERIMENT_COMPLETED', 'ANSWER_GENERATED',
];

async function save(sessionId, stage, state) {
  if (!STAGES.includes(stage)) throw new Error(`unknown stage ${stage}`);
  return CHECKPOINTS().insert({
    id: uid('ckpt'),
    session_id: sessionId,
    stage,
    state_blob: JSON.stringify(state || {}),
    valid: true,
    created_at: nowIso(),
  });
}

async function latestValid(sessionId) {
  const rows = await CHECKPOINTS().find((c) => c.session_id === sessionId && c.valid);
  if (!rows.length) return null;
  const sorted = rows.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || Date.parse(a.created_at) - Date.parse(b.created_at));
  const last = sorted[sorted.length - 1];
  return { checkpoint: last, state: JSON.parse(last.state_blob || '{}') };
}

/** Mark checkpoints invalid after a hard failure of a stage. */
async function invalidate(sessionId, stage) {
  const rows = await CHECKPOINTS().find((c) => c.session_id === sessionId && c.stage === stage);
  for (const r of rows) await CHECKPOINTS().update(r._id, { valid: false });
  return rows.length;
}

module.exports = { save, latestValid, invalidate, STAGES };
