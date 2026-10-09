'use strict';

/**
 * prompt_memory.test.js — Gen B Batch-C integration tests
 *
 * Covers:
 *   PromptVersioning, DynamicPromptEngine, DirectAnswerFirst,
 *   MultiTurnMemory, EntityTracker, GoalStateMonitor,
 *   PriorityQueue, TimeAwareness
 *
 * Run: npx jest api/test/integration/prompt_memory.test.js
 */

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { PromptVersioning } = require('../../server/services/CognitiveBehavior/PromptVersioning');
const { DynamicPromptEngine } = require('../../server/services/CognitiveBehavior/DynamicPromptEngine');
const { DirectAnswerFirst } = require('../../server/services/CognitiveBehavior/DirectAnswerFirst');
const { MultiTurnMemory } = require('../../server/services/CognitiveBehavior/MultiTurnMemory');
const { EntityTracker } = require('../../server/services/CognitiveBehavior/EntityTracker');
const { GoalStateMonitor } = require('../../server/services/CognitiveBehavior/GoalStateMonitor');
const { PriorityQueue } = require('../../server/services/CognitiveBehavior/PriorityQueue');
const { TimeAwareness } = require('../../server/services/CognitiveBehavior/TimeAwareness');

// ─── PromptVersioning ─────────────────────────────────────────────────────────

describe('PromptVersioning', () => {
  let pv;
  beforeEach(() => { pv = new PromptVersioning(); });

  test('save creates version 1 for a new prompt', () => {
    const r = pv.save('p1', 'Hello world');
    expect(r.version).toBe(1);
    expect(r.promptId).toBe('p1');
    expect(r.versionId).toMatch(/^[0-9a-f]{16}$/);
  });

  test('save increments version on subsequent saves', () => {
    pv.save('p1', 'First version');
    const r = pv.save('p1', 'Second version');
    expect(r.version).toBe(2);
  });

  test('getLatest returns the most recent version', () => {
    pv.save('p2', 'v1 text');
    pv.save('p2', 'v2 text');
    const latest = pv.getLatest('p2');
    expect(latest.promptText).toBe('v2 text');
    expect(latest.version).toBe(2);
  });

  test('getHistory returns all saved versions', () => {
    pv.save('p3', 'alpha');
    pv.save('p3', 'beta');
    pv.save('p3', 'gamma');
    const hist = pv.getHistory('p3');
    expect(hist).toHaveLength(3);
    expect(hist[0].promptText).toBe('alpha');
  });

  test('diff detects added and removed lines', () => {
    const r1 = pv.save('p4', 'line one\nline two');
    const r2 = pv.save('p4', 'line one\nline three');
    const d = pv.diff(r1.versionId, r2.versionId);
    expect(d.changed).toBe(true);
    expect(d.added).toContain('line three');
    expect(d.removed).toContain('line two');
  });

  test('rollback creates a new version with the old text', () => {
    const r1 = pv.save('p5', 'original text');
    pv.save('p5', 'modified text');
    pv.rollback('p5', r1.versionId);
    const latest = pv.getLatest('p5');
    expect(latest.promptText).toBe('original text');
    expect(latest.version).toBe(3);
  });

  test('getLatest returns null for unknown promptId', () => {
    expect(pv.getLatest('unknown')).toBeNull();
  });

  test('getStats increments correctly', () => {
    pv.save('s1', 'text');
    pv.save('s1', 'text2');
    pv.save('s2', 'other');
    const stats = pv.getStats();
    expect(stats.totalPrompts).toBe(2);
    expect(stats.totalVersions).toBe(3);
  });
});

// ─── DynamicPromptEngine ──────────────────────────────────────────────────────

