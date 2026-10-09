'use strict';

/**
 * PrefixCacheManager - Manages prefix/prompt caching.
 * Detects and caches common prefixes (system prompts, tool schemas)
 * that are shared across requests, enabling prompt caching on
 * supported providers.
 */
class PrefixCacheManager {
  constructor(config = {}) {
    this.config = {
      maxPrefixes: config.maxPrefixes || 50,
      minPrefixLength: config.minPrefixLength || 100,
      ...config,
    };
    this.prefixes = new Map();
    this.stats = { hits: 0, misses: 0, tokensSaved: 0 };
  }

  /**
   * Extract common prefix from a list of messages.
   */
  _extractPrefix(messages) {
    if (!messages || messages.length < 2) return null;

    // Check if system message is shared
    const systemMsgs = messages.filter(m => m.role === 'system');
    if (systemMsgs.length > 0) {
      return systemMsgs.map(m => m.content || '').join('\n');
    }

    return null;
  }

  /**
   * Register a prefix (e.g., system prompt + tool schemas).
   */
  register(id, prefix) {
    if (!prefix || prefix.length < this.config.minPrefixLength) return false;

    if (this.prefixes.size >= this.config.maxPrefixes) {
      // Remove oldest
      const oldest = this.prefixes.keys().next().value;
      this.prefixes.delete(oldest);
    }

    this.prefixes.set(id, {
      text: prefix,
      length: prefix.length,
      tokens: Math.ceil(prefix.length / 4),
      timestamp: Date.now(),
      hits: 0,
    });

    return true;
  }

  /**
   * Check if a request shares a known prefix.
   */
  check(messages) {
    const prefix = this._extractPrefix(messages);
    if (!prefix) {
      this.stats.misses++;
      return null;
    }

    for (const [id, cached] of this.prefixes) {
      if (prefix.startsWith(cached.text.slice(0, 200))) {
        this.stats.hits++;
        cached.hits++;
        return {
          prefixId: id,
          tokens: cached.tokens,
          canCache: true,
        };
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Get prefix info for a provider that supports prompt caching.
   */
  getCacheInfo(messages) {
    const result = this.check(messages);

    return {
      ...result,
      providerHints: {
        openai: 'Use prompt_caching=true in API call',
        anthropic: 'Use cache_control: {"type": "ephemeral"} on prefix',
        grok: 'Prefix caching supported automatically',
      },
    };
  }

  /**
   * Estimate tokens saved through prefix caching.
   */
  estimateSavings(requests) {
    let saved = 0;

    for (const req of requests) {
      const info = this.check(req.messages);
      if (info) {
        saved += info.tokens;
      }
    }

    return {
      totalRequests: requests.length,
      cacheHits: this.stats.hits,
      estimatedTokensSaved: saved,
    };
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      total,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%',
      prefixes: this.prefixes.size,
    };
  }
}

module.exports = { PrefixCacheManager };
