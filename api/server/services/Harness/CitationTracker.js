'use strict';

/**
 * CitationTracker - Track and attribute sources in LLM responses
 * Records every source used during tool execution and generates
 * inline citations like [1] URL in the final response.
 */
class CitationTracker {
  constructor(config = {}) {
    this.sources = new Map();
    this.order = [];
    this.sessionSources = new Map();
  }

  /**
   * Add a source from a tool call (web_search, web_fetch, etc.).
   */
  addSource(source) {
    const { url, title, tool, snippet, accessedAt } = source;
    if (!url) return null;

    // Normalize URL
    const normalizedUrl = this._normalizeUrl(url);

    // Check if already exists
    if (this.sources.has(normalizedUrl)) {
      const existing = this.sources.get(normalizedUrl);
      existing.usedBy.push(tool || 'unknown');
      return existing.number;
    }

    const number = this.order.length + 1;
    const entry = {
      number,
      url: normalizedUrl,
      originalUrl: url,
      title: title || normalizedUrl,
      tool: tool || 'unknown',
      snippet: snippet || '',
      accessedAt: accessedAt || new Date().toISOString(),
      usedBy: [tool || 'unknown'],
    };

    this.sources.set(normalizedUrl, entry);
    this.order.push(entry);

    return number;
  }

  /**
   * Add multiple sources at once.
   */
  addSources(sources) {
    return sources.map(s => this.addSource(s));
  }

  /**
   * Get citation number for a URL.
   */
  getCitationNumber(url) {
    const normalized = this._normalizeUrl(url);
    const source = this.sources.get(normalized);
    return source ? source.number : null;
  }

  /**
   * Generate inline citation text for a URL.
   */
  cite(url) {
    const num = this.getCitationNumber(url);
    return num ? `[${num}]` : '';
  }

  /**
   * Generate the citations section for a response.
   */
  generateCitationsSection() {
    if (this.order.length === 0) return '';

    const lines = ['\n\n**Sources:**\n'];
    for (const source of this.order) {
      lines.push(`${source.number}. ${source.title} — ${source.url}`);
    }
    return lines.join('\n');
  }

  /**
   * Get all sources in a structured format.
   */
  getSourceList() {
    return this.order.map(s => ({
      number: s.number,
      url: s.url,
      title: s.title,
      tool: s.tool,
      snippet: s.snippet,
      accessedAt: s.accessedAt,
    }));
  }

  /**
   * Replace URLs in text with inline citations.
   */
  addInlineCitations(text) {
    let result = text;
    for (const source of this.order) {
      if (result.includes(source.url)) {
        result = result.replace(source.url, `${source.url} [${source.number}]`);
      }
      if (result.includes(source.originalUrl) && source.originalUrl !== source.url) {
        result = result.replace(source.originalUrl, `${source.originalUrl} [${source.number}]`);
      }
    }
    return result;
  }

  /**
   * Get sources for a specific session.
   */
  getSessionSources(sessionId) {
    return this.sessionSources.get(sessionId) || [];
  }

  /**
   * Clear all tracked sources.
   */
  clear() {
    this.sources.clear();
    this.order = [];
    this.sessionSources.clear();
  }

  getStats() {
    return {
      totalSources: this.sources.size,
      sourcesByTool: this._getSourcesByTool(),
    };
  }

  // ===================== INTERNAL =====================

  _normalizeUrl(url) {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.hostname}${u.pathname}${u.search}`.replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  _getSourcesByTool() {
    const counts = {};
    for (const source of this.sources.values()) {
      counts[source.tool] = (counts[source.tool] || 0) + 1;
    }
    return counts;
  }
}

module.exports = CitationTracker;
