'use strict';

/**
 * ResearchEngine — Face 10/21 façade
 *
 * Wraps the ResearchOS pipeline for use in the chat pipeline.
 * Designed to be non-throwing: every public method catches all errors.
 * Singleton via getResearchEngine().
 */

const RESEARCH_KEYWORDS = [
  'research', 'find out', 'look up', 'what happened', 'history of',
  'according to', 'studies show', 'latest news', 'current', 'sources',
  'evidence', 'report on', 'survey', 'data shows', 'statistics on',
  'study shows', 'findings', 'analysis shows', 'researchers', 'scientists',
  'experts say', 'recent study', 'new study', 'published', 'journal',
  'academic', 'peer-reviewed', 'fact check',
];

const RESEARCH_PATTERNS = [
  /\bwhat (happened|caused|led to|is the history|are the facts|are the statistics)\b/i,
  /\bwhy (did|does|is|are|were) .{3,}/i,
  /\bhow (did|many|much|often|long) .{3,}/i,
  /\bwhere (did|does|is|are|were) .{3,}/i,
  /\bwhen (did|was|were|will) .{3,}/i,
  /\bwho (created|invented|discovered|founded|wrote|designed) .{3,}/i,
  /\bexplain .*(history|origin|background|cause|effect|impact)\b/i,
  /\btell me (about|more about) .*(history|origin|facts|data)\b/i,
];

// Lazily-loaded orchestrator — false means "unavailable, don't retry"
let _orchestrator = null;

function _loadOrchestrator() {
  if (_orchestrator !== null) return _orchestrator;
  try {
    _orchestrator = require('../ResearchOS/orchestrator/ResearchOrchestrator');
    // Verify the interface we need
    if (typeof _orchestrator.research !== 'function') {
      _orchestrator = false;
    }
  } catch {
    _orchestrator = false;
  }
  return _orchestrator;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance = null;

class ResearchEngine {
  constructor() {
    this._queriesProcessed = 0;
    this._totalConfidence = 0;
  }

  /**
   * Heuristic: true when the text looks like a research / factual-lookup query.
   * Never throws.
   * @param {string} text
   * @returns {boolean}
   */
  isResearchQuery(text) {
    try {
      if (!text || typeof text !== 'string') return false;
      const lower = text.toLowerCase();
      for (const kw of RESEARCH_KEYWORDS) {
        if (lower.includes(kw)) return true;
      }
      for (const re of RESEARCH_PATTERNS) {
        if (re.test(text)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Run the ResearchOS pipeline for a query.
   * Falls back to a stub result when ResearchOS is unavailable or errors.
   * Never throws.
   *
   * @param {string} text - The user's question / search text.
   * @param {object} [context={}] - Optional hints (passed through to ResearchOrchestrator).
   * @returns {Promise<{ answer: string|null, sources: Array, claims: Array, confidence: number, searchedAt: string, fallback?: boolean }>}
   */
  async query(text, context = {}) {
    const searchedAt = new Date().toISOString();
    const fallbackResult = { answer: null, sources: [], claims: [], confidence: 0, searchedAt, fallback: true };

    try {
      const orchestrator = _loadOrchestrator();
      if (!orchestrator) return fallbackResult;

      const result = await orchestrator.research(text, {
        skipClarification: true,
        offline: false,
        ...context,
      });

      // Normalise sources from claim metadata
      const sources = (Array.isArray(result.claims) ? result.claims : [])
        .filter((c) => c && c.source_url)
        .map((c) => ({ url: c.source_url, title: c.source_title || c.source_url }))
        .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i) // dedup
        .slice(0, 10);

      const claims = (Array.isArray(result.claims) ? result.claims : [])
        .map((c) => ({ text: c.text || '', confidence: c.confidence || 0 }))
        .slice(0, 20);

      const summaries = Array.isArray(result.summaries) ? result.summaries : [];
      const confidence = summaries.length > 0
        ? summaries.reduce((s, x) => s + (x.confidence || 0), 0) / summaries.length
        : 0;

      this._queriesProcessed++;
      this._totalConfidence += confidence;

      return {
        answer: result.answer || null,
        sources,
        claims,
        confidence,
        searchedAt,
        session_id: result.session_id,
      };
    } catch {
      return fallbackResult;
    }
  }

  /**
   * @returns {{ queriesProcessed: number, avgConfidence: number }}
   */
  getStats() {
    try {
      const { _queriesProcessed: queriesProcessed, _totalConfidence } = this;
      return {
        queriesProcessed,
        avgConfidence: queriesProcessed > 0 ? _totalConfidence / queriesProcessed : 0,
      };
    } catch {
      return { queriesProcessed: 0, avgConfidence: 0 };
    }
  }
}

/**
 * Return the singleton ResearchEngine.
 * @returns {ResearchEngine}
 */
function getResearchEngine() {
  if (!_instance) _instance = new ResearchEngine();
  return _instance;
}

module.exports = { ResearchEngine, getResearchEngine };
