/**
 * RateLimiter — Per-source rate limiting
 * ========================================
 * Token bucket algorithm with configurable limits per connector.
 */

class RateLimiter {
  constructor() {
    this._buckets = new Map(); // sourceId → { tokens, maxTokens, refillRate, lastRefill }
  }

  /**
   * Configure rate limits for a source.
   * @param {string} sourceId
   * @param {number} maxTokens - Maximum tokens (max requests in window)
   * @param {number} refillRateMs - Milliseconds per token refill
   */
  configure(sourceId, maxTokens, refillRateMs) {
    this._buckets.set(sourceId, {
      tokens: maxTokens,
      maxTokens,
      refillRateMs,
      lastRefill: Date.now(),
    });
  }

  /**
   * Try to consume a token. Returns true if allowed, false if rate limited.
   * @param {string} sourceId
   * @returns {boolean}
   */
  tryConsume(sourceId) {
    const bucket = this._buckets.get(sourceId);
    if (!bucket) return true; // No limit configured = allow

    this._refill(bucket);
    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }
    return false;
  }

  /**
   * Wait until a token is available.
   * @param {string} sourceId
   * @param {number} maxWaitMs - Max wait time
   * @returns {Promise<boolean>} true if acquired, false if timeout
   */
  async acquire(sourceId, maxWaitMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (this.tryConsume(sourceId)) return true;
      const bucket = this._buckets.get(sourceId);
      await new Promise((r) => setTimeout(r, Math.min(bucket.refillRateMs, 1000)));
    }
    return false;
  }

  /**
   * Get remaining tokens for a source.
   * @param {string} sourceId
   * @returns {number}
   */
  getRemaining(sourceId) {
    const bucket = this._buckets.get(sourceId);
    if (!bucket) return Infinity;
    this._refill(bucket);
    return bucket.tokens;
  }

  /**
   * Get rate limit info for a source.
   */
  getInfo(sourceId) {
    const bucket = this._buckets.get(sourceId);
    if (!bucket) return { configured: false };
    this._refill(bucket);
    return {
      configured: true,
      remaining: bucket.tokens,
      max: bucket.maxTokens,
      refillRateMs: bucket.refillRateMs,
    };
  }

  _refill(bucket) {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / bucket.refillRateMs);
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }
}

let _instance = null;
function getRateLimiter() {
  if (!_instance) _instance = new RateLimiter();
  return _instance;
}

module.exports = { RateLimiter, getRateLimiter };
