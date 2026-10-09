'use strict';

const crypto = require('crypto');

/**
 * ExactCache - Hash-based exact match cache for LLM requests.
 * Prevents redundant API calls for identical requests.
 */
class ExactCache {
  constructor(config = {}) {
    this.config = {
      maxEntries: config.maxEntries || 1000,
      ttlMs: config.ttlMs || 3600000, // 1 hour default
      ...config,
    };
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Generate hash for a request.
   */
  _hash(request) {
    const key = JSON.stringify({
      model: request.model,
      system: request.system,
      messages: request.messages,
      tools: (request.tools || []).map(t => t.function?.name || t.name || '').sort(),
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  /**
   * Check cache for an exact match.
   */
  get(request) {
    const hash = this._hash(request);
    const entry = this.cache.get(hash);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(hash);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return {
      response: entry.response,
      cached: true,
      age: Date.now() - entry.timestamp,
      hitCount: entry.hitCount++,
    };
  }

  /**
   * Store a request/response pair.
   */
  set(request, response) {
    const hash = this._hash(request);

    // Evict oldest if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
      this.stats.evictions++;
    }

    this.cache.set(hash, {
      response,
      timestamp: Date.now(),
      hitCount: 0,
      model: request.model,
    });
  }

  /**
   * Invalidate cache entries by pattern.
   */
  invalidate(pattern) {
    let count = 0;
    for (const [hash, entry] of this.cache) {
      if (pattern && entry.model && entry.model.includes(pattern)) {
        this.cache.delete(hash);
        count++;
      }
    }
    return count;
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      total,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%',
      entries: this.cache.size,
      maxEntries: this.config.maxEntries,
    };
  }
}

module.exports = { ExactCache };
