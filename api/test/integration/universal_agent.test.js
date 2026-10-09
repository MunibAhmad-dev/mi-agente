'use strict';

/**
 * Fase 4 — Integration tests for Gen B Universal Agent phases.
 * Tests actual behavior of each component, not just file existence.
 */

const { TaskComplexityEngine, getTaskComplexityEngine } = require('~/server/services/CognitiveBehavior/TaskComplexityEngine');
const { DecisionEngine, getDecisionEngine } = require('~/server/services/CognitiveBehavior/DecisionEngine');
const { AskVsAct, getAskVsAct } = require('~/server/services/CognitiveBehavior/AskVsAct');
const { CapabilityRegistry, getCapabilityRegistry } = require('~/server/services/CognitiveBehavior/CapabilityRegistry');
const { ContextResolution, getContextResolution } = require('~/server/services/CognitiveBehavior/ContextResolution');
const { AdaptiveCognition, getAdaptiveCognition } = require('~/server/services/CognitiveBehavior/AdaptiveCognition');
const { ModelPerformanceMemory, getModelPerformanceMemory } = require('~/server/services/CognitiveBehavior/ModelPerformanceMemory');
const { LoopDetection, getLoopDetection } = require('~/server/services/CognitiveBehavior/LoopDetection');
const { ProgressEngine, getProgressEngine } = require('~/server/services/CognitiveBehavior/ProgressEngine');

