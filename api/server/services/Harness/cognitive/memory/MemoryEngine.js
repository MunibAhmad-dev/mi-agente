'use strict';

const crypto = require('crypto');

// MongoDB helper — optional, gracefully disabled when DB is not connected
let _mc = null;
function mc() {
  if (_mc) return _mc;
  try {
    _mc = require('~/models/MemoryCollections');
  } catch {
    _mc = null;
  }
  return _mc;
}

function isValidObjectId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * MemoryEngine - Orchestrates 8 memory types.
 * In-memory layers act as a hot cache; every remember() also writes
 * through to MongoDB (SessionMemory + HistoricalMemory) when a valid
 * userId (24-char hex ObjectId) is available.
 */
class MemoryEngine {
  constructor(config = {}) {
    this.config = config;
    this.bus = config.bus;
    this.userId = config.userId || 'default';
    this.projectId = config.projectId || 'default';
    this.sessionId = config.sessionId || `sess_${Date.now()}`;

    this.layers = {
      working: new WorkingMemory(),
      episodic: new EpisodicMemory(),
      semantic: new SemanticMemory(),
      procedural: new ProceduralMemory(),
      user: new UserMemory(),
      temporal: new TemporalMemory(),
      relational: new RelationalMemory(),
      meta: new MetaMemory(),
    };

    this.stats = { remember: 0, recall: 0, forget: 0 };
  }

  // ── Persistence helpers ──────────────────────────────────────────────────

  /**
   * Fire-and-forget write to MongoDB. Uses entry.userId (set per-request),
   * not this.userId (set at engine construction time).
   */
  async _persistRemember(entry) {
    // Use the userId baked into the entry, not the engine-level default
    const uid = entry.userId;
    if (!isValidObjectId(uid)) return;
    const lib = mc();
    if (!lib) return;
    const content = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
    try {
      const writes = [
        // Session memory: one row per (userId, sessionId, entry.id) — expires in 7 days
        lib.setSessionMemory(uid, this.sessionId, entry.id, content, {
          metadata: { type: entry.type, source: entry.source, tags: entry.tags, importance: entry.importance },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }),
        // Historical log: append-only, kept forever
        lib.recordHistoricalEvent(uid, {
          sessionId: this.sessionId,
          event: `memory:remember:${entry.type}`,
          context: { id: entry.id, content: entry.content, tags: entry.tags, source: entry.source },
          outcome: 'success',
          score: entry.confidence,
          tags: entry.tags || [],
          metadata: entry.metadata || {},
        }),
      ];

      // Project memory: persist high-importance facts for long-term recall
      if (entry.importance === 'high' || entry.importance === 'critical') {
        writes.push(lib.setProjectMemory(uid, entry.projectId || this.projectId, entry.id, content, {
          category: entry.type,
          importance: entry.importance === 'critical' ? 10 : 8,
          metadata: entry.metadata || {},
        }));
      }

      await Promise.all(writes);
    } catch {
      // Silent — MongoDB unavailable or schema violation; in-memory is still intact
    }
  }

