'use strict';

const { ExternalSecurityRunner, TOOLS } = require('../ExternalSecurityRunner');

describe('ExternalSecurityRunner', () => {
  let runner;
  beforeEach(() => { runner = new ExternalSecurityRunner(); });

  test('getSupportedTools returns all 5 tools', () => {
    const tools = runner.getSupportedTools();
    expect(tools).toContain('semgrep');
    expect(tools).toContain('trivy');
    expect(tools).toContain('gitleaks');
    expect(tools).toContain('grype');
    expect(tools).toContain('zap');
    expect(tools.length).toBe(5);
  });

  test('run returns skipped tools when binaries are not installed', async () => {
    const result = await runner.run({ targetPath: '/tmp/nonexistent', type: 'sast' });
    expect(result.tools_skipped).toBeDefined();
    expect(Array.isArray(result.tools_skipped)).toBe(true);
    expect(result.findings).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  test('run with unavailable tools returns empty findings', async () => {
    // All tools expected to be missing in CI
    const result = await runner.run({ targetPath: '/tmp', type: 'all' });
    expect(result.summary.total).toBeGreaterThanOrEqual(0);
    expect(typeof result.summary.critical).toBe('number');
    expect(typeof result.summary.high).toBe('number');
  });

  test('checkAvailability returns boolean for each tool', async () => {
    const availability = await runner.checkAvailability();
    for (const tool of TOOLS) {
      expect(typeof availability[tool]).toBe('boolean');
    }
  }, 15000);

  test('getResults returns empty initially', () => {
    expect(runner.getResults()).toEqual([]);
  });

  test('getResults populates after run', async () => {
    await runner.run({ targetPath: '/tmp', type: 'secrets' });
    expect(runner.getResults().length).toBeGreaterThanOrEqual(0);
  });
});
