'use strict';

// ── Phase 35: MinimumEffectiveAction ─────────────────────────────────────────

describe('Phase 35 — MinimumEffectiveAction', () => {
  let MEA, mea;

  beforeAll(() => {
    ({ MinimumEffectiveAction } = require('~/server/services/CognitiveBehavior/MinimumEffectiveAction'));
    mea = new MinimumEffectiveAction();
  });

  describe('evaluate()', () => {
    test('read action gets high compliance score', () => {
      const r = mea.evaluate('read the config file', 'understand current settings');
      expect(r.compliant).toBe(true);
      expect(r.score).toBeGreaterThan(0.5);
      expect(r.weight).toBeLessThanOrEqual(3);
    });

    test('delete action gets low score and suggestions', () => {
      const r = mea.evaluate('delete all user records', 'clean up database');
      expect(r.compliant).toBe(false);
      expect(r.suggestions.length).toBeGreaterThan(0);
      expect(r.weight).toBeGreaterThanOrEqual(8);
    });

    test('broad irreversible action gets suggestions for both', () => {
      const r = mea.evaluate('wipe everything recursively', 'free disk space');
      expect(r.reversibility).toBe('irreversible');
      expect(r.scope).toBe('broad');
      expect(r.suggestions.length).toBeGreaterThanOrEqual(2);
    });

    test('dry-run action is classified as reversible', () => {
      const r = mea.evaluate('dry-run the deployment', 'verify config');
      expect(r.reversibility).toBe('reversible');
    });

    test('alternatives surface a lighter option', () => {
      const r = mea.evaluate('delete the log file', 'free space', {
        alternatives: ['read the log file', 'archive the log file'],
      });
      expect(r.minimumAction).toBeTruthy();
      expect(r.minimumAction).toMatch(/read|archive/i);
    });

    test('error does not throw', () => {
      expect(() => mea.evaluate(null, null)).not.toThrow();
    });
  });

  describe('choose()', () => {
    test('picks lowest-impact action', () => {
      const r = mea.choose(['delete the file', 'read the file', 'write to the file'], 'inspect content');
      expect(r.chosen).toMatch(/read/i);
    });

    test('returns fallback for empty array', () => {
      const r = mea.choose([], 'do something');
      expect(r.chosen).toBeNull();
    });
  });

  describe('shouldBlock()', () => {
    test('blocks wipe command', () => {
      const r = mea.shouldBlock('wipe the entire database');
      expect(r.blocked).toBe(true);
      expect(r.reason).toBeTruthy();
    });

    test('does not block a read', () => {
      const r = mea.shouldBlock('read the user profile');
      expect(r.blocked).toBe(false);
    });

    test('blocks irreversible+broad combo', () => {
      const r = mea.shouldBlock('delete all files recursively');
      expect(r.blocked).toBe(true);
    });
  });

  describe('suggestAlternative()', () => {
    test('suggests backup before delete', () => {
      const s = mea.suggestAlternative('delete the config');
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(10);
    });

    test('suggests staging before deploy', () => {
      const s = mea.suggestAlternative('deploy to production');
      expect(s).toMatch(/staging|preview/i);
    });

    test('returns generic suggestion for unknown action', () => {
      const s = mea.suggestAlternative('frobnicate the widget');
      expect(typeof s).toBe('string');
    });
  });

  test('getStats() returns structured object', () => {
    const stats = mea.getStats();
    expect(stats).toHaveProperty('evaluated');
    expect(stats).toHaveProperty('complianceRate');
  });
});

// ── Phase 44: ModelAgnosticTesting ───────────────────────────────────────────

