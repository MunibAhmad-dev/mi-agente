'use strict';

const { ConstitutionEngine, getConstitutionEngine } = require('../ConstitutionEngine');
const { ConfidenceRiskTracker, getConfidenceRiskTracker } = require('../ConfidenceRiskTracker');

describe('ConstitutionEngine', () => {
  test('validates clean text as passed', () => {
    const ce = new ConstitutionEngine();
    const result = ce.validate('The quick brown fox jumps over the lazy dog.');
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('detects email address violation', () => {
    const ce = new ConstitutionEngine();
    const result = ce.validate('Please contact user@example.com for more information.');
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.id === 'C1')).toBe(true);
  });

  test('detects credential pattern', () => {
    const ce = new ConstitutionEngine();
    const result = ce.validate('The api_key: abc123secret is valid');
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.id === 'C2')).toBe(true);
  });

  test('warns on absolute claims without hedging', () => {
    const ce = new ConstitutionEngine();
    const result = ce.validate('This will always work and is definitely 100% guaranteed.');
    expect(result.warnings.some((w) => w.id === 'C3')).toBe(true);
  });

  test('getStats tracks validations', () => {
    const ce = new ConstitutionEngine();
    ce.validate('Clean text');
    ce.validate('Bad text user@evil.com');
    const stats = ce.getStats();
    expect(stats.total_validations).toBeGreaterThanOrEqual(2);
  });
});

describe('ConfidenceRiskTracker', () => {
  test('records a decision', () => {
    const tracker = new ConfidenceRiskTracker();
    const rec = tracker.record({ decision: 'Deploy feature', confidence: 0.9, risk_factors: [] });
    expect(rec.id).toMatch(/^dec_/);
    expect(rec.risk_level).toBeDefined();
  });

  test('high risk_factors reduce confidence effectively', () => {
    const tracker = new ConfidenceRiskTracker();
    const highRisk = tracker.record({ decision: 'Irreversible action', confidence: 0.3, risk_factors: ['no_rollback', 'production', 'irreversible'] });
    expect(['high', 'critical', 'medium']).toContain(highRisk.risk_level);
  });

  test('records outcome', () => {
    const tracker = new ConfidenceRiskTracker();
    const rec = tracker.record({ decision: 'Test', confidence: 0.7 });
    tracker.recordOutcome(rec.id, { success: true, actual_result: 'Worked' });
    expect(tracker.get(rec.id).outcome.success).toBe(true);
  });

  test('getStats reports success rate', () => {
    const tracker = new ConfidenceRiskTracker();
    const r1 = tracker.record({ decision: 'D1', confidence: 0.8 });
    const r2 = tracker.record({ decision: 'D2', confidence: 0.6 });
    tracker.recordOutcome(r1.id, { success: true });
    tracker.recordOutcome(r2.id, { success: false });
    const stats = tracker.getStats();
    expect(stats.success_rate).toBe(50);
  });
});
