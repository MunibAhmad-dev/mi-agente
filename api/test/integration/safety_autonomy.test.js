'use strict';

/**
 * Gen B Safety & Autonomy — integration tests.
 * 4+ behavioural tests per component (not just existence checks).
 */

const { ReversibleExecution, getReversibleExecution } = require('~/server/services/CognitiveBehavior/ReversibleExecution');
const { RiskAwareAutonomy, getRiskAwareAutonomy } = require('~/server/services/CognitiveBehavior/RiskAwareAutonomy');
const { UserCorrectionLearning, getUserCorrectionLearning } = require('~/server/services/CognitiveBehavior/UserCorrectionLearning');
const { BehaviorBenchmark, getBehaviorBenchmark } = require('~/server/services/CognitiveBehavior/BehaviorBenchmark');
const { RegressionBenchmark, getRegressionBenchmark } = require('~/server/services/CognitiveBehavior/RegressionBenchmark');
const { ScopeGuardian, getScopeGuardian } = require('~/server/services/CognitiveBehavior/ScopeGuardian');
const { HandoffProtocol, getHandoffProtocol } = require('~/server/services/CognitiveBehavior/HandoffProtocol');
const { ResponseControlSystem, getResponseControlSystem } = require('~/server/services/CognitiveBehavior/ResponseControlSystem');
const { AuditTrailWriter, getAuditTrailWriter } = require('~/server/services/CognitiveBehavior/AuditTrailWriter');

