'use strict';

jest.useFakeTimers();

const { LearningEngine } = require('../LearningEngine');

describe('LearningEngine.scheduleRetraining — Face 15', () => {
  let engine;

  beforeEach(() => {
    engine = new LearningEngine();
  });

  afterEach(() => {
    engine.stopRetraining();
    jest.clearAllTimers();
  });

  test('scheduleRetraining() returns { scheduled: true }', () => {
    const result = engine.scheduleRetraining(60_000, 5);
    expect(result.scheduled).toBe(true);
    expect(result.intervalMs).toBe(60_000);
    expect(result.thresholdExperiences).toBe(5);
  });

  test('calling scheduleRetraining() twice returns { scheduled: false }', () => {
    engine.scheduleRetraining(60_000);
    const second = engine.scheduleRetraining(60_000);
    expect(second.scheduled).toBe(false);
  });

  test('stopRetraining() stops the timer', () => {
    engine.scheduleRetraining(60_000);
    const result = engine.stopRetraining();
    expect(result.stopped).toBe(true);
    expect(engine._retrainingTimer).toBeNull();
  });

  test('stopRetraining() when not running returns { stopped: false }', () => {
    const result = engine.stopRetraining();
    expect(result.stopped).toBe(false);
  });

  test('scheduleRetraining() sets _retrainingThreshold on instance', () => {
    engine.scheduleRetraining(60_000, 25);
    expect(engine._retrainingThreshold).toBe(25);
  });

  test('_checkAndRetrain() is a function', () => {
    expect(typeof engine._checkAndRetrain).toBe('function');
  });
});
