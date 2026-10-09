'use strict';

const { SkillVersionManager } = require('../SkillVersionManager');
const { ExternalSkillRegistry, REGISTRY_TYPES } = require('../ExternalSkillRegistry');

describe('SkillVersionManager (Face 15)', () => {
  let mgr;
  beforeEach(() => { mgr = new SkillVersionManager(); });

  test('publish creates first version 1.0.0', () => {
    const entry = mgr.publish('skill-a', { name: 'Skill A', run: 'echo' });
    expect(entry.version).toBe('1.0.0');
    expect(entry.is_current).toBe(true);
  });

  test('publish auto-increments patch version', () => {
    mgr.publish('skill-a', { name: 'v1' });
    const v2 = mgr.publish('skill-a', { name: 'v2' });
    expect(v2.version).toBe('1.0.1');
  });

  test('rollback restores previous version', () => {
    mgr.publish('skill-a', { name: 'v1' });
    mgr.publish('skill-a', { name: 'v2' });
    const result = mgr.rollback('skill-a', '1.0.0');
    expect(result.rolled_back_to).toBe('1.0.0');
    expect(mgr.getCurrentVersion('skill-a').version).toBe('1.0.0');
  });

  test('getHistory returns versions newest first', () => {
    mgr.publish('skill-a', { name: 'v1' });
    mgr.publish('skill-a', { name: 'v2' }, 'auto', 'minor');
    const history = mgr.getHistory('skill-a');
    expect(history.length).toBe(2);
  });

  test('deleteVersion removes non-current version', () => {
    mgr.publish('skill-a', { name: 'v1' });
    mgr.publish('skill-a', { name: 'v2' });
    mgr.deleteVersion('skill-a', '1.0.0');
    expect(mgr.getHistory('skill-a').length).toBe(1);
  });

  test('listSkills returns summary', () => {
    mgr.publish('skill-x', { name: 'X' });
    mgr.publish('skill-y', { name: 'Y' });
    const list = mgr.listSkills();
    expect(list.length).toBe(2);
    expect(list.every((s) => s.skillId && s.current_version)).toBe(true);
  });
});

describe('ExternalSkillRegistry (Face 15)', () => {
  test('REGISTRY_TYPES has npm, http, github', () => {
    expect(REGISTRY_TYPES).toContain('npm');
    expect(REGISTRY_TYPES).toContain('http');
    expect(REGISTRY_TYPES).toContain('github');
  });

  test('search returns array (no network — http type with no url)', async () => {
    const reg = new ExternalSkillRegistry({ type: 'http', url: null });
    const results = await reg.search('test');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  test('throws on invalid registry type', () => {
    expect(() => new ExternalSkillRegistry({ type: 'invalid' })).toThrow();
  });
});
