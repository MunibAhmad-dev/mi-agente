'use strict';

/**
 * MemorySystem — Gen B Phase 15 (deepened).
 *
 * Three-layer cognitive memory architecture for agents:
 *
 *   EpisodicLayer   — time-sequenced events with session context.
 *                     "What happened, when, and in which session?"
 *
 *   SemanticLayer   — facts/concepts organized by category with
 *                     confidence scores and relationship links.
 *                     "What do I know, and how sure am I?"
 *
 *   ProceduralLayer — how-to patterns learned from successful executions.
 *                     "How did I succeed at this kind of task before?"
 *
 * MemorySystem coordinates all three layers plus a cross-layer recall.
 */

const crypto = require('crypto');

// ── Episodic Layer ─────────────────────────────────────────────────────────

class EpisodicLayer {
  constructor(maxSize = 5000) {
    this._events  = [];
    this._maxSize = maxSize;
    this.stats    = { recorded: 0, recalled: 0 };
  }

  /**
   * Record a time-stamped event.
   * @param {string|object} event  Short description or structured event
   * @param {{ sessionId?, userId?, tags?, outcome?, metadata? }} context
   */
  recordEvent(event, context = {}) {
    const entry = {
      id:        `ep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      event:     typeof event === 'string' ? event : JSON.stringify(event),
      sessionId: context.sessionId || 'default',
      userId:    context.userId    || null,
      outcome:   context.outcome   || null,   // 'success'|'failure'|'partial'|null
      tags:      context.tags      || [],
      metadata:  context.metadata  || {},
      timestamp: context.timestamp || Date.now(),
    };

    this._events.push(entry);
    if (this._events.length > this._maxSize) this._events.shift();
    this.stats.recorded++;
    return entry;
  }

  /**
   * Get the N most-recent events, optionally filtered.
   * @param {number} n
   * @param {{ sessionId?, tags?, outcome? }} filter
   */
  getRecent(n = 10, filter = {}) {
    let events = [...this._events].reverse();
    if (filter.sessionId) events = events.filter(e => e.sessionId === filter.sessionId);
    if (filter.outcome)   events = events.filter(e => e.outcome   === filter.outcome);
    if (filter.tags && filter.tags.length) {
      events = events.filter(e => filter.tags.some(t => e.tags.includes(t)));
    }
    this.stats.recalled++;
    return events.slice(0, n);
  }

  /**
   * Get events in a time window.
   * @param {number} startMs  Unix timestamp
   * @param {number} endMs    Unix timestamp
   */
  getByTimeRange(startMs, endMs) {
    return this._events.filter(e => e.timestamp >= startMs && e.timestamp <= endMs);
  }

  /**
   * Text-search events.
   * @param {string} query
   * @param {number} limit
   */
  search(query, limit = 10) {
    const q = (query || '').toLowerCase();
    if (!q) return this.getRecent(limit);

    this.stats.recalled++;
    return this._events
      .map(e => ({ ...e, score: this._score(e.event, q) + this._score(JSON.stringify(e.tags), q) }))
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getTimeline(sessionId) {
    return this._events
      .filter(e => !sessionId || e.sessionId === sessionId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  size()   { return this._events.length; }
  getAll() { return [...this._events]; }

  _score(text, q) {
    const t = (text || '').toLowerCase();
    return q.split(/\s+/).reduce((s, w) => s + (w.length > 2 && t.includes(w) ? 1 : 0), 0);
  }
}

// ── Semantic Layer ─────────────────────────────────────────────────────────

class SemanticLayer {
  constructor() {
    this._facts       = new Map();  // factId → fact
    this._categories  = new Map();  // category → Set<factId>
    this._relations   = [];         // { from, relation, to, weight }
    this.stats        = { stored: 0, recalled: 0 };
  }

  /**
   * Store a fact/concept.
   * @param {string} content        The fact text
   * @param {string} category       Category label (e.g. 'user', 'system', 'domain')
   * @param {{ confidence?, source?, tags?, metadata? }} opts
   */
  storeFact(content, category = 'general', opts = {}) {
    const id = `sem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const entry = {
      id,
      content,
      category,
      confidence: typeof opts.confidence === 'number' ? opts.confidence : 0.8,
      source:     opts.source   || null,
      tags:       opts.tags     || [],
      metadata:   opts.metadata || {},
      createdAt:  Date.now(),
      accessCount: 0,
    };

    this._facts.set(id, entry);
    if (!this._categories.has(category)) this._categories.set(category, new Set());
    this._categories.get(category).add(id);
    this.stats.stored++;
    return entry;
  }

  /**
   * Link two facts/concepts with a named relation.
   * @param {string} fromId
   * @param {string} relation  e.g. 'causes', 'requires', 'contradicts', 'similar_to'
   * @param {string} toId
   * @param {number} weight    0–1
   */
  linkFacts(fromId, relation, toId, weight = 1.0) {
    if (!this._facts.has(fromId) || !this._facts.has(toId)) return null;
    const rel = { from: fromId, relation, to: toId, weight, createdAt: Date.now() };
    this._relations.push(rel);
    return rel;
  }

  /**
   * Query facts by text and optional category.
   * @param {string} query
   * @param {{ category?, minConfidence?, limit? }} opts
   */
  queryFacts(query, opts = {}) {
    const q       = (query || '').toLowerCase();
    const limit   = opts.limit         || 10;
    const minConf = opts.minConfidence || 0;

    let facts = Array.from(this._facts.values()).filter(f => f.confidence >= minConf);
    if (opts.category) {
      const ids = this._categories.get(opts.category) || new Set();
      facts = facts.filter(f => ids.has(f.id));
    }

    const results = facts
      .map(f => ({ ...f, score: this._score(f.content + ' ' + f.tags.join(' '), q) }))
      .filter(f => !q || f.score > 0)
      .sort((a, b) => b.score - a.score || b.confidence - a.confidence);

    results.forEach(f => { this._facts.get(f.id) && this._facts.get(f.id).accessCount++; });
    this.stats.recalled++;
    return results.slice(0, limit);
  }

  getHighConfidence(minConfidence = 0.8) {
    return Array.from(this._facts.values()).filter(f => f.confidence >= minConfidence);
  }

  getByCategory(category) {
    const ids = this._categories.get(category) || new Set();
    return Array.from(ids).map(id => this._facts.get(id)).filter(Boolean);
  }

  getRelations(factId) {
    return this._relations.filter(r => r.from === factId || r.to === factId);
  }

  listCategories() { return Array.from(this._categories.keys()); }
  size()           { return this._facts.size; }
  getAll()         { return Array.from(this._facts.values()); }

  _score(text, q) {
    if (!q) return 1;
    const t = (text || '').toLowerCase();
    return q.split(/\s+/).reduce((s, w) => s + (w.length > 2 && t.includes(w) ? 1 : 0), 0);
  }
}

// ── Procedural Layer ───────────────────────────────────────────────────────

class ProceduralLayer {
  constructor() {
    this._patterns = new Map();   // patternId → pattern
    this._taskIndex = new Map();  // normalizedTask → patternId[]
    this.stats     = { recorded: 0, recalled: 0, improvements: 0 };
  }