  /**
   * Query MongoDB for memories matching a text query (supplements in-memory).
   * userId is taken from options (per-request) not this.userId (engine default).
   */
  async _recallFromDB(query, limit, userId) {
    const uid = userId || this.userId;
    if (!isValidObjectId(uid)) return [];
    const lib = mc();
    if (!lib) return [];
    try {
      const [session, project] = await Promise.all([
        lib.getSessionMemories(uid, this.sessionId),
        lib.getProjectMemories(uid, this.projectId),
      ]);

      const all = [
        ...session.map(r => ({ id: r.key, content: r.value, layer: 'session_db', timestamp: r.createdAt?.getTime?.() || Date.now(), ...((r.metadata) || {}) })),
        ...project.map(r => ({ id: r.key, content: r.value, layer: 'project_db', importance: r.importance, timestamp: r.updatedAt?.getTime?.() || Date.now() })),
      ];

      // Simple text match
      const q = (query || '').toLowerCase();
      return all
        .map(e => ({ ...e, score: this._scoreText((e.content || '').toLowerCase(), q) }))
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch {
      return [];
    }
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

  // ── Public API ───────────────────────────────────────────────────────────

  async remember(fact, context = {}) {
    const entry = {
      id: `mem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      content: fact,
      type: context.type || 'fact',
      source: context.source || 'conversation',
      confidence: context.confidence || 0.8,
      importance: context.importance || 'medium',
      timestamp: context.timestamp || Date.now(),
      userId: context.userId || this.userId,
      projectId: context.projectId || this.projectId,
      tags: context.tags || [],
      metadata: context.metadata || {},
    };

    // In-memory layers (always)
    this.layers.working.add(entry);
    this.layers.episodic.add(entry);
    if (entry.type === 'fact') this.layers.semantic.add(entry);
    if (entry.type === 'procedure') this.layers.procedural.add(entry);
    this.layers.temporal.add(entry);
    if (context.userId) this.layers.user.add(entry);
    this.layers.meta.recordOperation('remember', entry.id);

    this.stats.remember++;

    // MongoDB write-through (fire-and-forget)
    this._persistRemember(entry).catch(() => {});

    if (this.bus) await this.bus.emit('memory:remembered', { entry });
    return entry;
  }

  async recall(query, options = {}) {
    const limit = options.limit || 10;
    const layer = options.layer || null;
    const results = [];

    if (layer && this.layers[layer]) {
      results.push(...this.layers[layer].search(query, limit));
    } else {
      // Search all in-memory layers
      for (const [name, mem] of Object.entries(this.layers)) {
        const found = mem.search(query, Math.ceil(limit / Object.keys(this.layers).length));
        results.push(...found.map(r => ({ ...r, layer: name })));
      }
    }

    // Supplement from MongoDB when in-memory results are sparse
    if (results.length < 3) {
      const dbResults = await this._recallFromDB(query, limit - results.length, options.userId);
      results.push(...dbResults);
    }

    // Sort by relevance and deduplicate by id
    const seen = new Set();
    const deduped = results
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .filter(r => {
        const key = r.id || r.content;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    this.stats.recall++;
    return deduped.slice(0, limit);
  }

  async forget(id, policy = 'soft') {
    if (policy === 'hard') {
      for (const mem of Object.values(this.layers)) {
        if (mem.remove) mem.remove(id);
      }
    } else {
      for (const mem of Object.values(this.layers)) {
        if (mem.markForgotten) mem.markForgotten(id);
      }
    }
    this.stats.forget++;
  }

  async consolidate(options = {}) {
    // Deduplicate in-memory
    const allEntries = new Map();
    for (const [name, mem] of Object.entries(this.layers)) {
      if (mem.getAll) {
        for (const entry of mem.getAll()) {
          const key = `${entry.content}_${entry.type}`;
          if (allEntries.has(key)) {
            allEntries.get(key).sources.push(name);
            allEntries.get(key).confidence = Math.max(allEntries.get(key).confidence, entry.confidence || 0);
          } else {
            allEntries.set(key, { ...entry, sources: [name] });
          }
        }
      }
    }

    // Query MongoDB for this user's DB entries
    let dbConsolidated = 0;
    const uid = options.userId || this.userId;
    if (isValidObjectId(uid)) {
      const lib = mc();
      if (lib) {
        try {
          const [sessionMems, projectMems] = await Promise.all([
            lib.getSessionMemories(uid, this.sessionId),
            lib.getProjectMemories(uid, this.projectId),
          ]);
          dbConsolidated = sessionMems.length + projectMems.length;
        } catch { /* ignore */ }
      }
    }

    return {
      consolidated: allEntries.size,
      duplicates: Math.max(0, this.stats.remember - allEntries.size),
      dbEntries: dbConsolidated,
    };
  }

  getStats() {
    const layerStats = {};
    for (const [name, mem] of Object.entries(this.layers)) {
      layerStats[name] = mem.size ? mem.size() : 0;
    }
    return { ...this.stats, layers: layerStats };
  }
}

// ===================== WORKING MEMORY =====================
class WorkingMemory {
  constructor(maxSize = 50) {
    this._entries = [];
    this._maxSize = maxSize;
  }
  add(entry) {
    this._entries.push({ ...entry, layer: 'working' });
    if (this._entries.length > this._maxSize) this._entries.shift();
  }
  search(query, limit) {
    return this._simpleSearch(this._entries, query, limit);
  }
  clear() { this._entries = []; }
  size() { return this._entries.length; }
  getAll() { return [...this._entries]; }
}

// ===================== EPISODIC MEMORY =====================
class EpisodicMemory {
  constructor() { this._entries = []; }
  add(entry) { this._entries.push({ ...entry, layer: 'episodic' }); }
  search(query, limit) { return this._simpleSearch(this._entries, query, limit); }
  size() { return this._entries.length; }
  getAll() { return [...this._entries]; }
  getRecent(n = 10) { return this._entries.slice(-n); }
  getByTimeRange(start, end) {
    return this._entries.filter(e => e.timestamp >= start && e.timestamp <= end);
  }
}

// ===================== SEMANTIC MEMORY =====================
class SemanticMemory {
  constructor() { this._entries = []; }
  add(entry) { this._entries.push({ ...entry, layer: 'semantic' }); }
  search(query, limit) { return this._simpleSearch(this._entries, query, limit); }
  size() { return this._entries.length; }
  getAll() { return [...this._entries]; }
  getByType(type) { return this._entries.filter(e => e.type === type); }
  getHighConfidence(minConfidence = 0.7) {
    return this._entries.filter(e => (e.confidence || 0) >= minConfidence);
  }
}

// ===================== PROCEDURAL MEMORY =====================
class ProceduralMemory {
  constructor() { this._entries = []; }
  add(entry) { this._entries.push({ ...entry, layer: 'procedural' }); }
  search(query, limit) { return this._simpleSearch(this._entries, query, limit); }
  size() { return this._entries.length; }
  getAll() { return [...this._entries]; }
  getByTask(task) { return this._entries.filter(e => e.content && e.content.includes(task)); }
}

// ===================== USER MEMORY =====================
class UserMemory {
  constructor() { this._entries = new Map(); }
  add(entry) {
    const uid = entry.userId || 'default';
    if (!this._entries.has(uid)) this._entries.set(uid, []);
    this._entries.get(uid).push({ ...entry, layer: 'user' });
  }
  search(query, limit, userId) {
    const entries = userId ? (this._entries.get(userId) || []) : Array.from(this._entries.values()).flat();
    return this._simpleSearch(entries, query, limit);
  }
  size() { return Array.from(this._entries.values()).reduce((s, e) => s + e.length, 0); }
  getAll() { return Array.from(this._entries.values()).flat(); }
  getByUser(userId) { return this._entries.get(userId) || []; }
}

// ===================== TEMPORAL MEMORY =====================
class TemporalMemory {
  constructor() { this._entries = []; }
  add(entry) { this._entries.push({ ...entry, layer: 'temporal' }); }
  search(query, limit) { return this._simpleSearch(this._entries, query, limit); }
  size() { return this._entries.length; }
  getAll() { return [...this._entries]; }
  getRecent(n = 10) { return this._entries.slice(-n); }
  getOlderThan(ms) {
    const cutoff = Date.now() - ms;
    return this._entries.filter(e => (e.timestamp || 0) < cutoff);
  }
  applyDecay(decayRate = 0.01) {
    const now = Date.now();
    for (const entry of this._entries) {
      const age = now - (entry.timestamp || now);
      entry.decayFactor = Math.max(0.1, 1 - (age / (86400000 * 30)) * decayRate);
    }
  }
}

// ===================== RELATIONAL MEMORY =====================
class RelationalMemory {
  constructor() { this._relations = []; }
  add(entry) {
    if (entry.relation) this._relations.push(entry);
  }
  search(query, limit) {
    return this._relations
      .filter(r => (r.content || '').includes(query) || (r.relation || '').includes(query))
      .slice(0, limit)
      .map(r => ({ ...r, score: 0.5, layer: 'relational' }));
  }
  size() { return this._relations.length; }
  getAll() { return [...this._relations]; }
  getByEntity(entityId) {
    return this._relations.filter(r => r.subject === entityId || r.object === entityId);
  }
}

// ===================== META MEMORY =====================
class MetaMemory {
  constructor() { this._operations = []; this._stats = { totalOps: 0 }; }
  add() { /* meta memory stores metadata about memories */ }
  recordOperation(op, memId) {
    this._operations.push({ op, memId, timestamp: Date.now() });
    this._stats.totalOps++;
  }
  search() { return []; }
  size() { return this._operations.length; }
  getAll() { return [...this._operations]; }
  getStats() { return { ...this._stats, operations: this._operations.length }; }
}

// ===================== SHARED SEARCH =====================
const addSearch = (Cls) => {
  Cls.prototype._simpleSearch = function(entries, query, limit) {
    const q = (query || '').toLowerCase();
    return entries
      .map(e => ({
        ...e,
        score: this._scoreText((e.content || '').toLowerCase(), q),
      }))
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  };
  Cls.prototype._scoreText = function(text, query) {
    if (!query || !text) return 0;
    const words = query.split(/\s+/);
    let score = 0;
    for (const word of words) {
      if (word.length < 2) continue;
      if (text.includes(word)) score += 1;
      for (let i = 0; i <= text.length - word.length; i++) {
        if (text.substring(i, i + word.length).includes(word)) { score += 0.5; break; }
      }
    }
    return score / Math.max(words.length, 1);
  };
};

[WorkingMemory, EpisodicMemory, SemanticMemory, ProceduralMemory,
  UserMemory, TemporalMemory, RelationalMemory, MetaMemory].forEach(addSearch);

module.exports = { MemoryEngine };
