'use strict';

const { DecisionLedger, RISK_LEVELS, RISK_BY_INTENT } = require('../DecisionLedger');

describe('DecisionLedger', () => {
  let ledger;
  beforeEach(() => { ledger = new DecisionLedger(); });

  test('records a decision and returns it', () => {
    const rec = ledger.record({ sessionId: 's1', userId: 'u1', intent: 'chat', confidence: 0.9, outcome: 'completed' });
    expect(rec.id).toMatch(/^dec_/);
    expect(rec.intent).toBe('chat');
    expect(rec.confidence).toBe(0.9);
    expect(rec.outcome).toBe('completed');
    expect(rec.riskLevel).toBe('minimal');
  });

  test('infers risk level from intent', () => {
    const rec = ledger.record({ sessionId: 's1', userId: 'u1', intent: 'command_execution', confidence: 0.5, outcome: 'approved' });
    expect(rec.riskLevel).toBe('high');
  });

  test('allows risk level override', () => {
    const rec = ledger.record({ sessionId: 's1', userId: 'u1', intent: 'chat', confidence: 0.9, risk: 'critical', outcome: 'completed' });
    expect(rec.riskLevel).toBe('critical');
  });

  test('clamps confidence to 0-1 range', () => {
    const r1 = ledger.record({ sessionId: 's1', userId: 'u1', intent: 'chat', confidence: 1.5, outcome: 'completed' });
    const r2 = ledger.record({ sessionId: 's1', userId: 'u1', intent: 'chat', confidence: -0.2, outcome: 'completed' });
    expect(r1.confidence).toBe(1);
    expect(r2.confidence).toBe(0);
  });

  test('getRecords returns all records', () => {
    ledger.record({ sessionId: 's1', userId: 'u1', intent: 'chat', confidence: 0.9, outcome: 'completed' });
    ledger.record({ sessionId: 's2', userId: 'u2', intent: 'research', confidence: 0.7, outcome: 'completed' });
    expect(ledger.getRecords().length).toBe(2);
  });

  test('getRecords filters by userId', () => {
    ledger.record({ sessionId: 's1', userId: 'u1', intent: 'chat', confidence: 0.9, outcome: 'completed' });
    ledger.record({ sessionId: 's2', userId: 'u2', intent: 'research', confidence: 0.7, outcome: 'completed' });
    const u1Records = ledger.getRecords({ userId: 'u1' });
    expect(u1Records.length).toBe(1);
    expect(u1Records[0].userId).toBe('u1');
  });

  test('getStats returns correct counts', () => {
    ledger.record({ sessionId: 's1', userId: 'u1', intent: 'chat', confidence: 0.9, outcome: 'completed' });
    ledger.record({ sessionId: 's2', userId: 'u1', intent: 'command_execution', confidence: 0.3, outcome: 'denied' });
    const stats = ledger.getStats('u1');
    expect(stats.total).toBe(2);
    expect(stats.approved).toBe(1);
    expect(stats.denied).toBe(1);
    expect(stats.avg_confidence).toBeCloseTo(0.6, 2);
  });

  test('clear empties all records', () => {
    ledger.record({ sessionId: 's1', userId: 'u1', intent: 'chat', confidence: 0.9, outcome: 'completed' });
    ledger.clear();
    expect(ledger.getRecords().length).toBe(0);
  });

  test('RISK_BY_INTENT maps critical intents correctly', () => {
    expect(RISK_BY_INTENT.code_deployment).toBe('critical');
    expect(RISK_BY_INTENT.file_write).toBe('high');
    expect(RISK_BY_INTENT.web_search).toBe('minimal');
  });
});
