'use strict';

let tokenize = null;
try {
  tokenize = require('gpt-tokenizer').encode;
} catch (e) {
  // Fallback: ~4 chars per token estimate
  tokenize = (text) => { const t = String(text || ''); return Math.ceil(t.length / 4); };
}

/**
 * TokenAnalyzer - Measures tokens precisely, estimates costs, breaks down usage.
 */
class TokenAnalyzer {
  constructor(config = {}) {
    this.config = config;
    this.pricing = {
      'openai/gpt-4o-mini': { input: 2.0, output: 6.0 },
      'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
      'xai/grok-4.6': { input: 2.0, output: 6.0 },
      'xai/grok-3-mini': { input: 0.3, output: 0.5 },
      'local/default': { input: 0, output: 0 },
    };
  }

  /**
   * Count tokens in text.
   */
  count(text) {
    if (!text) return 0;
    try {
      const encoded = tokenize(String(text));
      return Array.isArray(encoded) ? encoded.length : encoded;
    } catch {
      return Math.ceil(String(text).length / 4);
    }
  }

  /**
   * Analyze a full request (system + messages + tools).
   */
  analyze(request) {
    const systemTokens = this.count(request.system || '');
    const messageTokens = (request.messages || []).reduce((s, m) => s + this.count(m.content || ''), 0);
    const toolTokens = (request.tools || []).reduce((s, t) => s + this.count(JSON.stringify(t)), 0);
    const ragTokens = (request.rag || []).reduce((s, r) => s + this.count(r.content || r.text || ''), 0);
    const memoryTokens = (request.memory || []).reduce((s, m) => s + this.count(m.content || m.text || ''), 0);

    const totalInput = systemTokens + messageTokens + toolTokens + ragTokens + memoryTokens;

    return {
      system: systemTokens,
      messages: messageTokens,
      tools: toolTokens,
      rag: ragTokens,
      memory: memoryTokens,
      total: totalInput,
      breakdown: {
        systemPct: totalInput > 0 ? (systemTokens / totalInput * 100).toFixed(1) : 0,
        messagesPct: totalInput > 0 ? (messageTokens / totalInput * 100).toFixed(1) : 0,
        toolsPct: totalInput > 0 ? (toolTokens / totalInput * 100).toFixed(1) : 0,
        ragPct: totalInput > 0 ? (ragTokens / totalInput * 100).toFixed(1) : 0,
        memoryPct: totalInput > 0 ? (memoryTokens / totalInput * 100).toFixed(1) : 0,
      },
    };
  }

  /**
   * Estimate cost for a request.
   */
  estimateCost(inputTokens, outputTokens, model) {
    const key = model || 'local/default';
    const pricing = this.pricing[key] || this.pricing['local/default'];
    return (inputTokens / 1e6 * pricing.input) + (outputTokens / 1e6 * pricing.output);
  }

  /**
   * Compare before/after optimization.
   */
  compare(before, after) {
    return {
      before: before.total,
      after: after.total,
      saved: before.total - after.total,
      ratio: before.total > 0 ? ((1 - after.total / before.total) * 100).toFixed(1) : 0,
      beforeBreakdown: before.breakdown,
      afterBreakdown: after.breakdown,
    };
  }

  getStats() {
    return { pricing: this.pricing };
  }
}

module.exports = { TokenAnalyzer };