describe('Phase 44 — ModelAgnosticTesting', () => {
  let MAT, mat;

  beforeAll(() => {
    ({ ModelAgnosticTesting } = require('~/server/services/CognitiveBehavior/ModelAgnosticTesting'));
    mat = new ModelAgnosticTesting();
    mat._loadBuiltins();
  });

  describe('built-in matchers', () => {
    test('hasCodeBlock detects fenced code', () => {
      expect(mat.matchers.hasCodeBlock('Use ```js\nconsole.log("hi")\n```')).toBe(true);
      expect(mat.matchers.hasCodeBlock('No code here')).toBe(false);
    });

    test('isConcise respects maxWords', () => {
      const short = 'This is short.';
      const long  = Array(120).fill('word').join(' ');
      expect(mat.matchers.isConcise(short, { maxWords: 100 })).toBe(true);
      expect(mat.matchers.isConcise(long,  { maxWords: 100 })).toBe(false);
    });

    test('isSafe rejects harmful language', () => {
      expect(mat.matchers.isSafe('This is helpful.')).toBe(true);
      expect(mat.matchers.isSafe('go die already')).toBe(false);
    });

    test('noFiller rejects sycophantic openers', () => {
      expect(mat.matchers.noFiller('Great question! Here is the answer.')).toBe(false);
      expect(mat.matchers.noFiller('The answer is 42.')).toBe(true);
    });

    test('containsValidJson detects valid JSON', () => {
      expect(mat.matchers.containsValidJson('Result: {"ok":true}')).toBe(true);
      expect(mat.matchers.containsValidJson('No JSON here')).toBe(false);
      expect(mat.matchers.containsValidJson('Bad: {broken json')).toBe(false);
    });

    test('noPlaceholders catches lorem ipsum', () => {
      expect(mat.matchers.noPlaceholders('Lorem ipsum dolor')).toBe(false);
      expect(mat.matchers.noPlaceholders('Real content here')).toBe(true);
    });
  });

  describe('runSuite()', () => {
    test('builtin:general_quality passes for a good response', () => {
      const response = 'Here is a detailed and safe explanation of the topic with multiple paragraphs.';
      const r = mat.runSuite('builtin:general_quality', response, { model: 'gpt-4' });
      expect(r.passed).toBe(true);
      expect(r.score).toBeGreaterThan(0.5);
      expect(r.model).toBe('gpt-4');
    });

    test('builtin:general_quality fails for empty response', () => {
      const r = mat.runSuite('builtin:general_quality', '   ', { model: 'test' });
      expect(r.passed).toBe(false);
    });

    test('builtin:code_response requires a code block', () => {
      const r = mat.runSuite('builtin:code_response', 'No code here at all.', {});
      expect(r.passed).toBe(false);
    });

    test('builtin:code_response passes with code block', () => {
      const r = mat.runSuite('builtin:code_response', 'Use this:\n```python\nprint("hello")\n```\nThis prints hello.', {});
      expect(r.passed).toBe(true);
    });

    test('builtin:concise_response fails for a very long response', () => {
      const long = Array(200).fill('word').join(' ');
      const r = mat.runSuite('builtin:concise_response', long, {});
      expect(r.passed).toBe(false);
    });

    test('returns error for unknown suite', () => {
      const r = mat.runSuite('nonexistent:suite', 'response', {});
      expect(r.passed).toBe(false);
      expect(r.error).toMatch(/not found/i);
    });
  });

  describe('runInline()', () => {
    test('runs ad-hoc tests without registering a suite', () => {
      const r = mat.runInline('Hello world, this is a response.', [
        { name: 'Is substantial', matcher: 'isSubstantial', opts: { minWords: 3 } },
        { name: 'Is safe',        matcher: 'isSafe' },
      ], { model: 'claude-3' });
      expect(r.passed).toBe(true);
      expect(r.results).toHaveLength(2);
    });
  });

  describe('compare()', () => {
    test('picks the better model response', () => {
      const r = mat.compare('builtin:general_quality', [
        { model: 'gpt-3.5', response: '  ' },
        { model: 'gpt-4',   response: 'This is a helpful, safe, and detailed answer to your question.' },
      ]);
      expect(r.winner).toBe('gpt-4');
      expect(r.comparison).toHaveLength(2);
    });
  });

  describe('defineSuite() + registerMatcher()', () => {
    test('defines a custom suite', () => {
      const r = mat.defineSuite('custom:test', [
        { name: 'Has list', matcher: 'hasList', required: true },
      ], { description: 'Requires a list' });
      expect(r.defined).toBe(true);
      expect(r.testCount).toBe(1);
    });

    test('registerMatcher() adds a custom matcher', () => {
      const r = mat.registerMatcher('startsWithCapital', (text) => /^[A-Z]/.test(text.trim()));
      expect(r.registered).toBe(true);
      expect(mat.matchers.startsWithCapital('Hello')).toBe(true);
      expect(mat.matchers.startsWithCapital('hello')).toBe(false);
    });

    test('registerMatcher() rejects non-function', () => {
      const r = mat.registerMatcher('bad', 'not a function');
      expect(r.registered).toBe(false);
    });
  });

  test('getStats() returns structured stats', () => {
    const s = mat.getStats();
    expect(s).toHaveProperty('suitesRun');
    expect(s).toHaveProperty('passRate');
    expect(s).toHaveProperty('matchersAvailable');
  });

  test('getBuiltinSuites() returns 4 built-ins', () => {
    const s = mat.getBuiltinSuites();
    expect(s.length).toBe(4);
    expect(s.every(b => b.suiteId.startsWith('builtin:'))).toBe(true);
  });
});

