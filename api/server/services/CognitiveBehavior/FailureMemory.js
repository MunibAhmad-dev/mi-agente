'use strict';

/**
 * FailureMemory — Gen B Phase 16 (deepened).
 *
 * Explicit failure pattern storage, categorization, and retrieval for
 * pre-task warnings. Agents query this before executing tasks to learn
 * what went wrong in similar past tasks and how to avoid it.
 *
 * Failure categories cover the full spectrum of LLM/agent failure modes:
 *   timeout | hallucination | tool_failure | context_overflow |
 *   permission_denied | invalid_output | loop_detected |
 *   resource_exhausted | user_correction | model_error | unknown
 */

const FAILURE_CATEGORIES = {
  TIMEOUT:           'timeout',
  HALLUCINATION:     'hallucination',
  TOOL_FAILURE:      'tool_failure',
  CONTEXT_OVERFLOW:  'context_overflow',
  PERMISSION_DENIED: 'permission_denied',
  INVALID_OUTPUT:    'invalid_output',
  LOOP_DETECTED:     'loop_detected',
  RESOURCE_EXHAUSTED:'resource_exhausted',
  USER_CORRECTION:   'user_correction',
  MODEL_ERROR:       'model_error',
  UNKNOWN:           'unknown',
};

// Keyword patterns used for auto-categorization
const CATEGORY_PATTERNS = [
  { category: FAILURE_CATEGORIES.TIMEOUT,           patterns: [/timeout/i, /timed? out/i, /too slow/i, /exceeded.*time/i] },
  { category: FAILURE_CATEGORIES.HALLUCINATION,     patterns: [/hallucin/i, /fabricat/i, /made up/i, /invented/i, /wrong fact/i, /incorrect fact/i] },
  { category: FAILURE_CATEGORIES.TOOL_FAILURE,      patterns: [/tool.*fail/i, /tool.*error/i, /tool.*crash/i, /function.*fail/i, /api.*fail/i] },
  { category: FAILURE_CATEGORIES.CONTEXT_OVERFLOW,  patterns: [/context.*limit/i, /too many tokens/i, /token.*limit/i, /context.*overflow/i, /truncat/i] },
  { category: FAILURE_CATEGORIES.PERMISSION_DENIED, patterns: [/permission denied/i, /access denied/i, /unauthorized/i, /forbidden/i, /not allowed/i] },
  { category: FAILURE_CATEGORIES.INVALID_OUTPUT,    patterns: [/invalid.*output/i, /bad.*format/i, /parse.*error/i, /invalid json/i, /malformed/i] },
  { category: FAILURE_CATEGORIES.LOOP_DETECTED,     patterns: [/loop detect/i, /infinite loop/i, /stuck in loop/i, /repeated.*action/i, /cycle detect/i] },
  { category: FAILURE_CATEGORIES.RESOURCE_EXHAUSTED,patterns: [/out of memory/i, /disk.*full/i, /resource.*exhaust/i, /rate limit/i, /quota.*exceed/i] },
  { category: FAILURE_CATEGORIES.USER_CORRECTION,   patterns: [/user.*correc/i, /wrong.*answer/i, /incorrect.*answer/i, /not what.*asked/i, /misunderstood/i] },
  { category: FAILURE_CATEGORIES.MODEL_ERROR,       patterns: [/model.*error/i, /llm.*fail/i, /generation.*fail/i, /inference.*error/i] },
];

class FailureMemory {
  constructor(config = {}) {
    this.config     = config;
    this.failures   = new Map();        // failureId → failure entry
    this.patterns   = new Map();        // patternKey → { pattern, failureIds, avoidance }
    this._counter   = 0;
    this.maxFailures = config.maxFailures || 5000;
    this.stats      = { recorded: 0, retrieved: 0, patternsExtracted: 0, warningsIssued: 0 };
  }

  // ── Recording failures ───────────────────────────────────────────────────

  /**
   * Record a failure event.
   * @param {{ what, why?, tool?, model?, task?, context?, error?, metadata? }} data
   * @returns {object} stored failure entry
   */
  record(data) {
    const category = this.categorize(data);

