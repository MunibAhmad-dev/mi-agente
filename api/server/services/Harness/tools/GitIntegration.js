'use strict';

/**
 * GitIntegration — Native Git operations
 * License: MIT — Zero cost (uses git CLI)
 *
 * All user-supplied values (branch names, filenames, commit messages, queries)
 * are passed as separate array arguments to execFileSync — never interpolated
 * into a shell string. This prevents shell injection entirely.
 */

const { execFileSync } = require('child_process');

class GitIntegration {
  constructor(options = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.initialized = false;
    this.stats = { commits: 0, branches: 0, pulls: 0 };
  }

  initialize() {
    try {
      execFileSync('git', ['--version'], { stdio: 'pipe', cwd: this.repoPath });
      this.initialized = true;
    } catch {
      this.initialized = false;
    }
    return { status: 'ok', module: 'GitIntegration', available: this.initialized };
  }

  _exec(args) {
    try {
      const output = execFileSync('git', args, {
        encoding: 'utf8',
        cwd: this.repoPath,
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      return { success: true, output };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  status() { return this._exec(['status', '--porcelain']); }

  log({ limit = 10 } = {}) {
    return this._exec(['log', '--oneline', `-${Math.max(1, parseInt(limit, 10) || 10)}`]);
  }

  branches() { return this._exec(['branch', '-a']); }
  currentBranch() { return this._exec(['branch', '--show-current']); }
  diff({ staged = false } = {}) { return this._exec(staged ? ['diff', '--staged'] : ['diff']); }

  commit({ message, files = [] } = {}) {
    if (!message) return { success: false, error: 'Message required' };
    if (files.length > 0) {
      for (const f of files) {
        const r = this._exec(['add', '--', f]);
        if (!r.success) return r;
      }
    } else {
      this._exec(['add', '-A']);
    }
    const result = this._exec(['commit', '-m', message]);
    if (result.success) this.stats.commits++;
    return result;
  }

  checkout(branch) {
    if (!branch || typeof branch !== 'string') return { success: false, error: 'Branch name required' };
    return this._exec(['checkout', branch]);
  }

  createBranch(name) {
    if (!name || typeof name !== 'string') return { success: false, error: 'Branch name required' };
    return this._exec(['checkout', '-b', name]);
  }

  pull() {
    const r = this._exec(['pull']);
    if (r.success) this.stats.pulls++;
    return r;
  }

  push() { return this._exec(['push']); }

  stash({ message } = {}) {
    if (message) return this._exec(['stash', 'save', message]);
    return this._exec(['stash']);
  }

  stashPop() { return this._exec(['stash', 'pop']); }

  blame(file) {
    if (!file || typeof file !== 'string') return { success: false, error: 'File path required' };
    return this._exec(['blame', '--', file]);
  }

  show(commit) {
    // Validate: only alphanumeric + punctuation safe for git refs
    if (!commit || !/^[a-zA-Z0-9._/~^:-]{1,200}$/.test(commit)) {
      return { success: false, error: 'Invalid commit ref' };
    }
    return this._exec(['show', commit]);
  }

  search(query) {
    if (!query || typeof query !== 'string') return { success: false, error: 'Query required' };
    return this._exec(['log', '--all', `--grep=${query}`, '--oneline']);
  }

  getStats() { return { ...this.stats, initialized: this.initialized }; }
}

module.exports = GitIntegration;
