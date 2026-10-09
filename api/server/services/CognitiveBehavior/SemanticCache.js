'use strict';

/**
 * SemanticCache — Face 17 Phase 7.
 * Cache LLM responses by semantic similarity of the question.
 * Uses a simple TF-IDF-style cosine similarity for lookups.
 * TTL-based expiry. Max cache size with LRU eviction.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 min
const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_SIMILARITY_THRESHOLD = 0.82;

function tokenize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
}

function tfidfVector(tokens, idf) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const vec = {};
  for (const [t, freq] of Object.entries(tf)) {
    vec[t] = (freq / tokens.length) * (idf[t] || Math.log(2));
  }
  return vec;
}

function cosineSimilarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, normA = 0, normB = 0;
  for (const k of keys) {
    const va = a[k] || 0, vb = b[k] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

class SemanticCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, threshold = DEFAULT_SIMILARITY_THRESHOLD } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.threshold = threshold;
    this._entries = new Map(); // key → { question, tokens, vector, response, ts, hits }
    this._idf = {}; // term → idf weight
    this._stats = { hits: 0, misses: 0, evictions: 0 };
  }

  _buildVector(tokens) {
    return tfidfVector(tokens, this._idf);
  }

  _updateIDF(tokens) {
    for (const t of new Set(tokens)) {
      this._idf[t] = (this._idf[t] || 0) + 1;
    }
    const N = this._entries.size + 1;
    for (const t of Object.keys(this._idf)) {
      this._idf[t] = Math.log(N / (this._idf[t] + 1)) + 1;
    }
  }

  _evictIfNeeded() {
    if (this._entries.size < this.maxEntries) return;
    let oldest = null, oldestTs = Infinity;
    for (const [k, v] of this._entries) {
      if (v.ts < oldestTs) { oldest = k; oldestTs = v.ts; }
    }
    if (oldest) { this._entries.delete(oldest); this._stats.evictions++; }
  }

  _purgeExpired() {
    const now = Date.now();
    for (const [k, v] of this._entries) {
      if (now - v.ts > this.ttlMs) this._entries.delete(k);
    }
  }

  set(question, response) {
    this._purgeExpired();
    this._evictIfNeeded();
    const tokens = tokenize(question);
    this._updateIDF(tokens);
    const key = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this._entries.set(key, { question, tokens, vector: this._buildVector(tokens), response, ts: Date.now(), hits: 0 });
    return key;
  }

  get(question) {
    this._purgeExpired();
    const tokens = tokenize(question);
    const vec = this._buildVector(tokens);
    let best = null, bestScore = 0;
    for (const entry of this._entries.values()) {
      const sim = cosineSimilarity(vec, entry.vector);
      if (sim > bestScore) { best = entry; bestScore = sim; }
    }
    if (best && bestScore >= this.threshold) {
      best.hits++;
      this._stats.hits++;
      return { response: best.response, similarity: bestScore, original_question: best.question };
    }
    this._stats.misses++;
    return null;
  }

  clear() {
    this._entries.clear();
    this._idf = {};
    return { cleared: true };
  }

  getStats() {
    this._purgeExpired();
    return { ...this._stats, size: this._entries.size, max: this.maxEntries, threshold: this.threshold };
  }
}

let _instance = null;
function getSemanticCache(opts) {
  if (!_instance) _instance = new SemanticCache(opts);
  return _instance;
}

module.exports = { SemanticCache, getSemanticCache };
