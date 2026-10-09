'use strict';

const { getDisputePlatform, DISPUTE_TYPES } = require('../DisputePlatform');
const { AlertSystem, ALERT_TYPES } = require('../AlertSystem');
const { analyze, keywordSentiment, aggregate } = require('../MLSentiment');
const { getCaseManager } = require('../CaseManager');
const { createChain, getChain, listChains } = require('../EvidenceChain');

describe('DisputePlatform', () => {
  let platform;
  beforeEach(() => { platform = getDisputePlatform(); });

  test('creates a dispute', () => {
    const d = platform.create({ title: 'False claim about product', type: 'false_claim', subject_name: 'Acme' });
    expect(d.id).toMatch(/^disp_/);
    expect(d.status).toBe('open');
  });

  test('adds evidence to dispute', () => {
    const d = platform.create({ title: 'Test', type: 'misinformation' });
    const ev = platform.addEvidence(d.id, { content: 'Screenshot showing false claim', type: 'image' });
    expect(ev.id).toBeTruthy();
    expect(platform.get(d.id).evidence_items).toHaveLength(1);
  });

  test('updates status', () => {
    const d = platform.create({ title: 'Test', type: 'defamation' });
    platform.updateStatus(d.id, 'under_review');
    expect(platform.get(d.id).status).toBe('under_review');
  });

  test('lists with filters', () => {
    platform.create({ title: 'Open one', type: 'false_claim' });
    const open = platform.list({ status: 'open' });
    expect(open.every((d) => d.status === 'open')).toBe(true);
  });
});

describe('AlertSystem', () => {
  test('adds and fires alert rule', async () => {
    const sys = new AlertSystem();
    sys.addRule({ id: 'r1', name: 'Test Rule', type: 'mention', keywords: ['fraud'], severity: 'warning' });
    const alerts = await sys.process({ type: 'mention', content: 'There is fraud happening here', subject_id: null });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('warning');
  });

  test('does not fire when keyword not in content', async () => {
    const sys = new AlertSystem();
    sys.addRule({ id: 'r2', name: 'Fraud Rule', type: 'mention', keywords: ['fraud'] });
    const alerts = await sys.process({ type: 'mention', content: 'Everything is fine', subject_id: null });
    expect(alerts).toHaveLength(0);
  });

  test('acknowledges alert', async () => {
    const sys = new AlertSystem();
    sys.addRule({ id: 'r3', name: 'All mentions', type: 'mention', keywords: [] });
    const alerts = await sys.process({ type: 'mention', content: 'test', subject_id: null });
    const ack = sys.acknowledge(alerts[0].id);
    expect(ack.acknowledged).toBe(true);
  });

  test('getStats returns counts', async () => {
    const sys = new AlertSystem();
    sys.addRule({ id: 'r4', name: 'Rule', type: 'mention', keywords: ['test'] });
    await sys.process({ type: 'mention', content: 'test content' });
    const stats = sys.getStats();
    expect(stats.total).toBeGreaterThan(0);
  });
});

describe('MLSentiment - keywordFallback', () => {
  test('detects very positive sentiment', () => {
    const result = keywordSentiment('This is the most amazing, outstanding product ever!');
    expect(['positive', 'very_positive']).toContain(result.label);
    expect(result.score).toBeGreaterThan(0);
  });

  test('detects very negative sentiment', () => {
    const result = keywordSentiment('Terrible awful fraud scam horrible disaster');
    expect(['negative', 'very_negative']).toContain(result.label);
    expect(result.score).toBeLessThan(0);
  });

  test('detects neutral', () => {
    const result = keywordSentiment('The product arrived in a box');
    expect(result.label).toBe('neutral');
  });
});

describe('MLSentiment - analyze async', () => {
  test('falls back to keyword when Ollama unavailable', async () => {
    const result = await analyze('Great product!', { force_keyword: true });
    expect(result.method).toBe('keyword_fallback');
    expect(result.label).toBeDefined();
  });
});

describe('MLSentiment - aggregate', () => {
  test('computes aggregate stats', () => {
    const results = [
      { label: 'positive', score: 0.5 },
      { label: 'positive', score: 0.7 },
      { label: 'negative', score: -0.5 },
    ];
    const agg = aggregate(results);
    expect(agg.dominant_label).toBe('positive');
    expect(typeof agg.avg_score).toBe('number');
  });
});

describe('CaseManager', () => {
  test('creates a case', () => {
    const mgr = getCaseManager();
    const c = mgr.create({ title: 'Case 1', subject_name: 'Target Corp' });
    expect(c.id).toMatch(/^case_/);
    expect(c.status).toBe('new');
  });

  test('updates status', () => {
    const mgr = getCaseManager();
    const c = mgr.create({ title: 'Case 2' });
    mgr.updateStatus(c.id, 'active');
    expect(mgr.get(c.id).status).toBe('active');
  });

  test('adds notes', () => {
    const mgr = getCaseManager();
    const c = mgr.create({ title: 'Case 3' });
    mgr.addNote(c.id, { content: 'Important note', author: 'analyst' });
    expect(mgr.get(c.id).notes).toHaveLength(1);
  });
});

describe('EvidenceChain', () => {
  test('creates a chain', () => {
    const chain = createChain({ claim: 'Product was defective on 2024-01-01' });
    expect(chain.id).toMatch(/^ec_/);
    expect(chain.items).toHaveLength(0);
  });

  test('adds items with chain linking', () => {
    const chain = createChain({ claim: 'Test claim' });
    chain.addItem({ content: 'First evidence', source: 'email', confidence: 0.8 });
    chain.addItem({ content: 'Second evidence', source: 'document', confidence: 0.9 });
    expect(chain.items).toHaveLength(2);
    expect(chain.items[1].prev_hash).toBe(chain.items[0].hash);
  });

  test('verifies intact chain', () => {
    const chain = createChain({ claim: 'Test' });
    chain.addItem({ content: 'E1', source: 's1' });
    chain.addItem({ content: 'E2', source: 's2' });
    const result = chain.verify();
    expect(result.valid).toBe(true);
    expect(result.status).toBe('verified');
  });

  test('detects tampered chain', () => {
    const chain = createChain({ claim: 'Test' });
    chain.addItem({ content: 'Original', source: 's1' });
    chain.items[0].content = 'Tampered!';
    const result = chain.verify();
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('computes chain strength', () => {
    const chain = createChain({ claim: 'Strength test' });
    chain.addItem({ content: 'E1', source: 'source1', confidence: 0.9 });
    chain.addItem({ content: 'E2', source: 'source2', confidence: 0.8 });
    const strength = chain.getStrength();
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeLessThanOrEqual(100);
  });
});
