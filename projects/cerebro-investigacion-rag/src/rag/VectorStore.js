'use strict';

/**
 * Face 33 — VectorStore: TF-IDF weighted vectors + cosine similarity.
 * Zero external deps; swap for sqlite-vec/LanceDB adapter when needed
 * (lightweight-first). Documents indexed per collection with per-collection
 * IDF statistics.
 */

const { collection } = require('../core/store');
const { tokens } = require('../core/text');

const INDEX = () => collection('tfidf_index');

let stats = null;

function _rebuild() {
  const rows = INDEX().find(() => true);
  const df = new Map();
  for (const r of rows) {
    for (const t of new Set(r.tf.keys())) df.set(t, (df.get(t) || 0) + 1);
  }
  stats = { rows, df, N: rows.length || 1 };
}

function idf(term) {
  if (!stats) _rebuild();
  const n = stats.df.get(term) || 0;
  return Math.log((stats.N + 1) / (n + 1)) + 1;
}

function vectorize(text) {
  const tf = new Map();
  for (const t of tokens(text)) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

async function upsert(id, text, metadata = {}) {
  const existing = INDEX().find((r) => r.id === id)[0];
  const tf = vectorize(text);
  const rec = { id, tf, metadata };
  if (existing) return INDEX().update(existing._id, rec);
  stats = null;
  return INDEX().insert(rec);
}

function cosine(tfA, tfB) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [t, f] of tfA) {
    const w = f * idf(t);
    na += w * w;
    if (tfB.has(t)) dot += w * (tfB.get(t) * idf(t));
  }
  for (const [t, f] of tfB) nb += (f * idf(t)) ** 2;
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function search(queryText, k = 8, filter = null) {
  if (!stats) _rebuild();
  const q = vectorize(queryText);
  const scored = [];
  for (const r of stats.rows) {
    if (filter && !filter(r)) continue;
    scored.push({ id: r.id, score: Math.round(cosine(q, r.tf) * 1000) / 1000, metadata: r.metadata });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

module.exports = { upsert, search, vectorize, cosine, _rebuildForTests: _rebuild };
