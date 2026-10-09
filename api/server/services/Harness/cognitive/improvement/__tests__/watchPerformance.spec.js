'use strict';

jest.useFakeTimers();

const { SelfImprovementEngine } = require('../SelfImprovementEngine');

describe('SelfImprovementEngine.watchPerformance — Face 16', () => {
  let engine;

  beforeEach(() => {
    engine = new SelfImprovementEngine({});
  });

  afterEach(() => {
    engine.stopWatchingPerformance();
    jest.clearAllTimers();
  });

  test('watchPerformance() returns { watching: true }', () => {
    const result = engine.watchPerformance(60_000, 0.7);
    expect(result.watching).toBe(true);
    expect(result.checkIntervalMs).toBe(60_000);
    expect(result.qualityThreshold).toBe(0.7);
  });

  test('calling watchPerformance() twice returns { watching: false }', () => {
    engine.watchPerformance(60_000);
    const second = engine.watchPerformance(60_000);
    expect(second.watching).toBe(false);
  });

  test('stopWatchingPerformance() clears the timer', () => {
    engine.watchPerformance(60_000);
    const result = engine.stopWatchingPerformance();
    expect(result.stopped).toBe(true);
    expect(engine._watchTimer).toBeNull();
  });

  test('stopWatchingPerformance() when not watching returns { stopped: false }', () => {
    expect(engine.stopWatchingPerformance().stopped).toBe(false);
  });

  test('getStats() reports watchingPerformance correctly', () => {
    expect(engine.getStats().watchingPerformance).toBe(false);
    engine.watchPerformance(60_000);
    expect(engine.getStats().watchingPerformance).toBe(true);
  });

  test('_performanceCheck() is a function', () => {
    expect(typeof engine._performanceCheck).toBe('function');
  });
});