    // De-duplicate: update howOften for similar failures
    const similar = this.findSimilar(data, category);
    if (similar.length > 0) {
      const existing = similar[0];
      existing.howOften++;
      existing.lastSeen  = new Date().toISOString();
      existing.category  = category;   // refine category if improved
      return existing;
    }

    const id = `fail_${++this._counter}_${Date.now()}`;
    const entry = {
      id,
      what:     data.what     || data.message  || 'Unknown failure',
      why:      data.why      || data.cause     || '',
      category,
      tool:     data.tool     || null,
      model:    data.model    || null,
      task:     data.task     || null,
      context:  data.context  || {},
      error:    data.error    || null,
      howOften: 1,
      severity: data.severity || this._defaultSeverity(category),
      recovery: data.recovery || null,
      prevention: data.prevention || null,
      patterns: [],
      resolved: false,
      when:     new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      metadata: data.metadata || {},
    };

    this.failures.set(id, entry);
    this._evictIfNeeded();
    this.stats.recorded++;
    return entry;
  }

  /**
   * Auto-categorize a failure by matching keyword patterns.
   * @param {{ what?, why?, error? }} data
   * @returns {string} FAILURE_CATEGORIES value
   */
  categorize(data) {
    const text = [data.what, data.why, data.error, data.message]
      .filter(Boolean).join(' ');

    for (const { category, patterns } of CATEGORY_PATTERNS) {
      if (patterns.some(re => re.test(text))) return category;
    }
    return FAILURE_CATEGORIES.UNKNOWN;
  }

  _defaultSeverity(category) {
    const HIGH   = [FAILURE_CATEGORIES.HALLUCINATION, FAILURE_CATEGORIES.PERMISSION_DENIED, FAILURE_CATEGORIES.LOOP_DETECTED];
    const MEDIUM = [FAILURE_CATEGORIES.TOOL_FAILURE, FAILURE_CATEGORIES.CONTEXT_OVERFLOW, FAILURE_CATEGORIES.INVALID_OUTPUT];
    if (HIGH.includes(category))   return 'high';
    if (MEDIUM.includes(category)) return 'medium';
    return 'low';
  }

  // ── Pattern extraction ────────────────────────────────────────────────────

  /**
   * Extract and store a reusable avoidance pattern from a failure.
   * @param {string} failureId
   * @param {{ pattern: string, avoidance: string, conditions? }} patternData
   */
  learnPattern(failureId, patternData) {
    const failure = this.failures.get(failureId);
    if (!failure) return null;

    const key = `pat_${patternData.pattern.toLowerCase().replace(/\s+/g, '_').slice(0, 40)}`;
    const existing = this.patterns.get(key);

    if (existing) {
      if (!existing.failureIds.includes(failureId)) {
        existing.failureIds.push(failureId);
        existing.frequency++;
      }
    } else {
      this.patterns.set(key, {
        key,
        pattern:    patternData.pattern,
        avoidance:  patternData.avoidance,
        conditions: patternData.conditions || [],
        failureIds: [failureId],
        category:   failure.category,
        frequency:  1,
        learnedAt:  Date.now(),
      });
    }

    failure.patterns.push(key);
    this.stats.patternsExtracted++;
    return this.patterns.get(key);
  }

  // ── Pre-task warning retrieval ────────────────────────────────────────────

