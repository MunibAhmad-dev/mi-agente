/**
 * ResponseCache - Caché de respuestas para optimización
 * Implementación de LRU Cache con TTL
 */

class ResponseCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutos
    this.cache = new Map();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
    this.enabled = options.enabled !== false;

    // Limpieza periódica
    if (options.cleanupInterval) {
      setInterval(() => this.cleanup(), options.cleanupInterval);
    }
  }

  /**
   * Generar clave de caché
   */
  generateKey(prefix, params) {
    const sortedParams = JSON.stringify(params, Object.keys(params).sort());
    return `${prefix}:${sortedParams}`;
  }

  /**
   * Obtener valor del caché
   */
  get(key) {
    if (!this.enabled) return null;

    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Verificar TTL
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.misses++;
      return null;
    }

    // Actualizar orden de acceso (LRU)
    this.updateAccessOrder(key);
    this.hits++;

    return entry.value;
  }

  /**
   * Establecer valor en caché
   */
  set(key, value, ttl = this.defaultTTL) {
    if (!this.enabled) return;

    // Verificar tamaño máximo
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
      accessCount: 0,
    });

    this.updateAccessOrder(key);
  }

  /**
   * Eliminar entrada del caché
   */
  delete(key) {
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
  }

  /**
   * Limpiar todo el caché
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Obtener estadísticas del caché
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%',
      memoryUsage: this.estimateMemoryUsage(),
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.createdAt,
        ttlRemaining: entry.expiresAt - Date.now(),
        accessCount: entry.accessCount,
      })),
    };
  }

  /**
   * Eliminar entrada LRU
   */
  evictLRU() {
    if (this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift();
      this.cache.delete(lruKey);
    }
  }

  /**
   * Actualizar orden de acceso
   */
  updateAccessOrder(key) {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);

    const entry = this.cache.get(key);
    if (entry) {
      entry.accessCount++;
    }
  }

  /**
   * Limpiar entradas expiradas
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.accessOrder = this.accessOrder.filter((k) => k !== key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[ResponseCache] Cleaned ${cleaned} expired entries`);
    }

    return cleaned;
  }

  /**
   * Estimar uso de memoria
   */
  estimateMemoryUsage() {
    let bytes = 0;

    for (const [key, entry] of this.cache.entries()) {
      bytes += key.length * 2; // UTF-16
      bytes += JSON.stringify(entry.value).length * 2;
    }

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Middleware de Express para caché de respuestas
   */
  middleware(options = {}) {
    const { cacheKey = 'default', ttl = this.defaultTTL, condition = () => true } = options;

    return (req, res, next) => {
      if (!this.enabled || !condition(req)) {
        return next();
      }

      const key = this.generateKey(cacheKey, {
        path: req.path,
        query: req.query,
        user: req.user?.id,
      });

      const cached = this.get(key);

      if (cached) {
        return res.json(cached);
      }

      // Interceptar res.json para guardar en caché
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (res.statusCode === 200) {
          this.set(key, data, ttl);
        }
        return originalJson(data);
      };

      next();
    };
  }
}

// Singleton
let instance = null;

function getResponseCache(options) {
  if (!instance) {
    instance = new ResponseCache(options);
  }
  return instance;
}

module.exports = { ResponseCache, getResponseCache };
