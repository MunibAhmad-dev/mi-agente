'use strict';

const { AdversarialVisualTesting, ADVERSARIAL_TESTS, WCAG_CHECKS } = require('../AdversarialVisualTesting');

describe('AdversarialVisualTesting', () => {
  let avt;
  beforeEach(() => { avt = new AdversarialVisualTesting(); });

  test('listTests returns all tests', () => {
    const tests = avt.listTests();
    expect(tests.length).toBe(Object.keys(ADVERSARIAL_TESTS).length);
    expect(tests.every((t) => t.id && t.description)).toBe(true);
  });

  test('runTest runs a known test and returns result', async () => {
    const result = await avt.runTest('grayscale', { base64: 'abc', question: 'What do you see?' });
    expect(result.test_id).toBe('grayscale');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('timestamp');
  });

  test('runTest throws for unknown test id', async () => {
    await expect(avt.runTest('nonexistent')).rejects.toThrow('Unknown adversarial test');
  });

  test('getSummary aggregates results', async () => {
    await avt.runTest('grayscale');
    await avt.runTest('horizontal_flip');
    const summary = avt.getSummary();
    expect(summary.total).toBe(2);
    expect(summary.pass_rate).toBeGreaterThanOrEqual(0);
    expect(summary.pass_rate).toBeLessThanOrEqual(100);
  });

  test('clearResults empties history', async () => {
    await avt.runTest('rotation_45');
    avt.clearResults();
    expect(avt.getSummary().total).toBe(0);
  });

  test('runAccessibilityChecks with empty description flags missing alt text', () => {
    const result = avt.runAccessibilityChecks('');
    const altCheck = result.checks.find((c) => c.id === 'alt_text');
    expect(altCheck).toBeDefined();
    expect(altCheck.passed).toBe(false);
  });

  test('runAccessibilityChecks with description passes alt_text', () => {
    const result = avt.runAccessibilityChecks('A red cat sitting on a mat');
    const altCheck = result.checks.find((c) => c.id === 'alt_text');
    expect(altCheck.passed).toBe(true);
  });

  test('runAccessibilityChecks returns score and level', () => {
    const result = avt.runAccessibilityChecks('A landscape photograph');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['A', 'AA', 'AAA', 'FAIL']).toContain(result.level);
  });

  test('WCAG_CHECKS list is defined', () => {
    expect(WCAG_CHECKS.length).toBeGreaterThan(0);
    expect(WCAG_CHECKS.every((c) => c.id && c.name && c.level)).toBe(true);
  });
});