describe('DynamicPromptEngine', () => {
  let engine;
  beforeEach(() => { engine = new DynamicPromptEngine(); });

  test('registerTemplate and render basic placeholder', () => {
    engine.registerTemplate('greet', 'Hello, {{name}}!', ['name']);
    const out = engine.render('greet', { name: 'Alice' });
    expect(out).toBe('Hello, Alice!');
  });

  test('render returns error string for missing template', () => {
    const out = engine.render('no_such_template', {});
    expect(out).toContain('not found');
  });

  test('renderInline substitutes variables without registration', () => {
    const out = engine.renderInline('The answer is {{answer}}.', { answer: '42' });
    expect(out).toBe('The answer is 42.');
  });

  test('conditional {{#if}} block is included when var is truthy', () => {
    const tpl = 'Line 1.{{#if extra}} Extra: {{extra}}.{{/if}}';
    expect(engine.renderInline(tpl, { extra: 'yes' })).toContain('Extra: yes');
    expect(engine.renderInline(tpl, {})).not.toContain('Extra');
  });

  test('getBuiltinTemplates returns 6 entries', () => {
    const builtins = engine.getBuiltinTemplates();
    expect(builtins.length).toBe(6);
    const ids = builtins.map((b) => b.id);
    expect(ids).toContain('code_review');
    expect(ids).toContain('explain_concept');
    expect(ids).toContain('debug_error');
    expect(ids).toContain('research_summary');
    expect(ids).toContain('task_decomposition');
    expect(ids).toContain('critique');
  });

  test('builtin code_review renders with language and code', () => {
    const out = engine.render('code_review', { language: 'JavaScript', code: 'const x = 1;' });
    expect(out).toContain('JavaScript');
    expect(out).toContain('const x = 1;');
  });

  test('getStats counts renders', () => {
    engine.render('code_review', { language: 'js', code: 'x' });
    engine.renderInline('{{a}}', { a: '1' });
    const s = engine.getStats();
    expect(s.renders).toBe(1);
    expect(s.inlineRenders).toBe(1);
  });
});

// ─── DirectAnswerFirst ────────────────────────────────────────────────────────

