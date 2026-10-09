'use strict';

/**
 * Face 33 — HybridRAG (plan §35).
 *
 * VECTOR + BM25/KEYWORD + ENTITY + CLAIM + GRAPH search → RERANK →
 * EVIDENCE FILTER (drops E0 from synthesis contexts) → CONTEXT BUILDER →
 * COMPRESSION → LLM. Per-leg provenance is preserved through fusion.
 */

const VectorStore = require('./VectorStore');
const KeywordStore = require('./KeywordStore');
const RetrievalRouter = require('./RetrievalRouter');
const { collection } = require('../core/store');
const { config } = require('../core/config');
const { contentWords, jaccard, truncate } = require('../core/text');

const CHUNKS = () => collection('document_chunks');
const CLAIMS = () => collection('claims');
const ENTITIES = () => collection('entities');
const EVIDENCE = () => collection('evidence');

/** Compress a context block: keep topic sentences, drop redundancy. */
function compressContext(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  const { sentences } = require('../core/text');
  const kept = [];
  let len = 0;
  for (const s of sentences(text)) {
    if (len + s.length > maxChars) break;
    kept.push(s);
    len += s.length + 1;
  }
  return kept.join(' ');
}

/** Simple reciprocal-rank-fusion reranker across legs. */
function rrfFuse(legResults, k = 60) {
  const scores = new Map();
  const meta = new Map();
  for (const leg of legResults) {
    leg.results.forEach((r, i) => {
      const cur = scores.get(r.id) || 0;
      scores.set(r.id, cur + 1 / (k + i + 1));
      if (!meta.has(r.id)) meta.set(r.id, { legs: [], metadata: r.metadata });
      meta.get(r.id).legs.push({ leg: leg.leg, score: r.score });
    });
  }
  return [...scores.entries()]
    .map(([id, s]) => ({ id, fused_score: Math.round(s * 10000) / 10000, legs: meta.get(id).legs, metadata: meta.get(id).metadata }))
    .sort((a, b) => b.fused_score - a.fused_score);
}

/**
 * Main retrieval entry.
 * @param {object} input { query, session_id, contested_claim_id, entity_relation, topK }
 */
async function retrieve(input) {
  const { query, contested_claim_id, entity_relation, topK = config.RAG_TOPK } = input;
  const route = RetrievalRouter.classifyQuery(query, { contested_claim_id, entity_relation });
  const legs = [];

  const wantVector = ['hybrid', 'vector'].includes(route.strategy);
  const wantKeyword = ['hybrid', 'keyword'].includes(route.strategy);

  if (wantKeyword) legs.push({ leg: 'bm25', results: await KeywordStore.search(query, topK) });
  if (wantVector) legs.push({ leg: 'tfidf', results: await VectorStore.search(query, topK) });

  // CLAIM search: atomic claims matching the query
  const allClaims = await CLAIMS().all();
  const qWords = new Set(contentWords(query));
  const claimHits = allClaims
    .map((c) => ({ id: c.id, score: jaccard(contentWords(c.text), [...qWords]), metadata: { type: 'claim', text: c.text, status: c.status, doc_id: c.doc_id } }))
    .filter((c) => c.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (claimHits.length) legs.push({ leg: 'claim', results: claimHits });

  // ENTITY/GRAPH search
  if (entity_relation || route.strategy === 'hybrid') {
    const ents = await ENTITIES().all();
    const entHits = ents
      .filter((e) => qWords.has(require('../core/text').normalize(e.name).replace(/\s+/g, '_')) || [...qWords].some((w) => require('../core/text').normalize(e.name).includes(w)))
      .slice(0, 5)
      .map((e) => ({ id: e._id, score: 0.5, metadata: { type: 'entity', name: e.name, relations: e.relations || [] } }));
    if (entHits.length) legs.push({ leg: 'entity', results: entHits });
  }

  // EVIDENCE GRAPH search for contested claims
  if (contested_claim_id) {
    const evs = await EVIDENCE().find((e) => e.claim_id === contested_claim_id);
    if (evs.length) {
      legs.push({
        leg: 'evidence_graph',
        results: evs.map((e) => ({ id: e._id, score: e.relevance || 0.5, metadata: { type: 'evidence', relation: e.relation, level: e.level, independent: e.independent, doc_id: e.doc_id } })),
      });
    }
  }

  const fused = rrfFuse(legs).slice(0, topK);

  // Attach chunk text, apply evidence filter (drop E0 contexts)
  const enriched = [];
  for (const f of fused) {
    let text = null;
    if (f.metadata && f.metadata.type === 'claim') text = f.metadata.text;
    else {
      const chunk = (await CHUNKS().find((c) => c._id === f.id || c.doc_id === f.id))[0];
      text = chunk ? chunk.text : null;
    }
    enriched.push({ ...f, text: truncate(text || '', 700) });
  }

  return { route, legs: legs.map((l) => ({ leg: l.leg, hits: l.results.length })), results: enriched };
}

module.exports = { retrieve, compressContext, rrfFuse };
