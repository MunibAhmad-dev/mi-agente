'use strict';

const { MultiResolutionTester, BREAKPOINTS, CHECKS } = require('../MultiResolutionTester');

describe('MultiResolutionTester', () => {
  let tester;
  beforeEach(() => { tester = new MultiResolutionTester(); });

  test('returns results for all 8 breakpoints', async () => {
    const result = await tester.run({ url: 'https://example.com', screenshots: [] });
    expect(result.total).toBe(BREAKPOINTS.length);
    expect(Object.keys(result.by_breakpoint).length).toBe(BREAKPOINTS.length);
  });

  test('marks breakpoints without screenshots as info findings', async () => {
    const result = await tester.run({ url: 'https://example.com', screenshots: [] });
    const mobileResult = result.by_breakpoint['mobile'];
    expect(mobileResult).toBeDefined();
    expect(mobileResult.issues.length).toBeGreaterThan(0);
    expect(mobileResult.issues[0].severity).toBe('info');
  });

  test('getBreakpoints returns all 8 standard breakpoints', () => {
    const bps = tester.getBreakpoints();
    expect(bps.length).toBe(8);
    expect(bps.some((b) => b.name === 'mobile')).toBe(true);
    expect(bps.some((b) => b.name === 'desktop')).toBe(true);
    expect(bps.some((b) => b.name === 'mobile-xs')).toBe(true);
  });

  test('getChecks returns check names', () => {
    const checks = tester.getChecks();
    expect(checks).toContain('horizontal_scroll');
    expect(checks).toContain('text_overflow');
    expect(checks).toContain('element_overlap');
  });

  test('getHistory returns empty initially', () => {
    expect(tester.getHistory()).toEqual([]);
  });

  test('getHistory populates after run', async () => {
    await tester.run({ url: 'test', screenshots: [] });
    expect(tester.getHistory().length).toBe(1);
    expect(tester.getLastResult()).not.toBeNull();
  });
});
