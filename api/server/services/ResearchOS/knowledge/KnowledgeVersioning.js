'use strict';

/**
 * Face 36 — KnowledgeVersioning (plan §77).
 *
 * Every knowledge record keeps versions. Allows: WHAT DID WE KNOW THEN? WHAT
 * DO WE KNOW NOW? WHAT CHANGED? — with diffs on statement status and content.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');

const VERSIONS = () => collection('knowledge_versions');

async function snapshot(knowledgeRecord, reason = 'consolidation') {
  // deep clone: the caller keeps mutating its object — versions must be immutable
  const frozen = JSON.parse(JSON.stringify({ statements: knowledgeRecord.statements, entities: knowledgeRecord.entities }));
  return VERSIONS().insert({
    id: uid('knv'),
    knowledge_id: knowledgeRecord.id,
    version: (await VERSIONS().find((v) => v.knowledge_id === knowledgeRecord.id)).length + 1,
    statements: frozen.statements || [],
    entities: frozen.entities || [],
    reason,
    created_at: nowIso(),
  });
}

/** Compare two versions of the same knowledge record. */
async function diff(knowledgeId, fromVersion, toVersion) {
  const rows = await VERSIONS().find((v) => v.knowledge_id === knowledgeId);
  const from = rows.find((r) => r.version === fromVersion);
  const to = rows.find((r) => r.version === toVersion);
  if (!from || !to) return { ok: false, reason: 'version_not_found' };

  const key = (s) => (s.statement || '').toLowerCase().slice(0, 80);
  const fromMap = new Map(from.statements.map((s) => [key(s), s]));
  const toMap = new Map(to.statements.map((s) => [key(s), s]));

  const added = to.statements.filter((s) => !fromMap.has(key(s)));
  const removed = from.statements.filter((s) => !toMap.has(key(s)));
  const changed = [];
  for (const [k, s] of toMap) {
    const prev = fromMap.get(k);
    if (prev && (prev.status !== s.status || prev.evidence !== s.evidence)) {
      changed.push({ statement: s.statement, from: { status: prev.status, evidence: prev.evidence }, to: { status: s.status, evidence: s.evidence } });
    }
  }
  return { ok: true, added, removed, changed };
}

module.exports = { snapshot, diff };