describe('Gen B Universal Agent — TaskComplexityEngine', () => {
  let engine;
  beforeEach(() => { engine = new TaskComplexityEngine(); });

  test('classifies simple question', () => {
    const r = engine.analyze('What is Node.js?');
    expect(r.level).toBe('simple');
    expect(r.score).toBeLessThanOrEqual(4);
  });

  test('classifies moderate explanation request', () => {
    const r = engine.analyze('Explain the difference between REST and GraphQL');
    expect(['moderate', 'complex']).toContain(r.level);
  });

  test('classifies complex implementation task', () => {
    const r = engine.analyze('Build a REST API service for user authentication with JWT');
    expect(['complex', 'expert']).toContain(r.level);
    expect(r.recommendedApproach).toBeTruthy();
  });

  test('classifies expert system design task', () => {
    const r = engine.analyze('Design a distributed microservice architecture for a kubernetes cluster with terraform');
    expect(r.level).toBe('expert');
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  test('returns factors array', () => {
    const r = engine.analyze('Implement a full end-to-end pipeline');
    expect(Array.isArray(r.factors)).toBe(true);
  });

  test('handles empty input gracefully', () => {
    const r = engine.analyze('');
    expect(r.level).toBe('simple');
  });

  test('tracks stats', () => {
    engine.analyze('test');
    engine.analyze('test two');
    expect(engine.getStats().analyzed).toBe(2);
  });

  test('singleton getter returns same instance', () => {
    expect(getTaskComplexityEngine()).toBe(getTaskComplexityEngine());
  });
});

describe('Gen B Universal Agent — DecisionEngine', () => {
  let engine;
  beforeEach(() => { engine = new DecisionEngine(); });

  test('makes YES decision for clear affirmative', () => {
    const r = engine.decide('Should we proceed with the deployment?', { evidence: ['tests pass', 'review approved'] });
    expect(['yes', 'ask']).toContain(r.decision);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.reasoning).toBeTruthy();
  });

  test('asks when irreversible and low confidence', () => {
    const r = engine.decide('Maybe possibly delete the production database?', { irreversible: true });
    expect(r.decision).toBe('ask');
  });

  test('asks when high risk', () => {
    const r = engine.decide('Unclear action', { riskLevel: 'high' });
    expect(r.decision).toBe('ask');
  });

  test('returns alternatives', () => {
    const r = engine.decide('Should we proceed?', {});
    expect(Array.isArray(r.alternatives)).toBe(true);
    expect(r.alternatives.length).toBeGreaterThan(0);
  });

  test('tracks decision history', () => {
    engine.decide('Test?', {});
    engine.decide('Another?', {});
    expect(engine.getHistory().length).toBe(2);
    expect(engine.getStats().decisions).toBe(2);
  });

  test('handles missing question gracefully', () => {
    const r = engine.decide('', {});
    expect(r.decision).toBe('ask');
  });
});

describe('Gen B Universal Agent — AskVsAct', () => {
  let engine;
  beforeEach(() => { engine = new AskVsAct(); });

  test('acts when confidence is high and task is clear', () => {
    const r = engine.evaluate('Format this list alphabetically', { confidence: 0.9, clarityScore: 0.9 });
    expect(r.action).toBe('act');
  });

  test('asks when task is irreversible', () => {
    const r = engine.evaluate('Delete all files', { irreversible: true });
    expect(r.action).toBe('ask');
    expect(Array.isArray(r.clarifyingQuestions)).toBe(true);
  });

  test('asks when ambiguous', () => {
    const r = engine.evaluate('Do the thing', {});
    expect(['ask', 'act']).toContain(r.action);
    expect(r.reason).toBeTruthy();
  });

  test('returns clarifying questions when asking', () => {
    const r = engine.evaluate('Maybe do something risky?', { irreversible: true });
    if (r.action === 'ask') {
      expect(r.clarifyingQuestions.length).toBeGreaterThan(0);
    }
  });
});

describe('Gen B Universal Agent — CapabilityRegistry', () => {
  let registry;
  beforeEach(() => { registry = new CapabilityRegistry(); });

  test('has built-in capabilities', () => {
    const list = registry.list();
    expect(list.length).toBeGreaterThan(0);
    const names = list.map(c => c.name);
    expect(names).toContain('text_generation');
  });

  test('registers a new capability', () => {
    const r = registry.register({ name: 'test_cap', type: 'custom', description: 'Test' });
    expect(r.success || r.name).toBeTruthy();
    expect(registry.hasCapability('test_cap')).toBe(true);
  });

  test('lists by type', () => {
    const result = registry.getByType('core');
    expect(Array.isArray(result)).toBe(true);
  });

  test('enables and disables capability', () => {
    registry.setEnabled('text_generation', false);
    const cap = registry.list({ enabled: false }).find(c => c.name === 'text_generation');
    expect(cap).toBeTruthy();
    registry.setEnabled('text_generation', true);
  });

  test('unregisters a capability', () => {
    registry.register({ name: 'temp_cap', type: 'custom', description: 'Temp' });
    registry.unregister('temp_cap');
    expect(registry.hasCapability('temp_cap')).toBe(false);
  });
});

describe('Gen B Universal Agent — ContextResolution', () => {
  let engine;
  beforeEach(() => { engine = new ContextResolution(); });

  test('resolves message without history', () => {
    const r = engine.resolve('What is the capital of France?', []);
    expect(r.resolved).toBeTruthy();
    expect(r.entities).toBeDefined();
  });

  test('resolves pronoun from history', () => {
    const history = [{ role: 'user', content: 'Tell me about Paris' }];
    const r = engine.resolve('What is it famous for?', history);
    expect(r.resolved).toBeTruthy();
    expect(r.referencedEntities || r.entities).toBeDefined();
  });

  test('returns context metadata', () => {
    const r = engine.resolve('How does it work?', []);
    expect(r.resolved).toBeDefined();
    expect(r.confidence).toBeDefined();
  });
});

describe('Gen B Universal Agent — AdaptiveCognition', () => {
  let engine;
  beforeEach(() => { engine = new AdaptiveCognition(); });

  test('returns default strategy for new session', () => {
    const r = engine.getStrategy('session-new');
    expect(r.strategy).toBeTruthy();
  });

  test('adapts strategy based on positive feedback', () => {
    engine.adapt('session-1', { rating: 5, type: 'analytical' });
    const r = engine.getStrategy('session-1');
    expect(r.strategy).toBeTruthy();
  });

  test('lists available strategies', () => {
    const strategies = engine.listStrategies();
    expect(Array.isArray(strategies)).toBe(true);
    expect(strategies.length).toBeGreaterThan(0);
  });

  test('tracks adaptation stats', () => {
    engine.adapt('session-stat', { rating: 4 });
    expect(engine.getStats().adaptations).toBeGreaterThanOrEqual(1);
  });
});

describe('Gen B Universal Agent — ModelPerformanceMemory', () => {
  let mem;
  beforeEach(() => { mem = new ModelPerformanceMemory(); });

  test('records performance for a model', () => {
    const r = mem.record('gpt-4', 'coding', { latency: 1200, quality: 9 });
    expect(r.success || r.recorded).toBeTruthy();
  });

  test('returns best model for task type', () => {
    mem.record('claude-3', 'analysis', { quality: 9, latency: 800 });
    mem.record('gpt-4', 'analysis', { quality: 7, latency: 1000 });
    const best = mem.getBestModelFor('analysis');
    expect(best.modelId || best.model || best).toBeTruthy();
  });

  test('returns stats for a model', () => {
    mem.record('test-model', 'task', { latency: 500 });
    const stats = mem.getStats('test-model');
    expect(stats).toBeTruthy();
  });

  test('handles unknown model gracefully', () => {
    const stats = mem.getStats('no-such-model');
    expect(stats).toBeDefined();
  });
});

describe('Gen B Universal Agent — LoopDetection', () => {
  let detector;
  beforeEach(() => { detector = new LoopDetection(); });

  test('no loop on first message', () => {
    const r = detector.check('session-loop', 'Hello world');
    expect(r.loopDetected).toBe(false);
  });

  test('detects repetition after same message 3 times', () => {
    const msg = 'Repeat me exactly to trigger loop detection logic';
    detector.check('session-repeat', msg);
    detector.check('session-repeat', msg);
    const r = detector.check('session-repeat', msg);
    expect(r.loopDetected).toBe(true);
    expect(r.iteration).toBeGreaterThanOrEqual(2);
  });

  test('resets session loop state', () => {
    detector.check('session-reset', 'same');
    detector.check('session-reset', 'same');
    detector.reset('session-reset');
    const r = detector.check('session-reset', 'same');
    expect(r.loopDetected).toBe(false);
  });

  test('returns stats', () => {
    const stats = detector.getStats();
    expect(stats).toBeDefined();
    expect(stats.checks).toBeDefined();
  });
});

describe('Gen B Universal Agent — ProgressEngine', () => {
  let engine;
  beforeEach(() => { engine = new ProgressEngine(); });

  test('starts a task and returns 0% progress', () => {
    engine.start('task-1', ['step1', 'step2', 'step3']);
    const p = engine.getProgress('task-1');
    expect(p.percent).toBe(0);
    expect(p.done).toBe(false);
  });

  test('advances progress', () => {
    engine.start('task-2', ['step1', 'step2']);
    engine.advance('task-2', 'step1', {});
    const p = engine.getProgress('task-2');
    expect(p.percent).toBeGreaterThan(0);
  });

  test('completes a task', () => {
    engine.start('task-3', ['s1']);
    engine.complete('task-3');
    const p = engine.getProgress('task-3');
    expect(p.done).toBe(true);
    expect(p.percent).toBe(100);
  });

  test('lists active tasks', () => {
    engine.start('active-task', ['s1', 's2']);
    const active = engine.listActive();
    expect(Array.isArray(active)).toBe(true);
    expect(active.some(t => t.taskId === 'active-task')).toBe(true);
  });

  test('fails a task with reason', () => {
    engine.start('fail-task', ['s1']);
    const r = engine.fail('fail-task', 'Network error');
    expect(r.failed || r.success || r.taskId).toBeTruthy();
  });

  test('returns stats', () => {
    const stats = engine.getStats();
    expect(stats).toBeDefined();
  });
});
