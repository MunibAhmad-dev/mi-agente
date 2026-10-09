'use strict';

/**
 * Face 33 — KeywordStore: BM25 (Okapi) keyword retrieval leg.
 */

const { collection } = require('../core/store');
const { tokens } = require('../core/text');

const INDEX = () => collection('bm25_index');

let cached = null;

function _load() {
  const rows = INDEX().find(() => true);
  let totalLen = 0;
  const df = new Map();
  for (const r of rows) {
    totalLen += r.length;
    for (const t of new Set(r.tf.keys())) df.set(t, (df.get(t) || 0) + 1);
  }
  cached = { rows, df, avgLen: rows.length ? totalLen / rows.length : 0, N: rows.length };
}

const K1 = 1.5;
const B = 0.75;

async function index(id, text, metadata = {}) {
  const tf = new Map();
  for (const t of tokens(text)) tf.set(t, (tf.get(t) || 0) + 1);
  let len = 0;
  for (const f of tf.values()) len += f;
  const existing = INDEX().find((r) => r.id === id)[0];
  const rec = { id, tf, length: len, metadata };
  cached = null;
  if (existing) return INDEX().update(existing._id, rec);
  return INDEX().insert(rec);
}

function score(queryTokens, r) {
  let s = 0;
  for (const t of queryTokens) {
    const f = r.tf.get(t);
    if (!f) continue;
    const n = cached.df.get(t) || 0;
    const idf = Math.log(1 + (cached.N - n + 0.5) / (n + 0.5));
    s += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (r.length / (cached.avgLen || 1))));
  }
  return Math.round(s * 1000) / 1000;
}

async function search(query, k = 8, filter = null) {
  if (!cached) _load();
  const qt = tokens(query);
  const out = [];
  for (const r of cached.rows) {
    if (filter && !filter(r)) continue;
    const s = score(qt, r);
    if (s > 0) out.push({ id: r.id, score: s, metadata: r.metadata });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}

module.exports = { index, search };
