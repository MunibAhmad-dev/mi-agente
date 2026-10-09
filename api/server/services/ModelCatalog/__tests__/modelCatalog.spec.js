/**
 * FASE 4 — ModelCatalog tests.
 */

const catalog = require('../index');

// Mock fetchOllamaModels to avoid real network calls in tests
jest.mock('../../AgentArchitect/modelRouter', () => ({
  fetchOllamaModels: jest.fn().mockResolvedValue([
    { name: 'qwen3:latest', size: 4500000000, details: { parameter_size: '7B', context_length: 32768 } },
    { name: 'deepseek-r1:7b', size: 4200000000, details: { parameter_size: '7B' } },
  ]),
  capabilitiesForOllamaModel: jest.fn((name) =>
    name.includes('qwen') ? ['chat', 'code'] : ['reasoning', 'code'],
  ),
}));

describe('ModelCatalog', () => {
  test('discover returns local + cloud models', async () => {
    const models = await catalog.discover();
    expect(models.length).toBeGreaterThan(2);
    const sources = new Set(models.map((m) => m.source));
    expect(sources.has('local-ollama')).toBe(true);
    expect(sources.has('static-catalog')).toBe(true);
  });

  test('local models have zero cost', async () => {
    const models = await catalog.discover();
    const local = models.filter((m) => m.source === 'local-ollama');
    for (const m of local) {
      expect(m.costPer1K.input).toBe(0);
      expect(m.costPer1K.output).toBe(0);
    }
  });

  test('all models have licenseStatus field', async () => {
    const models = await catalog.discover();
    for (const m of models) {
      expect(m).toHaveProperty('licenseStatus');
      expect(['SAFE_TO_INTEGRATE', 'REVIEW_REQUIRED', 'INCOMPATIBLE', 'UNKNOWN']).toContain(m.licenseStatus);
    }
  });

  test('getModel returns null for unknown model', async () => {
    const result = await catalog.getModel('nonexistent_model_xyz');
    expect(result).toBeNull();
  });

  test('getModel finds a model in static catalog', async () => {
    const result = await catalog.getModel('gpt-4o');
    expect(result).not.toBeNull();
    expect(result.provider).toBe('openai');
  });

  test('licenseStatus classifies correctly', () => {
    expect(catalog.licenseStatus('mit')).toBe('SAFE_TO_INTEGRATE');
    expect(catalog.licenseStatus('apache-2.0')).toBe('SAFE_TO_INTEGRATE');
    expect(catalog.licenseStatus('agpl-3.0')).toBe('REVIEW_REQUIRED');
    expect(catalog.licenseStatus('cc-by-nc')).toBe('INCOMPATIBLE');
    expect(catalog.licenseStatus('unknown')).toBe('UNKNOWN');
  });
});
