'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SNAPSHOT_KEY = 'knowledge_graph_snapshot';
const DISK_SNAPSHOT_DIR = path.join(process.cwd(), 'data', 'knowledge_graphs');

let _ProjectMemory = null;
function getProjectMemory() {
  if (!_ProjectMemory) {
    try { _ProjectMemory = require('~/models/MemoryCollections').ProjectMemory; } catch { /* no DB */ }
  }
  return _ProjectMemory;
}

function diskSnapshotPath(userId, projectId) {
  return path.join(DISK_SNAPSHOT_DIR, `${userId}_${projectId || 'default'}.json`);
}

function saveToDisk(userId, projectId, snapshot) {
  try {
    if (!fs.existsSync(DISK_SNAPSHOT_DIR)) {
      fs.mkdirSync(DISK_SNAPSHOT_DIR, { recursive: true });
    }
    fs.writeFileSync(diskSnapshotPath(userId, projectId), JSON.stringify(snapshot), 'utf8');
  } catch { /* best-effort */ }
}

function loadFromDisk(userId, projectId) {
  try {
    const file = diskSnapshotPath(userId, projectId);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch { /* ignore corrupt file */ }
  return null;
}

/**
 * KnowledgeEngine - Knowledge graph with entities, relations, causal chains, temporal tracking.
 * Supports optional MongoDB write-through persistence via ProjectMemory.
 * Pass `userId` and `projectId` in config to enable persistence.
 */
class KnowledgeEngine {
  constructor(config = {}) {
    this.config = config;
    this.bus = config.bus;
    this.userId = config.userId || null;
    this.projectId = config.projectId || 'default';
    this.entities = new Map();
    this.relations = [];
    this.causalChains = [];
    this.temporalEntries = [];
  }

  async addEntity(entity) {
    const id = entity.id || `ent_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const entry = {
      id,
      type: entity.type || 'concept',
      content: entity.content || entity.name || '',
      name: entity.name || '',
      attributes: entity.attributes || {},
      confidence: entity.confidence || 0.8,
      source: entity.source || 'unknown',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      versions: [{ content: entity.content, timestamp: Date.now(), confidence: entity.confidence || 0.8 }],
    };
    this.entities.set(id, entry);
    if (this.bus) await this.bus.emit('knowledge:entity_added', { id, type: entry.type });
    this.persist().catch(() => {});
    return entry;
  }

  async addRelation(relation) {
    const entry = {
      id: relation.id || `rel_${Date.now()}`,
      subject: relation.subject,
      predicate: relation.predicate,
      object: relation.object,
      confidence: relation.confidence || 0.8,
      source: relation.source || 'unknown',
      createdAt: Date.now(),
    };
    this.relations.push(entry);
    this.persist().catch(() => {});
    return entry;
  }

  async addCausalChain(chain) {
    const entry = {
      id: chain.id || `causal_${Date.now()}`,
      cause: chain.cause,
      effect: chain.effect,
      mechanism: chain.mechanism || '',
      confidence: chain.confidence || 0.7,
      evidence: chain.evidence || [],
      createdAt: Date.now(),
    };
    this.causalChains.push(entry);
    return entry;
  }

  async addTemporal(entityId, time, data) {
    this.temporalEntries.push({
      entityId,
      time,
      data,
      timestamp: Date.now(),
    });
  }

  async query(pattern, options = {}) {
    const results = [];
    const q = (typeof pattern === 'string' ? pattern : pattern.content || '').toLowerCase();

    // Search entities
    for (const [id, entity] of this.entities) {
      const score = this._scoreText((entity.content || '').toLowerCase(), q);
      if (score > 0) results.push({ ...entity, score, type_result: 'entity' });
    }

    // Search relations
    for (const rel of this.relations) {
      const text = `${rel.subject} ${rel.predicate} ${rel.object}`.toLowerCase();
      const score = this._scoreText(text, q);
      if (score > 0) results.push({ ...rel, score, type_result: 'relation' });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.limit || 20);
  }

  async getCausalChain(eventId) {
    return this.causalChains.filter(c => c.cause === eventId || c.effect === eventId);
  }

  async updateEntity(id, updates) {
    const entity = this.entities.get(id);
    if (!entity) return null;
    Object.assign(entity, updates, { updatedAt: Date.now() });
    entity.versions.push({ content: updates.content || entity.content, timestamp: Date.now(), confidence: updates.confidence || entity.confidence });
    return entity;
  }

  getEntity(id) { return this.entities.get(id); }
  getAllEntities() { return Array.from(this.entities.values()); }
  getRelations(entityId) {
    return this.relations.filter(r => r.subject === entityId || r.object === entityId);
  }

  getStats() {
    return {
      entities: this.entities.size,
      relations: this.relations.length,
      causalChains: this.causalChains.length,
      temporalEntries: this.temporalEntries.length,
    };
  }

  _scoreText(text, query) {
    if (!query || !text) return 0;
    const words = query.split(/\s+/);
    let score = 0;
    for (const word of words) {
      if (word.length < 2) continue;
      if (text.includes(word)) score += 1;
    }
    return score / Math.max(words.length, 1);
  }

  /**
   * Persist the current graph to MongoDB and/or disk.
   * MongoDB is the primary store; disk JSON is always written as a fallback.
   * No-op when userId is not set.
   */
  async persist() {
    if (!this.userId) return;

    const snapshot = {
      entities: [...this.entities.entries()],
      relations: this.relations,
      causalChains: this.causalChains,
      temporalEntries: this.temporalEntries,
      savedAt: Date.now(),
    };

    // Always write disk snapshot (fast, no-op on failure)
    saveToDisk(this.userId, this.projectId, snapshot);

    const PM = getProjectMemory();
    if (!PM) return;
    try {
      await PM.findOneAndUpdate(
        { userId: this.userId, projectId: this.projectId, key: SNAPSHOT_KEY },
        { $set: { value: JSON.stringify(snapshot), category: 'knowledge_graph' } },
        { upsert: true, new: true },
      );
    } catch (err) {
      if (this.bus) this.bus.emit?.('knowledge:persist_error', { error: err.message });
    }
  }

  /**
   * Load a previously persisted graph.
   * Tries MongoDB first; falls back to disk snapshot.
   * Returns a new KnowledgeEngine instance with the restored data.
   */
  static async restore(userId, projectId = 'default', config = {}) {
    const engine = new KnowledgeEngine({ ...config, userId, projectId });

    let snap = null;

    // Try MongoDB
    const PM = getProjectMemory();
    if (PM) {
      try {
        const doc = await PM.findOne({ userId, projectId, key: SNAPSHOT_KEY }).lean();
        if (doc?.value) snap = JSON.parse(doc.value);
      } catch { /* fall through to disk */ }
    }

    // Disk fallback
    if (!snap) {
      snap = loadFromDisk(userId, projectId);
    }

    if (snap) {
      try {
        engine.entities = new Map(snap.entities || []);
        engine.relations = snap.relations || [];
        engine.causalChains = snap.causalChains || [];
        engine.temporalEntries = snap.temporalEntries || [];
      } catch {
        // Corrupted snapshot — start fresh
      }
    }

    return engine;
  }
}

module.exports = { KnowledgeEngine };
