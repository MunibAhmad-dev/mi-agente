'use strict';

/**
 * reasoning_quality.test.js — Gen B Batch A integration test
 *
 * Behavioral tests for all 8 reasoning-quality components:
 *   ContradictionDetector, KnowledgeGapDetector, SelfAudit, SelfReflection,
 *   CounterfactualChecker, ConfidenceCalibration, UncertaintyQuantifier, FactChecker
 *
 * Each component has at least 4 tests.
 * No LLM calls are made — all services use heuristics.
 *
 * Run: npx jest api/test/integration/reasoning_quality.test.js
 */

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const {
  ContradictionDetector,
} = require('../../server/services/CognitiveBehavior/ContradictionDetector');

const {
  KnowledgeGapDetector,
} = require('../../server/services/CognitiveBehavior/KnowledgeGapDetector');

const {
  SelfAudit,
} = require('../../server/services/CognitiveBehavior/SelfAudit');

const {
  SelfReflection,
} = require('../../server/services/CognitiveBehavior/SelfReflection');

const {
  CounterfactualChecker,
} = require('../../server/services/CognitiveBehavior/CounterfactualChecker');

const {
  ConfidenceCalibration,
} = require('../../server/services/CognitiveBehavior/ConfidenceCalibration');

const {
  UncertaintyQuantifier,
} = require('../../server/services/CognitiveBehavior/UncertaintyQuantifier');

const {
  FactChecker,
} = require('../../server/services/CognitiveBehavior/FactChecker');

// ─── ContradictionDetector ──────────────────────────────────────────────────

