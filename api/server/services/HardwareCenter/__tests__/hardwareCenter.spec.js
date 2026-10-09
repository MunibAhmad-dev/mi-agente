'use strict';

const { HardwareRequirementsCenter, TIERS } = require('../HardwareRequirementsCenter');

describe('HardwareRequirementsCenter', () => {
  let center;
  beforeEach(() => { center = new HardwareRequirementsCenter(); });

  test('returns specs for known model', () => {
    const specs = center.getSpecs('llama3.2:8b');
    expect(specs.vram_gb).toBe(6);
    expect(specs.tier).toBe('standard');
  });

  test('infers specs for unknown model with size hint', () => {
    const specs = center.getSpecs('custom-model:70b');
    expect(specs.tier).toBe('heavy');
    expect(specs.vram_gb).toBeGreaterThanOrEqual(40);
  });

  test('adds custom model specs', () => {
    center.addSpecs('my-model:3b', { vram_gb: 2, ram_gb: 8, disk_gb: 2, cpu_cores: 4, tier: 'light' });
    expect(center.getSpecs('my-model:3b').tier).toBe('light');
  });

  test('listAll returns all models', () => {
    const all = center.listAll();
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((m) => m.model_id && m.tier)).toBe(true);
  });

  test('getByTier filters correctly', () => {
    const heavy = center.getByTier('heavy');
    expect(heavy.every((m) => m.tier === 'heavy')).toBe(true);
    expect(heavy.some((m) => m.model_id.includes('70b'))).toBe(true);
  });

  test('checkViability passes with sufficient hardware', () => {
    center.setSystem({ vram_gb: 8, ram_gb: 32, cpu_cores: 16, has_gpu: true, disk_free_gb: 100 });
    const result = center.checkViability('llama3.2:8b');
    expect(result.viable).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  test('checkViability flags insufficient RAM', () => {
    center.setSystem({ vram_gb: 2, ram_gb: 4, cpu_cores: 4, has_gpu: false, disk_free_gb: 100 });
    const result = center.checkViability('llama3.2:8b');
    expect(result.viable).toBe(false);
    expect(result.issues.some((i) => i.includes('RAM'))).toBe(true);
  });

  test('checkViability flags missing GPU when required', () => {
    center.setSystem({ vram_gb: 0, ram_gb: 64, cpu_cores: 16, has_gpu: false, disk_free_gb: 100 });
    const result = center.checkViability('llama3.2:70b');
    expect(result.viable).toBe(false);
    expect(result.issues.some((i) => i.includes('GPU'))).toBe(true);
  });

  test('rankByViability returns sorted list', () => {
    center.setSystem({ vram_gb: 4, ram_gb: 16, cpu_cores: 8, has_gpu: false, disk_free_gb: 50 });
    const ranked = center.rankByViability();
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  test('returns null viable without system set', () => {
    const result = center.checkViability('llama3.2:8b');
    expect(result.viable).toBeNull();
  });
});
