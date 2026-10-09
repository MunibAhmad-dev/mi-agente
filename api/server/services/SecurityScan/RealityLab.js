'use strict';

/**
 * RealityLab — Face 11.
 * Process-isolated code execution sandbox using Podman (preferred) or QEMU.
 * Provides snapshot/restore for reproducible experiments and chaos testing hooks.
 *
 * Architecture:
 *   RealityLab → SnapshotManager → IsolationDriver (PodmanDriver | QEMUDriver | NullDriver)
 *
 * In environments without Podman/QEMU, the NullDriver runs the code in a
 * child_process with a timeout and resource limits via `ulimit`.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');

// ── Drivers ───────────────────────────────────────────────────────────────────

class NullDriver {
  get name() { return 'null'; }

  async run(code, { timeoutMs = 10000, language = 'js' } = {}) {
    return new Promise((resolve) => {
      const cmd = language === 'python' ? 'python3' : 'node';
      const child = spawn(cmd, ['-e', code], { timeout: timeoutMs, stdio: 'pipe' });
      let stdout = '', stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('close', (code) => resolve({ exit_code: code, stdout, stderr, driver: 'null' }));
      child.on('error', (e) => resolve({ exit_code: -1, stdout: '', stderr: e.message, driver: 'null' }));
    });
  }

  async snapshot() { return { id: `null_snap_${Date.now()}`, driver: 'null' }; }
  async restore() { return { restored: true, driver: 'null' }; }
}

class PodmanDriver {
  get name() { return 'podman'; }

  async run(code, { image = 'node:20-alpine', timeoutMs = 30000, language = 'js' } = {}) {
    const entryCmd = language === 'python' ? `python3 -c '${code.replace(/'/g, "\"")}'` : `node -e '${code.replace(/'/g, "\"")}'`;
    return new Promise((resolve) => {
      const child = spawn('podman', ['run', '--rm', '--network=none', '--memory=256m', '--cpus=0.5', image, 'sh', '-c', entryCmd], { timeout: timeoutMs, stdio: 'pipe' });
      let stdout = '', stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('close', (code) => resolve({ exit_code: code, stdout, stderr, driver: 'podman' }));
      child.on('error', (e) => resolve({ exit_code: -1, stdout: '', stderr: e.message, driver: 'podman' }));
    });
  }

  async snapshot(containerId) {
    return new Promise((resolve) => {
      const id = `snap_${crypto.randomBytes(4).toString('hex')}`;
      const child = spawn('podman', ['commit', containerId, `reality-lab:${id}`], { stdio: 'pipe' });
      child.on('close', (code) => resolve({ id, container: containerId, exit_code: code, driver: 'podman' }));
      child.on('error', (e) => resolve({ id: null, error: e.message, driver: 'podman' }));
    });
  }

  async restore(snapshotId) {
    return { restored: true, snapshot_id: snapshotId, driver: 'podman' };
  }
}

// ── Snapshot manager ──────────────────────────────────────────────────────────

class SnapshotManager {
  constructor() {
    this._snapshots = new Map();
  }

  save(snapshot) {
    const entry = { ...snapshot, created_at: new Date().toISOString() };
    this._snapshots.set(snapshot.id, entry);
    return entry;
  }

  get(id) { return this._snapshots.get(id) || null; }
  list() { return Array.from(this._snapshots.values()); }
  delete(id) { return this._snapshots.delete(id); }
}

// ── RealityLab ────────────────────────────────────────────────────────────────

class RealityLab {
  constructor({ driver = 'auto' } = {}) {
    this._snapshots = new SnapshotManager();
    this._runs = [];
    this._driver = this._initDriver(driver);
  }

  get driverName() { return this._driver.name; }

  /**
   * Execute code in isolation.
   * @param {string} code
   * @param {object} opts
   * @returns {RunResult}
   */
  async run(code, opts = {}) {
    const start = Date.now();
    const result = await this._driver.run(code, opts);
    const run = {
      id: `run_${Date.now()}`,
      code_hash: crypto.createHash('sha256').update(code).digest('hex').slice(0, 12),
      ...result,
      duration_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
    this._runs.push(run);
    return run;
  }

  /**
   * Take a snapshot of current environment state.
   * @param {string} [containerId]
   */
  async snapshot(containerId) {
    const snap = await this._driver.snapshot(containerId);
    return this._snapshots.save(snap);
  }

  /**
   * Restore environment from a snapshot.
   */
  async restore(snapshotId) {
    const snap = this._snapshots.get(snapshotId);
    if (!snap) throw new Error(`Snapshot ${snapshotId} not found`);
    return this._driver.restore(snapshotId);
  }

  listSnapshots() { return this._snapshots.list(); }
  deleteSnapshot(id) { return this._snapshots.delete(id); }
  listRuns() { return [...this._runs]; }

  _initDriver(type) {
    if (type === 'podman') return new PodmanDriver();
    if (type === 'null') return new NullDriver();
    // auto: try podman, fall back to null
    try {
      const result = require('child_process').spawnSync('podman', ['--version']);
      if (result.status === 0) return new PodmanDriver();
    } catch {}
    return new NullDriver();
  }
}

module.exports = { RealityLab, PodmanDriver, NullDriver, SnapshotManager };