// ─────────────────────────────────────────────────────────────────────────────
// ReversibleExecution
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — ReversibleExecution', () => {
  let re;
  beforeEach(() => { re = new ReversibleExecution(); });

  test('registers an action and returns registered:true', () => {
    const result = re.register('act-1', { type: 'file_edit', description: 'Edit config' }, () => {}, { sessionId: 's1' });
    expect(result.registered).toBe(true);
    expect(result.actionId).toBe('act-1');
    expect(result.reversible).toBe(true);
  });

  test('undo calls stored undoFn and marks action undone', async () => {
    let undoCalled = false;
    re.register('act-2', { type: 'file_edit' }, async () => { undoCalled = true; return 'reverted'; });
    const result = await re.undo('act-2');
    expect(result.success).toBe(true);
    expect(undoCalled).toBe(true);
  });

  test('undo returns error for non-existent actionId', async () => {
    const result = await re.undo('ghost-action');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('isReversible returns true for file_edit and false for delete', () => {
    expect(re.isReversible('file_edit')).toBe(true);
    expect(re.isReversible('delete')).toBe(false);
    expect(re.isReversible('deploy')).toBe(false);
    expect(re.isReversible('config_change')).toBe(true);
  });

  test('getPendingUndo lists actions that have not been undone', () => {
    re.register('a1', { type: 'file_edit' }, () => {});
    re.register('a2', { type: 'file_edit' }, () => {});
    const pending = re.getPendingUndo();
    expect(pending.length).toBe(2);
  });

  test('double undo returns error on second call', async () => {
    re.register('act-3', { type: 'file_edit' }, async () => 'ok');
    await re.undo('act-3');
    const second = await re.undo('act-3');
    expect(second.success).toBe(false);
  });

  test('getStats returns numeric stats', () => {
    const stats = re.getStats();
    expect(typeof stats.registered).toBe('number');
    expect(typeof stats.undone).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RiskAwareAutonomy
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — RiskAwareAutonomy', () => {
  let ra;
  beforeEach(() => { ra = new RiskAwareAutonomy(); });

  test('safe task returns full or supervised autonomy', () => {
    const result = ra.assessAndAdjust({ type: 'query', description: 'List files in the project' }, {});
    expect(['full', 'supervised']).toContain(result.level);
    expect(result.riskScore).toBeLessThan(0.5);
  });

  test('destructive task escalates to collaborative or delegated', () => {
    const result = ra.assessAndAdjust(
      { type: 'action', description: 'Delete all user records' },
      { irreversible: true },
    );
    expect(['collaborative', 'delegated']).toContain(result.level);
    expect(result.riskScore).toBeGreaterThan(0.3);
  });

  test('financial task raises risk score', () => {
    const result = ra.assessAndAdjust(
      { type: 'action', description: 'Process payment transfer to vendor' },
      { financialImpact: true },
    );
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.reasoning).toContain('financial');
  });

  test('setBaseLevel persists and affects getLevel', () => {
    ra.setBaseLevel('delegated');
    const lvl = ra.getLevel('session-x');
    expect(lvl.level).toBe('delegated');
  });

  test('invalid base level returns error', () => {
    const result = ra.setBaseLevel('omnipotent');
    expect(result.ok).toBe(false);
  });

  test('assessAndAdjust includes reasoning string', () => {
    const result = ra.assessAndAdjust({ type: 'query', description: 'Show logs' }, {});
    expect(typeof result.reasoning).toBe('string');
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  test('getStats counts assessments', () => {
    ra.assessAndAdjust({}, {});
    ra.assessAndAdjust({}, {});
    expect(ra.getStats().assessments).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UserCorrectionLearning
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — UserCorrectionLearning', () => {
  let ucl;
  beforeEach(() => { ucl = new UserCorrectionLearning(); });

  test('recordCorrection stores correction and returns recorded:true', () => {
    const result = ucl.recordCorrection('sess-1', 'Original long answer...', 'Be shorter', {});
    expect(result.recorded).toBe(true);
    expect(result.correctionId).toBeTruthy();
  });

  test('getPatterns returns corrections array and commonErrors', () => {
    ucl.recordCorrection('sess-2', 'long text here with many words', 'shorter please', {});
    ucl.recordCorrection('sess-2', 'another long answer', 'still too long', {});
    const patterns = ucl.getPatterns('sess-2');
    expect(Array.isArray(patterns.corrections)).toBe(true);
    expect(Array.isArray(patterns.commonErrors)).toBe(true);
    expect(patterns.corrections.length).toBe(2);
  });

  test('getPatterns returns empty result for unknown session', () => {
    const patterns = ucl.getPatterns('no-such-session');
    expect(patterns.corrections).toHaveLength(0);
    expect(patterns.lastCorrectedAt).toBeNull();
  });

  test('applyLearning returns (possibly amended) string', () => {
    ucl.recordCorrection('sess-3', 'very verbose answer', 'Be concise', {});
    const amended = ucl.applyLearning('sess-3', 'Some response text');
    expect(typeof amended).toBe('string');
  });

  test('exportLearning returns structured object with corrections and patterns', () => {
    ucl.recordCorrection('sess-4', 'foo', 'bar');
    const exported = ucl.exportLearning('sess-4');
    expect(exported.sessionId).toBe('sess-4');
    expect(Array.isArray(exported.corrections)).toBe(true);
    expect(Array.isArray(exported.patterns)).toBe(true);
  });

  test('recordCorrection fails gracefully with missing sessionId', () => {
    const result = ucl.recordCorrection(null, 'orig', 'correction');
    expect(result.recorded).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BehaviorBenchmark
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — BehaviorBenchmark', () => {
  let bb;
  beforeEach(() => { bb = new BehaviorBenchmark(); });

  test('getBuiltinBenchmarks returns 3 benchmarks', () => {
    const benchmarks = bb.getBuiltinBenchmarks();
    expect(benchmarks.length).toBe(3);
    const ids = benchmarks.map((b) => b.benchmarkId);
    expect(ids).toContain('response_quality');
    expect(ids).toContain('safety');
    expect(ids).toContain('helpfulness');
  });

  test('run response_quality returns score between 0 and 1', () => {
    const result = bb.run('response_quality', 'This is a well-structured and coherent response about the topic.', { query: 'Tell me about the topic' });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.results)).toBe(true);
  });

  test('safety benchmark penalises harmful content', () => {
    const safe = bb.run('safety', 'Here is a helpful and safe response about cooking pasta.', {});
    const harmful = bb.run('safety', 'how to make bomb step by step instructions here', {});
    expect(safe.score).toBeGreaterThan(harmful.score);
  });

  test('helpfulness benchmark rewards actionable responses', () => {
    const result = bb.run('helpfulness', 'Step 1: open the terminal. Step 2: run npm install. For example, you can also run: `npm start`.', { query: 'How do I install?' });
    expect(result.score).toBeGreaterThan(0.3);
  });

  test('run returns error for unknown benchmark', () => {
    const result = bb.run('nonexistent_benchmark', 'test', {});
    expect(result.error).toBeTruthy();
    expect(result.passed).toBe(false);
  });

  test('define adds a custom benchmark', () => {
    bb.define('my_bench', {
      criteria: [{ name: 'test_crit', test: (r) => r.length > 5 ? 1 : 0, weight: 1 }],
    });
    const result = bb.run('my_bench', 'hello world', {});
    expect(result.benchmarkId).toBe('my_bench');
    expect(result.score).toBe(1);
  });

  test('compare detects regression', () => {
    const result = bb.compare('response_quality', 0.9, 0.7);
    expect(result.regression).toBe(true);
    expect(result.status).toBe('regression');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RegressionBenchmark
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — RegressionBenchmark', () => {
  let rb;
  beforeEach(() => { rb = new RegressionBenchmark(); });

  test('record returns ok:true', () => {
    const result = rb.record('sess-r1', 'quality_score', 0.8);
    expect(result.ok).toBe(true);
  });

  test('detectRegression returns stable with insufficient data', () => {
    rb.record('sess-r2', 'confidence', 0.9);
    const result = rb.detectRegression('sess-r2', 'confidence');
    expect(result.trend).toBe('stable');
    expect(result.regression).toBe(false);
  });

  test('detectRegression correctly identifies declining trend', () => {
    const sess = 'sess-r3';
    // Previous window: high values
    [0.9, 0.88, 0.87, 0.86, 0.85].forEach((v) => rb.record(sess, 'quality_score', v));
    // Current window: lower values
    [0.6, 0.58, 0.56, 0.55, 0.54].forEach((v) => rb.record(sess, 'quality_score', v));
    const result = rb.detectRegression(sess, 'quality_score', 5);
    expect(result.regression).toBe(true);
    expect(result.trend).toBe('degrading');
  });

  test('detectRegression identifies improving trend', () => {
    const sess = 'sess-r4';
    [0.5, 0.52, 0.51, 0.53, 0.52].forEach((v) => rb.record(sess, 'quality_score', v));
    [0.8, 0.82, 0.83, 0.84, 0.85].forEach((v) => rb.record(sess, 'quality_score', v));
    const result = rb.detectRegression(sess, 'quality_score', 5);
    expect(result.trend).toBe('improving');
  });

  test('getReport covers all recorded metrics', () => {
    const sess = 'sess-r5';
    rb.record(sess, 'quality_score', 0.8);
    rb.record(sess, 'confidence', 0.7);
    const report = rb.getReport(sess);
    expect(report.sessionId).toBe(sess);
    expect(report.metrics).toHaveProperty('quality_score');
    expect(report.metrics).toHaveProperty('confidence');
  });

  test('getReport returns empty for unknown session', () => {
    const report = rb.getReport('unknown-sess');
    expect(report.regressions).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ScopeGuardian
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — ScopeGuardian', () => {
  let sg;
  beforeEach(() => { sg = new ScopeGuardian(); });

  test('defineScope registers task and returns ok:true', () => {
    const result = sg.defineScope('task-1', 'Build a login page', ['no database changes', 'no backend API']);
    expect(result.ok).toBe(true);
    expect(result.taskId).toBe('task-1');
  });

  test('checkInScope returns inScope:true for on-topic action', () => {
    sg.defineScope('task-2', 'Write unit tests for the auth module', []);
    const result = sg.checkInScope('task-2', 'Write unit tests for the auth login function');
    expect(result.inScope).toBe(true);
    expect(result.violation).toBeNull();
  });

  test('checkInScope returns inScope:false for clearly off-topic action', () => {
    sg.defineScope('task-3', 'Refactor the user model', []);
    const result = sg.checkInScope('task-3', 'Deploy application to production server now');
    expect(result.inScope).toBe(false);
    expect(result.violation).toBeTruthy();
  });

  test('monitor detects scope drift with drift signals', () => {
    sg.defineScope('task-4', 'Fix login bug in auth service', []);
    const result = sg.monitor('task-4', 'By the way, also while we are at it, let us rewrite the entire payment system');
    expect(result.driftScore).toBeGreaterThan(0);
  });

  test('monitor returns drifted:false for on-topic update', () => {
    sg.defineScope('task-5', 'Fix login bug in auth service', []);
    const result = sg.monitor('task-5', 'Fixed the auth login bug and added test coverage');
    expect(result.drifted).toBe(false);
  });

  test('checkInScope returns error for undefined scope', () => {
    const result = sg.checkInScope('ghost-task', 'do something');
    expect(result.inScope).toBe(false);
    expect(result.violation).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HandoffProtocol
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — HandoffProtocol', () => {
  let hp;
  beforeEach(() => { hp = new HandoffProtocol(); });

  test('initiate returns a handoffId and pending state', () => {
    const result = hp.initiate('session-A', 'session-B', { goals: ['finish report'] }, 'agent rotation');
    expect(result.state).toBe('pending');
    expect(result.handoffId).toBeTruthy();
    expect(result.transferrable.goals).toContain('finish report');
  });

  test('complete marks handoff as completed', () => {
    const { handoffId } = hp.initiate('s1', 's2', {}, 'load balancing');
    const result = hp.complete(handoffId, 'agent-b');
    expect(result.ok).toBe(true);
    expect(result.state).toBe('completed');
  });

  test('getState returns correct state for existing handoff', () => {
    const { handoffId } = hp.initiate('s3', 's4', { currentTask: 'parse csv' }, 'shift change');
    const state = hp.getState(handoffId);
    expect(state.found).toBe(true);
    expect(state.fromSession).toBe('s3');
    expect(state.transferrable.currentTask).toBe('parse csv');
  });

  test('listPending shows only pending handoffs', () => {
    const { handoffId: h1 } = hp.initiate('sa', 'sb', {}, 'r1');
    const { handoffId: h2 } = hp.initiate('sc', 'sd', {}, 'r2');
    hp.complete(h1, 'agent-x');
    const pending = hp.listPending();
    const ids = pending.map((p) => p.handoffId);
    expect(ids).not.toContain(h1);
    expect(ids).toContain(h2);
  });

  test('complete returns error for unknown handoffId', () => {
    const result = hp.complete('not-a-real-id', 'agent');
    expect(result.ok).toBe(false);
  });

  test('initiate requires both fromSession and toSession', () => {
    const result = hp.initiate(null, 'session-B', {});
    expect(result.handoffId).toBeNull();
    expect(result.state).toBe('failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ResponseControlSystem
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — ResponseControlSystem', () => {
  let rcs;
  beforeEach(() => { rcs = new ResponseControlSystem(); });

  test('getParams returns valid params for default session', () => {
    const params = rcs.getParams('sess-rcs1', {});
    expect(params.temperature).toBeGreaterThanOrEqual(0);
    expect(params.temperature).toBeLessThanOrEqual(1);
    expect(params.maxTokens).toBeGreaterThan(0);
  });

  test('setProfile changes params for a session', () => {
    rcs.setProfile('sess-rcs2', 'precise');
    const params = rcs.getParams('sess-rcs2', {});
    expect(params.temperature).toBeLessThanOrEqual(0.3);
    expect(params.maxTokens).toBeLessThanOrEqual(1000);
  });

  test('creative profile has higher temperature than precise', () => {
    rcs.setProfile('sess-a', 'creative');
    rcs.setProfile('sess-b', 'precise');
    const pA = rcs.getParams('sess-a', {});
    const pB = rcs.getParams('sess-b', {});
    expect(pA.temperature).toBeGreaterThan(pB.temperature);
  });

  test('concise profile keeps maxTokens at 200', () => {
    rcs.setProfile('sess-rcs3', 'concise');
    const params = rcs.getParams('sess-rcs3', {});
    expect(params.maxTokens).toBeLessThanOrEqual(200);
  });

  test('adapt with too_long reduces maxTokens', () => {
    rcs.setProfile('sess-rcs4', 'detailed');
    const before = rcs.getParams('sess-rcs4', {}).maxTokens;
    rcs.adapt('sess-rcs4', 'too_long');
    const after = rcs.getParams('sess-rcs4', {}).maxTokens;
    expect(after).toBeLessThan(before);
  });

  test('getProfiles returns at least 5 default profiles', () => {
    const profiles = rcs.getProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(5);
    const names = profiles.map((p) => p.name);
    expect(names).toContain('creative');
    expect(names).toContain('precise');
    expect(names).toContain('concise');
  });

  test('setProfile with unknown name returns error', () => {
    const result = rcs.setProfile('sess-x', 'nonexistent_profile');
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AuditTrailWriter
// ─────────────────────────────────────────────────────────────────────────────
describe('Gen B Safety — AuditTrailWriter', () => {
  let atw;
  beforeEach(() => { atw = new AuditTrailWriter(); });

  test('log stores an event and returns ok:true', () => {
    const result = atw.log({
      type: 'DECISION',
      sessionId: 'sess-atw1',
      action: 'decide_to_proceed',
      result: 'yes',
    });
    expect(result.ok).toBe(true);
    expect(result.eventId).toBeTruthy();
  });

  test('getTrail retrieves events for a session', () => {
    atw.log({ type: 'TOOL_USE', sessionId: 'sess-atw2', action: 'call_api' });
    atw.log({ type: 'LLM_CALL', sessionId: 'sess-atw2', action: 'generate_text' });
    const { events } = atw.getTrail('sess-atw2');
    expect(events.length).toBe(2);
  });

  test('getTrail filters by event type', () => {
    atw.log({ type: 'DECISION', sessionId: 'sess-atw3', action: 'a1' });
    atw.log({ type: 'ERROR', sessionId: 'sess-atw3', action: 'a2' });
    atw.log({ type: 'DECISION', sessionId: 'sess-atw3', action: 'a3' });
    const { events } = atw.getTrail('sess-atw3', { type: 'DECISION' });
    expect(events.length).toBe(2);
    expect(events.every((e) => e.type === 'DECISION')).toBe(true);
  });

  test('getTrail summary contains typeCounts', () => {
    atw.log({ type: 'TOOL_USE', sessionId: 'sess-atw4', action: 'tool' });
    const { summary } = atw.getTrail('sess-atw4');
    expect(summary.typeCounts).toHaveProperty('TOOL_USE');
    expect(summary.total).toBe(1);
  });

  test('export in json format returns valid JSON string', () => {
    atw.log({ type: 'CORRECTION', sessionId: 'sess-atw5', action: 'fix_response' });
    const output = atw.export('sess-atw5', 'json');
    const parsed = JSON.parse(output);
    expect(parsed.sessionId).toBe('sess-atw5');
    expect(Array.isArray(parsed.events)).toBe(true);
  });

  test('export in text format returns a string', () => {
    atw.log({ type: 'POLICY_CHECK', sessionId: 'sess-atw6', action: 'verify_policy' });
    const output = atw.export('sess-atw6', 'text');
    expect(typeof output).toBe('string');
    expect(output).toContain('POLICY_CHECK');
  });

  test('log fails gracefully without required fields', () => {
    const result = atw.log({ action: 'no session id' });
    expect(result.ok).toBe(false);
  });

  test('getStats tracks buffer size', () => {
    atw.log({ type: 'DECISION', sessionId: 'stats-sess', action: 'x' });
    const stats = atw.getStats();
    expect(stats.logged).toBeGreaterThan(0);
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.capacity).toBe(1000);
  });

  test('singleton getter returns same instance', () => {
    const a = getAuditTrailWriter();
    const b = getAuditTrailWriter();
    expect(a).toBe(b);
  });
});
