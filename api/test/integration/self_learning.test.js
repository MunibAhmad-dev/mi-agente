'use strict';

/**
 * self_learning.test.js — Face 16 behavioral integration test.
 *
 * Verifies:
 *   - FeedbackAdapter.processBatch identifies patterns from degraded gate history
 *   - FeedbackAdapter.getSuggestions returns suggestions for known bad patterns
 *   - SelfImprovementLoop.runOnce completes without error and updates state
 *   - Stats are accurate after a batch run
 *
 * Run: npx jest api/test/integration/self_learning.test.js
 */

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { FeedbackAdapter, getFeedbackAdapter } = require('../../server/services/Learning/FeedbackAdapter');
const { SelfImprovementLoop } = require('../../server/services/Learning/SelfImprovementLoop');
const { LearningEvaluationGate } = require('../../server/services/Learning/LearningEvaluationGate');
const { PromptIR } = require('../../server/services/CognitiveBehavior/PromptIR');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Seed a gate with N degraded evaluations, each with the given prompt. */
function seedDegradedEvals(gate, n, prompt = 'fix') {
  for (let i = 0; i < n; i++) {
    gate.evaluate({
      model_id: 'test-model',
      before: { accuracy: 0.85, helpfulness: 0.80 },
      after: { accuracy: 0.55, helpfulness: 0.40 },
      metadata: { prompt },
    });
  }
}

// ── FeedbackAdapter.processBatch ──────────────────────────────────────────────

describe('FeedbackAdapter.processBatch', () => {
  let gate;
  let promptIR;
  let adapter;

  beforeEach(() => {
    gate = new LearningEvaluationGate();
    promptIR = new PromptIR();
    adapter = new FeedbackAdapter();
  });

  it('returns { patternsFound: 0, processed: 0 } for an empty gate', () => {
    const result = adapter.processBatch(gate, promptIR);
    expect(result).toEqual({ patternsFound: 0, processed: 0 });
  });

  it('processes degraded evaluations and reports processed count', () => {
    seedDegradedEvals(gate, 3, 'fix');
    const result = adapter.processBatch(gate, promptIR);
    expect(result.processed).toBe(3);
  });

  it('does not reprocess already-seen evaluation IDs', () => {
    seedDegradedEvals(gate, 2, 'fix');
    const first = adapter.processBatch(gate, promptIR);
    const second = adapter.processBatch(gate, promptIR);
    expect(first.processed).toBe(2);
    expect(second.processed).toBe(0);
  });

  it('increments patternsLearned on degraded entry with vague prompt', () => {
    seedDegradedEvals(gate, 1, 'hi'); // 1 word — too_short / single_word
    adapter.processBatch(gate, promptIR);
    const stats = adapter.getStats();
    expect(stats.patternsLearned).toBeGreaterThanOrEqual(1);
  });

  it('skips evaluations that are not degraded (improvement case)', () => {
    gate.evaluate({
      model_id: 'good-model',
      before: { accuracy: 0.5 },
      after: { accuracy: 0.9 },
      metadata: { prompt: 'What is React?' },
    });
    const result = adapter.processBatch(gate, promptIR);
    // Entry is processed (marked seen) but no pattern extracted from a non-degraded eval
    expect(result.processed).toBe(1);
    expect(result.patternsFound).toBe(0);
  });

  it('does not throw when gate is null (falls back to singleton path)', () => {
    // Singleton has no evaluations — should return 0/0 without throwing
    expect(() => adapter.processBatch(null, promptIR)).not.toThrow();
  });
});

// ── FeedbackAdapter.getSuggestions ────────────────────────────────────────────

