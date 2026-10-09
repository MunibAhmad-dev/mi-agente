'use strict';

/**
 * LLMResponseCache — Redis caching for LLM responses.
 *
 * Strategy:
 *   Cache key = SHA-256 hash of (model + messages + temperature).
 *   On a cache hit, return the stored response without touching the LLM API.
 *   Default TTL: 5 minutes (configurable via LLM_CACHE_TTL_SECONDS env var).
 *
 * Dependency: requires REDIS_URI in .env. Falls back to a no-op (logs a warning,
 * never throws) when Redis is unavailable so the app keeps working without it.
 */

const { createHash } = require('crypto');

const DEFAULT_TTL = parseInt(process.env.LLM_CACHE_TTL_SECONDS, 10) || 300; // 5 min
const KEY_PREFIX = 'llm:resp:v1:';

const _logger = {
  info:  (...a) => console.log('[LLMResponseCache]', ...a),
  warn:  (...a) => console.warn('[LLMResponseCache]', ...a),
  error: (...a) => console.error('[LLMResponseCache]', ...a),
};

// Lazy-load ioredis directly (avoids the @librechat/api package which connects
// to MongoDB at import time and would hang the first require).
let _redis = null;
function _getRedis() {
  if (_redis) return _redis;
  const uri = process.env.REDIS_URI;
  if (!uri) {
    _logger.warn('REDIS_URI not set — LLM response caching disabled');
    return null;
  }
  try {
    const IORedis = require('ioredis');
    _redis = new IORedis(uri, {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    _redis.on('error', (e) => _logger.warn('Redis error:', e.message));
    return _redis;
  } catch {
    // ioredis not available — try node-redis v4
  }
  try {
    const redis = require('redis');
    _redis = redis.createClient({ url: uri });
    _redis.connect().catch((e) => _logger.warn('Redis connect error:', e.message));
    return _redis;
  } catch {
    _logger.warn('No Redis package available — LLM response caching disabled');
  }
  return null;
}

/**
 * Build a deterministic cache key for a given LLM request.
 *
 * @param {string}  model       - model identifier (e.g. "gpt-4o", "claude-3-5-sonnet")
 * @param {Array}   messages    - the messages array sent to the LLM
 * @param {number}  [temperature=0] - sampling temperature
 * @param {object}  [extra={}]  - any other params that affect output (system prompt, max_tokens…)
 * @returns {string} prefixed Redis key
 */
function buildCacheKey(model, messages, temperature = 0, extra = {}) {
  const payload = JSON.stringify({ model, messages, temperature, ...extra });
  const hash = createHash('sha256').update(payload).digest('hex');
  return `${KEY_PREFIX}${hash}`;
}

/**
 * Look up a cached LLM response.
 * @returns {Promise<object|null>} parsed response object or null on miss/error
 */
async function getCachedResponse(cacheKey) {
  const redis = _getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    _logger.error('getCachedResponse error:', e.message);
    return null;
  }
}

/**
 * Store an LLM response in Redis.
 * @param {string} cacheKey   - from buildCacheKey()
 * @param {object} response   - the full response object to cache
 * @param {number} [ttl]      - TTL in seconds (defaults to DEFAULT_TTL)
 */
async function setCachedResponse(cacheKey, response, ttl = DEFAULT_TTL) {
  const redis = _getRedis();
  if (!redis) return;
  try {
    const value = JSON.stringify(response);
    // ioredis: set(key, value, 'EX', seconds) / redis v4: set with { EX: seconds }
    if (typeof redis.set === 'function') {
      try {
        await redis.set(cacheKey, value, 'EX', ttl);
      } catch {
        await redis.set(cacheKey, value, { EX: ttl });
      }
    }
  } catch (e) {
    _logger.error('setCachedResponse error:', e.message);
  }
}

/**
 * Invalidate a specific cached response.
 */
async function invalidateCache(cacheKey) {
  const redis = _getRedis();
  if (!redis) return;
  try {
    await redis.del(cacheKey);
  } catch (e) {
    _logger.error('invalidateCache error:', e.message);
  }
}

/**
 * Wrap an LLM call function with cache logic.
 *
 * Usage:
 *   const response = await withCache(
 *     { model, messages, temperature },
 *     () => callOpenAI(model, messages, temperature),
 *   );
 *
 * @param {object}   params   - { model, messages, temperature, ...extra }
 * @param {Function} llmFn    - async function that calls the actual LLM and returns a response
 * @param {number}   [ttl]    - cache TTL in seconds
 * @returns {Promise<object>} LLM response (from cache or live call)
 */
async function withCache(params, llmFn, ttl = DEFAULT_TTL) {
  const { model, messages, temperature = 0, ...extra } = params;
  const key = buildCacheKey(model, messages, temperature, extra);

  const cached = await getCachedResponse(key);
  if (cached) {
    _logger.info(`Cache HIT  [${model}] key=${key.slice(-8)}`);
    return { ...cached, _cached: true };
  }

  _logger.info(`Cache MISS [${model}] key=${key.slice(-8)}`);
  const response = await llmFn();
  await setCachedResponse(key, response, ttl);
  return response;
}

/** Return cache stats (key count with the llm: prefix). */
async function getCacheStats() {
  const redis = _getRedis();
  if (!redis) return { enabled: false };
  try {
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    return { enabled: true, cachedResponses: keys.length, ttlSeconds: DEFAULT_TTL, prefix: KEY_PREFIX };
  } catch (e) {
    return { enabled: true, error: e.message };
  }
}

module.exports = { buildCacheKey, getCachedResponse, setCachedResponse, invalidateCache, withCache, getCacheStats };
