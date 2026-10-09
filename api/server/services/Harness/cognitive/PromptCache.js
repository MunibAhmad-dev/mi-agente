/**
 * PromptCache.js — Prompt Caching System
 * 
 * Reduces token costs by caching and reusing prompts:
 * - Hash-based cache keys
 * - TTL-based expiration
 * - LRU eviction
 * - Cache hit/miss tracking
 * - Cost savings reporting
 * 
 * License: Custom (MIT)
 * RAM: ~10MB
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[PromptCache]', ...args),
    info: (...args) => console.info('[PromptCache]', ...args),
    warn: (...args) => console.warn('[PromptCache]', ...args),
    error: (...args) => console.error('[PromptCache]', ...args),
};

class PromptCache extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'PromptCache';
        this._cache = new Map();
        this._maxSize = config.maxSize || 1000;
        this._ttl = config.ttl || 3600000; // 1 hour
        this._stats = { hits: 0, misses: 0, evictions: 0, totalSaved: 0 };
    }

    /**
     * Get cached response for a prompt.
     */
    get(prompt, options = {}) {
        const key = this._hashPrompt(prompt, options);
        const entry = this._cache.get(key);

        if (!entry) {
            this._stats.misses++;
            return null;
        }

        // Check TTL
        if (Date.now() - entry.timestamp > this._ttl) {
            this._cache.delete(key);
            this._stats.misses++;
            return null;
        }

        // Update access time for LRU
        entry.lastAccess = Date.now();
        entry.accessCount++;

        this._stats.hits++;
        this._stats.totalSaved += entry.tokensSaved || 0;

        logger.info(`[PromptCache] Cache hit (saved ${entry.tokensSaved} tokens)`);

        return entry.response;
    }

    /**
     * Store a prompt-response pair in cache.
     */
    set(prompt, response, options = {}) {
        const key = this._hashPrompt(prompt, options);
        const tokensSaved = this._estimateTokens(prompt);

        // Evict if at capacity
        if (this._cache.size >= this._maxSize) {
            this._evictLRU();
        }

        this._cache.set(key, {
            response,
            timestamp: Date.now(),
            lastAccess: Date.now(),
            accessCount: 1,
            tokensSaved,
            promptPreview: prompt.substring(0, 100),
        });
    }

    /**
     * Check if a prompt is cached.
     */
    has(prompt, options = {}) {
        const key = this._hashPrompt(prompt, options);
        const entry = this._cache.get(key);
        if (!entry) return false;
        if (Date.now() - entry.timestamp > this._ttl) {
            this._cache.delete(key);
            return false;
        }
        return true;
    }

    /**
     * Get cache statistics.
     */
    getStats() {
        const totalRequests = this._stats.hits + this._stats.misses;
        return {
            size: this._cache.size,
            maxSize: this._maxSize,
            hits: this._stats.hits,
            misses: this._stats.misses,
            hitRate: totalRequests > 0 ? (this._stats.hits / totalRequests * 100).toFixed(1) + '%' : '0%',
            evictions: this._stats.evictions,
            totalSaved: this._stats.totalSaved,
            estimatedSavings: `$${(this._stats.totalSaved * 0.000002).toFixed(4)}`,
        };
    }

    /**
     * Clear the cache.
     */
    clear() {
        this._cache.clear();
        this._stats = { hits: 0, misses: 0, evictions: 0, totalSaved: 0 };
    }

    /**
     * Get all cached entries.
     */
    entries() {
        return [...this._cache.entries()].map(([key, entry]) => ({
            key,
            promptPreview: entry.promptPreview,
            accessCount: entry.accessCount,
            age: Date.now() - entry.timestamp,
        }));
    }

    // ── Internal ──────────────────────────────────────────────

    _hashPrompt(prompt, options = {}) {
        const data = JSON.stringify({
            prompt: prompt.substring(0, 1000), // First 1000 chars
            model: options.model || 'default',
            temperature: options.temperature || 0.7,
        });
        return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
    }

    _evictLRU() {
        let oldestKey = null;
        let oldestAccess = Infinity;

        for (const [key, entry] of this._cache) {
            if (entry.lastAccess < oldestAccess) {
                oldestAccess = entry.lastAccess;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this._cache.delete(oldestKey);
            this._stats.evictions++;
        }
    }

    _estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
}

module.exports = { PromptCache };
module.exports.default = PromptCache;