describe('FeedbackAdapter.getSuggestions', () => {
  let adapter;

  beforeEach(() => {
    adapter = new FeedbackAdapter();
  });

  it('returns hasSuggestions=true for a single-word prompt', () => {
    const result = adapter.getSuggestions('fix');
    expect(result.hasSuggestions).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('returns hasSuggestions=true for a very short two-word prompt', () => {
    const result = adapter.getSuggestions('help me');
    expect(result.hasSuggestions).toBe(true);
  });

  it('returns hasSuggestions=false for a clear, specific long prompt', () => {
    const result = adapter.getSuggestions(
      'Explain how React hooks work with a simple useEffect example showing cleanup.',
    );
    expect(result.hasSuggestions).toBe(false);
    expect(result.suggestions).toHaveLength(0);
  });

  it('includes an improvedPrompt when suggestions are present', () => {
    const result = adapter.getSuggestions('hi');
    if (result.hasSuggestions) {
      expect(result.improvedPrompt).toBeDefined();
      expect(typeof result.improvedPrompt).toBe('string');
    }
  });

  it('returns suggestions for known bad patterns even before any processBatch call', () => {
    // No processBatch has been run — KNOWN_BAD_PATTERNS covers 'too_short' etc.
    const result = adapter.getSuggestions('ok');
    expect(result.hasSuggestions).toBe(true);
  });

  it('handles empty string without throwing', () => {
    expect(() => adapter.getSuggestions('')).not.toThrow();
    const result = adapter.getSuggestions('');
    expect(result.hasSuggestions).toBe(false);
  });

  it('handles null without throwing', () => {
    expect(() => adapter.getSuggestions(null)).not.toThrow();
  });

  it('surface suggestions after processBatch records a pattern', () => {
    const gate = new LearningEvaluationGate();
    const promptIR = new PromptIR();
    seedDegradedEvals(gate, 1, 'fix');
    adapter.processBatch(gate, promptIR);

    // 'fix' is too_short → patterns map should now include too_short
    const result = adapter.getSuggestions('fix');
    expect(result.hasSuggestions).toBe(true);
  });
});

// ── SelfImprovementLoop.runOnce ───────────────────────────────────────────────

describe('SelfImprovementLoop.runOnce', () => {
  it('completes without throwing', () => {
    const loop = new SelfImprovementLoop();
    expect(() => loop.runOnce()).not.toThrow();
  });

  it('increments cyclesCompleted on each call', () => {
    const loop = new SelfImprovementLoop();
    loop.runOnce();
    loop.runOnce();
    expect(loop.getStatus().cyclesCompleted).toBe(2);
  });

  it('sets lastRun to a non-null ISO string after first call', () => {
    const loop = new SelfImprovementLoop();
    expect(loop.getStatus().lastRun).toBeNull();
    loop.runOnce();
    const { lastRun } = loop.getStatus();
    expect(lastRun).not.toBeNull();
    expect(typeof lastRun).toBe('string');
    // Should be a valid ISO 8601 date
    expect(new Date(lastRun).getTime()).not.toBeNaN();
  });

  it('returns an object with patternsFound and processed', () => {
    const loop = new SelfImprovementLoop();
    const result = loop.runOnce();
    expect(result).toHaveProperty('patternsFound');
    expect(result).toHaveProperty('processed');
  });

  it('does NOT start the interval when not explicitly started', () => {
    const loop = new SelfImprovementLoop();
    expect(loop.getStatus().running).toBe(false);
  });
});

// ── Stats accuracy ────────────────────────────────────────────────────────────

describe('Stats accuracy after batch', () => {
  it('getStats reflects lastProcessedAt after processBatch runs', () => {
    const gate = new LearningEvaluationGate();
    const promptIR = new PromptIR();
    const adapter = new FeedbackAdapter();

    seedDegradedEvals(gate, 5, 'hi');
    adapter.processBatch(gate, promptIR);

    const stats = adapter.getStats();
    expect(stats.patternsLearned).toBeGreaterThanOrEqual(0);
    expect(stats.suggestionsGiven).toBeGreaterThanOrEqual(0);
    expect(stats.lastProcessedAt).not.toBeNull();
    expect(typeof stats.lastProcessedAt).toBe('string');
  });

  it('suggestionsGiven increments on each getSuggestions call that returns suggestions', () => {
    const adapter = new FeedbackAdapter();
    adapter.getSuggestions('hi'); // hasSuggestions=true — should increment
    adapter.getSuggestions('hi');
    const stats = adapter.getStats();
    expect(stats.suggestionsGiven).toBeGreaterThanOrEqual(2);
  });

  it('getFeedbackAdapter always returns the same singleton instance', () => {
    const a1 = getFeedbackAdapter();
    const a2 = getFeedbackAdapter();
    expect(a1).toBe(a2);
  });

  it('SelfImprovementLoop.getStatus has all expected fields', () => {
    const loop = new SelfImprovementLoop();
    const status = loop.getStatus();
    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('lastRun');
    expect(status).toHaveProperty('cyclesCompleted');
    expect(status).toHaveProperty('patternsDiscovered');
  });
});
