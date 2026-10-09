'use strict';

/**
 * FeedbackAdapter — Face 16: Self-Learning Feedback Loop.
 *
 * Bridges LearningEvaluationGate outputs back into PromptIR behavior improvements.
 * Reads gate history, identifies patterns in prompts that led to degraded quality,
 * and surfaces those as improvement suggestions on future prompts.
 *
 * Design principles:
 *  - All public methods are non-throwing (catch + log internally).
 *  - No dependency on the singleton — accepts gate/promptIR as injected dependencies
 *    but falls back to the singletons when called with null/undefined.
 *  - Side-effects are in-memory only; nothing is written to disk or DB.
 */

const { logger } = require('@librechat/data-schemas');

// Patterns that a short/vague prompt can exhibit
const KNOWN_BAD_PATTERNS = new Set(['too_short', 'too_vague', 'single_word', 'no_context']);

const PATTERN_SUGGESTIONS = {
  too_short: 'Add more context to your prompt for better results.',
  too_long: 'Consider breaking this into smaller, focused questions.',
  too_vague: 'Be more specific — include what outcome you expect.',
  missing_punctuation: 'Adding punctuation helps clarify your request.',
  single_word: 'A single word is too vague — describe what you need.',
  no_context: 'Provide context about what you are working on.',
};

class FeedbackAdapter {
  constructor() {
    /** pattern → number of degraded evaluations that exhibited this pattern */
    this._improvements = new Map();
    /** Set of evaluation IDs already processed so we never double-count. */
    this._processedEvalIds = new Set();
    this._patternsLearned = 0;
    this._suggestionsGiven = 0;
    this._lastProcessedAt = null;
  }

  // ── Core ───────────────────────────────────────────────────────────────────

  /**
   * Read gate history, find degraded/low-quality entries, extract bad prompt
   * patterns from their metadata, and store them for future getSuggestions calls.
   *
   * @param {object|null} gate     - LearningEvaluationGate instance (optional — falls back to singleton)
   * @param {object|null} promptIR - PromptIR instance (optional — used if it exposes addPattern)
   * @returns {{ patternsFound: number, processed: number }}
   */
  processBatch(gate, promptIR) {
    try {
      if (!gate) {
        try {
          gate = require('./LearningEvaluationGate').getLearningEvaluationGate();
        } catch { /* not available */ }
      }
      if (!gate) return { patternsFound: 0, processed: 0 };

      const history = gate.getHistory(null, 200);
      const unprocessed = history.filter((e) => !this._processedEvalIds.has(e.id));
      if (unprocessed.length === 0) return { patternsFound: 0, processed: 0 };

      let patternsFound = 0;

      for (const entry of unprocessed) {
        this._processedEvalIds.add(entry.id);

        // Determine if this evaluation represents a quality regression
        const isDegraded = entry.deltas
          ? Object.values(entry.deltas).some((d) => d.delta < 0)
          : false;

        // Also flag entries whose after-scores are very low (< 0.3)
        const isLowScore =
          !isDegraded &&
          entry.after &&
          Object.values(entry.after).some((v) => typeof v === 'number' && v < 0.3);

        if (!isDegraded && !isLowScore) continue;

        const prompt = entry.metadata?.prompt;
        if (!prompt || typeof prompt !== 'string') continue;

        const patterns = this._identifyPatterns(prompt);
        for (const pattern of patterns) {
          const count = this._improvements.get(pattern) || 0;
          this._improvements.set(pattern, count + 1);
          patternsFound++;
          this._patternsLearned++;

          // Forward to PromptIR if it supports addPattern (future-proofing)
          if (promptIR && typeof promptIR.addPattern === 'function') {
            try { promptIR.addPattern(pattern); } catch { /* non-fatal */ }
          }
        }
      }

      this._lastProcessedAt = new Date().toISOString();
      return { patternsFound, processed: unprocessed.length };
    } catch (err) {
      try { logger.warn('[FeedbackAdapter] processBatch error:', err?.message ?? err); } catch {}
      return { patternsFound: 0, processed: 0 };
    }
  }

