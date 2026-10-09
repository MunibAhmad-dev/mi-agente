/**
 * Face 16 — SelfImprovementEngine tests.
 */

const { SelfImprovementEngine } = require('../SelfImprovementEngine');

describe('SelfImprovementEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new SelfImprovementEngine({});
  });

  test('propose creates a proposal with status proposed', async () => {
    const prop = await engine.propose({
      description: 'Improve response latency by 20%',
      type: 'performance',
      target: 'ExecutiveLoop',
      expectedImpact: 'high',
    });
    expect(prop.id).toMatch(/^prop_/);
    expect(prop.status).toBe('proposed');
    expect(prop.description).toBe('Improve response latency by 20%');
    expect(prop.type).toBe('performance');
    expect(prop.target).toBe('ExecutiveLoop');
  });

  test('sandbox transitions proposal to sandboxed', async () => {
    const { id } = await engine.propose({ description: 'Add caching layer', type: 'improvement' });
    const result = await engine.sandbox(id);
    expect(result).not.toBeNull();
    expect(result.proposal.status).toBe('sandboxed');
    expect(result.sandboxResult).toBe('passed');
  });

  test('sandbox returns null for unknown proposal', async () => {
    const result = await engine.sandbox('nonexistent_id');
    expect(result).toBeNull();
  });

  test('benchmark returns before/after metrics', async () => {
    const { id } = await engine.propose({ description: 'Optimize query path' });
    const result = await engine.benchmark(id);
    expect(result).not.toBeNull();
    expect(result.metrics).toHaveProperty('before');
    expect(result.metrics).toHaveProperty('after');
    expect(result.metrics).toHaveProperty('improvement');
  });

  test('approve transitions proposal to approved', async () => {
    const { id } = await engine.propose({ description: 'Refactor agent router' });
    await engine.sandbox(id);
    const result = await engine.approve(id);
    expect(result.status).toBe('approved');
  });

  test('deploy transitions proposal to deployed and adds version', async () => {
    const { id } = await engine.propose({ description: 'Add retry logic' });
    await engine.sandbox(id);
    await engine.approve(id);
    const result = await engine.deploy(id);
    expect(result.status).toBe('deployed');
    expect(engine.versions.length).toBe(1);
  });

  test('rollback returns rolledBack true for valid version', async () => {
    const { id } = await engine.propose({ description: 'Swap model router' });
    await engine.sandbox(id);
    await engine.approve(id);
    await engine.deploy(id);
    const result = await engine.rollback(id);
    expect(result).not.toBeNull();
    expect(result.rolledBack).toBe(true);
  });

  test('rollback returns null for unknown version', async () => {
    const result = await engine.rollback('unknown_version_xyz');
    expect(result).toBeNull();
  });

  test('getStats tracks all counters', async () => {
    await engine.propose({ description: 'Proposal A' });
    const { id } = await engine.propose({ description: 'Proposal B' });
    await engine.sandbox(id);
    await engine.approve(id);
    await engine.deploy(id);

    const stats = engine.getStats();
    expect(stats.proposed).toBe(2);
    expect(stats.sandboxed).toBe(1);
    expect(stats.approved).toBe(1);
    expect(stats.deployed).toBe(1);
    expect(stats.proposals).toBe(2);
    expect(stats.versions).toBe(1);
  });

  test('proposals Map is accessible', async () => {
    await engine.propose({ description: 'Track this' });
    expect(engine.proposals.size).toBe(1);
  });
});
