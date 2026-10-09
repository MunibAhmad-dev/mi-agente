'use strict';

/**
 * ModelAgnosticTesting — Gen B Phase 44.
 *
 * A testing framework that evaluates LLM responses against behavioral
 * contracts that hold regardless of which model produced the output.
 *
 * Key insight: good tests assert WHAT the output should do, not WHICH
 * tokens were produced. E.g. "contains a code block", "answers in < 3
 * sentences", "mentions the word 'error'", "parsed JSON is valid".
 *
 * Singleton: getModelAgnosticTesting()
 */

// ── Built-in behavioral matchers ───────────────────────────────────────────

const BUILT_IN_MATCHERS = {
  /** Response contains a fenced code block */
  hasCodeBlock: (text) => /```[\s\S]*?```/.test(text),

  /** Response is shorter than N words */
  isConcise: (text, { maxWords = 100 } = {}) => text.trim().split(/\s+/).length <= maxWords,

  /** Response is longer than N words */
  isSubstantial: (text, { minWords = 20 } = {}) => text.trim().split(/\s+/).length >= minWords,

  /** Response contains no profanity / harmful language (basic check) */
  isSafe: (text) => !/\b(fuck|shit|kill yourself|go die)\b/i.test(text),

  /** Response does not start with sycophantic filler */
  noFiller: (text) => !/^(great question|certainly!|of course!|absolutely!|sure thing)/i.test(text.trim()),

  /** Response contains at least one numbered or bulleted list item */
  hasList: (text) => /^\s*[\d]+\.|^\s*[-*•]/m.test(text),

  /** Response appears to answer directly (first 50 chars isn't a preamble) */
  directAnswer: (text) => !/^(I would|Let me|First, let me|To answer)/i.test(text.trim().slice(0, 60)),

  /** Response contains valid JSON somewhere */
  containsValidJson: (text) => {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return false;
    try { JSON.parse(match[0]); return true; } catch { return false; }
  },

  /** Response mentions the error/exception topic when given an error prompt */
  mentionsError: (text) => /\b(error|exception|bug|issue|problem|fix|resolve|cause)\b/i.test(text),

  /** Response length is within a given range */
  lengthInRange: (text, { min = 0, max = Infinity } = {}) => {
    const len = text.trim().length;
    return len >= min && len <= max;
  },

  /** Response does not contain placeholder text */
  noPlaceholders: (text) => !/\b(lorem ipsum|TODO|FIXME|PLACEHOLDER|your text here)\b/i.test(text),

  /** Response is in English (simple heuristic) */
  isEnglish: (text) => {
    const commonWords = /\b(the|is|are|was|were|and|or|but|in|on|at|to|for|of|a|an)\b/gi;
    const matches = (text.match(commonWords) || []).length;
    return matches >= Math.min(3, text.split(/\s+/).length * 0.1);
  },
};

// ── Suite and result types ─────────────────────────────────────────────────

class ModelAgnosticTesting {
  constructor() {
    this.suites    = new Map();
    this.history   = [];
    this.matchers  = { ...BUILT_IN_MATCHERS };
    this.stats     = { suitesRun: 0, totalTests: 0, passed: 0, failed: 0 };
  }

  // ── Matcher registration ─────────────────────────────────────────────────

  /**
   * Register a custom matcher function.
   * @param {string}   name - Matcher name
   * @param {Function} fn   - (text: string, opts?: object) => boolean
   */
  registerMatcher(name, fn) {
    try {
      if (typeof fn !== 'function') throw new Error('Matcher must be a function');
      this.matchers[name] = fn;
      return { registered: true, name };
    } catch (e) {
      return { registered: false, error: e.message };
    }
  }

  /** List all available matchers */
  listMatchers() {
    return Object.keys(this.matchers);
  }

  // ── Suite management ─────────────────────────────────────────────────────

  /**
   * Define a test suite.
   * @param {string} suiteId
   * @param {Array<{ name, matcher, opts?, required? }>} tests
   * @param {object} [meta] - { description, tags }
   */
  defineSuite(suiteId, tests, meta = {}) {
    try {
      if (!Array.isArray(tests) || tests.length === 0) throw new Error('Suite needs at least one test');
      this.suites.set(suiteId, { suiteId, tests, meta, createdAt: new Date().toISOString() });
      return { defined: true, suiteId, testCount: tests.length };
    } catch (e) {
      return { defined: false, error: e.message };
    }
  }

