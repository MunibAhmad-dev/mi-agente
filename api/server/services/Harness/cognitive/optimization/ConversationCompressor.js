'use strict';

/**
 * ConversationCompressor - Compresses conversation history.
 * Preserves recent messages in full, summarizes older ones,
 * extracts key facts and decisions.
 */
class ConversationCompressor {
  constructor(config = {}) {
    this.config = {
      keepRecent: config.keepRecent || 6, // Keep last N messages full
      maxTokens: config.maxTokens || 2000,
      summaryTarget: config.summaryTarget || 200, // tokens per summary chunk
      ...config,
    };
    this.stats = { compressed: 0, tokensSaved: 0 };
  }

  /**
   * Extract key facts from a message.
   */
  _extractKeyFacts(text) {
    if (!text) return [];

    const facts = [];

    // Extract numbers with context
    const numMatches = text.match(/\b\d+[\.,]?\d*\s*(?:USD|\$|€|GB|MB|TB|W|MHz|GHz|cores?|%)\b/gi);
    if (numMatches) facts.push(...numMatches.map(m => m.trim()));

    // Extract paths
    const paths = text.match(/(?:[A-Za-z]:\\|\/\S+|\.\.\/\S+)/g);
    if (paths) facts.push(...paths.slice(0, 5));

    // Extract URLs
    const urls = text.match(/https?:\/\/[^\s]+/g);
    if (urls) facts.push(...urls.slice(0, 5));

    // Extract decisions (words indicating decisions)
    const decisions = text.match(/(?:decid|eleg|seleccion|implement|usar|crear|agregar|elimin|cambiar|actualiz|configur)\w*\s+.{10,60}/gi);
    if (decisions) facts.push(...decisions.slice(0, 3));

    // Extract errors and solutions
    const errors = text.match(/(?:error|bug|fallo|problema|issue)[:\s].{10,80}/gi);
    if (errors) facts.push(...errors.slice(0, 3));

    return [...new Set(facts)].slice(0, 10);
  }

  /**
   * Summarize a group of messages into a compact representation.
   */
  _summarizeMessages(messages) {
    if (!messages || messages.length === 0) return '';

    const allText = messages.map(m => m.content || '').join(' ');
    const facts = this._extractKeyFacts(allText);

    // Extract speaker roles
    const roles = messages.map(m => m.role || 'unknown');
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;

    // Build summary
    const parts = [];
    parts.push(`[${messages.length} messages: ${userMessages} user, ${assistantMessages} assistant]`);

    if (facts.length > 0) {
      parts.push(`Key points: ${facts.join('; ')}`);
    }

    // Extract topics mentioned
    const words = allText.toLowerCase().split(/\s+/);
    const freq = {};
    for (const w of words) {
      if (w.length > 4 && !this._stopWords.has(w)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
    const topics = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);

    if (topics.length > 0) {
      parts.push(`Topics: ${topics.join(', ')}`);
    }

    return parts.join(' | ');
  }

  _stopWords = new Set([
    'para', 'como', 'pero', 'con', 'una', 'por', 'que', 'del', 'los', 'las',
    'este', 'esta', 'eso', 'hay', 'más', 'sin', 'sobre', 'desde', 'donde',
    'the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'was',
    'have', 'been', 'will', 'would', 'could', 'should', 'there', 'their',
  ]);

  /**
   * Compress conversation to fit within token budget.
   */
  compress(messages, tokenCountFn, tokenBudget) {
    if (!messages || messages.length === 0) return { messages: [], saved: 0 };

    const budget = tokenBudget || this.config.maxTokens;
    const keepN = this.config.keepRecent;

    // Count total tokens
    const totalTokens = tokenCountFn
      ? messages.reduce((s, m) => s + tokenCountFn(m.content || ''), 0)
      : messages.reduce((s, m) => s + Math.ceil(String(m.content || '').length / 4), 0);

    // If already within budget, return as-is
    if (totalTokens <= budget) return { messages, saved: 0, compressed: false };

    // Split into recent (keep full) and old (compress)
    const recent = messages.slice(-keepN);
    const old = messages.slice(0, -keepN);

    const recentTokens = tokenCountFn
      ? recent.reduce((s, m) => s + tokenCountFn(m.content || ''), 0)
      : recent.reduce((s, m) => s + Math.ceil(String(m.content || '').length / 4), 0);

    // Compress old messages
    const summary = this._summarizeMessages(old);
    const summaryTokens = tokenCountFn
      ? tokenCountFn(summary)
      : Math.ceil(summary.length / 4);

    const compressed = [
      { role: 'system', content: `[Conversation context: ${summary}]`, _compressed: true },
      ...recent,
    ];

    this.stats.compressed++;
    this.stats.tokensSaved += (totalTokens - recentTokens - summaryTokens);

    return {
      messages: compressed,
      saved: totalTokens - recentTokens - summaryTokens,
      compressed: true,
      originalTokens: totalTokens,
      compressedTokens: recentTokens + summaryTokens,
      compressionRatio: ((1 - (recentTokens + summaryTokens) / totalTokens) * 100).toFixed(1) + '%',
    };
  }

  /**
   * Compress tool results (truncate long outputs).
   */
  compressToolResults(results, tokenCountFn, maxTokensPerResult) {
    const maxTokens = maxTokensPerResult || 500;

    return results.map(r => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      const tokens = tokenCountFn ? tokenCountFn(text) : Math.ceil(text.length / 4);

      if (tokens <= maxTokens) return r;

      // Truncate but preserve start and end
      if (tokenCountFn) {
        const words = text.split(/\s+/);
        const truncated = [
          ...words.slice(0, Math.floor(words.length * 0.4)),
          '[...compressed...]',
          ...words.slice(-Math.floor(words.length * 0.3)),
        ].join(' ');
        return { _truncated: true, content: truncated };
      }

      const mid = Math.floor(text.length * 0.4);
      const end = text.length - Math.floor(text.length * 0.3);
      return {
        _truncated: true,
        content: text.slice(0, mid) + '\n[...compressed...]\n' + text.slice(end),
      };
    });
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { ConversationCompressor };
