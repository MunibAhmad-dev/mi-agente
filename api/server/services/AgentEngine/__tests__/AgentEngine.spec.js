/**
 * FASE 6 — AgentEngine tests.
 */

const { AgentEngine, AGENT_REGISTRY, AGENT_BY_ID } = require('../AgentEngine');

describe('AgentEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new AgentEngine();
  });

  test('has all 18 specialist agents', () => {
    expect(AGENT_REGISTRY).toHaveLength(18);
  });

  test('every agent has required fields', () => {
    for (const agent of AGENT_REGISTRY) {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('role');
      expect(Array.isArray(agent.capabilities)).toBe(true);
      expect(Array.isArray(agent.triggers)).toBe(true);
      expect(typeof agent.canDelegate).toBe('boolean');
      expect(typeof agent.constitution).toBe('string');
      expect(agent.constitution.length).toBeGreaterThan(10);
    }
  });

  test('listAgents returns 18 items', () => {
    expect(engine.listAgents()).toHaveLength(18);
  });

  test('getAgent returns correct spec', () => {
    const agent = engine.getAgent('coder');
    expect(agent).not.toBeNull();
    expect(agent.name).toBe('Coder');
  });

  test('getAgent returns null for unknown id', () => {
    expect(engine.getAgent('unknown_xyz')).toBeNull();
  });

  test('selectAgent picks researcher for research task', () => {
    const agent = engine.selectAgent('please research the latest AI models');
    expect(agent.id).toBe('researcher');
  });

  test('selectAgent picks coder for code task', () => {
    const agent = engine.selectAgent('write a function to parse JSON');
    expect(agent.id).toBe('coder');
  });

  test('selectAgent picks debugger for bug task', () => {
    const agent = engine.selectAgent('the app crashes with an error');
    expect(agent.id).toBe('debugger');
  });

  test('selectAgent picks critic for critique task', () => {
    const agent = engine.selectAgent('critique this design');
    expect(agent.id).toBe('critic');
  });

  test('selectAgent falls back to executor for unknown task', () => {
    const agent = engine.selectAgent('xyzzy frobnicator quux');
    expect(agent.id).toBe('executor');
  });

  test('spawn returns correct session stub', async () => {
    const result = await engine.spawn('planner', { task: 'plan the project', userId: 'u1' });
    expect(result.agentId).toBe('planner');
    expect(result.status).toBe('spawned');
    expect(result.task).toBe('plan the project');
  });

  test('spawn throws for unknown agent', async () => {
    await expect(engine.spawn('ghost_agent', {})).rejects.toThrow('Unknown agent');
  });

  test('all agent ids are unique', () => {
    const ids = AGENT_REGISTRY.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('delegate returns delegation metadata and spawn result', async () => {
    const result = await engine.delegate('planner', 'researcher', 'Research competitor pricing', { userId: 'u1' });
    expect(result.delegation.from.id).toBe('planner');
    expect(result.delegation.to.id).toBe('researcher');
    expect(result.delegation.task).toBe('Research competitor pricing');
    expect(result.result.agentId).toBe('researcher');
    expect(result.result.status).toBe('spawned');
  });

  test('delegate throws when source agent cannot delegate', async () => {
    await expect(engine.delegate('coder', 'researcher', 'do something')).rejects.toThrow('canDelegate=false');
  });

  test('delegate throws for unknown source agent', async () => {
    await expect(engine.delegate('ghost', 'researcher', 'task')).rejects.toThrow('Unknown agent');
  });

  test('delegate throws for unknown target agent', async () => {
    await expect(engine.delegate('planner', 'ghost', 'task')).rejects.toThrow('Unknown agent');
  });
});