  /**
   * Retrieve relevant warnings before executing a task.
   * Returns failures and patterns that are likely relevant to the
   * described task so the agent can avoid repeating them.
   *
   * @param {string} taskDescription
   * @param {{ category?, tool?, limit? }} opts
   * @returns {{ warnings: object[], patterns: object[], severity: string }}
   */
  preTaskWarning(taskDescription, opts = {}) {
    const q       = (taskDescription || '').toLowerCase();
    const limit   = opts.limit || 5;
    this.stats.warningsIssued++;

    // Match failures by text similarity to task
    const relevantFailures = Array.from(this.failures.values())
      .filter(f => !opts.category || f.category === opts.category)
      .filter(f => !opts.tool     || f.tool     === opts.tool)
      .map(f => {
        const text  = [f.what, f.why, f.task].filter(Boolean).join(' ').toLowerCase();
        const score = this._textSimilarity(text, q);
        return { ...f, score };
      })
      .filter(f => f.score > 0)
      .sort((a, b) => b.howOften - a.howOften || b.score - a.score || (b.severity === 'high' ? 1 : -1))
      .slice(0, limit);

    // Match patterns by text similarity
    const relevantPatterns = Array.from(this.patterns.values())
      .map(p => ({ ...p, score: this._textSimilarity(p.pattern.toLowerCase(), q) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.frequency - a.frequency || b.score - a.score)
      .slice(0, limit);

    const topSeverity = relevantFailures.some(f => f.severity === 'high')   ? 'high'
      : relevantFailures.some(f => f.severity === 'medium') ? 'medium'
      : relevantFailures.length > 0 ? 'low' : 'none';

    return { warnings: relevantFailures, patterns: relevantPatterns, severity: topSeverity };
  }

  /**
   * Get warnings for a given context object (tool + task + category).
   * @param {{ tool?, task?, category?, model? }} context
   */
  getWarnings(context = {}) {
    const taskDesc = [context.task, context.tool, context.model].filter(Boolean).join(' ');
    return this.preTaskWarning(taskDesc, { tool: context.tool, category: context.category });
  }

  _textSimilarity(text, query) {
    if (!query || !text) return 0;
    const words = query.split(/\s+/).filter(w => w.length > 2);
    if (!words.length) return 0;
    const hits = words.filter(w => text.includes(w)).length;
    return hits / words.length;
  }

  // ── Recovery tracking ─────────────────────────────────────────────────────

  /**
   * Record the recovery/prevention strategy for a failure.
   * @param {string} failureId
   * @param {string} recovery    What fixed it
   * @param {string} prevention  How to avoid it next time
   */
  recordRecovery(failureId, recovery, prevention) {
    const f = this.failures.get(failureId);
    if (!f) return null;
    f.recovery   = recovery;
    f.prevention = prevention;
    f.resolved   = true;
    return f;
  }

  // ── Similarity search ─────────────────────────────────────────────────────

  findSimilar(data, category) {
    const what = (data.what || data.message || '').toLowerCase();
    const why  = (data.why  || data.cause   || '').toLowerCase();
    return Array.from(this.failures.values()).filter(f =>
      (f.category === category) &&
      (
        f.what.toLowerCase() === what ||
        (f.tool && f.tool === data.tool) ||
        (why && f.why && f.why.toLowerCase() === why)
      )
    );
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  getByCategory(category) {
    return Array.from(this.failures.values()).filter(f => f.category === category);
  }

  getRecurring(minCount = 2) {
    return Array.from(this.failures.values())
      .filter(f => f.howOften >= minCount)
      .sort((a, b) => b.howOften - a.howOften);
  }

  getUnresolved() {
    return Array.from(this.failures.values()).filter(f => !f.resolved);
  }

  getHighSeverity() {
    return Array.from(this.failures.values()).filter(f => f.severity === 'high');
  }

  // ── Eviction ──────────────────────────────────────────────────────────────

  _evictIfNeeded() {
    if (this.failures.size <= this.maxFailures) return;
    // Evict resolved, non-recurring failures first
    const resolved = Array.from(this.failures.entries())
      .filter(([, f]) => f.resolved && f.howOften < 2)
      .sort((a, b) => a[1].howOften - b[1].howOften);
    if (resolved.length > 0) {
      this.failures.delete(resolved[0][0]);
    } else {
      const oldest = this.failures.keys().next().value;
      this.failures.delete(oldest);
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats() {
    const failures = Array.from(this.failures.values());
    const byCat = {};
    for (const f of failures) byCat[f.category] = (byCat[f.category] || 0) + 1;
    return {
      ...this.stats,
      total:      this.failures.size,
      resolved:   failures.filter(f => f.resolved).length,
      unresolved: failures.filter(f => !f.resolved).length,
      recurring:  failures.filter(f => f.howOften >= 2).length,
      patterns:   this.patterns.size,
      byCategory: byCat,
      highSeverity: failures.filter(f => f.severity === 'high').length,
    };
  }
}

let _instance = null;
function getFailureMemory(config) {
  if (!_instance) _instance = new FailureMemory(config || {});
  return _instance;
}

module.exports = { FailureMemory, getFailureMemory, FAILURE_CATEGORIES };