// ── Phase 46: FinalAuditLoop ──────────────────────────────────────────────────

describe('Phase 46 — FinalAuditLoop', () => {
  let FAL, fal;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    ({ FinalAuditLoop } = require('~/server/services/CognitiveBehavior/FinalAuditLoop'));
    fal = new FinalAuditLoop();
  });

  describe('runAudit()', () => {
    test('returns a structured audit report', async () => {
      const r = await fal.runAudit({ triggeredBy: 'test' });
      expect(r).toHaveProperty('auditId');
      expect(r).toHaveProperty('sections');
      expect(r).toHaveProperty('findings');
      expect(r).toHaveProperty('summary');
      expect(r.summary).toHaveProperty('severity');
    });

    test('report has all expected sections', async () => {
      const r = await fal.runAudit();
      expect(r.sections).toHaveProperty('responseQuality');
      expect(r.sections).toHaveProperty('benchmarks');
      expect(r.sections).toHaveProperty('regressions');
      expect(r.sections).toHaveProperty('auditTrail');
      expect(r.sections).toHaveProperty('security');
      expect(r.sections).toHaveProperty('coverage');
    });

    test('coverage section reports correct percentage', async () => {
      const r = await fal.runAudit();
      expect(r.sections.coverage).toHaveProperty('coverage');
      expect(r.sections.coverage.coverage).toMatch(/\d+%/);
    });

    test('summary severity is one of ok/warn/critical', async () => {
      const r = await fal.runAudit();
      expect(['ok', 'warn', 'critical']).toContain(r.summary.severity);
    });

    test('findings is an array', async () => {
      const r = await fal.runAudit();
      expect(Array.isArray(r.findings)).toBe(true);
    });

    test('durationMs is populated', async () => {
      const r = await fal.runAudit();
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('history and reporting', () => {
    test('getLastAudit() returns the most recent report', async () => {
      await fal.runAudit();
      const last = fal.getLastAudit();
      expect(last).not.toBeNull();
      expect(last).toHaveProperty('auditId');
    });

    test('getHistory() returns up to limit entries', async () => {
      await fal.runAudit();
      await fal.runAudit();
      const h = fal.getHistory(2);
      expect(h.length).toBeLessThanOrEqual(2);
    });

    test('summarize() returns a non-empty string', async () => {
      await fal.runAudit();
      const s = fal.summarize();
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(10);
    });

    test('summarize() returns helpful message when no audit run yet', () => {
      const fresh = new FinalAuditLoop();
      const s = fresh.summarize();
      expect(s).toMatch(/no audit/i);
    });
  });

  describe('scheduled loop', () => {
    test('start() is disabled in test env', () => {
      const r = fal.start(60_000);
      expect(r.started).toBe(false);
      expect(r.reason).toMatch(/test/i);
    });

    test('stop() is idempotent', () => {
      const r = fal.stop();
      expect(r.stopped).toBe(true);
    });
  });

  test('getStats() returns structured object', async () => {
    await fal.runAudit();
    const s = fal.getStats();
    expect(s).toHaveProperty('auditsRun');
    expect(s).toHaveProperty('findings');
    expect(s).toHaveProperty('running');
  });
});
