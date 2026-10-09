'use strict';

/**
 * Face 29 — ContradictionEngine (plan §28).
 *
 * Detects direct / partial / temporal / contextual contradictions and source
 * disagreement. NEVER picks a winner automatically: conflicting claims
 * escalate to primary-source search (task creation) — plan §99.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');
const { jaccard, contentWords, normalize } = require('../core/text');

const CONTRAS = () => collection('contradictions');

const NEGATIONS = ['not', 'no', 'never', 'cannot', "n't", 'no ', 'nunca', 'tampoco', 'falso', 'false'];

function negated(text) {
  const n = ' ' + normalize(text) + ' ';
  return NEGATIONS.some((x) => n.includes(x));
}

/**
 * Compare two claims (same subject required by caller).
 * @returns contradiction record or null
 */
function compare(a, b) {
  const overlap = jaccard(contentWords(a.text), contentWords(b.text));
  if (overlap < 0.25) return null; // not about the same thing

  const yearsA = (a.text.match(/\b(19|20)\d{2}\b/g) || []);
  const yearsB = (b.text.match(/\b(19|20)\d{2}\b/g) || []);
  const sameSubject = a.subject && b.subject && normalize(a.subject) === normalize(b.subject);

  // temporal contradiction: same event, different years, no negation involved
  if (sameSubject && yearsA.length && yearsB.length && yearsA[0] !== yearsB[0] && !negated(a.text) && !negated(b.text)) {
    return { type: 'temporal', detail: `years ${yearsA[0]} vs ${yearsB[0]}`, confidence: 0.8 };
  }

  const opp = overlap >= 0.35 && (negated(a.text) !== negated(b.text));
  if (opp) return { type: 'direct', detail: 'negation asymmetry', confidence: 0.7 };

  // numeric disagreement
  const numsA = (a.text.match(/\d+(\.\d+)?%?/g) || []);
  const numsB = (b.text.match(/\d+(\.\d+)?%?/g) || []);
  if (sameSubject && numsA.length && numsB.length && numsA.join() !== numsB.join()) {
    return { type: 'partial', detail: `figures ${numsA.join('/')} vs ${numsB.join('/')}`, confidence: 0.55 };
  }

  if (overlap >= 0.6 && (a.status === 'FALSE_CANDIDATE' || b.status === 'FALSE_CANDIDATE')) {
    return { type: 'direct', detail: 'explicit status conflict', confidence: 0.6 };
  }
  return null;
}

/**
 * Scan a claim set for contradictions. Emits ContradictionDetected and returns
 * escalation tasks (primary-source search) instead of verdicts.
 */
async function scan(claims) {
  const out = [];
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const c = compare(claims[i], claims[j]);
      if (c) {
        const rec = await CONTRAS().insert({
          id: uid('ctr'),
          claim_a: claims[i].id,
          claim_b: claims[j].id,
          type: c.type,
          detail: c.detail,
          confidence: c.confidence,
          resolved: false,
          resolution: null,
          escalation_task: {
            id: uid('task'),
            type: 'PRIMARY_SOURCE_SEARCH',
            claim_ids: [claims[i].id, claims[j].id],
            status: 'PENDING',
            created_at: nowIso(),
          },
          created_at: nowIso(),
        });
        eventbus.emit('ContradictionDetected', { contradiction_id: rec.id, type: c.type, claim_a: claims[i].id, claim_b: claims[j].id });
        out.push(rec);
      }
    }
  }
  return out;
}

module.exports = { scan, compare, negated };