  /**
   * For a given prompt, check whether it matches known bad patterns and
   * return actionable improvement suggestions.
   *
   * @param {string} prompt
   * @returns {{ hasSuggestions: boolean, suggestions: string[], improvedPrompt?: string }}
   */
  getSuggestions(prompt) {
    try {
      if (!prompt || typeof prompt !== 'string') {
        return { hasSuggestions: false, suggestions: [] };
      }

      const patterns = this._identifyPatterns(prompt);
      const suggestions = [];

      for (const pattern of patterns) {
        // Surface a suggestion if this pattern was seen in degraded evals OR
        // if it is a statically known bad pattern (works even before first batch).
        if (this._improvements.has(pattern) || KNOWN_BAD_PATTERNS.has(pattern)) {
          const suggestion = PATTERN_SUGGESTIONS[pattern] || `Improve prompt clarity (${pattern}).`;
          suggestions.push(suggestion);
        }
      }

      const result = { hasSuggestions: suggestions.length > 0, suggestions };

      if (suggestions.length > 0) {
        const improved = this._applyImprovements(prompt, patterns);
        if (improved) result.improvedPrompt = improved;
        this._suggestionsGiven++;
      }

      return result;
    } catch (err) {
      try { logger.warn('[FeedbackAdapter] getSuggestions error:', err?.message ?? err); } catch {}
      return { hasSuggestions: false, suggestions: [] };
    }
  }

  /**
   * Auto-processes if gate has 10 or more unprocessed entries.
   * Intended to be called passively from the chat pipeline.
   *
   * @param {object|null} gate     - LearningEvaluationGate instance (falls back to singleton)
   * @param {object|null} promptIR - PromptIR instance
   */
  triggerIfNeeded(gate, promptIR) {
    try {
      if (!gate) {
        try {
          gate = require('./LearningEvaluationGate').getLearningEvaluationGate();
        } catch { /* not available */ }
      }
      if (!gate) return;

      const history = gate.getHistory(null, 200);
      const unprocessedCount = history.filter((e) => !this._processedEvalIds.has(e.id)).length;

      if (unprocessedCount >= 10) {
        this.processBatch(gate, promptIR);
      }
    } catch (err) {
      try { logger.warn('[FeedbackAdapter] triggerIfNeeded error:', err?.message ?? err); } catch {}
    }
  }

  /**
   * @returns {{ patternsLearned: number, suggestionsGiven: number, lastProcessedAt: string|null }}
   */
  getStats() {
    return {
      patternsLearned: this._patternsLearned,
      suggestionsGiven: this._suggestionsGiven,
      lastProcessedAt: this._lastProcessedAt,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Classify a prompt string into a list of quality-issue pattern names.
   */
  _identifyPatterns(prompt) {
    if (!prompt || typeof prompt !== 'string') return [];
    const text = prompt.trim();
    const wordCount = text.split(/\s+/).length;
    const patterns = [];

    if (wordCount === 1) patterns.push('single_word');
    else if (wordCount < 5) patterns.push('too_short');
    if (wordCount > 200) patterns.push('too_long');
    if (/^(tell me about|talk about|what about|explain|describe)\s+\w+\.?\s*$/i.test(text)) {
      patterns.push('too_vague');
    }
    if (/^(help|help me|i need help|assist)\s*\.?\s*$/i.test(text)) patterns.push('no_context');
    if (!/[.!?]$/.test(text) && wordCount < 10 && wordCount > 1) {
      patterns.push('missing_punctuation');
    }

    return patterns;
  }

  /**
   * Apply simple text improvements based on identified patterns.
   * Returns the improved text or undefined if no improvement was made.
   */
  _applyImprovements(prompt, patterns) {
    let text = prompt.trim();
    if (patterns.includes('single_word') || patterns.includes('too_short')) {
      text = `${text} (Please provide detailed information and examples.)`;
    } else if (patterns.includes('too_vague')) {
      text = `${text} (Be specific about the context and expected outcome.)`;
    }
    return text !== prompt.trim() ? text : undefined;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

let _instance = null;
function getFeedbackAdapter() {
  if (!_instance) _instance = new FeedbackAdapter();
  return _instance;
}

module.exports = { FeedbackAdapter, getFeedbackAdapter };
