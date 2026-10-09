/**
 * RateLimiter — Token bucket rate limiting
 * License: MIT — Zero cost
 */

class RateLimiter {
  constructor(options = {}) {
    this.buckets = new Map();
    this.defaultRate = options.rate || 100; // requests per window
    this.defaultWindow = options.window || 60000; // 1 min
    this.initialized = false;
  }

  initialize() { this.initialized = true; return { status: 'ok', module: 'RateLimiter' }; }

  /**
   * Check if request is allowed
   */
  check(key, { rate, window } = {}) {
    const r = rate || this.defaultRate;
    const w = window || this.defaultWindow;
    const now = Date.now();
    
    if (!this.buckets.has(key)) {
      this.buckets.set(key, { tokens: r, lastRefill: now });
    }

    const bucket = this.buckets.get(key);
    
    // Refill tokens
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor(elapsed / w * r);
    if (refill > 0) {
      bucket.tokens = Math.min(r, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return { allowed: true, remaining: bucket.tokens };
    }

    return { allowed: false, remaining: 0, retryAfter: w - (now - bucket.lastRefill) };
  }

  /**
   * Configure rate limit for a key
   */
  configure(key, { rate, window }) {
    this.buckets.set(key, { tokens: rate, lastRefill: Date.now(), rate, window });
    return { success: true };
  }

  /**
   * Reset a bucket
   */
  reset(key) {
    this.buckets.delete(key);
    return { success: true };
  }

  getStats() {
    const buckets = {};
    for (const [k, v] of this.buckets) buckets[k] = { tokens: v.tokens, rate: v.rate };
    return { buckets, initialized: this.initialized };
  }
}

module.exports = RateLimiter;
