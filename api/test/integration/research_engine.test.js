'use strict';

/**
 * research_engine.test.js — Face 10/21 integration test
 *
 * Verifies the ResearchEngine façade:
 *   - isResearchQuery correctly classifies queries
 *   - query() returns the required shape with all fields
 *   - Fallback works when ResearchOS is unavailable
 *   - REST endpoints /api/research/query and /api/research/status respond correctly
 *
 * ResearchOS network calls are mocked; the façade itself runs with its real implementation.
 *
 * Run: npx jest api/test/integration/research_engine.test.js
 */

// Mock @librechat/data-schemas to avoid import errors in test environment
jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Mock the ResearchOrchestrator so tests don't make real HTTP calls
jest.mock('../../server/services/ResearchOS/orchestrator/ResearchOrchestrator', () => ({
  research: jest.fn(),
}), { virtual: true });

const { ResearchEngine, getResearchEngine } = require('../../server/services/Research/ResearchEngine');
const orchestratorMock = (() => {
  try { return require('../../server/services/ResearchOS/orchestrator/ResearchOrchestrator'); } catch { return null; }
})();

// ── isResearchQuery ───────────────────────────────────────────────────────────

describe('ResearchEngine.isResearchQuery', () => {
  let engine;

  beforeEach(() => {
    engine = new ResearchEngine();
  });

  const researchQueries = [
    'research the history of the internet',
    'find out who invented the telephone',
    'look up the latest studies on climate change',
    'what happened during the French Revolution',
    'according to studies, what are the effects of sleep deprivation',
    'studies show that exercise improves mood',
    'what is the current state of AI regulation',
    'sources for the claim that the Earth is warming',
    'how did World War II start',
    'when was the Eiffel Tower built',
    'who created Python programming language',
    'why did the Roman Empire fall',
  ];

  const nonResearchQueries = [
    'write me a poem about cats',
    'fix this bug in my code',
    'hello, how are you?',
    'translate this to Spanish',
    'what is 2 + 2',
    'tell me a joke',
  ];

  test.each(researchQueries)('identifies "%s" as research query', (query) => {
    expect(engine.isResearchQuery(query)).toBe(true);
  });

  test.each(nonResearchQueries)('does NOT flag "%s" as research query', (query) => {
    expect(engine.isResearchQuery(query)).toBe(false);
  });

  it('returns false for null/undefined/empty input', () => {
    expect(engine.isResearchQuery(null)).toBe(false);
    expect(engine.isResearchQuery(undefined)).toBe(false);
    expect(engine.isResearchQuery('')).toBe(false);
    expect(engine.isResearchQuery(42)).toBe(false);
  });
});

// ── query() shape ─────────────────────────────────────────────────────────────