  /**
   * Record a successful procedure (how-to pattern).
   * @param {string} task           Task description
   * @param {string[]|object[]} steps  Steps taken
   * @param {{ outcome?, duration?, successRate?, metadata? }} opts
   */
  recordPattern(task, steps, opts = {}) {
    const normalized = this._normalize(task);
    const id = `proc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const entry = {
      id,
      task,
      normalizedTask: normalized,
      steps:          Array.isArray(steps) ? steps : [steps],
      outcome:        opts.outcome     || 'success',
      duration:       opts.duration    || null,
      successRate:    opts.successRate || 1.0,
      executionCount: 1,
      lastUsed:       Date.now(),
      metadata:       opts.metadata    || {},
      createdAt:      Date.now(),
    };

    this._patterns.set(id, entry);
    if (!this._taskIndex.has(normalized)) this._taskIndex.set(normalized, []);
    this._taskIndex.get(normalized).push(id);
    this.stats.recorded++;
    return entry;
  }

  /**
   * Find the best known pattern for a task.
   * @param {string} task
   * @returns {object|null}
   */
  getBestPattern(task) {
    const q = (task || '').toLowerCase();
    this.stats.recalled++;

    let best = null, bestScore = -1;
    for (const [, pattern] of this._patterns) {
      const score = this._score(pattern.task + ' ' + pattern.normalizedTask, q)
        * pattern.successRate * (1 + Math.log1p(pattern.executionCount) * 0.1);
      if (score > bestScore) { bestScore = score; best = pattern; }
    }

    if (best) {
      best.lastUsed = Date.now();
      best.executionCount++;
    }
    return best;
  }

  /**
   * Get top N patterns for a task with similarity scores.
   * @param {string} task
   * @param {number} limit
   */
  getSimilarPatterns(task, limit = 5) {
    const q = (task || '').toLowerCase();
    this.stats.recalled++;

    return Array.from(this._patterns.values())
      .map(p => ({
        ...p,
        score: this._score(p.task + ' ' + p.normalizedTask, q) * p.successRate,
      }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Update success rate for a pattern after execution.
   * @param {string} patternId
   * @param {boolean} success
   */
  recordOutcome(patternId, success) {
    const p = this._patterns.get(patternId);
    if (!p) return null;
    const alpha = 0.1;   // learning rate
    p.successRate = p.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    p.lastUsed    = Date.now();
    this.stats.improvements++;
    return p;
  }

  /**
   * Learn from a successful execution: record or update the pattern.
   * @param {string} task
   * @param {string[]|object[]} steps
   * @param {{ duration?, metadata? }} opts
   */
  learnFromSuccess(task, steps, opts = {}) {
    const existing = this.getBestPattern(task);
    const similarity = existing ? this._score(existing.task, task.toLowerCase()) / Math.max(task.split(/\s+/).length, 1) : 0;

    if (existing && similarity > 0.7) {
      existing.executionCount++;
      existing.successRate = Math.min(1, existing.successRate * 0.9 + 0.1);
      existing.lastUsed    = Date.now();
      this.stats.improvements++;
      return { updated: true, pattern: existing };
    }

    return { updated: false, pattern: this.recordPattern(task, steps, { outcome: 'success', ...opts }) };
  }

  size()   { return this._patterns.size; }
  getAll() { return Array.from(this._patterns.values()); }

  _normalize(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  _score(text, q) {
    if (!q) return 1;
    const t = (text || '').toLowerCase();
    const words = q.split(/\s+/);
    return words.reduce((s, w) => s + (w.length > 2 && t.includes(w) ? 1 : 0), 0) / Math.max(words.length, 1);
  }
}

// ── MemorySystem coordinator ───────────────────────────────────────────────

class MemorySystem {
  constructor(config = {}) {
    this.config    = config;
    this.episodic  = new EpisodicLayer(config.episodicMaxSize  || 5000);
    this.semantic  = new SemanticLayer();
    this.procedural = new ProceduralLayer();
    this.stats     = { crossLayerRecalls: 0 };
  }

  // ── Unified API ──────────────────────────────────────────────────────────

  /**
   * Record an event (routes to episodic; also stores persistent facts in semantic).
   */
  recordEvent(event, context = {}) {
    const entry = this.episodic.recordEvent(event, context);
    // Auto-store high-importance events as semantic facts
    if (context.importance === 'high' || context.importance === 'critical') {
      this.semantic.storeFact(
        typeof event === 'string' ? event : JSON.stringify(event),
        context.category || 'events',
        { confidence: 0.9, tags: context.tags || [] }
      );
    }
    return entry;
  }

  /**
   * Store a fact (semantic layer).
   */
  storeFact(content, category, opts = {}) {
    return this.semantic.storeFact(content, category, opts);
  }

  /**
   * Record a successful procedure (procedural layer).
   */
  learnFromSuccess(task, steps, opts = {}) {
    const result = this.procedural.learnFromSuccess(task, steps, opts);
    // Also log to episodic
    this.episodic.recordEvent(`Learned procedure: ${task}`, {
      outcome: 'success', tags: ['procedure', 'learning'], ...opts,
    });
    return result;
  }

  /**
   * Cross-layer recall: searches all three layers and merges results.
   * @param {string} query
   * @param {{ limit?, layers? }} opts  layers: array of 'episodic'|'semantic'|'procedural'
   */
  recall(query, opts = {}) {
    const limit  = opts.limit  || 10;
    const layers = opts.layers || ['episodic', 'semantic', 'procedural'];
    const results = [];

    if (layers.includes('episodic')) {
      const ep = this.episodic.search(query, Math.ceil(limit / layers.length));
      results.push(...ep.map(e => ({ ...e, layer: 'episodic' })));
    }
    if (layers.includes('semantic')) {
      const sem = this.semantic.queryFacts(query, { limit: Math.ceil(limit / layers.length) });
      results.push(...sem.map(e => ({ ...e, layer: 'semantic' })));
    }
    if (layers.includes('procedural')) {
      const proc = this.procedural.getSimilarPatterns(query, Math.ceil(limit / layers.length));
      results.push(...proc.map(e => ({ ...e, layer: 'procedural' })));
    }

    this.stats.crossLayerRecalls++;
    const seen = new Set();
    return results
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .filter(r => {
        const key = r.id || r.content;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  getStats() {
    return {
      ...this.stats,
      episodic:   { size: this.episodic.size(),   ...this.episodic.stats },
      semantic:   { size: this.semantic.size(),   ...this.semantic.stats },
      procedural: { size: this.procedural.size(), ...this.procedural.stats },
    };
  }
}

let _instance = null;
function getMemorySystem(config) {
  if (!_instance) _instance = new MemorySystem(config || {});
  return _instance;
}

module.exports = { MemorySystem, EpisodicLayer, SemanticLayer, ProceduralLayer, getMemorySystem };
