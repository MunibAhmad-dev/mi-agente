'use strict';

/**
 * VisualHistory — Face 9: Visual Intelligence pipeline.
 *
 * Stores and retrieves visual state snapshots over time.
 * Each snapshot is a lightweight record that captures:
 *   - the URL or component key audited
 *   - the UVR summary (not the full object — kept small)
 *   - the diagnosis verdict
 *   - health score and issue counts
 *   - timestamp
 *
 * Used to:
 *   - track regressions over deployments
 *   - answer "is it getting better or worse?"
 *   - provide VisualDiagnosisAgent with trend context
 */

const MAX_SNAPSHOTS = 500;
const MAX_PER_KEY   = 50;

class VisualHistory {
  constructor() {
    this._store = new Map(); // key → [snapshot, ...]
    this._total = 0;
  }

  /**
   * Record a new visual snapshot.
   *
   * @param {string} key       — URL, component name, or any stable identifier
   * @param {object} uvr       — UnifiedVisualRepresentation
   * @param {object} diagnosis — VisualDiagnosisAgent.diagnose() result
   * @returns {object}         — the stored snapshot
   */
  record(key, uvr = {}, diagnosis = {}) {
    if (!key) throw new Error('key is required');
    const snapshot = {
      id:           `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      key,
      ts:           new Date().toISOString(),
      health:       uvr.health ?? null,
      verdict:      diagnosis.verdict || 'unknown',
      errors:       diagnosis.errorCount || 0,
      warnings:     diagnosis.warningCount || 0,
      a11yViolations: uvr.accessibility?.violations || 0,
      domIssues:    uvr.structure?.issues?.length || 0,
      uiAntiPatterns: uvr.ui?.antiPatterns?.length || 0,
      textLength:   uvr.text?.raw?.length || 0,
    };

    const list = this._store.get(key) || [];
    list.push(snapshot);
    if (list.length > MAX_PER_KEY) list.shift();
    this._store.set(key, list);

    this._total++;
    // Global cap: evict oldest key when over limit
    if (this._total > MAX_SNAPSHOTS) {
      const oldest = this._store.keys().next().value;
      const dropped = this._store.get(oldest) || [];
      this._total -= dropped.length;
      this._store.delete(oldest);
    }

    return snapshot;
  }

  /**
   * Return all snapshots for a key, oldest first.
   */
  getHistory(key, limit = 20) {
    const list = this._store.get(key) || [];
    return list.slice(-limit);
  }

  /**
   * Compute a trend for a key: is health improving, degrading, or stable?
   * Returns { trend: 'improving'|'degrading'|'stable'|'unknown', delta, snapshots }
   */
  getTrend(key, lookback = 5) {
    const list = this.getHistory(key, lookback);
    if (list.length < 2) return { trend: 'unknown', delta: 0, snapshots: list };
    const recent = list[list.length - 1];
    const base   = list[0];
    const healthDelta = (recent.health ?? 0) - (base.health ?? 0);
    const errorDelta  = (recent.errors ?? 0) - (base.errors ?? 0);
    let trend;
    if (healthDelta > 5 || (healthDelta >= 0 && errorDelta < 0)) trend = 'improving';
    else if (healthDelta < -5 || errorDelta > 0) trend = 'degrading';
    else trend = 'stable';
    return { trend, delta: healthDelta, errorDelta, snapshots: list };
  }

  /**
   * List all tracked keys with their latest snapshot.
   */
  listKeys() {
    const result = [];
    for (const [key, list] of this._store) {
      if (list.length > 0) result.push({ key, latest: list[list.length - 1], count: list.length });
    }
    return result;
  }

  /**
   * Delete history for a key.
   */
  clear(key) {
    if (key) {
      const dropped = this._store.get(key) || [];
      this._total -= dropped.length;
      this._store.delete(key);
      return { deleted: dropped.length };
    }
    const total = this._total;
    this._store.clear();
    this._total = 0;
    return { deleted: total };
  }

  getStats() {
    return {
      keys: this._store.size,
      total: this._total,
    };
  }
}

let _instance = null;
function getVisualHistory() {
  if (!_instance) _instance = new VisualHistory();
  return _instance;
}

module.exports = { VisualHistory, getVisualHistory };
