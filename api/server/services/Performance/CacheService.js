/**
 * Cache Service
 * ==============
 *
 * Sistema de caché con múltiples backends:
 * - Memory (LRU)
 * - Redis (requiere redis)
 *
 * Features:
 * - TTL
 * - LRU eviction
 * - Tags/Categories
 * - Stats
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  backend: process.env.CACHE_BACKEND || 'memory',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  memory: {
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000', 10),
    maxMemory: parseInt(process.env.CACHE_MAX_MEMORY || '104857600', 10), // 100MB
    ttl: parseInt(process.env.CACHE_DEFAULT_TTL || '300000', 10), // 5 min
  },
};

// ============================================================================
// MEMORY CACHE (LRU)
// ============================================================================

class LRUCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || config.memory.maxSize;
    this.maxMemory = options.maxMemory || config.memory.maxMemory;
    this.defaultTTL = options.ttl || config.memory.ttl;

    this.cache = new Map();
    this.accessOrder = [];
    this.timers = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      memoryUsed: 0,
    };
  }

  /**
   * Obtiene un valor
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access order
    this.updateAccessOrder(key);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Establece un valor
   */
  set(key, value, options = {}) {
    const { ttl = this.defaultTTL, tags = [] } = options;

    // Calculate size
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    const size = Buffer.byteLength(valueStr, 'utf8');

    // Check memory limit
    if (this.stats.memoryUsed + size > this.maxMemory) {
      this.evictToMakeSpace(size);
    }

    // Check size limit
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const expiresAt = ttl > 0 ? Date.now() + ttl : null;

    // Remove existing entry size
    if (this.cache.has(key)) {
      const existing = this.cache.get(key);
      this.stats.memoryUsed -= existing.size;
    }

    // Add new entry
    const entry = {
      value,
      size,
      expiresAt,
      tags,
      createdAt: Date.now(),
      accessedAt: Date.now(),
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.stats.memoryUsed += size;
    this.stats.sets++;

    // Set expiration timer
    if (ttl > 0) {
      this.setExpiration(key, ttl);
    }

    return true;
  }

  /**
   * Elimina un valor
   */
  delete(key) {
    const entry = this.cache.get(key);

    if (!entry) return false;

    this.stats.memoryUsed -= entry.size;
    this.cache.delete(key);
    this.removeFromAccessOrder(key);
    this.clearExpiration(key);

    this.stats.deletes++;
    return true;
  }

  /**
   * Verifica si existe
   */
  has(key) {
    const entry = this.cache.get(key);

    if (!entry) return false;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Limpia por tag
   */
  clearByTag(tag) {
    const keysToDelete = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));

    return keysToDelete.length;
  }

  /**
   * Limpia todo
   */
  clear() {
    const count = this.cache.size;

    this.cache.clear();
    this.accessOrder = [];
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.stats.memoryUsed = 0;

    return count;
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryUsed: this.stats.memoryUsed,
      maxMemory: this.maxMemory,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2) + '%'
          : '0%',
    };
  }

  // Helpers
  updateAccessOrder(key) {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  removeFromAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  setExpiration(key, ttl) {
    this.clearExpiration(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.delete(key);
      }, ttl),
    );
  }

  clearExpiration(key) {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  evictLRU() {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder.shift();
    this.stats.evictions++;
    this.delete(lruKey);
  }

  evictToMakeSpace(neededSize) {
    while (this.stats.memoryUsed + neededSize > this.maxMemory && this.cache.size > 0) {
      this.evictLRU();
    }
  }
}

// ============================================================================
// REDIS CACHE (Stub)
// ============================================================================

