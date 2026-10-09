'use strict';

/**
 * SemanticCache - Embedding-based semantic similarity cache.
 * Returns cached responses for semantically equivalent requests.
 */
class SemanticCache {
  constructor(config = {}) {
    this.config = {
      maxEntries: config.maxEntries || 500,
      ttlMs: config.ttlMs || 7200000, // 2 hours
      similarityThreshold: config.similarityThreshold || 0.88,
      ...config,
    };
    this.entries = [];
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Simple TF-based embedding (no external deps).
   * Good enough for semantic similarity in most cases.
   */
  _embed(text) {
    const clean = String(text || '').toLowerCase().replace(/[^a-z0-9áéíóúñü\s]/g, ' ');
    const words = clean.split(/\s+/).filter(w => w.length > 2);
    const freq = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }
    return freq;
  }

  /**
   * Cosine similarity between two term-frequency vectors.
   */
  _similarity(a, b) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length === 0 && keysB.length === 0) return 1;

    let dot = 0, normA = 0, normB = 0;
    const allKeys = new Set([...keysA, ...keysB]);

    for (const k of allKeys) {
      const va = a[k] || 0;
      const vb = b[k] || 0;
      dot += va * vb;
      normA += va * va;
      normB += vb * vb;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Extract a simplified key from a request for matching.
   */
  _requestKey(request) {
    const parts = [];
    if (request.system) parts.push(request.system.slice(0, 200));
    const msgs = request.messages || [];
    for (const m of msgs.slice(-3)) {
      parts.push(String(m.content || '').slice(0, 200));
    }
    return parts.join(' ');
  }

  /**
   * Look up a semantically similar cached response.
   */
  get(request) {
    this._evictExpired();

    const queryEmbed = this._embed(this._requestKey(request));

    let bestMatch = null;
    let bestScore = 0;

    for (const entry of this.entries) {
      // Must match model
      if (entry.model !== request.model) continue;

      const score = this._similarity(queryEmbed, entry.embedding);
      if (score > bestScore && score >= this.config.similarityThreshold) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      this.stats.hits++;
      return {
        response: bestMatch.response,
        cached: true,
        similarity: bestScore,
        age: Date.now() - bestMatch.timestamp,
      };
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Store a request/response pair.
   */
  set(request, response) {
    if (this.entries.length >= this.config.maxEntries) {
      // Remove oldest
      this.entries.sort((a, b) => a.timestamp - b.timestamp);
      this.entries.shift();
    }

    this.entries.push({
      embedding: this._embed(this._requestKey(request)),
      response,
      model: request.model,
      timestamp: Date.now(),
    });
  }

  _evictExpired() {
    const now = Date.now();
    this.entries = this.entries.filter(e => now - e.timestamp < this.config.ttlMs);
  }

  clear() {
    const count = this.entries.length;
    this.entries = [];
    return count;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      total,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%',
      entries: this.entries.length,
      threshold: this.config.similarityThreshold,
    };
  }
}

module.exports = { SemanticCache };
