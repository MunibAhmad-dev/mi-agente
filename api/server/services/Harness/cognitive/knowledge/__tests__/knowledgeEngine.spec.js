'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

// Disable MongoDB dependency
jest.mock('~/models/MemoryCollections', () => ({ ProjectMemory: null }), { virtual: true });

const { KnowledgeEngine } = require('../KnowledgeEngine');

describe('KnowledgeEngine — in-memory operations', () => {
  let engine;

  beforeEach(() => {
    engine = new KnowledgeEngine({});
  });

  test('addEntity stores entity and returns it with id', async () => {
    const e = await engine.addEntity({ type: 'concept', content: 'machine learning', name: 'ML' });
    expect(e.id).toBeTruthy();
    expect(engine.entities.has(e.id)).toBe(true);
    expect(e.content).toBe('machine learning');
  });

  test('addRelation stores a relation', async () => {
    const a = await engine.addEntity({ name: 'A', content: 'first' });
    const b = await engine.addEntity({ name: 'B', content: 'second' });
    const rel = await engine.addRelation({ subject: a.id, predicate: 'related_to', object: b.id });
    expect(engine.relations).toHaveLength(1);
    expect(rel.subject).toBe(a.id);
  });

  test('query finds entities by keyword', async () => {
    await engine.addEntity({ name: 'NLP', content: 'natural language processing', type: 'field' });
    await engine.addEntity({ name: 'CV', content: 'computer vision', type: 'field' });
    const results = await engine.query('natural language');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toBe('natural language processing');
  });

  test('getStats returns correct counts', async () => {
    await engine.addEntity({ name: 'X', content: 'x' });
    await engine.addEntity({ name: 'Y', content: 'y' });
    const stats = engine.getStats();
    expect(stats.entities).toBe(2);
  });

  test('updateEntity modifies existing entity', async () => {
    const e = await engine.addEntity({ name: 'Old', content: 'old content' });
    const updated = await engine.updateEntity(e.id, { content: 'new content' });
    expect(updated.content).toBe('new content');
    expect(updated.versions.length).toBeGreaterThanOrEqual(2);
  });

  test('getRelations returns relations for an entity', async () => {
    const a = await engine.addEntity({ name: 'A', content: 'a' });
    const b = await engine.addEntity({ name: 'B', content: 'b' });
    await engine.addRelation({ subject: a.id, predicate: 'causes', object: b.id });
    const rels = engine.getRelations(a.id);
    expect(rels).toHaveLength(1);
    expect(rels[0].predicate).toBe('causes');
  });
});

describe('KnowledgeEngine — disk JSON persistence fallback', () => {
  const userId = `test_user_${Date.now()}`;
  const projectId = 'test_proj';
  const diskDir = path.join(process.cwd(), 'data', 'knowledge_graphs');
  const diskFile = path.join(diskDir, `${userId}_${projectId}.json`);

  afterAll(() => {
    try { fs.unlinkSync(diskFile); } catch {}
  });

  test('persist() writes a JSON snapshot to disk when userId is set', async () => {
    const engine = new KnowledgeEngine({ userId, projectId });
    await engine.addEntity({ name: 'Test', content: 'disk persistence test' });
    await engine.persist();
    expect(fs.existsSync(diskFile)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(diskFile, 'utf8'));
    expect(raw.entities.length).toBe(1);
    expect(raw.savedAt).toBeTruthy();
  });

  test('restore() loads graph from disk when MongoDB is unavailable', async () => {
    const restored = await KnowledgeEngine.restore(userId, projectId);
    expect(restored.entities.size).toBe(1);
    const first = [...restored.entities.values()][0];
    expect(first.content).toBe('disk persistence test');
  });

  test('persist() is no-op when userId is not set', async () => {
    const engine = new KnowledgeEngine({});
    await engine.addEntity({ name: 'X', content: 'x' });
    await expect(engine.persist()).resolves.toBeUndefined();
  });
});