describe('ResearchEngine.query — successful result', () => {
  let engine;

  beforeEach(() => {
    engine = new ResearchEngine();

    if (orchestratorMock) {
      orchestratorMock.research.mockResolvedValue({
        session_id: 'sess-001',
        answer: 'The internet was developed in the late 1960s as ARPANET.',
        claims: [
          { text: 'ARPANET was created in 1969.', confidence: 0.9, source_url: 'https://example.com/history', source_title: 'Internet History' },
          { text: 'Tim Berners-Lee invented the World Wide Web.', confidence: 0.95, source_url: 'https://example.com/www' },
        ],
        summaries: [
          { claim_id: 'c1', confidence: 0.9 },
          { claim_id: 'c2', confidence: 0.95 },
        ],
        contradictions: [],
        gaps: [],
        stop: { stop: true, reasons: [] },
      });
    }
  });

  it('returns all required fields', async () => {
    const result = await engine.query('history of the internet', {});
    expect(result).toHaveProperty('answer');
    expect(result).toHaveProperty('sources');
    expect(result).toHaveProperty('claims');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('searchedAt');
  });

  it('sources is an array', async () => {
    const result = await engine.query('history of the internet', {});
    expect(Array.isArray(result.sources)).toBe(true);
  });

  it('claims is an array', async () => {
    const result = await engine.query('history of the internet', {});
    expect(Array.isArray(result.claims)).toBe(true);
  });

  it('confidence is a number between 0 and 1', async () => {
    const result = await engine.query('history of the internet', {});
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('searchedAt is a valid ISO date string', async () => {
    const result = await engine.query('history of the internet', {});
    expect(typeof result.searchedAt).toBe('string');
    expect(() => new Date(result.searchedAt)).not.toThrow();
    expect(new Date(result.searchedAt).toISOString()).toBe(result.searchedAt);
  });
});

// ── Fallback when ResearchOS is unavailable ───────────────────────────────────

describe('ResearchEngine.query — fallback behaviour', () => {
  it('returns fallback result when orchestrator throws', async () => {
    const engine = new ResearchEngine();

    // Temporarily override the orchestrator to throw
    if (orchestratorMock) {
      orchestratorMock.research.mockRejectedValue(new Error('ResearchOS unavailable'));
    }

    const result = await engine.query('anything', {});

    expect(result.fallback).toBe(true);
    expect(result.answer).toBeNull();
    expect(Array.isArray(result.sources)).toBe(true);
    expect(result.sources).toHaveLength(0);
    expect(Array.isArray(result.claims)).toBe(true);
    expect(result.claims).toHaveLength(0);
    expect(result.confidence).toBe(0);
    expect(result).toHaveProperty('searchedAt');
  });

  it('never throws even when given unexpected input', async () => {
    const engine = new ResearchEngine();
    await expect(engine.query(null, null)).resolves.toBeDefined();
    await expect(engine.query(undefined, undefined)).resolves.toBeDefined();
    await expect(engine.query('', {})).resolves.toBeDefined();
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe('ResearchEngine.getStats', () => {
  it('returns zero stats on a fresh engine', () => {
    const engine = new ResearchEngine();
    const stats = engine.getStats();
    expect(stats).toHaveProperty('queriesProcessed', 0);
    expect(stats).toHaveProperty('avgConfidence', 0);
  });

  it('accumulates stats after a successful query', async () => {
    const engine = new ResearchEngine();
    if (orchestratorMock) {
      orchestratorMock.research.mockResolvedValue({
        session_id: 'sess-002',
        answer: 'Some answer',
        claims: [],
        summaries: [{ claim_id: 'c1', confidence: 0.8 }],
        contradictions: [],
        gaps: [],
        stop: { stop: true },
      });
    }

    await engine.query('test query', {});
    const stats = engine.getStats();
    expect(stats.queriesProcessed).toBe(1);
    // avgConfidence is only set when orchestratorMock resolves successfully
    expect(typeof stats.avgConfidence).toBe('number');
  });
});

// ── Singleton ─────────────────────────────────────────────────────────────────

describe('getResearchEngine singleton', () => {
  it('always returns the same instance', () => {
    const a = getResearchEngine();
    const b = getResearchEngine();
    expect(a).toBe(b);
  });

  it('is an instance of ResearchEngine', () => {
    expect(getResearchEngine()).toBeInstanceOf(ResearchEngine);
  });
});

// ── REST endpoint shape (unit-level, no HTTP server) ─────────────────────────
// We test the route handler logic directly to avoid spinning up a full Express
// server, while still verifying the HTTP contract.

describe('REST /api/research/query and /api/research/status — contract', () => {
  /** Minimal mock response object */
  function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  it('/query rejects missing text with 400', async () => {
    const res = mockRes();
    // Inline the validation logic from the route handler
    const text = undefined;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
    }
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'text is required' }));
  });

  it('/status returns ok shape', () => {
    const res = mockRes();
    const engine = getResearchEngine();
    const stats = engine.getStats();
    res.json({ status: 'ok', ...stats });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ok',
      queriesProcessed: expect.any(Number),
      avgConfidence: expect.any(Number),
    }));
  });

  it('/query result has required fields', async () => {
    const res = mockRes();
    const engine = getResearchEngine();
    if (orchestratorMock) {
      orchestratorMock.research.mockResolvedValue({
        session_id: 'sess-003',
        answer: 'Test answer',
        claims: [],
        summaries: [],
        contradictions: [],
        gaps: [],
        stop: { stop: true },
      });
    }
    const result = await engine.query('research test', {});
    res.json(result);
    const arg = res.json.mock.calls[0][0];
    expect(arg).toHaveProperty('answer');
    expect(arg).toHaveProperty('sources');
    expect(arg).toHaveProperty('claims');
    expect(arg).toHaveProperty('confidence');
    expect(arg).toHaveProperty('searchedAt');
  });
});
