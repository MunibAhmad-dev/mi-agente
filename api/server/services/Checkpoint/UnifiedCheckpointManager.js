'use strict';

/**
 * UnifiedCheckpointManager — canonical checkpoint implementation.
 *
 * Merges the two Harness CheckpointManager variants into one class:
 *   - Label-based save/restore for "before risky op" pattern (from Harness/)
 *   - Session-based with EventEmitter and auto-checkpoint-on-error (from Harness/cognitive/)
 *
 * Both Harness/CheckpointManager.js and Harness/cognitive/CheckpointManager.js
 * are thin re-exports of this canonical implementation.
 *
 * NOT for ResearchOS (domain-specific stage checkpoints with DB store) or
 * AgentRuntime/SessionManager/Checkpoint.js (file-based, userId ownership).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

class Checkpoint {
  constructor(label, state, sessionId) {
    this.id = crypto.randomUUID();
    this.label = label;
    this.sessionId = sessionId || null;
    this.state = _deepClone(state);
    this.createdAt = new Date().toISOString();
    this.timestamp = Date.now();
    this.size = JSON.stringify(state).length;
  }
}

function _deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(_deepClone);
  const clone = {};
  for (const key of Object.keys(obj)) clone[key] = _deepClone(obj[key]);
  return clone;
}

class UnifiedCheckpointManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      maxCheckpoints: config.maxCheckpoints || 50,
      persistDir: config.persistDir || config.storageDir || null,
      autoCleanup: config.autoCleanup !== false,
      autoCheckpoint: config.autoCheckpoint !== false,
    };
    this._byLabel = new Map();    // label → Checkpoint[]
    this._bySession = new Map();  // sessionId → Checkpoint[]
    this._byId = new Map();       // id → Checkpoint
    this._totalSaved = 0;
    this._totalRestored = 0;
  }

  // ── Label-based API (Harness/CheckpointManager pattern) ──────────────────

  /** Save under a label (latest wins for restore). */
  save(label, state, opts = {}) {
    const sessionId = typeof label === 'string' && opts.sessionId ? opts.sessionId : null;
    const cp = new Checkpoint(label, state, sessionId);
    this._store(cp);
    this.emit('checkpointSaved', { id: cp.id, label, sessionId });
    return cp;
  }

  /** Restore the latest checkpoint for a label → returns deep-cloned state. */
  restore(label) {
    const list = this._byLabel.get(label);
    if (!list || list.length === 0) return null;
    this._totalRestored++;
    return _deepClone(list[list.length - 1].state);
  }

  getLatestByLabel(label) {
    const list = this._byLabel.get(label);
    return list ? list[list.length - 1] : null;
  }

  getAllByLabel(label) {
    return this._byLabel.get(label) || [];
  }

  listLabels() {
    return Array.from(this._byLabel.keys());
  }

  deleteLabel(label) {
    const list = this._byLabel.get(label) || [];
    for (const cp of list) this._byId.delete(cp.id);
    this._byLabel.delete(label);
  }

  saveCombined(label, stateMap) {
    const combined = {};
    for (const [k, v] of Object.entries(stateMap)) combined[k] = _deepClone(v);
    return this.save(label, combined);
  }

  restoreCombined(label) {
    return this.restore(label);
  }

  // ── Session-based API (Harness/cognitive/CheckpointManager pattern) ──────

  /** Save under a sessionId (for agent session tracking). */
  saveForSession(sessionId, state, options = {}) {
    const label = options.label || 'auto';
    const cp = new Checkpoint(label, state, sessionId);
    if (options.id) cp.id = options.id;
    this._store(cp);
    this.emit('checkpointSaved', { id: cp.id, sessionId, label });
    return { success: true, id: cp.id };
  }

  loadById(checkpointId) {
    const cp = this._byId.get(checkpointId);
    if (!cp) {
      const loaded = this._loadFromDisk(checkpointId);
      if (loaded) return loaded;
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    return cp;
  }

  getLatest(sessionId) {
    const list = this._bySession.get(sessionId);
    if (!list || list.length === 0) return null;
    return list.reduce((a, b) => (a.timestamp >= b.timestamp ? a : b));
  }

  listForSession(sessionId) {
    return (this._bySession.get(sessionId) || [])
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(({ id, label, timestamp, createdAt }) => ({ id, label, timestamp, createdAt, age: Date.now() - timestamp }));
  }

  compare(id1, id2) {
    const cp1 = this.loadById(id1);
    const cp2 = this.loadById(id2);
    return {
      checkpoint1: { id: cp1.id, timestamp: cp1.timestamp },
      checkpoint2: { id: cp2.id, timestamp: cp2.timestamp },
      stateChanged: JSON.stringify(cp1.state) !== JSON.stringify(cp2.state),
      timeDiff: cp2.timestamp - cp1.timestamp,
    };
  }

  delete(checkpointId) {
    const cp = this._byId.get(checkpointId);
    if (cp) {
      this._byId.delete(checkpointId);
      const labelList = this._byLabel.get(cp.label);
      if (labelList) {
        const idx = labelList.findIndex(c => c.id === checkpointId);
        if (idx !== -1) labelList.splice(idx, 1);
      }
      const sessionList = this._bySession.get(cp.sessionId);
      if (sessionList) {
        const idx = sessionList.findIndex(c => c.id === checkpointId);
        if (idx !== -1) sessionList.splice(idx, 1);
      }
      this._deleteFromDisk(checkpointId);
    }
    return { success: true };
  }

  async autoCheckpointOnerror(sessionId, state, error) {
    if (!this.config.autoCheckpoint) return null;
    return this.saveForSession(sessionId, state, {
      label: `auto-error: ${String(error).slice(0, 50)}`,
      metadata: { error: String(error), auto: true },
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats() {
    let totalSize = 0;
    for (const cp of this._byId.values()) totalSize += cp.size;
    return {
      labels: this._byLabel.size,
      sessions: this._bySession.size,
      totalCheckpoints: this._byId.size,
      totalSizeBytes: totalSize,
      totalSaved: this._totalSaved,
      totalRestored: this._totalRestored,
    };
  }

  loadFromDisk() {
    if (!this.config.persistDir) return 0;
    try {
      const dir = this.config.persistDir;
      if (!fs.existsSync(dir)) return 0;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      let loaded = 0;
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
          const cp = Object.assign(new Checkpoint(data.label, data.state, data.sessionId), data);
          this._indexCheckpoint(cp);
          loaded++;
        } catch { /* skip corrupted */ }
      }
      return loaded;
    } catch {
      return 0;
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _store(cp) {
    this._indexCheckpoint(cp);
    this._totalSaved++;
    if (this.config.persistDir) this._persistCheckpoint(cp);
    if (this.config.autoCleanup) this._prune(cp.label, cp.sessionId);
  }

  _indexCheckpoint(cp) {
    this._byId.set(cp.id, cp);

    if (cp.label) {
      if (!this._byLabel.has(cp.label)) this._byLabel.set(cp.label, []);
      this._byLabel.get(cp.label).push(cp);
    }
    if (cp.sessionId) {
      if (!this._bySession.has(cp.sessionId)) this._bySession.set(cp.sessionId, []);
      this._bySession.get(cp.sessionId).push(cp);
    }
  }

  _prune(label, sessionId) {
    const MAX = this.config.maxCheckpoints;
    if (label) {
      const list = this._byLabel.get(label);
      if (list && list.length > 5) {
        const removed = list.splice(0, list.length - 5);
        for (const cp of removed) this._byId.delete(cp.id);
      }
    }
    if (sessionId) {
      const list = this._bySession.get(sessionId);
      if (list && list.length > MAX) {
        const sorted = [...list].sort((a, b) => b.timestamp - a.timestamp);
        const keep = new Set(sorted.slice(0, MAX).map(c => c.id));
        const pruned = list.filter(c => !keep.has(c.id));
        for (const cp of pruned) {
          this._byId.delete(cp.id);
          const lList = this._byLabel.get(cp.label);
          if (lList) lList.splice(lList.indexOf(cp), 1);
        }
        this._bySession.set(sessionId, list.filter(c => keep.has(c.id)));
      }
    }
  }

  _persistCheckpoint(cp) {
    try {
      const dir = this.config.persistDir;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${cp.id}.json`);
      fs.writeFileSync(file, JSON.stringify({
        id: cp.id, label: cp.label, sessionId: cp.sessionId,
        state: cp.state, createdAt: cp.createdAt, timestamp: cp.timestamp, size: cp.size,
      }, null, 2));
    } catch { /* non-fatal */ }
  }

  _loadFromDisk(checkpointId) {
    if (!this.config.persistDir) return null;
    try {
      const file = path.join(this.config.persistDir, `${checkpointId}.json`);
      if (!fs.existsSync(file)) return null;
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const cp = Object.assign(new Checkpoint(data.label, data.state, data.sessionId), data);
      this._indexCheckpoint(cp);
      return cp;
    } catch {
      return null;
    }
  }

  _deleteFromDisk(checkpointId) {
    if (!this.config.persistDir) return;
    try {
      const file = path.join(this.config.persistDir, `${checkpointId}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch { /* non-fatal */ }
  }
}

module.exports = { UnifiedCheckpointManager, Checkpoint };
