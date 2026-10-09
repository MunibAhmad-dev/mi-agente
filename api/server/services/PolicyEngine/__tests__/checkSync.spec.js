'use strict';

jest.mock('../PolicyStore', () => ({
  getMatching: jest.fn(() => []),
}));
jest.mock('../CedarEngine', () => ({
  evaluate: jest.fn(async () => ({ decision: 'allow', matched: [], source: 'mock' })),
}));

const PolicyStore = require('../PolicyStore');
const { checkSync, check } = require('../PolicyEvaluator');

describe('PolicyEvaluator.checkSync — bug fix', () => {
  beforeEach(() => {
    PolicyStore.getMatching.mockReset();
    PolicyStore.getMatching.mockReturnValue([]);
  });

  test('returns { allowed: true } when no policies match', () => {
    const result = checkSync({ action: 'file_write', resource: '/tmp/x' });
    expect(result.allowed).toBe(true);
  });

  test('returns { allowed: false } when a deny policy matches', () => {
    PolicyStore.getMatching.mockReturnValue([
      { id: 'p1', effect: 'deny', action: 'shell_command', reason: 'Shell blocked by policy' },
    ]);
    const result = checkSync({ action: 'shell_command' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/policy/i);
  });

  test('fails open (allowed: true) when PolicyStore throws', () => {
    PolicyStore.getMatching.mockImplementation(() => { throw new Error('store down'); });
    const result = checkSync({ action: 'any_action' });
    expect(result.allowed).toBe(true);
  });

  test('check() (async) still returns a promise', async () => {
    const result = await check({ action: 'test', resource: 'x' });
    expect(typeof result.allowed).toBe('boolean');
  });

  test('checkSync is synchronous (not a Promise)', () => {
    const result = checkSync({ action: 'read_file' });
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result.allowed).toBe('boolean');
  });
});
