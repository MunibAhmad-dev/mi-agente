'use strict';

const { createTimeline } = require('../TimelineEngine');
const { create: createInv } = require('../InvestigationEngine');
const { create: createDossier } = require('../DossierEngine');
const { getSourceCatalog } = require('../SourceCatalog');
const { ContradictionEngine } = require('../ContradictionEngine');

describe('IntelligenceEngines — unified pipeline (Face 7)', () => {
  test('can create a timeline and add events', () => {
    const tl = createTimeline('tl_test');
    const ev = tl.addEvent({ title: 'Test event', source: 'unit_test', confidence: 0.8 });
    expect(ev.title).toBe('Test event');
    expect(tl.export().events).toHaveLength(1);
  });

  test('can create an investigation', () => {
    const inv = createInv({ subject: 'Test subject', description: 'Test' });
    expect(inv.toJSON().subject).toBe('Test subject');
  });

  test('can create a dossier', () => {
    const dossier = createDossier({ name: 'John Doe', type: 'person' });
    expect(dossier.name).toBe('John Doe');
  });

  test('SourceCatalog returns list', () => {
    const catalog = getSourceCatalog();
    expect(Array.isArray(catalog.list())).toBe(true);
  });

  test('ContradictionEngine.analyse returns array', () => {
    const engine = new ContradictionEngine();
    const claims = [
      { text: 'The sky is blue', source: 'A', timestamp: new Date().toISOString() },
      { text: 'The sky is green', source: 'B', timestamp: new Date().toISOString() },
    ];
    const result = engine.analyse(claims);
    expect(Array.isArray(result)).toBe(true);
  });

  test('full pipeline orchestration produces all sections', () => {
    const topic = 'pipeline_test_subject';
    const inv = createInv({ subject: topic, description: `Automated pipeline investigation: ${topic}` });
    const tl = createTimeline();
    tl.addEvent({ title: 'Evidence A', source: 'test', confidence: 0.7 });
    const dossier = createDossier({ name: topic, type: 'person' });
    const contradictions = new ContradictionEngine().analyse([{ text: topic, source: 'input', timestamp: new Date().toISOString() }]);
    const sources = getSourceCatalog().list();

    expect(inv.toJSON().subject).toBe(topic);
    expect(tl.export().events).toHaveLength(1);
    expect(dossier.name).toBe(topic);
    expect(Array.isArray(contradictions)).toBe(true);
    expect(Array.isArray(sources)).toBe(true);
  });
});
