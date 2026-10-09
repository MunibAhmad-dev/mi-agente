'use strict';

const { ContradictionEngine } = require('../ContradictionEngine');

describe('ContradictionEngine', () => {
  let engine;
  beforeEach(() => { engine = new ContradictionEngine(); });

  test('detects direct contradiction same subject/predicate', () => {
    const claims = [
      { id: 'c1', subject: 'Alice', predicate: 'location', object: 'Paris', timestamp: '2024-01-01T10:00:00Z' },
      { id: 'c2', subject: 'Alice', predicate: 'location', object: 'Tokyo', timestamp: '2024-01-01T11:00:00Z' },
    ];
    const result = engine.analyse(claims);
    expect(result.length).toBeGreaterThan(0);
    expect(['TEMPORAL', 'DIRECT']).toContain(result[0].type);
  });

  test('does not flag non-contradicting claims', () => {
    const claims = [
      { id: 'c1', subject: 'Alice', predicate: 'occupation', object: 'Engineer' },
      { id: 'c2', subject: 'Bob', predicate: 'occupation', object: 'Designer' },
    ];
    const result = engine.analyse(claims);
    expect(result.length).toBe(0);
  });

  test('detects negation pattern', () => {
    const claims = [
      { id: 'n1', subject: 'Project', predicate: 'status', object: 'active' },
      { id: 'n2', subject: 'Project', predicate: 'status', object: 'not active' },
    ];
    const result = engine.analyse(claims);
    expect(result.some((c) => c.type === 'NEGATION')).toBe(true);
  });

  test('getAll returns stored contradictions', () => {
    const claims = [
      { id: 'c1', subject: 'X', predicate: 'loc', object: 'A', timestamp: '2024-01-01T10:00:00Z' },
      { id: 'c2', subject: 'X', predicate: 'loc', object: 'B', timestamp: '2024-01-01T10:30:00Z' },
    ];
    engine.analyse(claims);
    const all = engine.getAll();
    expect(all.length).toBeGreaterThan(0);
  });

  test('clear removes all stored contradictions', () => {
    const claims = [
      { id: 'c1', subject: 'Y', predicate: 'state', object: 'on', timestamp: '2024-01-01T10:00:00Z' },
      { id: 'c2', subject: 'Y', predicate: 'state', object: 'off', timestamp: '2024-01-01T10:00:00Z' },
    ];
    engine.analyse(claims);
    engine.clear();
    expect(engine.getAll().length).toBe(0);
  });

  test('crossCheckEvidence detects contradiction in evidence items', () => {
    const evidence = [
      { id: 'e1', subject: 'Alice', type: 'location', value: 'Rome', timestamp: '2024-06-01T09:00:00Z', confidence: 0.9 },
      { id: 'e2', subject: 'Alice', type: 'location', value: 'Madrid', timestamp: '2024-06-01T09:30:00Z', confidence: 0.8 },
    ];
    const result = engine.crossCheckEvidence(evidence);
    expect(result.length).toBeGreaterThan(0);
  });
});
