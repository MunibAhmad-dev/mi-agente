'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * InstallationEngine - Manages capability lifecycle.
 * Install, update, uninstall, rollback, configure.
 */
class InstallationEngine {
  constructor(config = {}) {
    this.config = {
      installPath: config.installPath || path.join(process.cwd(), 'data', 'capabilities'),
      snapshotsPath: config.snapshotsPath || path.join(process.cwd(), 'data', 'capability-snapshots'),
      ...config,
    };
    this.installed = new Map(); // id -> installation info
    this.stats = { installed: 0, updated: 0, uninstalled: 0, rollbacks: 0 };

    this._ensureDirs();
    this._loadInstalled();
  }

  _ensureDirs() {
    for (const dir of [this.config.installPath, this.config.snapshotsPath]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Install a capability.
   */
  async install(capability, options = {}) {
    const id = capability.id;
    const method = capability.installation?.method || this._detectMethod(capability);

    // Create snapshot before install
    if (options.snapshot !== false) {
      this._createSnapshot(id);
    }

    const installDir = path.join(this.config.installPath, id);

    try {
      switch (method) {
        case 'git':
          await this._installGit(capability, installDir);
          break;
        case 'npm':
          await this._installNpm(capability, installDir);
          break;
        case 'manual':
          await this._installManual(capability, installDir);
          break;
        default:
          await this._installManual(capability, installDir);
      }

      // Record installation
      const info = {
        id,
        capability: capability.name,
        method,
        installedAt: new Date().toISOString(),
        version: capability.source.version,
        path: installDir,
        status: 'installed',
      };

      this.installed.set(id, info);
      this._saveInstalled();
      this.stats.installed++;

      return { success: true, info };
    } catch (e) {
      // Rollback on failure
      if (options.snapshot !== false) {
        this._rollback(id);
      }
      return { success: false, error: e.message };
    }
  }

  /**
   * Update a capability to a new version.
   */
  async update(id, newCapability) {
    const current = this.installed.get(id);
    if (!current) return { success: false, error: 'Not installed' };

    // Snapshot current version
    this._createSnapshot(id);

    // Uninstall old, install new
    await this._removeFiles(current.path);
    const result = await this.install(newCapability, { snapshot: false });

    if (result.success) {
      this.stats.updated++;
    } else {
      this._rollback(id);
      this.stats.rollbacks++;
    }

    return result;
  }

  /**
   * Uninstall a capability.
   */
  async uninstall(id) {
    const info = this.installed.get(id);
    if (!info) return { success: false, error: 'Not installed' };

    await this._removeFiles(info.path);
    this.installed.delete(id);
    this._saveInstalled();
    this.stats.uninstalled++;

    return { success: true };
  }

  /**
   * Rollback to previous version.
   */
  _rollback(id) {
    const snapshotPath = path.join(this.config.snapshotsPath, id);
    const installPath = path.join(this.config.installPath, id);

    if (fs.existsSync(snapshotPath)) {
      this._removeFiles(installPath);
      this._copyDir(snapshotPath, installPath);
      this.stats.rollbacks++;
      return true;
    }
    return false;
  }

  /**
   * Create a snapshot before modification.
   */
  _createSnapshot(id) {
    const source = path.join(this.config.installPath, id);
    const dest = path.join(this.config.snapshotsPath, id);

    if (fs.existsSync(source)) {
      this._removeFiles(dest);
      this._copyDir(source, dest);
    }
  }

  async _installGit(capability, installDir) {
    const url = capability.source.url;
    if (!url) throw new Error('No URL provided');

    // For now, just create the directory and record the source
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });

    // Store metadata
    fs.writeFileSync(
      path.join(installDir, '.capability.json'),
      JSON.stringify(capability, null, 2)
    );
  }

  async _installNpm(capability, installDir) {
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(
      path.join(installDir, '.capability.json'),
      JSON.stringify(capability, null, 2)
    );
  }

  async _installManual(capability, installDir) {
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(
      path.join(installDir, '.capability.json'),
      JSON.stringify(capability, null, 2)
    );
  }

  _detectMethod(capability) {
    const url = capability.source?.url || '';
    if (url.includes('github.com')) return 'git';
    if (capability.dependencies?.length > 0) return 'npm';
    return 'manual';
  }

  _removeFiles(dirPath) {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  _copyDir(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const items = fs.readdirSync(src);
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      if (fs.statSync(srcPath).isDirectory()) {
        this._copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * List all installed capabilities.
   */
  listInstalled() {
    return Array.from(this.installed.values());
  }

  /**
   * Check if a capability is installed.
   */
  isInstalled(id) {
    return this.installed.has(id);
  }

  _saveInstalled() {
    const data = JSON.stringify(Array.from(this.installed.entries()), null, 2);
    fs.writeFileSync(path.join(this.config.installPath, '.installed.json'), data);
  }

  _loadInstalled() {
    try {
      const filePath = path.join(this.config.installPath, '.installed.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const [id, info] of data) {
          this.installed.set(id, info);
        }
      }
    } catch { /* empty */ }
  }

  getStats() { return { ...this.stats, installed: this.installed.size }; }
}

module.exports = { InstallationEngine };
