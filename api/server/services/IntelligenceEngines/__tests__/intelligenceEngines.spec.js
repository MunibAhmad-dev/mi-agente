'use strict';

const { createTimeline, getTimeline, listTimelines } = require('../TimelineEngine');
const { create: createInv, get: getInv, list: listInv } = require('../InvestigationEngine');
const { create: createDossier, get: getDossier, findByName } = require('../DossierEngine');
const { getSourceCatalog } = require('../SourceCatalog');

describe('TimelineEngine', () => {
  test('creates a timeline', () => {
    const tl = createTimeline();
    expect(tl.id).toMatch(/^tl_/);
    expect(tl.events).toEqual([]);
  });

  test('adds events sorted by timestamp', () => {
    const tl = createTimeline();
    tl.addEvent({ title: 'Event B', timestamp: '2024-02-01', source: 'news' });
    tl.addEvent({ title: 'Event A', timestamp: '2024-01-01', source: 'news' });
    expect(tl.events[0].title).toBe('Event A');
    expect(tl.events[1].title).toBe('Event B');
  });

  test('getRange returns events in window', () => {
    const tl = createTimeline();
    tl.addEvent({ title: 'Jan', timestamp: '2024-01-15' });
    tl.addEvent({ title: 'Mar', timestamp: '2024-03-15' });
    const range = tl.getRange('2024-01-01', '2024-02-01');
    expect(range).toHaveLength(1);
    expect(range[0].title).toBe('Jan');
  });

  test('getSummary reports correct stats', () => {
    const tl = createTimeline();
    tl.addEvent({ title: 'E1', timestamp: '2024-01-01', confidence: 0.8 });
    tl.addEvent({ title: 'E2', timestamp: '2024-06-01', confidence: 0.6 });
    const summary = tl.getSummary();
    expect(summary.event_count).toBe(2);
    expect(summary.avg_confidence).toBeCloseTo(0.7);
  });
});

describe('InvestigationEngine', () => {
  test('creates an investigation', () => {
    const inv = createInv({ title: 'Test Case', hypothesis: 'Subject is guilty' });
    expect(inv.id).toMatch(/^inv_/);
    expect(inv.status).toBe('open');
  });

  test('adds steps and evidence', () => {
    const inv = createInv({ title: 'Test' });
    inv.addStep({ title: 'Gather sources', type: 'research' });
    inv.addEvidence({ content: 'Document A', source: 'archive', confidence: 0.7 });
    expect(inv.steps).toHaveLength(1);
    expect(inv.evidence).toHaveLength(1);
  });

  test('sets verdict', () => {
    const inv = createInv({ title: 'Test' });
    inv.setVerdict({ conclusion: 'Confirmed', confidence: 0.9, reasoning: 'Evidence supports claim' });
    expect(inv.verdict.conclusion).toBe('Confirmed');
    expect(inv.status).toBe('closed');
  });

  test('getEvidenceSummary counts correctly', () => {
    const inv = createInv({ title: 'Test' });
    inv.addEvidence({ content: 'A', supports_hypothesis: true });
    inv.addEvidence({ content: 'B', supports_hypothesis: false });
    inv.addEvidence({ content: 'C', supports_hypothesis: null });
    const summary = inv.getEvidenceSummary();
    expect(summary.supporting).toBe(1);
    expect(summary.contradicting).toBe(1);
    expect(summary.neutral).toBe(1);
  });
});

describe('DossierEngine', () => {
  test('creates a dossier', () => {
    const d = createDossier({ type: 'person', name: 'Alice Smith' });
    expect(d.id).toMatch(/^dossier_/);
    expect(d.type).toBe('person');
  });

  test('adds attributes', () => {
    const d = createDossier({ type: 'person', name: 'Bob Jones' });
    d.setAttribute('occupation', 'Engineer', 'linkedin', 0.9);
    expect(d.attributes.occupation.value).toBe('Engineer');
    expect(d.confidence_score).toBeGreaterThan(0);
  });

  test('adds relationship', () => {
    const d = createDossier({ type: 'person', name: 'Carol' });
    d.addRelationship({ target_id: 'person_2', target_name: 'Dave', relationship_type: 'colleague' });
    expect(d.relationships).toHaveLength(1);
  });

  test('findByName works', () => {
    createDossier({ type: 'organization', name: 'Acme Corp' });
    const results = findByName('acme');
    expect(results.some((d) => d.name === 'Acme Corp')).toBe(true);
  });
});

describe('SourceCatalog', () => {
  test('adds and retrieves a source', () => {
    const catalog = getSourceCatalog();
    const src = catalog.add({ name: 'Reuters', url: 'https://reuters.com', type: 'news', reliability: 0.9 });
    expect(src.id).toBeTruthy();
    expect(catalog.get(src.id).name).toBe('Reuters');
  });

  test('findByDomain works', () => {
    const catalog = getSourceCatalog();
    catalog.add({ name: 'Nature', type: 'academic', domains: ['science', 'biology'], reliability: 0.95 });
    const results = catalog.findByDomain('science');
    expect(results.some((s) => s.name === 'Nature')).toBe(true);
  });

  test('getReliable filters by threshold', () => {
    const catalog = getSourceCatalog();
    catalog.add({ name: 'LowQuality', type: 'web', reliability: 0.2 });
    const reliable = catalog.getReliable(0.7);
    expect(reliable.every((s) => s.reliability >= 0.7)).toBe(true);
  });
});
