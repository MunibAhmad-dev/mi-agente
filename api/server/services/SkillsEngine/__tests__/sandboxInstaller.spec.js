'use strict';

const { SandboxInstaller, BLOCKED_PACKAGES } = require('../SandboxInstaller');

describe('SandboxInstaller', () => {
  let installer;
  beforeEach(() => {
    installer = new SandboxInstaller({ installDir: require('os').tmpdir() + '/test-skill-sandbox' });
  });

  test('BLOCKED_PACKAGES is a Set with known dangerous packages', () => {
    expect(BLOCKED_PACKAGES).toBeInstanceOf(Set);
    expect(BLOCKED_PACKAGES.has('sudo')).toBe(true);
    expect(BLOCKED_PACKAGES.has('vm2')).toBe(true);
  });

  test('isBlocked returns true for blocked packages', () => {
    expect(installer.isBlocked('sudo')).toBe(true);
    expect(installer.isBlocked('vm2')).toBe(true);
  });

  test('isBlocked returns false for normal packages', () => {
    expect(installer.isBlocked('lodash')).toBe(false);
    expect(installer.isBlocked('express')).toBe(false);
  });

  test('install returns error for blocked package without calling npm', async () => {
    const result = await installer.install('sudo');
    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });

  test('addToBlocklist adds custom packages', () => {
    installer.addToBlocklist('my-evil-package');
    expect(installer.isBlocked('my-evil-package')).toBe(true);
  });

  test('listInstalled returns empty initially', () => {
    expect(installer.listInstalled()).toHaveLength(0);
  });

  test('uninstall returns error for not-installed package', async () => {
    const result = await installer.uninstall('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not installed');
  });

  test('verify returns not verified for unknown package', () => {
    const result = installer.verify('unknown-package');
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('Not installed');
  });
});
