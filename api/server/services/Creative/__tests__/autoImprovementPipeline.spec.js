'use strict';

const { AutoImprovementPipeline, QUALITY_METRICS } = require('../AutoImprovementPipeline');

describe('AutoImprovementPipeline', () => {
  test('QUALITY_METRICS has expected keys', () => {
    expect(Object.keys(QUALITY_METRICS)).toContain('sharpness');
    expect(Object.keys(QUALITY_METRICS)).toContain('coherence');
    expect(Object.keys(QUALITY_METRICS)).toContain('prompt_adherence');
    expect(Object.keys(QUALITY_METRICS)).toContain('aesthetic_score');
  });

  test('run throws if no generatorFn', async () => {
    const pipeline = new AutoImprovementPipeline();
    await expect(pipeline.run({ params: {} })).rejects.toThrow('generatorFn is required');
  });

  test('run calls generatorFn and returns run result', async () => {
    const pipeline = new AutoImprovementPipeline({ maxIterations: 2, targetScore: 0.99 });
    let callCount = 0;
    const generatorFn = async () => { callCount++; return 'generated output'; };
    const run = await pipeline.run({ params: { steps: 20 }, generatorFn });
    expect(run.id).toMatch(/^pipeline_/);
    expect(run.iterations.length).toBeGreaterThan(0);
    expect(callCount).toBeGreaterThan(0);
    expect(run.best_score).toBeGreaterThanOrEqual(0);
  });

  test('run converges when targetScore is reached', async () => {
    const pipeline = new AutoImprovementPipeline({ maxIterations: 5, targetScore: 0.1 });
    const evaluatorFn = async () => ({ sharpness: 1.0, coherence: 1.0, prompt_adherence: 1.0, aesthetic_score: 1.0 });
    const run = await pipeline.run({
      params: {},
      generatorFn: async () => 'perfect output',
      evaluatorFn,
    });
    // With target 0.1 and score=1.0, should converge on first iteration
    expect(run.converged).toBe(true);
    expect(run.iterations.length).toBe(1);
  });

  test('listRuns returns history', async () => {
    const pipeline = new AutoImprovementPipeline({ maxIterations: 1 });
    await pipeline.run({ generatorFn: async () => 'x' });
    expect(pipeline.listRuns().length).toBe(1);
  });

  test('run emits iteration_start and complete events', async () => {
    const pipeline = new AutoImprovementPipeline({ maxIterations: 2, targetScore: 0.99 });
    const events = [];
    pipeline.on('iteration_start', (e) => events.push('start'));
    pipeline.on('complete', (e) => events.push('complete'));
    await pipeline.run({ generatorFn: async () => 'result' });
    expect(events).toContain('start');
    expect(events).toContain('complete');
  });

  test('params get adjusted on low score', async () => {
    const pipeline = new AutoImprovementPipeline({ maxIterations: 2, targetScore: 0.99 });
    const evaluatorFn = async () => ({ sharpness: 0.1, coherence: 0.1, prompt_adherence: 0.1, aesthetic_score: 0.1 });
    const capturedParams = [];
    await pipeline.run({
      params: { steps: 20, cfg_scale: 7 },
      generatorFn: async (p) => { capturedParams.push({ ...p }); return 'low quality'; },
      evaluatorFn,
    });
    // Second iteration should have higher steps
    if (capturedParams.length >= 2) {
      expect(capturedParams[1].steps).toBeGreaterThan(capturedParams[0].steps);
    }
  });
});
