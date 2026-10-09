/**
 * DoctorModule — System Diagnostics (/doctor)
 * Equivalent to Claude Code /doctor feature
 * 
 * License: MIT — Zero cost
 */

const fs = require('fs');
const path = require('path');

class DoctorModule {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.initialized = false;
    this.checks = [];
  }

  initialize() {
    this.initialized = true;
    return { status: 'ok', module: 'DoctorModule' };
  }

  /**
   * Run full system diagnostics
   */
  async runDiagnostics({ verbose = false } = {}) {
    this.checks = [];
    const results = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      checks: [],
      warnings: [],
      errors: [],
      suggestions: []
    };

    // 1. Check npm packages
    this._checkPackages(results);

    // 2. Check file structure
    this._checkFileStructure(results);

    // 3. Check Harness modules
    this._checkHarnessModules(results);

    // 4. Check data directories
    this._checkDataDirectories(results);

    // 5. Check cognitive engine
    this._checkCognitiveEngine(results);

    // 6. Check memory system
    this._checkMemorySystem(results);

    // 7. Check disk space
    this._checkDiskSpace(results);

    // 8. Check node version
    this._checkNodeVersion(results);

    // Summary
    if (results.errors.length > 0) results.overall = 'unhealthy';
    else if (results.warnings.length > 0) results.overall = 'degraded';
    else results.overall = 'healthy';

    results.summary = {
      total: results.checks.length,
      passed: results.checks.filter(c => c.status === 'ok').length,
      warnings: results.warnings.length,
      errors: results.errors.length,
      suggestions: results.suggestions.length
    };

    return results;
  }

  _checkPackages(results) {
    const required = ['better-sqlite3', 'dockerode', 'node-forge', 'natural', 'graphology', 'vm2', 'playwright', 'node-cron', 'sharp'];
    const missing = [];
    const installed = [];
    for (const pkg of required) {
      try { require.resolve(pkg); installed.push(pkg); }
      catch { missing.push(pkg); }
    }
    const status = missing.length === 0 ? 'ok' : 'warning';
    results.checks.push({ name: 'packages', status, installed: installed.length, missing });
    if (missing.length > 0) {
      results.warnings.push(`Missing packages: ${missing.join(', ')}`);
      results.suggestions.push(`Run: npm install ${missing.join(' ')}`);
    }
  }

  _checkFileStructure(results) {
    const dirs = [
      'api/server/services/Harness/cognitive',
      'api/server/services/Harness/tools',
      'api/server/services/Harness/cognitive/memory',
      'api/server/services/Harness/cognitive/learning',
      'api/server/services/Harness/cognitive/rag',
      'api/server/services/Harness/cognitive/optimization',
      'api/server/services/Harness/cognitive/knowledge',
      'api/server/services/Harness/connectors'
    ];
    const missing = dirs.filter(d => !fs.existsSync(path.join(this.projectRoot, d)));
    results.checks.push({ name: 'file_structure', status: missing.length === 0 ? 'ok' : 'warning', missing });
    if (missing.length > 0) results.warnings.push(`Missing directories: ${missing.join(', ')}`);
  }

  _checkHarnessModules(results) {
    const modules = [
      'cognitive/CognitiveEngine', 'tools/HookSystem', 'tools/BrowserManager',
      'tools/CanvasManager', 'tools/PluginMarketplace', 'tools/CloudAgent',
      'tools/PlanModeManager', 'tools/CompanionManager', 'tools/PlaybookManager',
      'tools/DesktopController', 'tools/CollectionsEngine', 'tools/CredentialVault',
      'tools/GoalManager', 'tools/DoctorModule'
    ];
    const base = path.join(this.projectRoot, 'api/server/services/Harness');
    const loaded = [];
    const failed = [];
    for (const mod of modules) {
      try { require(path.join(base, mod)); loaded.push(mod); }
      catch (e) { failed.push({ module: mod, error: e.message }); }
    }
    results.checks.push({ name: 'harness_modules', status: failed.length === 0 ? 'ok' : 'error', loaded: loaded.length, failed });
    if (failed.length > 0) {
      results.errors.push(`Failed modules: ${failed.map(f => f.module).join(', ')}`);
    }
  }

  _checkDataDirectories(results) {
    const dataDir = path.join(this.projectRoot, 'data');
    const exists = fs.existsSync(dataDir);
    results.checks.push({ name: 'data_directory', status: exists ? 'ok' : 'warning' });
    if (!exists) {
      results.warnings.push('Data directory does not exist yet');
      results.suggestions.push('Data directory will be created on first use');
    }
  }

  _checkCognitiveEngine(results) {
    try {
      const CE = require(path.join(this.projectRoot, 'api/server/services/Harness/cognitive/CognitiveEngine'));
      const ce = new CE();
      results.checks.push({ name: 'cognitive_engine', status: 'ok' });
    } catch (e) {
      results.checks.push({ name: 'cognitive_engine', status: 'error', error: e.message });
      results.errors.push(`CognitiveEngine: ${e.message}`);
    }
  }

  _checkMemorySystem(results) {
    try {
      const ME = require(path.join(this.projectRoot, 'api/server/services/Harness/cognitive/memory/MemoryEngine'));
      const me = new ME();
      results.checks.push({ name: 'memory_system', status: 'ok' });
    } catch (e) {
      results.checks.push({ name: 'memory_system', status: 'error', error: e.message });
      results.errors.push(`MemoryEngine: ${e.message}`);
    }
  }

  _checkDiskSpace(results) {
    try {
      const stats = fs.statfsSync(this.projectRoot);
      const freeGB = (stats.bfree * stats.bsize) / (1024 * 1024 * 1024);
      results.checks.push({ name: 'disk_space', status: freeGB > 1 ? 'ok' : 'warning', freeGB: freeGB.toFixed(2) });
      if (freeGB < 1) results.warnings.push(`Low disk space: ${freeGB.toFixed(2)} GB free`);
    } catch {
      results.checks.push({ name: 'disk_space', status: 'unknown' });
    }
  }

  _checkNodeVersion(results) {
    const version = process.version;
    const major = parseInt(version.slice(1));
    results.checks.push({ name: 'node_version', status: major >= 18 ? 'ok' : 'warning', version });
    if (major < 18) results.warnings.push(`Node.js ${version} is outdated. Recommend v18+`);
  }

  getStats() {
    return { initialized: this.initialized, lastRun: new Date().toISOString() };
  }
}

module.exports = DoctorModule;
