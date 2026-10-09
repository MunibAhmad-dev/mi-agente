'use strict';

const { VisualRegressionSystem, STATUS, DIFF_THRESHOLDS } = require('../VisualRegressionSystem');

describe('VisualRegressionSystem', () => {
  let vrs;
  const fakeBase64 = Buffer.from('fake-image-data').toString('base64');
  const fakeBase64v2 = Buffer.from('fake-image-data-v2').toString('base64');

  beforeEach(() => { vrs = new VisualRegressionSystem(); });

  test('captureBaseline stores baseline', () => {
    const result = vrs.captureBaseline({ name: 'home', base64: fakeBase64, mimeType: 'image/png' });
    expect(result.baseline_id).toMatch(/^baseline_home_/);
    expect(result.name).toBe('home');
  });

  test('compare returns baseline_missing when no baseline captured', async () => {
    const result = await vrs.compare({ name: 'nonexistent', base64: fakeBase64, mimeType: 'image/png' });
    expect(result.status).toBe(STATUS.BASELINE_MISSING);
  });

  test('compare returns pass when screenshot is identical to baseline', async () => {
    vrs.captureBaseline({ name: 'home', base64: fakeBase64, mimeType: 'image/png' });
    const result = await vrs.compare({ name: 'home', base64: fakeBase64, mimeType: 'image/png' });
    expect(result.status).toBe(STATUS.PASS);
    expect(result.diff_ratio).toBe(0);
  });

  test('listBaselines returns captured baselines without base64', () => {
    vrs.captureBaseline({ name: 'home', base64: fakeBase64, mimeType: 'image/png' });
    vrs.captureBaseline({ name: 'about', base64: fakeBase64v2, mimeType: 'image/png' });
    const baselines = vrs.listBaselines();
    expect(baselines.length).toBe(2);
    expect(baselines[0].base64).toBeUndefined();
    expect(baselines.some((b) => b.name === 'home')).toBe(true);
  });

  test('deleteBaseline removes the baseline', () => {
    vrs.captureBaseline({ name: 'home', base64: fakeBase64, mimeType: 'image/png' });
    vrs.deleteBaseline('home');
    expect(vrs.listBaselines().length).toBe(0);
  });

  test('getStats reports correct counts', () => {
    vrs.captureBaseline({ name: 'home', base64: fakeBase64, mimeType: 'image/png' });
    const stats = vrs.getStats();
    expect(stats.baselines).toBe(1);
    expect(stats.total).toBe(0);
  });

  test('STATUS constants are defined', () => {
    expect(STATUS.PASS).toBe('pass');
    expect(STATUS.WARN).toBe('warn');
    expect(STATUS.FAIL).toBe('fail');
    expect(STATUS.BASELINE_MISSING).toBe('baseline_missing');
  });
});
