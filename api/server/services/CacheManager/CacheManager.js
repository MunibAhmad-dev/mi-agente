/**
 * Cache Manager - Sistema de Caché Inteligente (JavaScript)
 *
 * Proporciona caché en memoria con TTL, eviction policies,
 * y soporte para diferentes tipos de datos.
 */

const EventEmitter = require('events');
const crypto = require('crypto');

const logger = {
  debug: (...args) => console.log('[CacheManager]', ...args),
  info: (...args) => console.log('[CacheManager]', ...args),
  warn: (...args) => console.warn('[CacheManager]', ...args),
  error: (...args) => console.error('[CacheManager]', ...args),
};

// Políticas de evict
const EvictionPolicy = {
  LRU: 'lru', // Least Recently Used
  LFU: 'lfu', // Least Frequently Used
  FIFO: 'fifo', // First In First Out
  TTL: 'ttl', // Time To Live only
};

// Tipos de dato en caché
const CacheType = {
  STRING: 'string',
  OBJECT: 'object',
  ARRAY: 'array',
  BUFFER: 'buffer',
};

/**
 * Cache Entry - Entrada individual del caché
 */
class CacheEntry {
  constructor(value, ttl, type) {
    this.key = null;
    this.value = value;
    this.type = type || this.detectType(value);
    this.createdAt = Date.now();
    this.lastAccessedAt = Date.now();
    this.accessCount = 0;
    this.ttl = ttl; // milliseconds
    this.hits = 0;
  }

  detectType(value) {
    if (Buffer.isBuffer(value)) return CacheType.BUFFER;
    if (Array.isArray(value)) return CacheType.ARRAY;
    if (typeof value === 'object' && value !== null) return CacheType.OBJECT;
    return CacheType.STRING;
  }

  isExpired() {
    if (this.ttl === 0) return false; // Sin TTL = no expira
    return Date.now() > this.createdAt + this.ttl;
  }

  touch() {
    this.lastAccessedAt = Date.now();
    this.accessCount++;
    this.hits++;
  }

  getValue() {
    this.touch();
    return this.value;
  }

  getAge() {
    return Date.now() - this.createdAt;
  }

  getSize() {
    if (Buffer.isBuffer(this.value)) {
      return this.value.length;
    }
    return JSON.stringify(this.value).length;
  }

  toJSON() {
    return {
      type: this.type,
      createdAt: this.createdAt,
      lastAccessedAt: this.lastAccessedAt,
      accessCount: this.accessCount,
      hits: this.hits,
      ttl: this.ttl,
      age: this.getAge(),
      size: this.getSize(),
      expired: this.isExpired(),
    };
  }
}

/**
 * Cache Manager - Clase principal
 */
class CacheManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxSize: config.maxSize || 1000, // Max entries
      maxMemoryMB: config.maxMemoryMB || 100, // Max memory in MB
      defaultTTL: config.defaultTTL || 3600000, // 1 hora default
      evictionPolicy: config.evictionPolicy || EvictionPolicy.LRU,
      enableStats: config.enableStats !== false,
      ...config,
    };

    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.totalMemory = 0;

    // Cleanup interval
    this.cleanupInterval = null;
    if (config.cleanupIntervalMs) {
      this.startCleanupInterval(config.cleanupIntervalMs);
    }
  }

  /**
   * Generar clave de caché
   */
  generateKey(prefix, ...args) {
    const data = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(':');

    const hash = crypto.createHash('md5').update(data).digest('hex');
    return `${prefix}:${hash}`;
  }

  /**
   * Establecer valor en caché
   */
  set(key, value, options = {}) {
    const ttl = options.ttl !== undefined ? options.ttl : this.config.defaultTTL;
    const type = options.type;

    // Verificar si ya existe para actualizar memoria
    const existing = this.cache.get(key);
    if (existing) {
      this.totalMemory -= existing.getSize();
    }

    const entry = new CacheEntry(value, ttl, type);
    entry.key = key;

    this.cache.set(key, entry);
    this.totalMemory += entry.getSize();

    // Evict si es necesario
    if (this.shouldEvict()) {
      this.evict();
    }

    this.emit('cache.set', { key, ttl, size: entry.getSize() });

    return entry;
  }

  /**
   * Obtener valor del caché
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      this.emit('cache.miss', { key });
      return null;
    }

    if (entry.isExpired()) {
      this.delete(key);
      this.misses++;
      this.emit('cache.expired', { key });
      return null;
    }

    this.hits++;
    this.emit('cache.hit', { key, value: entry.value });

    return entry.getValue();
  }

  /**
   * Verificar si existe
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.isExpired()) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Eliminar entrada
   */
  delete(key) {
    const entry = this.cache.get(key);

    if (entry) {
      this.totalMemory -= entry.getSize();
      this.cache.delete(key);
      this.emit('cache.delete', { key });
      return true;
    }

    return false;
  }

  /**
   * Limpiar todo el caché
   */
  clear() {
    const count = this.cache.size;
    this.cache.clear();
    this.totalMemory = 0;
    this.emit('cache.clear', { count });
    logger.info(`[CacheManager] Cleared ${count} entries`);
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%';

    return {
      entries: this.cache.size,
      maxSize: this.config.maxSize,
      memory: {
        used: this.formatBytes(this.totalMemory),
        max: this.formatBytes(this.config.maxMemoryMB * 1024 * 1024),
        percentage:
          ((this.totalMemory / (this.config.maxMemoryMB * 1024 * 1024)) * 100).toFixed(2) + '%',
      },
      stats: {
        hits: this.hits,
        misses: this.misses,
        hitRate,
        evictions: this.evictions,
      },
      topEntries: this.getTopEntries(5),
    };
  }

  /**
   * Obtener entradas más usadas
   */
  getTopEntries(limit = 10) {
    return Array.from(this.cache.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit)
      .map((e) => ({
        key: e.key,
        ...e.toJSON(),
      }));
  }

  /**
   * Verificar si debe evictuar
   */
  shouldEvict() {
    if (this.cache.size >= this.config.maxSize) return true;

    const maxBytes = this.config.maxMemoryMB * 1024 * 1024;
    if (this.totalMemory >= maxBytes) return true;

    return false;
  }

  /**
   * Evictuar entradas según política
   */
  evict(count = 1) {
    const entries = Array.from(this.cache.values());

    switch (this.config.evictionPolicy) {
      case EvictionPolicy.LRU:
        entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        break;

      case EvictionPolicy.LFU:
        entries.sort((a, b) => a.hits - b.hits);
        break;

      case EvictionPolicy.FIFO:
        entries.sort((a, b) => a.createdAt - b.createdAt);
        break;

      default:
        entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    }

    const evicted = entries.slice(0, count);

    for (const entry of evicted) {
      this.delete(entry.key);
      this.evictions++;
    }

    this.emit('cache.evict', { count: evicted.length });

    return evicted.map((e) => e.key);
  }

  /**
   * Obtener o establecer (get or set)
   */
  async getOrSet(key, fetchFn, options = {}) {
    const cached = this.get(key);

    if (cached !== null) {
      return cached;
    }

    // Fetch y cachear
    const value = await fetchFn();
    this.set(key, value, options);

    return value;
  }

  /**
   * Iniciar intervalo de cleanup
   */
  startCleanupInterval(intervalMs = 60000) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);

    logger.info(`[CacheManager] Cleanup interval started: ${intervalMs}ms`);
  }

  /**
   * Detener intervalo de cleanup
   */
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Limpiar entradas expiradas
   */
  cleanup() {
    const before = this.cache.size;

    for (const [key, entry] of this.cache) {
      if (entry.isExpired()) {
        this.delete(key);
      }
    }

    const cleaned = before - this.cache.size;

    if (cleaned > 0) {
      this.emit('cache.cleanup', { cleaned, remaining: this.cache.size });
      logger.debug(`[CacheManager] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Formatear bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Middleware para Express (cache de respuestas)
   */
  expressMiddleware(options = {}) {
    const cacheKeyGenerator =
      options.cacheKeyGenerator ||
      ((req) => {
        return this.generateKey(
          options.prefix || 'express',
          req.method,
          req.originalUrl || req.url,
        );
      });

    const ttl = options.ttl || this.config.defaultTTL;

    return (req, res, next) => {
      const key = cacheKeyGenerator(req);

      // Solo cachear GET
      if (req.method !== 'GET') {
        return next();
      }

      const cached = this.get(key);

      if (cached) {
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', key);
        return res.json(cached);
      }

      // Interceptar respuesta
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (res.statusCode === 200) {
          this.set(key, data, { ttl });
          res.set('X-Cache', 'MISS');
          res.set('X-Cache-Key', key);
        }
        return originalJson(data);
      };

      next();
    };
  }
}

// Singleton
let cacheInstance = null;

function getCacheManager(config) {
  if (!cacheInstance) {
    cacheInstance = new CacheManager(config);
  }
  return cacheInstance;
}

function createCacheManager(config) {
  cacheInstance = new CacheManager(config);
  return cacheInstance;
}

module.exports = {
  CacheManager,
  CacheEntry,
  EvictionPolicy,
  CacheType,
  getCacheManager,
  createCacheManager,
};
