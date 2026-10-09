/**
 * FASE 7 — HarnessAdapter tests.
 */

const { HarnessAdapter } = require('../HarnessAdapter');

describe('HarnessAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new HarnessAdapter();
  });

  test('createSession returns session with id and status created', () => {
    const session = adapter.createSession({ userId: 'u1', task: 'do something', agentId: 'coder' });
    expect(session.sessionId).toMatch(/^harness_/);
    expect(session.status).toBe('created');
    expect(session.task).toBe('do something');
    expect(session.agentId).toBe('coder');
  });

  test('getStatus returns session info', () => {
    const { sessionId } = adapter.createSession({ userId: 'u1', task: 'test' });
    const status = adapter.getStatus(sessionId);
    expect(status.sessionId).toBe(sessionId);
    expect(status.status).toBe('created');
  });

  test('getStatus returns null for unknown session', () => {
    expect(adapter.getStatus('unknown_session_id')).toBeNull();
  });

  test('stop changes session status', () => {
    const { sessionId } = adapter.createSession({ userId: 'u1', task: 'test' });
    adapter.sessions.get(sessionId).status = 'running';
    const result = adapter.stop(sessionId);
    expect(result.stopped).toBe(true);
    expect(adapter.getStatus(sessionId).status).toBe('stopped');
  });

  test('listSessions returns all sessions', () => {
    adapter.createSession({ userId: 'u1', task: 'task1' });
    adapter.createSession({ userId: 'u2', task: 'task2' });
    const list = adapter.listSessions();
    expect(list.length).toBe(2);
    expect(list[0]).toHaveProperty('sessionId');
    expect(list[0]).toHaveProperty('status');
  });

  test('run completes with stub when orchestrator unavailable', async () => {
    const { sessionId } = adapter.createSession({ userId: 'u1', task: 'analyze something' });
    const result = await adapter.run(sessionId);
    expect(result.status).toBe('completed');
    expect(result.result).toBeDefined();
  });

  test('health returns ok status', () => {
    const h = adapter.health();
    expect(h.ok).toBe(true);
    expect(h.adapter).toBe('HarnessAdapter');
    expect(h.face).toBe(7);
  });

  test('emits session:created event', () => {
    const listener = jest.fn();
    adapter.on('session:created', listener);
    adapter.createSession({ userId: 'u1', task: 'test' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('emits session:completed event on run', async () => {
    const listener = jest.fn();
    adapter.on('session:completed', listener);
    const { sessionId } = adapter.createSession({ userId: 'u1', task: 'test' });
    await adapter.run(sessionId);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
