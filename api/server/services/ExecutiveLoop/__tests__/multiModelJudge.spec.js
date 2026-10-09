'use strict';

const { MultiModelJudge, VERDICT } = require('../MultiModelJudge');

describe('MultiModelJudge', () => {
  let judge;
  beforeEach(() => { judge = new MultiModelJudge(); });

  test('returns fallback verdict when no models available', async () => {
    const origKey = process.env.OPENAI_API_KEY;
    const origAnth = process.env.ANTHROPIC_API_KEY;
    const origGem = process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await judge.judge({ action: 'delete all files', intent: 'file_write', riskLevel: 'high' });
    expect([VERDICT.APPROVE, VERDICT.DENY, VERDICT.ABSTAIN]).toContain(result.verdict);
    expect(result.votes).toBeDefined();

    process.env.OPENAI_API_KEY = origKey;
    process.env.ANTHROPIC_API_KEY = origAnth;
    process.env.GEMINI_API_KEY = origGem;
  });

  test('critical risk defaults to deny when no judges available', async () => {
    const j2 = new MultiModelJudge();
    const result = j2._fallbackVerdict('deploy to prod', 'critical');
    expect(result.verdict).toBe(VERDICT.DENY);
  });

  test('minimal risk defaults to approve in fallback', async () => {
    const j2 = new MultiModelJudge();
    const result = j2._fallbackVerdict('search google', 'minimal');
    expect(result.verdict).toBe(VERDICT.APPROVE);
  });

  test('getHistory returns empty initially', () => {
    expect(judge.getHistory()).toEqual([]);
  });

  test('VERDICT constants are defined', () => {
    expect(VERDICT.APPROVE).toBe('approve');
    expect(VERDICT.DENY).toBe('deny');
    expect(VERDICT.ABSTAIN).toBe('abstain');
  });
});
