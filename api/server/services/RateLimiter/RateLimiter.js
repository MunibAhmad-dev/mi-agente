/**
 * Rate Limiter - Control de Límites de Uso (JavaScript)
 *
 * Implementa rate limiting para proteger APIs y controlar uso de recursos.
 * Soporta múltiples estrategias y proveedores.
 */

const EventEmitter = require('events');

const logger = {
  debug: (...args) => console.log('[RateLimiter]', ...args),
  info: (...args) => console.log('[RateLimiter]', ...args),
  warn: (...args) => console.warn('[RateLimiter]', ...args),
  error: (...args) => console.error('[RateLimiter]', ...args),
};

// Estrategias de rate limiting
const RateLimitStrategy = {
  FIXED_WINDOW: 'fixed_window',
  SLIDING_WINDOW: 'sliding_window',
  TOKEN_BUCKET: 'token_bucket',
  LEAKY_BUCKET: 'leaky_bucket',
};

// Estados
const RateLimitStatus = {
  ALLOWED: 'allowed',
  BLOCKED: 'blocked',
  QUOTA_EXCEEDED: 'quota_exceeded',
};

/**
 * Rate Limit Entry - Registro de uso
 */
class RateLimitEntry {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = [];
    this.tokens = limit;
    this.lastRefill = Date.now();
  }

  recordRequest() {
    this.requests.push(Date.now());
    this.cleanup();
  }

  cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter((t) => t > cutoff);
  }

  getCount() {
    this.cleanup();
    return this.requests.length;
  }

  isAllowed() {
    this.cleanup();
    return this.requests.length < this.limit;
  }

  getRemaining() {
    return Math.max(0, this.limit - this.getCount());
  }

  getResetTime() {
    if (this.requests.length === 0) return Date.now();
    return Math.min(...this.requests) + this.windowMs;
  }

  reset() {
    this.requests = [];
    this.tokens = this.limit;
    this.lastRefill = Date.now();
  }
}

/**
 * Token Bucket Entry - Para estrategia token bucket
 */
class TokenBucketEntry {
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate; // tokens por segundo
    this.lastRefill = Date.now();
  }

  consume(tokens = 1) {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // segundos
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }

  getTokens() {
    this.refill();
    return this.tokens;
  }
}

/**
 * Rate Limiter - Clase principal
 */
