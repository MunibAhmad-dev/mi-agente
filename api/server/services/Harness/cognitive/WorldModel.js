'use strict';

/**
 * WorldModel — Phase 5: Agent's internal model of the world state.
 *
 * Tracks entities, their relationships, and the current environment context.
 * Updated by the ExecutiveLoop after each run; queried before actions to
 * give the agent situational awareness beyond the immediate conversation.
 *
 * Storage: in-memory with optional JSON persistence to disk.
 */

const fs = require('fs');
const path = require('path');

class WorldModel {
  constructor(options = {}) {
    this.persistPath = options.persistPath || path.join(process.cwd(), 'data', 'world_model.json');
    this._entities = new Map();     // entityId → { id, type, name, attributes, updatedAt }
    this._relations = [];            // { from, to, relation, confidence, ts }
    this._envState = {};             // current environment snapshot: { time, activeUser, activeGoals, ... }
    this._history = [];              // last N world-state snapshots
    this._maxHistory = options.maxHistory || 50;
    this._loaded = false;
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  init() {
    if (this._loaded) return this;
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
        if (raw.entities) raw.entities.forEach(([id, e]) => this._entities.set(id, e));
        if (raw.relations) this._relations = raw.relations;
        if (raw.envState) this._envState = raw.envState;
      }
    } catch { /* non-fatal — start fresh */ }
    this._loaded = true;
    return this;
  }

  // ── Entity management ───────────────────────────────────────────────────────

  /**
   * Upsert an entity in the world model.
   * @param {{ id: string, type: string, name: string, attributes?: object }} entity
   */
  upsertEntity(entity) {
    if (!entity?.id) throw new Error('entity.id required');
    const existing = this._entities.get(entity.id) || {};
    const updated = {
      ...existing,
      ...entity,
      attributes: { ...(existing.attributes || {}), ...(entity.attributes || {}) },
      updatedAt: new Date().toISOString(),
    };
    this._entities.set(entity.id, updated);
    this._persist();
    return updated;
  }

  getEntity(id) {
    return this._entities.get(id) || null;
  }

  queryEntities({ type, name } = {}) {
    let results = Array.from(this._entities.values());
    if (type) results = results.filter((e) => e.type === type);
    if (name) results = results.filter((e) => e.name && e.name.toLowerCase().includes(name.toLowerCase()));
    return results;
  }

  // ── Relation management ─────────────────────────────────────────────────────

  /**
   * Add a directed relation between two entities.
   * @param {string} fromId
   * @param {string} toId
   * @param {string} relation  e.g. "depends_on", "produces", "blocks"
   * @param {number} confidence  0–1
   */
  addRelation(fromId, toId, relation, confidence = 1.0) {
    this._relations.push({ from: fromId, to: toId, relation, confidence, ts: Date.now() });
    // Keep last 500 relations
    if (this._relations.length > 500) this._relations = this._relations.slice(-500);
    this._persist();
  }

  getRelations(entityId) {
    return this._relations.filter((r) => r.from === entityId || r.to === entityId);
  }

  // ── Environment state ───────────────────────────────────────────────────────

  /**
   * Update the current environment state snapshot.
   * Called by ExecutiveLoop after each run to keep the model current.
   * @param {object} patch  partial update merged into envState
   */
  updateEnv(patch) {
    this._envState = { ...this._envState, ...patch, lastUpdated: new Date().toISOString() };
    // Record snapshot in history
    this._history.push({ ...this._envState });
    if (this._history.length > this._maxHistory) this._history.shift();
    this._persist();
  }

  getEnv() {
    return { ...this._envState };
  }

  getHistory(limit = 10) {
    return this._history.slice(-limit);
  }

  // ── Context snapshot ────────────────────────────────────────────────────────

  /**
   * Get a concise snapshot string suitable for injecting into an LLM prompt.
   */
  getContextSummary() {
    const env = this._envState;
    const entityCount = this._entities.size;
    const lines = [`World Model (${entityCount} entities tracked)`];
    if (env.activeGoals?.length) lines.push(`Active goals: ${env.activeGoals.slice(0, 3).join(', ')}`);
    if (env.activeUser) lines.push(`Active user: ${env.activeUser}`);
    if (env.lastIntent) lines.push(`Last intent: ${env.lastIntent}`);
    if (env.knownConstraints?.length) lines.push(`Constraints: ${env.knownConstraints.slice(0, 2).join('; ')}`);
    return lines.join('\n');
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  _persist() {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.persistPath, JSON.stringify({
        entities: Array.from(this._entities.entries()),
        relations: this._relations.slice(-200),
        envState: this._envState,
      }, null, 2));
    } catch { /* non-fatal */ }
  }

  getStats() {
    return {
      entities: this._entities.size,
      relations: this._relations.length,
      historySnapshots: this._history.length,
      lastUpdated: this._envState.lastUpdated || null,
    };
  }
}

// Singleton — shared across the process
let _instance = null;
function getWorldModel(options) {
  if (!_instance) _instance = new WorldModel(options).init();
  return _instance;
}

module.exports = { WorldModel, getWorldModel };
