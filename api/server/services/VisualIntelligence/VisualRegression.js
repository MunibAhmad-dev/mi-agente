'use strict';

/**
 * VisualRegression — Face 9.
 * Baseline comparison system for visual regression testing.
 * Stores baselines as metadata snapshots and compares new captures against them.
 * For image diffing, uses structural hash comparison; pixel diffing requires external tooling.
 */

const crypto = require('crypto');

function hashImage(base64Data) {
  return crypto.createHash('sha256').update(base64Data || '').digest('hex').substring(0, 32);
}

class VisualRegression {
  constructor() {
    this._baselines = new Map(); // key → { hash, metadata, created_at }
    this._history = [];
  }

  /**
   * Record a baseline for a named component/screen at a given resolution.
   */
  setBaseline(key, { base64, metadata = {}, resolution = null }) {
    const hash = hashImage(base64);
    const entry = {
      key,
      hash,
      resolution,
      metadata,
      created_at: new Date().toISOString(),
    };
    this._baselines.set(key, entry);
    return { key, hash, status: 'baseline_set' };
  }

  /**
   * Compare a new capture against a stored baseline.
   * Returns pass/fail + diff info.
   */
  compare(key, { base64, metadata = {}, threshold = 0 }) {
    const baseline = this._baselines.get(key);
    if (!baseline) {
      return { key, status: 'no_baseline', passed: false, message: `No baseline found for: ${key}` };
    }

    const newHash = hashImage(base64);
    const identical = newHash === baseline.hash;

    const result = {
      key,
      status: identical ? 'pass' : 'fail',
      passed: identical,
      baseline_hash: baseline.hash,
      new_hash: newHash,
      diff: identical ? 0 : 1,
      threshold,
      exceeded_threshold: !identical && 1 > threshold,
      baseline_created_at: baseline.created_at,
      compared_at: new Date().toISOString(),
      metadata,
    };

    this._history.push(result);
    if (this._history.length > 1000) this._history.shift();
    return result;
  }

  hasBaseline(key) {
    return this._baselines.has(key);
  }

  getBaseline(key) {
    return this._baselines.get(key) || null;
  }

  deleteBaseline(key) {
    return this._baselines.delete(key);
  }

  listBaselines() {
    return Array.from(this._baselines.values()).map(({ key, hash, resolution, created_at }) => ({ key, hash, resolution, created_at }));
  }

  getHistory(key = null, limit = 50) {
    const all = key ? this._history.filter((r) => r.key === key) : this._history;
    return all.slice(-limit);
  }

  getStats() {
    const recent = this._history.slice(-100);
    const passed = recent.filter((r) => r.passed).length;
    return {
      baselines: this._baselines.size,
      history: this._history.length,
      recent_pass_rate: recent.length ? Math.round((passed / recent.length) * 100) : null,
    };
  }
}

let _instance = null;
function getVisualRegression() {
  if (!_instance) _instance = new VisualRegression();
  return _instance;
}

module.exports = { VisualRegression, getVisualRegression };