class RateLimiter extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      strategy: config.strategy || RateLimitStrategy.FIXED_WINDOW,
      defaultLimit: config.defaultLimit || 100,
      defaultWindowMs: config.defaultWindowMs || 60000, // 1 minuto
      ...config,
    };

    // Límites por identificador (IP, userId, API key, etc.)
    this.limits = new Map();

    // Límites por provider
    this.providerLimits = new Map([
      ['groq', { limit: 30, windowMs: 60000 }], // 30 req/min
      ['deepseek', { limit: 30, windowMs: 60000 }],
      ['huggingface', { limit: 30, windowMs: 60000 }], // ~30 req/min
      ['anthropic', { limit: 50, windowMs: 60000 }],
      ['gemini', { limit: 60, windowMs: 60000 }],
      ['mistral', { limit: 30, windowMs: 60000 }],
      ['tavily', { limit: 100, windowMs: 60000 }], // 100 req/min en free tier
      ['duckduckgo', { limit: 50, windowMs: 60000 }], // Rate limit estimado
    ]);

    // Estadísticas
    this.stats = {
      totalRequests: 0,
      allowed: 0,
      blocked: 0,
      byIdentifier: new Map(),
    };
  }

  /**
   * Verificar si una solicitud está permitida
   */
  check(identifier, options = {}) {
    const limit = options.limit || this.config.defaultLimit;
    const windowMs = options.windowMs || this.config.defaultWindowMs;

    this.stats.totalRequests++;

    // Obtener o crear entrada
    let entry = this.limits.get(identifier);

    if (!entry) {
      entry = new RateLimitEntry(limit, windowMs);
      this.limits.set(identifier, entry);
    }

    const allowed = entry.isAllowed();

    if (allowed) {
      entry.recordRequest();
      this.stats.allowed++;
    } else {
      this.stats.blocked++;
      this.emit('rate.limited', {
        identifier,
        limit,
        remaining: 0,
        resetTime: entry.getResetTime(),
      });
    }

    // Actualizar estadísticas por identificador
    this.updateIdentifierStats(identifier, allowed);

    return {
      allowed,
      limit,
      remaining: entry.getRemaining(),
      resetTime: entry.getResetTime(),
      retryAfter: allowed ? 0 : Math.ceil((entry.getResetTime() - Date.now()) / 1000),
    };
  }

  /**
   * Verificar límite de provider
   */
  checkProvider(provider, options = {}) {
    const providerLimit = this.providerLimits.get(provider);

    if (!providerLimit) {
      return { allowed: true, limit: Infinity, remaining: Infinity };
    }

    const limit = options.limit || providerLimit.limit;
    const windowMs = options.windowMs || providerLimit.windowMs;

    const identifier = `provider:${provider}`;
    return this.check(identifier, { limit, windowMs });
  }

  /**
   * Consumir tokens (para token bucket)
   */
  consume(identifier, tokens = 1, capacity, refillRate) {
    let entry = this.tokenBuckets.get(identifier);

    if (!entry) {
      entry = new TokenBucketEntry(capacity || 100, refillRate || 10);
      this.tokenBuckets.set(identifier, entry);
    }

    const allowed = entry.consume(tokens);

    if (allowed) {
      this.stats.allowed++;
    } else {
      this.stats.blocked++;
    }

    this.updateIdentifierStats(identifier, allowed);

    return {
      allowed,
      tokens: entry.getTokens(),
      capacity: entry.capacity,
    };
  }

  /**
   * Obtener estado actual
   */
  getStatus(identifier) {
    const entry = this.limits.get(identifier);

    if (!entry) {
      return {
        exists: false,
        limit: this.config.defaultLimit,
        remaining: this.config.defaultLimit,
        resetTime: null,
      };
    }

    return {
      exists: true,
      limit: entry.limit,
      remaining: entry.getRemaining(),
      resetTime: entry.getResetTime(),
    };
  }

  /**
   * Actualizar estadísticas
   */
  updateIdentifierStats(identifier, allowed) {
    const stats = this.stats.byIdentifier.get(identifier) || {
      total: 0,
      allowed: 0,
      blocked: 0,
    };

    stats.total++;
    stats.allowed += allowed ? 1 : 0;
    stats.blocked += allowed ? 0 : 1;

    this.stats.byIdentifier.set(identifier, stats);
  }

  /**
   * Establecer límite personalizado
   */
  setLimit(identifier, limit, windowMs) {
    const entry = new RateLimitEntry(limit, windowMs);
    this.limits.set(identifier, entry);
    logger.info(`[RateLimiter] Set limit for ${identifier}: ${limit}/${windowMs}ms`);
  }

  /**
   * Establecer límite de provider
   */
  setProviderLimit(provider, limit, windowMs) {
    this.providerLimits.set(provider, { limit, windowMs });
    logger.info(`[RateLimiter] Set provider limit for ${provider}: ${limit}/${windowMs}ms`);
  }

  /**
   * Resetear límite
   */
  reset(identifier) {
    const entry = this.limits.get(identifier);
    if (entry) {
      entry.reset();
      logger.info(`[RateLimiter] Reset limit for ${identifier}`);
    }
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    return {
      totalRequests: this.stats.totalRequests,
      allowed: this.stats.allowed,
      blocked: this.stats.blocked,
      blockRate:
        this.stats.totalRequests > 0
          ? ((this.stats.blocked / this.stats.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
      topIdentifiers: this.getTopIdentifiers(10),
      providerLimits: Array.from(this.providerLimits.entries()).map(([provider, config]) => ({
        provider,
        ...config,
      })),
    };
  }

  /**
   * Obtener top identificadores
   */
  getTopIdentifiers(limit = 10) {
    return Array.from(this.stats.byIdentifier.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, limit)
      .map(([identifier, stats]) => ({
        identifier,
        ...stats,
      }));
  }

  /**
   * Limpiar entradas antiguas
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.config.defaultWindowMs * 2;

    for (const [identifier, entry] of this.limits) {
      entry.cleanup();
      if (entry.requests.length === 0) {
        this.limits.delete(identifier);
      }
    }

    logger.debug(`[RateLimiter] Cleaned up, active limits: ${this.limits.size}`);
  }

  /**
   * Middleware para Express
   */
  middleware(options = {}) {
    return (req, res, next) => {
      const identifier = options.keyGenerator
        ? options.keyGenerator(req)
        : req.ip || req.connection.remoteAddress;

      const result = this.check(identifier, options);

      // Headers de rate limit
      res.set({
        'X-RateLimit-Limit': result.limit,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000),
      });

      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: result.retryAfter,
        });
      }

      next();
    };
  }
}

// Inicializar token buckets
RateLimiter.prototype.tokenBuckets = new Map();

// Singleton
let limiterInstance = null;

function getRateLimiter(config) {
  if (!limiterInstance) {
    limiterInstance = new RateLimiter(config);
  }
  return limiterInstance;
}

module.exports = {
  RateLimiter,
  RateLimitStrategy,
  RateLimitStatus,
  RateLimitEntry,
  TokenBucketEntry,
  getRateLimiter,
};
