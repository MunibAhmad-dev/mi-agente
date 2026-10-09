/**
 * WebSearchRateLimiter — Phase I: rate-limit DDG/web-research + backup provider
 *
 * Sliding-window rate limiter that wraps any search function.
 * Primary: DuckDuckGo. Fallback: SerpAPI (if SERPAPI_API_KEY is set).
 */

'use strict';

const logger = {
  warn: (...a) => console.warn('[WebSearchRL]', ...a),
  info: (...a) => console.log('[WebSearchRL]', ...a),
};

const DEFAULT_CONFIG = {
  windowMs: 60_000, // 1-minute sliding window
  maxRequests: 10, // max searches per window per provider
  backoffMs: 2_000, // wait between retries
};

class SlidingWindowLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this._timestamps = [];
  }

  canProceed() {
    const now = Date.now();
    this._timestamps = this._timestamps.filter((t) => now - t < this.windowMs);
    return this._timestamps.length < this.maxRequests;
  }

  record() {
    this._timestamps.push(Date.now());
  }

  nextAvailableIn() {
    if (this._timestamps.length === 0) return 0;
    const oldest = Math.min(...this._timestamps);
    return Math.max(0, this.windowMs - (Date.now() - oldest));
  }
}

class WebSearchRateLimiter {
  constructor(config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    this._ddgLimiter = new SlidingWindowLimiter(cfg.maxRequests, cfg.windowMs);
    this._serpLimiter = new SlidingWindowLimiter(cfg.maxRequests * 2, cfg.windowMs);
    this._backoffMs = cfg.backoffMs;
  }

  /**
   * Execute a search with rate limiting + fallback.
   * @param {string} query
   * @param {object} adapters - { ddg: async fn, serp?: async fn }
   * @returns {Promise<object>}
   */
  async search(query, adapters) {
    if (!adapters || typeof adapters.ddg !== 'function') {
      throw new Error('adapters.ddg is required');
    }

    // Try primary (DDG)
    if (this._ddgLimiter.canProceed()) {
      try {
        this._ddgLimiter.record();
        const result = await adapters.ddg(query);
        return { source: 'ddg', result };
      } catch (err) {
        logger.warn(`DDG search failed: ${err.message}`);
      }
    } else {
      const wait = this._ddgLimiter.nextAvailableIn();
      logger.warn(`DDG rate-limited. Next slot in ${wait}ms`);
    }

    // Fallback: SerpAPI
    const serpFn = adapters.serp || this._makeSerpAdapter();
    if (serpFn && this._serpLimiter.canProceed()) {
      try {
        this._serpLimiter.record();
        const result = await serpFn(query);
        return { source: 'serp', result };
      } catch (err) {
        logger.warn(`SerpAPI fallback failed: ${err.message}`);
      }
    } else {
      logger.warn('Both DDG and SerpAPI are rate-limited or unavailable');
    }

    throw new Error(`Web search rate-limited for query: ${query.slice(0, 50)}`);
  }

  /** Build a SerpAPI adapter from env if key is available. */
  _makeSerpAdapter() {
    const key = process.env.SERPAPI_API_KEY;
    if (!key) return null;
    return async (query) => {
      const https = require('https');
      const params = new URLSearchParams({ q: query, api_key: key, engine: 'google', num: 5 });
      const url = `https://serpapi.com/search?${params}`;
      return new Promise((resolve, reject) => {
        https
          .get(url, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            });
          })
          .on('error', reject);
      });
    };
  }

  /** Return current rate-limit status for health checks. */
  status() {
    return {
      ddg: {
        canProceed: this._ddgLimiter.canProceed(),
        nextAvailableIn: this._ddgLimiter.nextAvailableIn(),
      },
      serp: {
        canProceed: this._serpLimiter.canProceed(),
        nextAvailableIn: this._serpLimiter.nextAvailableIn(),
      },
    };
  }
}

module.exports = { WebSearchRateLimiter };
