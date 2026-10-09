/**
 * KnowledgeGate — Phase J: unified knowledge interface
 *
 * Routes a query to local RAG, web search, or project knowledge
 * depending on data classification, availability, and priority.
 *
 * Priority: local RAG → project memory → web search (last resort)
 */

'use strict';

const { DataClassifier, Classification } = require('../Security/DataClassifier');
const { WebSearchRateLimiter } = require('../Security/WebSearchRateLimiter');

const logger = {
  info: (...a) => console.log('[KnowledgeGate]', ...a),
  warn: (...a) => console.warn('[KnowledgeGate]', ...a),
  error: (...a) => console.error('[KnowledgeGate]', ...a),
};

const Source = Object.freeze({
  LOCAL_RAG: 'local_rag',
  PROJECT: 'project',
  WEB: 'web',
});

class KnowledgeGate {
  /**
   * @param {object} config
   * @param {object} [config.rag]      - { search: async (query) => results[] }
   * @param {object} [config.project]  - { search: async (query) => results[] }
   * @param {object} [config.web]      - { ddg: async fn, serp?: async fn }
   * @param {number} [config.maxWebResults=5]
   */
  constructor(config = {}) {
    this._rag = config.rag || null;
    this._project = config.project || null;
    this._webAdapters = config.web || null;
    this._maxWebResults = config.maxWebResults || 5;
    this._classifier = new DataClassifier();
    this._webLimiter = new WebSearchRateLimiter();
  }

  /**
   * Unified query across all knowledge sources.
   * @param {string} query
   * @param {object} [opts]
   * @param {string} [opts.provider]    - target LLM provider (for classification enforcement)
   * @param {boolean} [opts.webAllowed] - whether web search is permitted for this query
   * @returns {Promise<{ results: object[], sources: string[], classification: string }>}
   */
  async query(query, opts = {}) {
    const allResults = [];
    const usedSources = [];

    // Classify the query itself
    const { level: queryLevel } = this._classifier.classify(query, {
      source: 'user_session',
    });

    // Enforce cloud routing for sensitive queries
    if (opts.provider) {
      const { allowed, reason } = this._classifier.enforce(queryLevel, opts.provider);
      if (!allowed) {
        logger.warn(`Query blocked from ${opts.provider}: ${reason}`);
        return { results: [], sources: [], classification: queryLevel, blocked: reason };
      }
    }

    // 1. Local RAG (highest priority, always safe)
    if (this._rag) {
      try {
        const ragResults = await this._rag.search(query);
        if (ragResults && ragResults.length > 0) {
          allResults.push(...ragResults.map((r) => ({ ...r, _source: Source.LOCAL_RAG })));
          usedSources.push(Source.LOCAL_RAG);
        }
      } catch (err) {
        logger.warn(`RAG search failed: ${err.message}`);
      }
    }

    // 2. Project memory
    if (this._project) {
      try {
        const projectResults = await this._project.search(query);
        if (projectResults && projectResults.length > 0) {
          allResults.push(...projectResults.map((r) => ({ ...r, _source: Source.PROJECT })));
          usedSources.push(Source.PROJECT);
        }
      } catch (err) {
        logger.warn(`Project search failed: ${err.message}`);
      }
    }

    // 3. Web search (only if explicitly allowed and classification permits)
    const webAllowed =
      opts.webAllowed !== false &&
      queryLevel !== Classification.SECRET &&
      queryLevel !== Classification.LOCAL_ONLY;

    if (webAllowed && this._webAdapters && allResults.length < 2) {
      try {
        const webRes = await this._webLimiter.search(query, this._webAdapters);
        const items = this._normalizeWebResults(webRes.result, webRes.source);
        allResults.push(...items.slice(0, this._maxWebResults));
        usedSources.push(Source.WEB);
      } catch (err) {
        logger.warn(`Web search skipped: ${err.message}`);
      }
    }

    logger.info(`query="${query.slice(0, 60)}" sources=${usedSources.join(',')} results=${allResults.length}`);

    return {
      results: allResults,
      sources: [...new Set(usedSources)],
      classification: queryLevel,
    };
  }

  _normalizeWebResults(raw, source) {
    if (!raw) return [];
    // DuckDuckGo-style results
    if (Array.isArray(raw)) {
      return raw.map((r) => ({
        title: r.title || '',
        snippet: r.body || r.snippet || '',
        url: r.href || r.url || '',
        _source: Source.WEB,
        _provider: source,
      }));
    }
    // SerpAPI organic results
    if (raw.organic_results) {
      return raw.organic_results.map((r) => ({
        title: r.title || '',
        snippet: r.snippet || '',
        url: r.link || '',
        _source: Source.WEB,
        _provider: source,
      }));
    }
    return [];
  }

  /** Health / status for monitoring. */
  status() {
    return {
      rag: !!this._rag,
      project: !!this._project,
      web: !!this._webAdapters,
      webLimiter: this._webLimiter.status(),
    };
  }
}

module.exports = { KnowledgeGate, Source };