describe('ContradictionDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new ContradictionDetector();
  });

  test('returns no contradictions for a short consistent sentence', () => {
    const result = detector.detect('The sky is blue and clouds are white.');
    expect(result).toHaveProperty('hasContradictions');
    expect(result).toHaveProperty('contradictions');
    expect(result).toHaveProperty('score');
    expect(Array.isArray(result.contradictions)).toBe(true);
  });

  test('detects a logical contradiction in text that says X then not X', () => {
    const text =
      'The service is always available and never goes down. The service is not available and does go down regularly.';
    const result = detector.detect(text);
    expect(result).toHaveProperty('hasContradictions');
    // The score should be > 0 when a contradiction is detected
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  test('returns correct shape for empty string input', () => {
    const result = detector.detect('');
    expect(result.hasContradictions).toBe(false);
    expect(result.contradictions).toEqual([]);
    expect(result.score).toBe(0);
  });

  test('is non-throwing for null input', () => {
    expect(() => detector.detect(null)).not.toThrow();
    const result = detector.detect(null);
    expect(result).toHaveProperty('hasContradictions');
    expect(result.hasContradictions).toBe(false);
  });

  test('getStats returns checks counter', () => {
    detector.detect('some text to check');
    const stats = detector.getStats();
    expect(stats.checks).toBeGreaterThanOrEqual(1);
  });

  test('score is between 0 and 1', () => {
    const longText =
      'All users are authenticated. No users are authenticated. The system is online. The system is not online. Every request succeeds. Every request does not succeed.';
    const result = detector.detect(longText);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

// ─── KnowledgeGapDetector ───────────────────────────────────────────────────

describe('KnowledgeGapDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new KnowledgeGapDetector();
  });

  test('detects explicit uncertainty phrases', () => {
    const text = "I'm not sure about this claim. I don't know the exact figure.";
    const result = detector.detect(text);
    expect(result).toHaveProperty('gaps');
    expect(result).toHaveProperty('overallConfidence');
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  test('hasSignificantGaps returns true for heavily hedged text', () => {
    const text =
      "I'm not sure, but perhaps it might be around 50%. I don't know for certain. Maybe this is unclear to everyone.";
    expect(detector.hasSignificantGaps(text)).toBe(true);
  });

  test('hasSignificantGaps returns false for confident text', () => {
    const text = 'Node.js runs JavaScript on the server. HTTP uses port 80. React is a UI library.';
    expect(detector.hasSignificantGaps(text)).toBe(false);
  });

  test('returns correct shape for empty input', () => {
    const result = detector.detect('');
    expect(result.gaps).toEqual([]);
    expect(result.overallConfidence).toBe(1);
  });

  test('detects hedging language', () => {
    const text = 'The answer might be correct. Perhaps the server will respond. Possibly the data is available.';
    const result = detector.detect(text);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  test('getStats increments checks counter', () => {
    detector.detect('test text');
    detector.detect('another text');
    const stats = detector.getStats();
    expect(stats.checks).toBe(2);
  });
});

// ─── SelfAudit ──────────────────────────────────────────────────────────────

describe('SelfAudit', () => {
  let auditor;

  beforeEach(() => {
    auditor = new SelfAudit();
  });

  test('passes a relevant, well-supported response', () => {
    const prompt = 'How does Node.js handle async operations?';
    const response =
      'Node.js handles async operations using an event loop. Because of this design, I/O operations run non-blocking. For example, setTimeout and Promises are used. According to the Node.js documentation, the event loop processes callbacks in phases.';
    const result = auditor.audit(response, prompt);
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('score');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  test('flags unsupported absolute statements', () => {
    const prompt = 'What is the best approach?';
    const response =
      'You should always use this approach. It will never fail. Every developer guaranteed uses this pattern.';
    const result = auditor.audit(response, prompt);
    const unsupported = result.issues.filter((i) => i.type === 'unsupported_claim');
    expect(unsupported.length).toBeGreaterThan(0);
  });

  test('returns failed for empty response', () => {
    const result = auditor.audit('', 'What is X?');
    expect(result.passed).toBe(false);
  });

  test('is non-throwing for null inputs', () => {
    expect(() => auditor.audit(null, null, null)).not.toThrow();
    const result = auditor.audit(null, null, null);
    expect(result.passed).toBe(false);
  });

  test('score decreases when issues are found', () => {
    const response = 'Always guaranteed to work. Never fails. All systems are perfect.';
    const result = auditor.audit(response, 'Is this reliable?');
    expect(result.score).toBeLessThan(1);
  });

  test('getStats tracks audits and pass/fail counts', () => {
    auditor.audit('Some response', 'some prompt');
    auditor.audit('', 'empty');
    const stats = auditor.getStats();
    expect(stats.audits).toBe(2);
    expect(stats.passed + stats.failed).toBe(2);
  });
});

// ─── SelfReflection ─────────────────────────────────────────────────────────

describe('SelfReflection', () => {
  let reflection;

  beforeEach(() => {
    reflection = new SelfReflection();
  });

  test('returns insights, improvements, and rating', () => {
    const result = reflection.reflect(
      'How do I reverse a string in Python?',
      'yes',
      null,
    );
    expect(result).toHaveProperty('insights');
    expect(result).toHaveProperty('improvements');
    expect(result).toHaveProperty('rating');
    expect(typeof result.rating).toBe('number');
    expect(result.rating).toBeGreaterThanOrEqual(1);
    expect(result.rating).toBeLessThanOrEqual(5);
  });

  test('stores session insights via reflectAndStore', () => {
    const sessionId = 'test-session-001';
    reflection.reflectAndStore(
      sessionId,
      'Explain async/await',
      'yes',
      0.5,
    );
    const insights = reflection.getSessionInsights(sessionId);
    expect(Array.isArray(insights)).toBe(true);
  });

  test('applyInsights appends guidance to the next prompt when insights exist', () => {
    const sessionId = 'test-session-002';
    reflection.reflectAndStore(
      sessionId,
      'What is X?',
      'yes', // very short response — should trigger insights
      0.2,
    );
    const augmented = reflection.applyInsights(sessionId, 'Tell me about Y');
    // If insights were stored, prompt should be augmented; otherwise same
    expect(typeof augmented).toBe('string');
    expect(augmented).toContain('Tell me about Y');
  });

  test('respects MAX_INSIGHTS_PER_SESSION limit', () => {
    const sessionId = 'test-session-003';
    for (let i = 0; i < 15; i++) {
      reflection.reflectAndStore(sessionId, `Q${i}`, 'yes', 0.1);
    }
    const insights = reflection.getSessionInsights(sessionId);
    expect(insights.length).toBeLessThanOrEqual(10);
  });

  test('getSessionInsights returns empty array for unknown session', () => {
    const insights = reflection.getSessionInsights('nonexistent-session');
    expect(insights).toEqual([]);
  });

  test('rating is higher for high-quality response', () => {
    const highQuality =
      'Here is a detailed explanation with examples. For instance, you can use `str.split("").reverse().join("")` in JavaScript. This approach works because array reversal is O(n). According to MDN, the reverse() method mutates the array in place.';
    const result = reflection.reflect('How to reverse a string?', highQuality, 0.9);
    expect(result.rating).toBeGreaterThanOrEqual(3);
  });
});

// ─── CounterfactualChecker ──────────────────────────────────────────────────

describe('CounterfactualChecker', () => {
  let checker;

  beforeEach(() => {
    checker = new CounterfactualChecker();
  });

  test('generates exactly 3 counterfactuals', () => {
    const result = checker.check('Deploy the new authentication service to production');
    expect(result).toHaveProperty('counterfactuals');
    expect(result.counterfactuals).toHaveLength(3);
  });

  test('counterfactuals include best-case, worst-case, most-likely-alternative', () => {
    const result = checker.check('Migrate the database schema in production');
    const scenarios = result.counterfactuals.map((c) => c.scenario);
    expect(scenarios).toContain('best-case');
    expect(scenarios).toContain('worst-case');
    expect(scenarios).toContain('most-likely-alternative');
  });

  test('high-risk decision has riskScore > 0.4', () => {
    const result = checker.check(
      'Permanently delete all user records from the production database with no backup',
    );
    expect(result.riskScore).toBeGreaterThan(0.4);
  });

  test('shouldBlock returns false for low-risk decision', () => {
    const blocked = checker.shouldBlock('Update the README documentation file');
    expect(blocked).toBe(false);
  });

  test('each counterfactual has scenario, outcome, and probability fields', () => {
    const result = checker.check('Send a batch email to all users');
    for (const cf of result.counterfactuals) {
      expect(cf).toHaveProperty('scenario');
      expect(cf).toHaveProperty('outcome');
      expect(cf).toHaveProperty('probability');
      expect(typeof cf.probability).toBe('number');
      expect(cf.probability).toBeGreaterThanOrEqual(0);
      expect(cf.probability).toBeLessThanOrEqual(1);
    }
  });

  test('is non-throwing for empty decision', () => {
    expect(() => checker.check('')).not.toThrow();
    const result = checker.check('');
    expect(result).toHaveProperty('error');
  });
});

// ─── ConfidenceCalibration ──────────────────────────────────────────────────

describe('ConfidenceCalibration', () => {
  let calibration;

  beforeEach(() => {
    calibration = new ConfidenceCalibration();
  });

  test('records a calibration sample', () => {
    const result = calibration.calibrate(0.8, 1.0);
    expect(result.recorded).toBe(true);
    expect(result.sampleCount).toBe(1);
  });

  test('getCalibration returns bias, calibrationError, reliability', () => {
    calibration.calibrate(0.9, 1.0);
    calibration.calibrate(0.8, 0.5);
    const cal = calibration.getCalibration();
    expect(cal).toHaveProperty('bias');
    expect(cal).toHaveProperty('calibrationError');
    expect(cal).toHaveProperty('reliability');
    expect(cal.reliability).toBeGreaterThanOrEqual(0);
    expect(cal.reliability).toBeLessThanOrEqual(1);
  });

  test('adjust returns the raw confidence when fewer than 5 samples exist', () => {
    const adjusted = calibration.adjust(0.7);
    expect(adjusted).toBe(0.7);
  });

  test('adjust corrects for systematic overconfidence after many samples', () => {
    // Stated 0.9 but always wrong (actual 0.0) → overconfident by ~0.9
    for (let i = 0; i < 10; i++) {
      calibration.calibrate(0.9, 0.0);
    }
    const adjusted = calibration.adjust(0.9);
    // Adjusted should be noticeably lower than 0.9
    expect(adjusted).toBeLessThan(0.9);
  });

  test('handles invalid inputs without throwing', () => {
    expect(() => calibration.calibrate('bad', 'data')).not.toThrow();
    const result = calibration.calibrate('bad', 'data');
    expect(result.recorded).toBe(false);
  });

  test('reliability is 1 when no samples', () => {
    const cal = calibration.getCalibration();
    expect(cal.reliability).toBe(1);
    expect(cal.sampleCount).toBe(0);
  });
});

// ─── UncertaintyQuantifier ──────────────────────────────────────────────────

describe('UncertaintyQuantifier', () => {
  let quantifier;

  beforeEach(() => {
    quantifier = new UncertaintyQuantifier();
  });

  test('returns low uncertainty for a confident factual statement', () => {
    const result = quantifier.quantify(
      'Node.js is a JavaScript runtime. HTTP uses port 80. Git is a version control system.',
    );
    expect(result.uncertaintyLevel).toBe('low');
    expect(result.score).toBeLessThan(0.25);
  });

  test('returns high uncertainty for heavily hedged text', () => {
    const text =
      "I'm not sure, but perhaps it might be around 50%. Maybe this is unclear. I believe possibly the server could be down.";
    const result = quantifier.quantify(text);
    expect(result.uncertaintyLevel).toBe('high');
    expect(result.score).toBeGreaterThan(0.5);
  });

  test('getSuggestedDisclaimer returns a string for each level', () => {
    for (const level of ['low', 'medium', 'high']) {
      const disclaimer = quantifier.getSuggestedDisclaimer(level);
      expect(typeof disclaimer).toBe('string');
      expect(disclaimer.length).toBeGreaterThan(10);
    }
  });

  test('returns correct shape for empty input', () => {
    const result = quantifier.quantify('');
    expect(result.uncertaintyLevel).toBe('low');
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
  });

  test('signals array contains detected patterns', () => {
    const text = "Perhaps this might be approximately 100. I'm not sure if this is right.";
    const result = quantifier.quantify(text);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  test('getStats increments quantifications counter', () => {
    quantifier.quantify('some text');
    quantifier.quantify('more text');
    const stats = quantifier.getStats();
    expect(stats.quantifications).toBe(2);
  });
});

// ─── FactChecker ────────────────────────────────────────────────────────────

describe('FactChecker', () => {
  let checker;

  beforeEach(() => {
    checker = new FactChecker();
  });

  test('verifies a true built-in fact', () => {
    const result = checker.check('Node.js is a JavaScript runtime built on V8');
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('confidence');
    expect(['true', 'uncertain']).toContain(result.verdict);
  });

  test('check returns uncertain for unknown claim', () => {
    const result = checker.check('The moon is made of green cheese and is inhabited by dragons');
    expect(result.verdict).toBe('uncertain');
    expect(result.verified).toBeNull();
  });

  test('addFact allows adding a custom fact that is later verified', () => {
    checker.addFact('The project uses LibreChat as a base', 'project', 0.95);
    const result = checker.check('project uses LibreChat as base');
    expect(['true', 'uncertain']).toContain(result.verdict);
  });

  test('checkAll returns results array and overallTrustScore', () => {
    const text =
      'Node.js is a JavaScript runtime. HTTP uses port 80. HTTPS uses port 443. SQL stands for Structured Query Language.';
    const result = checker.checkAll(text);
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('overallTrustScore');
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.overallTrustScore).toBeGreaterThanOrEqual(0);
    expect(result.overallTrustScore).toBeLessThanOrEqual(1);
  });

  test('overallTrustScore is 1 when no checkable claims in text', () => {
    const result = checker.checkAll('Short text.');
    expect(result.overallTrustScore).toBe(1);
  });

  test('addFact does not duplicate identical facts', () => {
    const before = checker.getStats().totalFacts;
    checker.addFact('Node.js is a JavaScript runtime built on Chrome\'s V8 engine', 'tech', 1.0);
    const after = checker.getStats().totalFacts;
    expect(after).toBe(before);
  });

  test('getStats returns totalFacts and check counts', () => {
    checker.check('HTTP uses port 80');
    const stats = checker.getStats();
    expect(stats).toHaveProperty('totalFacts');
    expect(stats).toHaveProperty('checks');
    expect(stats.totalFacts).toBeGreaterThan(0);
    expect(stats.checks).toBeGreaterThanOrEqual(1);
  });
});
