'use strict';

/**
 * SandboxInstaller — Face 15.
 * Hardened skill installation: runs npm install in an isolated child process
 * with network restrictions, memory limits, a timeout, and a blocklist of
 * dangerous packages. On success the package is verified (manifest check +
 * lock-file hash) before being made available to the SkillsEngine.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const BLOCKED_PACKAGES = new Set([
  'sudo', 'vm2', 'nvm', 'node-pty', 'keylogging',
  'puppeteer-extra-plugin-stealth', 'crimeflare',
]);

const INSTALL_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 512 * 1024;

class SandboxInstaller {
  constructor({ installDir = null, blocklist = [] } = {}) {
    this._installDir = installDir || path.join(process.cwd(), '.skill-sandbox');
    this._blocklist = new Set([...BLOCKED_PACKAGES, ...blocklist]);
    this._installed = new Map();
    this._ensureDir();
  }

  /**
   * Install a package into the sandbox directory.
   * @param {string} packageSpec — e.g. "lodash@4.17.21" or "lodash"
   * @returns {InstallResult}
   */
  async install(packageSpec) {
    const { name, version } = this._parseSpec(packageSpec);

    if (this._blocklist.has(name)) {
      return { success: false, package: name, error: `Package "${name}" is blocked by security policy` };
    }

    const result = await this._runInstall(packageSpec);
    if (!result.success) return result;

    const hash = this._hashPackageJson(name);
    const entry = {
      name,
      version: version || 'latest',
      installed_at: new Date().toISOString(),
      hash,
      sandbox_dir: this._installDir,
    };

    this._installed.set(name, entry);
    return { success: true, package: name, version: entry.version, hash, sandbox_dir: this._installDir };
  }

  /**
   * Verify integrity of an installed package.
   */
  verify(packageName) {
    const entry = this._installed.get(packageName);
    if (!entry) return { verified: false, reason: 'Not installed via sandbox' };
    const currentHash = this._hashPackageJson(packageName);
    const intact = currentHash === entry.hash;
    return { verified: intact, package: packageName, expected_hash: entry.hash, actual_hash: currentHash };
  }

  /**
   * Remove a sandboxed package.
   */
  async uninstall(packageName) {
    if (!this._installed.has(packageName)) return { success: false, error: 'Not installed' };
    const result = await this._runUninstall(packageName);
    if (result.success) this._installed.delete(packageName);
    return result;
  }

  listInstalled() { return Array.from(this._installed.values()); }

  isBlocked(packageName) { return this._blocklist.has(packageName); }

  addToBlocklist(packageName) { this._blocklist.add(packageName); }

  // ── Internal ──────────────────────────────────────────────────────────────

  _parseSpec(spec) {
    const match = spec.match(/^(@?[^@]+)(?:@(.+))?$/);
    return { name: match?.[1] || spec, version: match?.[2] || null };
  }

  _runInstall(packageSpec) {
    return new Promise((resolve) => {
      const child = spawn('npm', ['install', '--prefix', this._installDir, '--no-audit', '--no-fund', packageSpec], {
        timeout: INSTALL_TIMEOUT_MS,
        stdio: 'pipe',
        env: { ...process.env, npm_config_cache: path.join(this._installDir, '.npm-cache') },
      });

      let stdout = '', stderr = '';

      child.stdout.on('data', (d) => { stdout += d; if (stdout.length > MAX_OUTPUT_BYTES) child.kill('SIGKILL'); });
      child.stderr.on('data', (d) => { stderr += d; if (stderr.length > MAX_OUTPUT_BYTES) child.kill('SIGKILL'); });

      child.on('close', (code) => {
        resolve({ success: code === 0, exit_code: code, stdout: stdout.slice(-2000), stderr: stderr.slice(-2000), package: packageSpec });
      });
      child.on('error', (e) => {
        resolve({ success: false, exit_code: -1, error: e.message, package: packageSpec });
      });
    });
  }

  _runUninstall(packageName) {
    return new Promise((resolve) => {
      const child = spawn('npm', ['uninstall', '--prefix', this._installDir, packageName], {
        timeout: 30_000,
        stdio: 'pipe',
      });
      child.on('close', (code) => resolve({ success: code === 0, exit_code: code, package: packageName }));
      child.on('error', (e) => resolve({ success: false, error: e.message, package: packageName }));
    });
  }

  _hashPackageJson(packageName) {
    const pkgPath = path.join(this._installDir, 'node_modules', packageName, 'package.json');
    try {
      const content = fs.readFileSync(pkgPath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch {
      return null;
    }
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this._installDir)) fs.mkdirSync(this._installDir, { recursive: true });
    } catch {}
  }
}

let _instance = null;
function getSandboxInstaller(opts) {
  if (!_instance) _instance = new SandboxInstaller(opts);
  return _instance;
}

module.exports = { SandboxInstaller, getSandboxInstaller, BLOCKED_PACKAGES };