describe('DirectAnswerFirst', () => {
  let daf;
  beforeEach(() => { daf = new DirectAnswerFirst(); });

  test('isLeadingWithAnswer returns true for direct factual opener', () => {
    expect(daf.isLeadingWithAnswer('The capital of France is Paris.')).toBe(true);
  });

  test('isLeadingWithAnswer returns false for filler opener', () => {
    expect(daf.isLeadingWithAnswer('Great question! The answer is Paris.')).toBe(false);
  });

  test('analyze returns hasDirectAnswer=true for direct response', () => {
    const r = daf.analyze('What is 2+2?', 'The answer is 4.');
    expect(r.hasDirectAnswer).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.suggestion).toBeNull();
  });

  test('analyze returns suggestion for filler opener', () => {
    const r = daf.analyze('What is Node.js?', 'Certainly! Node.js is a runtime. It was built by Ryan Dahl.');
    expect(r.suggestion).toBeTruthy();
  });

  test('enforce returns response unchanged if already leading with answer', () => {
    const response = 'Node.js is a JavaScript runtime. It runs on the V8 engine.';
    expect(daf.enforce(response)).toBe(response);
  });

  test('analyze score is between 0 and 1', () => {
    const r = daf.analyze('test', 'There are many ways to solve this. First you could ...');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  test('getStats tracks analyzed count', () => {
    daf.analyze('q', 'Yes, that is correct.');
    daf.analyze('q', 'There are many ways.');
    expect(daf.getStats().analyzed).toBe(2);
  });
});

// ─── MultiTurnMemory ──────────────────────────────────────────────────────────

describe('MultiTurnMemory', () => {
  let mem;
  beforeEach(() => { mem = new MultiTurnMemory(); });

  test('addTurn adds a turn and returns turnId', () => {
    const r = mem.addTurn('s1', 'user', 'Hello agent');
    expect(r.turnId).toBeDefined();
    expect(r.totalTurns).toBe(1);
  });

  test('getContext returns all turns for session', () => {
    mem.addTurn('s2', 'user', 'First message');
    mem.addTurn('s2', 'assistant', 'First reply');
    const ctx = mem.getContext('s2');
    expect(ctx.turns).toHaveLength(2);
    expect(ctx.turns[0].role).toBe('user');
  });

  test('getContext returns empty for unknown session', () => {
    const ctx = mem.getContext('unknown');
    expect(ctx.turns).toHaveLength(0);
  });

  test('summarize returns a non-empty string', () => {
    mem.addTurn('s3', 'user', 'What is machine learning?');
    mem.addTurn('s3', 'assistant', 'Machine learning is a subset of AI.');
    const summary = mem.summarize('s3');
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  test('getRelevant returns turns matching query', () => {
    mem.addTurn('s4', 'user', 'Tell me about Node.js');
    mem.addTurn('s4', 'user', 'What is Python used for?');
    mem.addTurn('s4', 'user', 'Back to Node.js, how does event loop work?');
    const relevant = mem.getRelevant('s4', 'Node.js', 2);
    expect(relevant.length).toBeGreaterThan(0);
    expect(relevant[0].content).toMatch(/Node/i);
  });

  test('getStats tracks totalTurns', () => {
    mem.addTurn('sx', 'user', 'a');
    mem.addTurn('sx', 'assistant', 'b');
    expect(mem.getStats().totalTurns).toBe(2);
  });
});

// ─── EntityTracker ────────────────────────────────────────────────────────────

describe('EntityTracker', () => {
  let et;
  beforeEach(() => { et = new EntityTracker(); });

  test('extract finds URLs from text', () => {
    const { entities } = et.extract('s1', 'Visit https://example.com for details');
    const urls = entities.filter((e) => e.type === 'URL');
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0].name).toContain('https://example.com');
  });

  test('extract finds file names', () => {
    const { entities } = et.extract('s2', 'Edit the file server.js to fix the bug');
    const files = entities.filter((e) => e.type === 'FILE');
    expect(files.length).toBeGreaterThan(0);
  });

  test('update creates entity if not found', () => {
    const r = et.update('s3', 'MyFunction', { description: 'a helper' });
    expect(r.name).toBe('MyFunction');
    expect(r.attributes.description).toBe('a helper');
  });

  test('getEntities returns all entities for session', () => {
    et.extract('s4', 'Check app.js and utils.js');
    const all = et.getEntities('s4');
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test('getEntities filters by type', () => {
    et.extract('s5', 'Visit https://foo.com and edit main.py');
    const urls = et.getEntities('s5', 'URL');
    expect(urls.every((e) => e.type === 'URL')).toBe(true);
  });

  test('resolve returns best entity for "it"', () => {
    et.extract('s6', 'Working on index.js to fix the route');
    const resolved = et.resolve('s6', 'it');
    expect(typeof resolved).toBe('string');
    expect(resolved.length).toBeGreaterThan(0);
  });

  test('getStats increments after extraction', () => {
    et.extract('sx', 'Check https://test.com');
    expect(et.getStats().totalExtracted).toBeGreaterThan(0);
  });
});

// ─── GoalStateMonitor ─────────────────────────────────────────────────────────

describe('GoalStateMonitor', () => {
  let gsm;
  beforeEach(() => { gsm = new GoalStateMonitor(); });

  test('setGoal returns goalId and status active', () => {
    const r = gsm.setGoal('s1', 'Deploy application', ['Build', 'Test', 'Ship']);
    expect(r.goalId).toBeDefined();
    expect(r.status).toBe('active');
    expect(r.subGoals).toHaveLength(3);
  });

  test('updateProgress marks sub-goal done and computes progress', () => {
    const { goalId } = gsm.setGoal('s2', 'Build feature', ['Design', 'Implement', 'Review']);
    const r = gsm.updateProgress('s2', goalId, 'Design', 'approved');
    expect(r.progress).toBeCloseTo(1 / 3, 1);
    expect(r.complete).toBe(false);
  });

  test('updateProgress marks goal complete when all sub-goals done', () => {
    const { goalId } = gsm.setGoal('s3', 'Simple goal', ['A', 'B']);
    gsm.updateProgress('s3', goalId, 'A', 'done');
    const r = gsm.updateProgress('s3', goalId, 'B', 'done');
    expect(r.complete).toBe(true);
    expect(r.progress).toBe(1);
  });

  test('getGoalState returns all goals and overall progress', () => {
    gsm.setGoal('s4', 'Goal 1', ['X']);
    gsm.setGoal('s4', 'Goal 2', ['Y']);
    const state = gsm.getGoalState('s4');
    expect(state.goals).toHaveLength(2);
    expect(state.overallProgress).toBeGreaterThanOrEqual(0);
  });

  test('isGoalMet returns false for incomplete goal', () => {
    const { goalId } = gsm.setGoal('s5', 'Incomplete', ['Step 1']);
    expect(gsm.isGoalMet('s5', goalId)).toBe(false);
  });

  test('isGoalMet returns true after completion', () => {
    const { goalId } = gsm.setGoal('s6', 'Done goal', ['Only step']);
    gsm.updateProgress('s6', goalId, 'Only step', 'evidence');
    expect(gsm.isGoalMet('s6', goalId)).toBe(true);
  });

  test('getStats counts goals', () => {
    gsm.setGoal('sx', 'G1', []);
    gsm.setGoal('sx', 'G2', []);
    expect(gsm.getStats().totalGoals).toBe(2);
  });
});

// ─── PriorityQueue ────────────────────────────────────────────────────────────

describe('PriorityQueue', () => {
  let pq;
  beforeEach(() => { pq = new PriorityQueue(); });

  test('enqueue returns taskId and position', () => {
    const r = pq.enqueue({ name: 'Task A' }, 5);
    expect(r.taskId).toBeDefined();
    expect(r.position).toBe(0);
  });

  test('dequeue returns highest priority task', () => {
    pq.enqueue('low', 2);
    pq.enqueue('high', 9);
    pq.enqueue('mid', 5);
    const top = pq.dequeue();
    expect(top.priority).toBe(9);
  });

  test('peek does not remove the task', () => {
    pq.enqueue('only task', 7);
    pq.peek();
    expect(pq.dequeue()).not.toBeNull();
  });

  test('update changes priority and affects dequeue order', () => {
    const r1 = pq.enqueue('task1', 3);
    const r2 = pq.enqueue('task2', 2);
    pq.update(r2.taskId, 10);
    const top = pq.dequeue();
    expect(top.taskId).toBe(r2.taskId);
  });

  test('list returns all pending tasks', () => {
    pq.enqueue('t1', 5);
    pq.enqueue('t2', 8);
    pq.enqueue('t3', 3);
    const tasks = pq.list();
    expect(tasks).toHaveLength(3);
    // Should be sorted highest first
    expect(tasks[0].priority).toBeGreaterThanOrEqual(tasks[1].priority);
  });

  test('list with filter narrows results', () => {
    pq.enqueue('low', 2);
    pq.enqueue('high', 9);
    const filtered = pq.list({ minPriority: 5 });
    expect(filtered.every((t) => t.effectivePriority >= 5)).toBe(true);
  });

  test('getStats tracks enqueue and dequeue counts', () => {
    pq.enqueue('a', 5);
    pq.enqueue('b', 3);
    pq.dequeue();
    const s = pq.getStats();
    expect(s.enqueued).toBe(2);
    expect(s.dequeued).toBe(1);
  });
});

// ─── TimeAwareness ────────────────────────────────────────────────────────────

describe('TimeAwareness', () => {
  let ta;
  beforeEach(() => { ta = new TimeAwareness(); });

  test('parse extracts ISO dates', () => {
    const r = ta.parse('The deadline is 2025-03-15 for the release.');
    expect(r.dates.length).toBeGreaterThan(0);
    expect(r.dates[0]).toBeInstanceOf(Date);
  });

  test('parse extracts durations', () => {
    const r = ta.parse('This will take 3 days and 2 hours.');
    expect(r.durations).toContain('3 days');
    expect(r.durations).toContain('2 hours');
  });

  test('isUrgent detects ASAP', () => {
    expect(ta.isUrgent('Please fix this ASAP')).toBe(true);
  });

  test('isUrgent returns false for non-urgent text', () => {
    expect(ta.isUrgent('When you have time, review this PR')).toBe(false);
  });

  test('toAbsolute converts "tomorrow" to a future Date', () => {
    const d = ta.toAbsolute('tomorrow');
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBeGreaterThan(Date.now());
  });

  test('toAbsolute converts "in 5 days"', () => {
    const d = ta.toAbsolute('in 5 days');
    expect(d).toBeInstanceOf(Date);
    const diffDays = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(4);
    expect(diffDays).toBeLessThan(6);
  });

  test('remaining returns isOverdue=false for future date', () => {
    const future = new Date(Date.now() + 3600 * 1000);
    const r = ta.remaining(future);
    expect(r.isOverdue).toBe(false);
    expect(r.ms).toBeGreaterThan(0);
  });

  test('remaining returns isOverdue=true for past date', () => {
    const past = new Date(Date.now() - 3600 * 1000);
    const r = ta.remaining(past);
    expect(r.isOverdue).toBe(true);
  });

  test('getContext returns current date info', () => {
    const ctx = ta.getContext();
    expect(ctx.now).toBeDefined();
    expect(ctx.dayOfWeek).toBeDefined();
    expect(typeof ctx.unixMs).toBe('number');
  });

  test('getStats increments parsed count', () => {
    ta.parse('Meeting at 2025-01-01');
    ta.parse('Due in 2 days');
    expect(ta.getStats().parsed).toBe(2);
  });
});
