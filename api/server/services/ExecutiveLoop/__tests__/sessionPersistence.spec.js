'use strict';

/**
 * sessionPersistence.spec.js — Face 8 session persistence.
 *
 * Tests loadSession() and the sessions Map pub/sub.
 * ExecutiveLoop's internal deps use relative paths, so they resolve fine
 * from this test file without the api/jest.config.js moduleNameMapper.
 *
 * loadSession() calls require('~/models') lazily inside a try/catch —
 * in this test environment it throws (path unresolvable) and returns null,
 * which is the correct "MongoDB unavailable" fallback behavior.
 */

const { sessions, subscribe, loadSession } = require('../ExecutiveLoop');

describe('ExecutiveLoop — sessions Map pub/sub', () => {
  test('sessions export is a Map', () => {
    expect(sessions instanceof Map).toBe(true);
  });

  test('subscribe creates a session entry if it does not exist', () => {
    const sid = `new-session-${Date.now()}`;
    const unsub = subscribe(sid, () => {});
    expect(sessions.has(sid)).toBe(true);
    unsub();
    sessions.delete(sid);
  });

  test('subscribe replays previously emitted events to the new listener', () => {
    const sid = `replay-${Date.now()}`;
    sessions.set(sid, { listeners: new Set(), events: [{ phase: 'start' }, { phase: 'done' }], done: false });
    const received = [];
    const unsub = subscribe(sid, (e) => received.push(e));
    expect(received).toHaveLength(2);
    expect(received[0].phase).toBe('start');
    expect(received[1].phase).toBe('done');
    unsub();
    sessions.delete(sid);
  });

  test('unsubscribe returned by subscribe stops future events', () => {
    const sid = `unsub-${Date.now()}`;
    sessions.set(sid, { listeners: new Set(), events: [], done: false });
    const received = [];
    const unsub = subscribe(sid, (e) => received.push(e));
    unsub();
    // Manually push an event to the session
    const session = sessions.get(sid);
    session.events.push({ phase: 'late' });
    session.listeners.forEach((fn) => fn({ phase: 'late' }));
    expect(received).toHaveLength(0);
    sessions.delete(sid);
  });
});

describe('ExecutiveLoop — loadSession', () => {
  test('loadSession is exported as a function', () => {
    expect(typeof loadSession).toBe('function');
  });

  test('loadSession returns null when AgentMemory is unavailable (graceful fallback)', async () => {
    const result = await loadSession('no-such-session');
    expect(result).toBeNull();
  });
});