  /**
   * Run a named suite against a response.
   * @param {string} suiteId
   * @param {string} response - The LLM response text
   * @param {object} [context] - { model, prompt, sessionId }
   * @returns {{ suiteId, passed: boolean, score: number, results: [...], model, duration }}
   */
  runSuite(suiteId, response, context = {}) {
    try {
      const suite = this.suites.get(suiteId);
      if (!suite) return { suiteId, passed: false, score: 0, error: 'Suite not found', results: [] };

      const start   = Date.now();
      const results = [];
      let   passing = 0;
      let   required_failed = false;

      for (const test of suite.tests) {
        const matcher = this.matchers[test.matcher];
        if (!matcher) {
          results.push({ name: test.name, passed: false, error: `Unknown matcher: ${test.matcher}` });
          if (test.required) required_failed = true;
          continue;
        }
        let passed = false;
        let error  = null;
        try {
          passed = Boolean(matcher(response, test.opts || {}));
        } catch (e) {
          error = e.message;
        }
        if (passed) passing++;
        if (!passed && test.required) required_failed = true;
        results.push({ name: test.name, matcher: test.matcher, passed, required: !!test.required, error });
        this.stats.totalTests++;
        if (passed) this.stats.passed++; else this.stats.failed++;
      }

      const score  = suite.tests.length > 0 ? passing / suite.tests.length : 0;
      const passed = !required_failed && score >= 0.5;

      this.stats.suitesRun++;
      const record = {
        suiteId, passed, score: Math.round(score * 100) / 100,
        results, model: context.model || 'unknown',
        prompt:  context.prompt ? context.prompt.slice(0, 100) : null,
        duration: Date.now() - start,
        runAt:   new Date().toISOString(),
      };
      this.history.push(record);
      if (this.history.length > 500) this.history.shift();
      return record;
    } catch (e) {
      return { suiteId, passed: false, score: 0, error: e.message, results: [] };
    }
  }

  /**
   * Run ad-hoc tests without a pre-defined suite.
   * @param {string} response
   * @param {Array<{ name, matcher, opts?, required? }>} tests
   * @param {object} [context]
   */
  runInline(response, tests, context = {}) {
    const tmpId = `__inline_${Date.now()}`;
    this.defineSuite(tmpId, tests);
    const result = this.runSuite(tmpId, response, context);
    this.suites.delete(tmpId);
    return result;
  }

  /**
   * Compare how two responses (from different models) perform on the same suite.
   * @param {string} suiteId
   * @param {{ model: string, response: string }[]} responses
   * @returns {{ winner: string, comparison: [...] }}
   */
  compare(suiteId, responses) {
    try {
      const results = responses.map(r => ({
        model:  r.model,
        result: this.runSuite(suiteId, r.response, { model: r.model }),
      }));
      results.sort((a, b) => b.result.score - a.result.score);
      return {
        winner:     results[0].model,
        comparison: results.map(r => ({ model: r.model, score: r.result.score, passed: r.result.passed })),
        full:       results,
      };
    } catch (e) {
      return { winner: null, comparison: [], error: e.message };
    }
  }

  /**
   * Get the built-in suites registered at startup.
   */
  getBuiltinSuites() {
    return Array.from(this.suites.entries())
      .filter(([id]) => id.startsWith('builtin:'))
      .map(([id, s]) => ({ suiteId: id, testCount: s.tests.length, meta: s.meta }));
  }

  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  getStats() {
    const passRate = this.stats.totalTests > 0
      ? Math.round((this.stats.passed / this.stats.totalTests) * 100) + '%'
      : 'n/a';
    return { ...this.stats, passRate, suitesDefined: this.suites.size, matchersAvailable: Object.keys(this.matchers).length };
  }

  // ── Bootstrap built-in suites ────────────────────────────────────────────

  _loadBuiltins() {
    this.defineSuite('builtin:general_quality', [
      { name: 'Not empty',           matcher: 'isSubstantial', opts: { minWords: 5 },  required: true },
      { name: 'Safe content',        matcher: 'isSafe',                                required: true },
      { name: 'No placeholder text', matcher: 'noPlaceholders' },
      { name: 'No sycophantic filler', matcher: 'noFiller' },
    ], { description: 'General response quality — applies to any model' });

    this.defineSuite('builtin:code_response', [
      { name: 'Contains code block', matcher: 'hasCodeBlock',  required: true },
      { name: 'Substantial length',  matcher: 'isSubstantial', opts: { minWords: 15 } },
      { name: 'Safe content',        matcher: 'isSafe',        required: true },
      { name: 'No placeholders',     matcher: 'noPlaceholders' },
    ], { description: 'Code generation responses — model-agnostic behavioral contract' });

    this.defineSuite('builtin:concise_response', [
      { name: 'Concise',       matcher: 'isConcise',     opts: { maxWords: 80 }, required: true },
      { name: 'Not empty',     matcher: 'isSubstantial', opts: { minWords: 5 },  required: true },
      { name: 'Direct answer', matcher: 'directAnswer' },
    ], { description: 'Short-answer responses — no fluff' });

    this.defineSuite('builtin:research_response', [
      { name: 'Substantial',         matcher: 'isSubstantial', opts: { minWords: 50 }, required: true },
      { name: 'Has list or structure', matcher: 'hasList' },
      { name: 'Safe',                matcher: 'isSafe',        required: true },
      { name: 'No placeholders',     matcher: 'noPlaceholders' },
    ], { description: 'Research / detailed explanation responses' });
  }
}

let _instance = null;
function getModelAgnosticTesting() {
  if (!_instance) {
    _instance = new ModelAgnosticTesting();
    _instance._loadBuiltins();
  }
  return _instance;
}

module.exports = { ModelAgnosticTesting, getModelAgnosticTesting, BUILT_IN_MATCHERS };
