'use strict';

/**
 * TokenCostOptimizer - Minimizes token costs.
 *
 * Strategies:
 * 1. Cache identical queries (avoid re-processing)
 * 2. Compress context before sending to LLM
 * 3. Use smaller models for simple tasks
 * 4. Batch similar queries
 * 5. Prefix caching (reuse system prompts)
 * 6. Response caching (same question = same answer)
 */
class TokenCostOptimizer {
  constructor(config = {}) {
    this.config = config;
    this.responseCache = new Map();
    this.queryCache = new Map();
    this.prefixCache = new Map();
    this.stats = {
      queriesProcessed: 0,
      cacheHits: 0,
      tokensSaved: 0,
      estimatedCostSaved: 0,
    };

    // Model pricing (per 1M tokens)
    this.pricing = {
      'gpt-4o-mini': { input: 2.0, output: 6.0 },
      'grok-4.6': { input: 2.0, output: 6.0 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'grok-3-mini': { input: 0.3, output: 0.5 },
      'local': { input: 0, output: 0 },
    };
  }

  /**
   * Check if we have a cached response for this query.
   */
  getCachedResponse(query, model) {
    const key = this._cacheKey(query, model);
    const cached = this.responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour TTL
      this.stats.cacheHits++;
      this.stats.tokensSaved += cached.tokenCount || 0;
      return cached.response;
    }
    return null;
  }

  /**
   * Cache a response.
   */
  cacheResponse(query, model, response, tokenCount) {
    const key = this._cacheKey(query, model);
    this.responseCache.set(key, {
      response,
      tokenCount,
      timestamp: Date.now(),
    });

    // Limit cache size
    if (this.responseCache.size > 1000) {
      const oldest = this.responseCache.keys().next().value;
      this.responseCache.delete(oldest);
    }
  }

  /**
   * Compress context to reduce tokens.
   */
  compressContext(messages, maxTokens = 4000) {
    if (!messages || messages.length === 0) return messages;

    let totalChars = 0;
    const compressed = [];

    // Keep system message
    if (messages[0]?.role === 'system') {
      compressed.push(messages[0]);
      totalChars += (messages[0].content || '').length;
    }

    // Compress older messages
    for (let i = (messages[0]?.role === 'system' ? 1 : 0); i < messages.length; i++) {
      const msg = messages[i];
      const chars = (msg.content || '').length;

      if (totalChars + chars > maxTokens * 4) { // ~4 chars per token
        // Summarize this message
        compressed.push({
          ...msg,
          content: this._summarize(msg.content),
        });
      } else {
        compressed.push(msg);
        totalChars += chars;
      }
    }

    return compressed;
  }

  /**
   * Select cheapest model for a task.
   */
  selectModel(taskComplexity) {
    if (taskComplexity === 'simple') return 'gpt-4o-mini';
    if (taskComplexity === 'medium') return 'grok-3-mini';
    return 'gpt-4o-mini';
  }

  /**
   * Estimate cost for a query.
   */
  estimateCost(inputTokens, outputTokens, model) {
    const pricing = this.pricing[model] || this.pricing['gpt-4o-mini'];
    return (inputTokens / 1e6 * pricing.input) + (outputTokens / 1e6 * pricing.output);
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.responseCache.size,
      hitRate: this.stats.queriesProcessed > 0
        ? (this.stats.cacheHits / this.stats.queriesProcessed * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  _cacheKey(query, model) {
    return `${(query || '').toLowerCase().trim()}_${model || 'default'}`;
  }

  _summarize(text) {
    if (!text) return '';
    const sentences = text.split(/(?<=[.!?])\s+/);
    return sentences.slice(0, Math.ceil(sentences.length * 0.5)).join(' ');
  }
}

module.exports = { TokenCostOptimizer };
