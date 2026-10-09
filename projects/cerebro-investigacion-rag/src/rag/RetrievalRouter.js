'use strict';

/**
 * Face 33 — RetrievalRouter (plan §36).
 *
 * exact fact → keyword | semantic question → vector | entity relationship →
 * graph | contested claim → evidence graph | technical specification →
 * keyword + primary | complex research → hybrid.
 */

const { normalize } = require('../core/text');

function classifyQuery(query, context = {}) {
  const n = ' ' + normalize(query) + ' ';
  if (context.contested_claim_id) return { strategy: 'evidence_graph', reason: 'claim is contested' };
  if (context.entity_relation) return { strategy: 'graph', reason: 'entity relationship requested' };

  const exactSignals = /(\bdefined as\b|\bexact\b|\bspecification\b|\bversion number\b|\bcuanto es\b|\bwhat year\b|\bcapacity of\b|\bpinout\b|\bdatasheet\b)/.test(n);
  const whoWhat = /\b(who|what|when|where|quien|que|cuando|donde)\b/.test(n);
  const semanticSignals = /\b(why|how|compare|difference|explain|por que|como|diferencia|explica)\b/.test(n);

  if (exactSignals && !semanticSignals) return { strategy: 'keyword', reason: 'exact fact / specification lookup' };
  if (semanticSignals) return { strategy: 'hybrid', reason: 'semantic/analytical question' };
  if (whoWhat) return { strategy: 'keyword', reason: 'factual lookup' };
  return { strategy: 'hybrid', reason: 'default for exploratory queries' };
}

module.exports = { classifyQuery };
