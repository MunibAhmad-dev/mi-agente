'use strict';

const { ChaosRunner, CHAOS_TYPES } = require('../ChaosRunner');

describe('ChaosRunner', () => {
  let runner;
  beforeEach(() => { runner = new ChaosRunner(); });

  test('listTypes returns all chaos types', () => {
    const types = runner.listTypes();
    expect(types.length).toBe(Object.keys(CHAOS_TYPES).length);
    expect(types.every((t) => t.id && t.description)).toBe(true);
  });

  test('run throws for unknown type', async () => {
    await expect(runner.run({ type: 'invalid' })).rejects.toThrow('Unknown chaos type');
  });

  test('run latency_injection completes', async () => {
    const exp = await runner.run({ type: 'latency_injection', duration_ms: 100, params: { delay_ms: 50 } });
    expect(exp.status).toBe('completed');
    expect(exp.result.injected_delay_ms).toBe(50);
    expect(exp.observations.length).toBeGreaterThan(0);
  }, 5000);

  test('run cpu_spike completes', async () => {
    const exp = await runner.run({ type: 'cpu_spike', duration_ms: 100 });
    expect(exp.status).toBe('completed');
    expect(exp.result.iterations).toBeGreaterThan(0);
  }, 5000);

  test('run error_injection completes', async () => {
    const exp = await runner.run({ type: 'error_injection', duration_ms: 50, target: { module: 'test' } });
    expect(exp.status).toBe('completed');
    expect(exp.result.injected).toBe(true);
  }, 5000);

  test('list returns experiments', async () => {
    await runner.run({ type: 'cpu_spike', duration_ms: 50 });
    const experiments = runner.list();
    expect(experiments.length).toBe(1);
  }, 5000);

  test('list filters by status', async () => {
    await runner.run({ type: 'cpu_spike', duration_ms: 50 });
    const completed = runner.list({ status: 'completed' });
    expect(completed.length).toBe(1);
    const failed = runner.list({ status: 'failed' });
    expect(failed.length).toBe(0);
  }, 5000);

  test('emits start and end events', async () => {
    const events = [];
    runner.on('start', () => events.push('start'));
    runner.on('end', () => events.push('end'));
    await runner.run({ type: 'cpu_spike', duration_ms: 50 });
    expect(events).toContain('start');
    expect(events).toContain('end');
  }, 5000);
});
