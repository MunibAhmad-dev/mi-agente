/**
 * CacheService — Redis-backed caching for social intelligence
 * ============================================================
 * Caches connector responses, search results, and computed data.
 */

const { createLogger } = require('../logger');

const logger = createLogger('CacheService');

class CacheService {
  constructor(redisClient = null) {
    this._redis = redisClient;
    this._memoryCache = new Map(); // Fallback if no Redis
    this._defaultTtl = 300; // 5 minutes
  }

  /**
   * Get a cached value.
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async get(key) {
    try {
      if (this._redis) {
        const data = await this._redis.get(`si:${key}`);
        return data ? JSON.parse(data) : null;
      }
      const entry = this._memoryCache.get(key);
      if (entry && Date.now() - entry.ts < entry.ttl * 1000) {
        return entry.data;
      }
      this._memoryCache.delete(key);
      return null;
    } catch (err) {
      logger.error('Cache get failed', { key, error: err.message });
      return null;
    }
  }

  /**
   * Set a cached value.
   * @param {string} key
   * @param {any} value
   * @param {number} [ttl] - TTL in seconds
   */
  async set(key, value, ttl = this._defaultTtl) {
    try {
      if (this._redis) {
        await this._redis.setex(`si:${key}`, ttl, JSON.stringify(value));
      } else {
        this._memoryCache.set(key, { data: value, ts: Date.now(), ttl });
      }
    } catch (err) {
      logger.error('Cache set failed', { key, error: err.message });
    }
  }

  /**
   * Delete a cached value.
   */
  async del(key) {
    try {
      if (this._redis) {
        await this._redis.del(`si:${key}`);
      }
      this._memoryCache.delete(key);
    } catch (err) {
      logger.error('Cache del failed', { key, error: err.message });
    }
  }

  /**
   * Get or compute (cache-through pattern).
   * @param {string} key
   * @param {Function} compute - Async function to compute value
   * @param {number} [ttl]
   * @returns {Promise<any>}
   */
  async getOrCompute(key, compute, ttl = this._defaultTtl) {
    const cached = await this.get(key);
    if (cached !== null) return cached;
    const value = await compute();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Clear all social intelligence cache.
   */
  async clear() {
    if (this._redis) {
      const keys = await this._redis.keys('si:*');
      if (keys.length > 0) await this._redis.del(...keys);
    }
    this._memoryCache.clear();
  }

  /**
   * Get cache stats.
   */
  getStats() {
    return {
      type: this._redis ? 'redis' : 'memory',
      entries: this._memoryCache.size,
    };
  }
}

module.exports = CacheService;