class RedisCache {
  constructor(options = {}) {
    this.host = options.host || config.redis.host;
    this.port = options.port || config.redis.port;
    this.password = options.password || config.redis.password;
    this.db = options.db || config.redis.db;

    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const redis = require('redis');
      this.client = redis.createClient({
        socket: {
          host: this.host,
          port: this.port,
        },
        password: this.password,
        database: this.db,
      });

      this.client.on('error', (err) => {
        logger.error('[Cache] Redis error:', err);
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
      logger.info('[Cache] Redis connected');
    } catch (error) {
      logger.warn('[Cache] Redis not available, falling back to memory');
      this.isConnected = false;
    }
  }

  async get(key) {
    if (!this.isConnected) return null;
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key, value, options = {}) {
    if (!this.isConnected) return false;
    const ttl = options.ttl || config.memory.ttl;
    await this.client.setEx(key, Math.floor(ttl / 1000), JSON.stringify(value));
    return true;
  }

  async delete(key) {
    if (!this.isConnected) return false;
    await this.client.del(key);
    return true;
  }

  async clear() {
    if (!this.isConnected) return 0;
    await this.client.flushDb();
    return true;
  }

  async getStats() {
    if (!this.isConnected) return null;
    const info = await this.client.info('memory');
    return { backend: 'redis', info };
  }
}

// ============================================================================
// UNIFIED CACHE API
// ============================================================================

class CacheService {
  constructor() {
    this.memory = new LRUCache();
    this.redis = new RedisCache();
    this.currentBackend = 'memory';
  }

  async init() {
    await this.redis.connect();
    if (this.redis.isConnected) {
      this.currentBackend = 'redis';
    }
  }

  /**
   * Obtiene un valor
   */
  async get(key) {
    // Try memory first
    const value = this.memory.get(key);
    if (value !== null) return value;

    // Try redis if available
    if (this.currentBackend === 'redis') {
      const redisValue = await this.redis.get(key);
      if (redisValue !== null) {
        // Populate memory
        this.memory.set(key, redisValue);
        return redisValue;
      }
    }

    return null;
  }

  /**
   * Establece un valor
   */
  async set(key, value, options = {}) {
    // Always set in memory
    this.memory.set(key, value, options);

    // Set in redis if available
    if (this.currentBackend === 'redis') {
      await this.redis.set(key, value, options);
    }

    return true;
  }

  /**
   * Elimina un valor
   */
  async delete(key) {
    this.memory.delete(key);

    if (this.currentBackend === 'redis') {
      await this.redis.delete(key);
    }

    return true;
  }

  /**
   * Verifica si existe
   */
  async has(key) {
    if (this.memory.has(key)) return true;

    if (this.currentBackend === 'redis') {
      const value = await this.redis.get(key);
      if (value !== null) {
        this.memory.set(key, value);
        return true;
      }
    }

    return false;
  }

  /**
   * Limpia por tag
   */
  async clearByTag(tag) {
    const count = this.memory.clearByTag(tag);

    // Redis doesn't support tags easily
    if (this.currentBackend === 'redis') {
      // Would need to track tag mappings
    }

    return count;
  }

  /**
   * Limpia todo
   */
  async clear() {
    this.memory.clear();

    if (this.currentBackend === 'redis') {
      await this.redis.clear();
    }

    return true;
  }

  /**
   * Wrapper para cachear funciones
   */
  async remember(key, fn, options = {}) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Genera clave de hash
   */
  static hash(key) {
    return crypto.createHash('md5').update(JSON.stringify(key)).digest('hex');
  }

  /**
   * Obtiene estadísticas
   */
  async getStats() {
    const memoryStats = this.memory.getStats();

    return {
      backend: this.currentBackend,
      memory: memoryStats,
    };
  }
}

// Singleton
const cache = new CacheService();

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

function cacheMiddleware(options = {}) {
  const {
    ttl = 300000, // 5 min
    keyGenerator = (req) => req.originalUrl,
    condition = () => true,
  } = options;

  return async (req, res, next) => {
    // Skip if condition not met
    if (!condition(req)) return next();

    const cacheKey = `middleware:${keyGenerator(req)}`;

    // Try to get cached response
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Override res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = async (data) => {
      await cache.set(cacheKey, data, { ttl });
      return originalJson(data);
    };

    next();
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Cache instance
  cache,

  // Backends
  LRUCache,
  RedisCache,

  // Config
  config,

  // Middleware
  cacheMiddleware,

  // Helpers
  hash: CacheService.hash,

  // Initialize
  init: () => cache.init(),

  // Stats
  getStats: () => cache.getStats(),
};
