/**
 * FASE 2 — IntegrationFacade tests.
 */

// Mock all heavy dependencies
jest.mock('../../AgentArchitect/modelRouter', () => ({
  fetchOllamaModels: jest.fn().mockResolvedValue([]),
  buildModelRegistryFromOllama: jest.fn().mockReturnValue({ models: new Map(), findByCapabilities: () => [] }),
  routeModelForAgent: jest.fn().mockReturnValue({ chosen: null, alternatives: [] }),
}));

jest.mock('../../AgentEngine/AgentEngine', () => ({
  AgentEngine: jest.fn().mockImplementation(() => ({
    selectAgent: jest.fn().mockReturnValue({ id: 'researcher', capabilities: ['reasoning'] }),
    listAgents: jest.fn().mockReturnValue([{ id: 'researcher' }]),
  })),
}));

const facade = require('../index');

describe('IntegrationFacade', () => {
  beforeEach(() => {
    facade._reset();
  });

  test('boots without throwing', async () => {
    const result = await facade.boot();
    expect(result.booted).toBe(true);
  });

  test('boot is idempotent', async () => {
    await facade.boot();
    const second = await facade.boot();
    expect(second.already).toBe(true);
  });

  test('health returns booted status after boot', async () => {
    await facade.boot();
    const h = await facade.health();
    expect(h.booted).toBe(true);
    expect(h.subsystems).toBeDefined();
    expect(h.subsystems.modelRouter).toBeDefined();
    expect(h.subsystems.agentMemory).toBe('ok');
  });

  test('remember and recall work', async () => {
    await facade.boot();
    facade.remember({
      layer: 'session',
      content: 'user prefers concise answers',
      userId: 'u1',
    });
    const entries = facade.recall({ query: 'concise', userId: 'u1' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].content).toContain('concise');
  });

  test('route returns context and subsystem status', async () => {
    await facade.boot();
    const result = await facade.route({ task: 'research AI models', userId: 'u1' });
    expect(result.context).toBeDefined();
    expect(result.subsystems).toBeDefined();
    expect(result.context.task).toBe('research AI models');
  });

  test('all required subsystem keys present in status', async () => {
    await facade.boot();
    const h = await facade.health();
    const required = ['modelRouter', 'modelCatalog', 'agentMemory', 'agentEngine', 'harness', 'executiveLoop'];
    for (const key of required) {
      expect(h.subsystems).toHaveProperty(key);
    }
  });
});
