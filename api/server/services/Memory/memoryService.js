/**
 * memoryService.js — Fase 10 (Memory por capas): memoria persistente del
 * agente con recuperación por relevancia.
 *
 * Distinto de contextLayers.js (Fase 4 — ensamblaje de contexto por capas
 * L0-L7): este módulo es la MEMORIA del agente: lo que aprende/recuerda
 * entre turnos y sesiones, recuperado por relevancia (no inyectar todo).
 *
 * Capas (doc §10):
 *   - SHORT: ventana reciente (últimos N eventos del turno actual).
 *   - SESSION: hechos/decisiones de la sesión actual.
 *   - PROJECT: conocimiento del proyecto (persiste por projectId).
 *   - HISTORICAL: patrones aprendidos entre sesiones (persiste por userId).
 *   - ARTIFACT: resultados grandes (delegado a ArtifactStore de la Fase 4).
 *
 * Retrieval por relevancia: score = layerWeight * recency * frequency.
 * Regla del doc: "no inyectar todo" — solo top-K por score.
 *
 * Persistencia: las capas PROJECT e HISTORICAL persisten a disco (JSON file)
 * para sobrevivir reinicios. SHORT y SESSION son volátiles (in-memory).
 */

const fs = require('fs');
const path = require('path');

/** Capas de memoria con peso (mayor = más relevante por defecto). */
const MemoryLayer = Object.freeze({
  SHORT: 'short',
  SESSION: 'session',
  PROJECT: 'project',
  HISTORICAL: 'historical',
  ARTIFACT: 'artifact',
  RESEARCH: 'research',   // FASE 5: investigaciones guardadas (Face 7 §42)
  ERROR: 'error_log',     // FASE 5: errores + causa + solución (Face 7 §64)
});

const LAYER_WEIGHT = Object.freeze({
  [MemoryLayer.SHORT]: 1.5,
  [MemoryLayer.SESSION]: 1.2,
  [MemoryLayer.PROJECT]: 1.0,
  [MemoryLayer.HISTORICAL]: 0.8,
  [MemoryLayer.ARTIFACT]: 0.5,
  [MemoryLayer.RESEARCH]: 1.1,  // research memories are highly relevant
  [MemoryLayer.ERROR]: 0.9,     // error memories inform future decisions
});

/** Tipos de entrada de memoria. */
const MemoryType = Object.freeze({
  DECISION: 'decision',
  FACT: 'fact',
  PATTERN: 'pattern',
  ERROR: 'error',
  LEARNING: 'learning',
  PREFERENCE: 'preference',
  RESEARCH_RESULT: 'research_result', // FASE 5: saved research findings
  ERROR_LEARNED: 'error_learned',     // FASE 5: error + prevention recipe
});

/** Decaimiento temporal (score de recency). */
const RECENCY_HALF_LIFE_MS = 1000 * 60 * 60; // 1h

let _idCounter = 0;
function nextId() {
  _idCounter += 1;
  return `mem_${Date.now()}_${_idCounter}`;
}

const PERSIST_DIR = path.join(process.cwd(), 'data', 'agent_memory');

/** FASE 5 — MongoDB write-through (best-effort, never crashes the agent). */
const MONGO_PERSISTENT_LAYERS = new Set([
  MemoryLayer.PROJECT, MemoryLayer.HISTORICAL, MemoryLayer.RESEARCH, MemoryLayer.ERROR,
]);

async function writeToMongo(entry) {
  try {
    const { AgentMemory } = require('~/models');
    if (typeof AgentMemory?.create === 'function') {
      await AgentMemory.create({
        memId: entry.id,
        layer: entry.layer,
        type: entry.type,
        content: entry.content,
        userId: entry.userId,
        projectId: entry.projectId,
        tags: entry.tags,
        importance: entry.importance,
        timestamp: new Date(entry.timestamp),
      });
    }
  } catch {
    // MongoDB unavailable — fall back to disk only
  }
}

async function loadFromMongo(layer, scopeField, scopeValue) {
  try {
    const { AgentMemory } = require('~/models');
    if (typeof AgentMemory?.find === 'function') {
      const docs = await AgentMemory.find({ layer, [scopeField]: scopeValue }).lean();
      return docs.map((d) => ({
        id: d.memId || String(d._id),
        layer: d.layer,
        type: d.type,
        content: d.content,
        userId: d.userId,
        projectId: d.projectId,
        tags: d.tags || [],
        importance: d.importance || 0.5,
        frequency: d.frequency || 0,
        timestamp: d.timestamp ? new Date(d.timestamp).getTime() : Date.now(),
      }));
    }
  } catch {
    // ignore
  }
  return [];
}

function persistenceFile(layer, scopeId) {
  return path.join(PERSIST_DIR, `${layer}_${scopeId || 'default'}.json`);
}

function loadFromDisk(layer, scopeId) {
  try {
    const file = persistenceFile(layer, scopeId);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    }
  } catch {
    // ignore corrupt/missing files
  }
  return [];
}

function saveToDisk(layer, scopeId, entries) {
  try {
    if (!fs.existsSync(PERSIST_DIR)) {
      fs.mkdirSync(PERSIST_DIR, { recursive: true });
    }
    const file = persistenceFile(layer, scopeId);
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf8');
  } catch {
    // persistence is best-effort; never crash the agent loop
  }
}

/**
 * MemoryService: almacén de memoria del agente con recuperación por relevancia.
 * L1 = Map (rápido), L2 = disco JSON (persistente para PROJECT/HISTORICAL).
 */
class MemoryService {
  constructor() {
    this.entries = new Map();
    this.maxShort = 50;
    this._loadedScopes = new Set();
  }

  /**
   * Carga perezosa de entradas persistentes para un scope dado.
   * FASE 5: PROJECT, HISTORICAL, RESEARCH, ERROR_LOG persist to both disk + MongoDB.
   */
  _ensureLoaded(layer, scopeId) {
    const key = `${layer}:${scopeId}`;
    if (this._loadedScopes.has(key)) {
      return;
    }
    this._loadedScopes.add(key);
    if (MONGO_PERSISTENT_LAYERS.has(layer)) {
      const loaded = loadFromDisk(layer, scopeId);
      for (const entry of loaded) {
        if (!this.entries.has(entry.id)) {
          this.entries.set(entry.id, entry);
        }
      }
      // Also try MongoDB (async, best-effort — fire and forget)
      const scopeField = layer === MemoryLayer.PROJECT ? 'projectId' : 'userId';
      loadFromMongo(layer, scopeField, scopeId).then((mongoEntries) => {
        for (const entry of mongoEntries) {
          if (!this.entries.has(entry.id)) {
            this.entries.set(entry.id, entry);
          }
        }
      }).catch(() => {});
    }
  }

  /**
   * Guarda una entrada de memoria.
   * @param {object} params
   * @returns {object} MemoryEntry
   */
  remember({
    layer,
    type = MemoryType.FACT,
    content,
    projectId,
    userId,
    tags = [],
    importance = 0.5,
  }) {
    const entry = {
      id: nextId(),
      layer,
      type,
      content,
      timestamp: Date.now(),
      projectId: projectId || null,
      userId: userId || null,
      frequency: 0,
      tags,
      importance,
    };
    this.entries.set(entry.id, entry);
    if (layer === MemoryLayer.SHORT) {
      this._evictShort();
    }
    if (MONGO_PERSISTENT_LAYERS.has(layer)) {
      const scopeId = layer === MemoryLayer.PROJECT || layer === MemoryLayer.RESEARCH
        ? projectId
        : userId;
      this._ensureLoaded(layer, scopeId);
      const persistent = Array.from(this.entries.values()).filter(
        (e) => e.layer === layer,
      );
      saveToDisk(layer, scopeId, persistent);
      writeToMongo(entry).catch(() => {}); // FASE 5: MongoDB write-through (async, best-effort)
    }
    return entry;
  }

  /** Evicción LRU de la capa SHORT. */
  _evictShort() {
    const shortEntries = Array.from(this.entries.values())
      .filter((e) => e.layer === MemoryLayer.SHORT)
      .sort((a, b) => a.timestamp - b.timestamp);
    while (shortEntries.length > this.maxShort) {
      const oldest = shortEntries.shift();
      this.entries.delete(oldest.id);
    }
  }

  /**
   * Recupera memorias por relevancia.
   * Score = layerWeight * recency * (1 + frequency*0.1) * (1 + importance).
   * @param {object} params
   * @returns {object[]} ordenadas por score descendente
   */
  recall({ query, layer, projectId, userId, topK = 10 } = {}) {
    if (layer === MemoryLayer.PROJECT && projectId) {
      this._ensureLoaded(layer, projectId);
    }
    if (layer === MemoryLayer.HISTORICAL && userId) {
      this._ensureLoaded(layer, userId);
    }
    if (!layer) {
      if (projectId) {
        this._ensureLoaded(MemoryLayer.PROJECT, projectId);
      }
      if (userId) {
        this._ensureLoaded(MemoryLayer.HISTORICAL, userId);
      }
    }
    const now = Date.now();
    let candidates = Array.from(this.entries.values());

    if (layer) {
      candidates = candidates.filter((e) => e.layer === layer);
    }
    if (projectId) {
      candidates = candidates.filter(
        (e) => e.layer !== MemoryLayer.HISTORICAL || e.projectId === projectId,
      );
    }
    if (userId) {
      candidates = candidates.filter((e) => e.layer !== MemoryLayer.PROJECT || e.userId === userId);
    }

    const q = (query || '').toLowerCase();
    const scored = candidates.map((e) => {
      const recency = Math.exp(-(now - e.timestamp) / RECENCY_HALF_LIFE_MS);
      const layerW = LAYER_WEIGHT[e.layer] || 1;
      const freqBoost = 1 + e.frequency * 0.1;
      const impBoost = 1 + (e.importance || 0);
      let relevance = layerW * recency * freqBoost * impBoost;

      if (q) {
        const inContent = e.content.toLowerCase().includes(q);
        const inTags = (e.tags || []).some((t) => t.toLowerCase().includes(q));
        relevance *= inContent || inTags ? 2 : 0.1;
      }
      return { entry: e, score: relevance };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK).map((s) => {
      s.entry.frequency += 1;
      return s.entry;
    });
    return top;
  }

  /** Recupera una entrada por id (sin afectar score). */
  get(id) {
    return this.entries.get(id) || null;
  }

  /** Olvida una entrada. */
  forget(id) {
    const entry = this.entries.get(id);
    const deleted = this.entries.delete(id);
    if (
      deleted &&
      entry &&
      (entry.layer === MemoryLayer.PROJECT || entry.layer === MemoryLayer.HISTORICAL)
    ) {
      const scopeId = entry.layer === MemoryLayer.PROJECT ? entry.projectId : entry.userId;
      const persistent = Array.from(this.entries.values()).filter(
        (e) =>
          e.layer === entry.layer &&
          (entry.layer === MemoryLayer.PROJECT
            ? e.projectId === entry.projectId
            : e.userId === entry.userId),
      );
      saveToDisk(entry.layer, scopeId, persistent);
    }
    return deleted;
  }

  /** Limpia una capa o todo. */
  clear(layer) {
    if (!layer) {
      this.entries.clear();
      this._loadedScopes.clear();
      return;
    }
    const removed = [];
    for (const [id, e] of this.entries) {
      if (e.layer === layer) {
        removed.push(e);
        this.entries.delete(id);
      }
    }
    if (layer === MemoryLayer.PROJECT || layer === MemoryLayer.HISTORICAL) {
      for (const e of removed) {
        const scopeId = layer === MemoryLayer.PROJECT ? e.projectId : e.userId;
        saveToDisk(layer, scopeId, []);
      }
    }
  }

  /**
   * Prune stale or low-relevance memory entries.
   * SHORT and SESSION layers are never pruned here (they self-expire).
   *
   * @param {object} [opts]
   * @param {number} [opts.olderThanMs]  — remove entries older than this many ms
   * @param {number} [opts.minImportance] — remove entries below this importance (0–1)
   * @param {string} [opts.layer]        — restrict to a specific layer
   * @param {string} [opts.userId]       — restrict to a userId scope
   * @param {string} [opts.projectId]    — restrict to a projectId scope
   * @returns {{ removed: number, ids: string[] }}
   */
  prune({ olderThanMs, minImportance, layer, userId, projectId } = {}) {
    const now = Date.now();
    const cutoff = olderThanMs != null ? now - olderThanMs : null;
    const removedIds = [];
    const affectedPersist = new Map(); // layer -> Set of scopeIds

    for (const [id, entry] of this.entries) {
      // Never auto-prune volatile layers
      if (entry.layer === MemoryLayer.SHORT || entry.layer === MemoryLayer.SESSION) continue;

      if (layer && entry.layer !== layer) continue;
      if (userId && entry.userId !== userId) continue;
      if (projectId && entry.projectId !== projectId) continue;

      const tooOld = cutoff != null && entry.timestamp < cutoff;
      const tooLow = minImportance != null && (entry.importance || 0) < minImportance;

      if (tooOld || tooLow) {
        this.entries.delete(id);
        removedIds.push(id);

        // Track which persistent scopes need to be re-saved to disk
        if (MONGO_PERSISTENT_LAYERS.has(entry.layer)) {
          const scopeId = entry.layer === MemoryLayer.PROJECT || entry.layer === MemoryLayer.RESEARCH
            ? entry.projectId
            : entry.userId;
          if (!affectedPersist.has(entry.layer)) affectedPersist.set(entry.layer, new Set());
          affectedPersist.get(entry.layer).add(scopeId);
        }
      }
    }

    // Re-save pruned persistent layers to disk
    for (const [pruneLayer, scopeIds] of affectedPersist) {
      for (const scopeId of scopeIds) {
        const remaining = Array.from(this.entries.values()).filter(
          (e) => e.layer === pruneLayer,
        );
        saveToDisk(pruneLayer, scopeId, remaining);
      }
    }

    return { removed: removedIds.length, ids: removedIds };
  }

  /**
   * Start automatic decay — prunes stale/low-importance entries on a timer.
   * The timer is unref'd so it won't prevent process shutdown.
   *
   * @param {number} [intervalMs=3600000]  — how often to prune (default: 1h)
   * @param {object} [pruneOpts]           — passed to prune()
   * @param {number} [pruneOpts.olderThanMs=604800000] — drop entries older than 7 days
   * @param {number} [pruneOpts.minImportance=0.1]     — drop entries below this score
   * @returns {{ intervalMs: number, pruneOpts: object }}
   */
  startAutoDecay(intervalMs = 3_600_000, pruneOpts = { olderThanMs: 7 * 24 * 3_600_000, minImportance: 0.1 }) {
    if (this._decayTimer) clearInterval(this._decayTimer);
    this._decayTimer = setInterval(() => {
      try { this.prune(pruneOpts); } catch { /* best-effort */ }
    }, intervalMs);
    this._decayTimer.unref();
    this._decayOpts = { intervalMs, pruneOpts };
    return { intervalMs, pruneOpts };
  }

  /** Stop the auto-decay timer. */
  stopAutoDecay() {
    if (this._decayTimer) {
      clearInterval(this._decayTimer);
      this._decayTimer = null;
      this._decayOpts = null;
    }
    return { stopped: true };
  }

  /** Estadísticas. */
  stats() {
    const byLayer = {};
    for (const e of this.entries.values()) {
      byLayer[e.layer] = (byLayer[e.layer] || 0) + 1;
    }
    return { total: this.entries.size, byLayer, autoDecay: this._decayOpts || null };
  }
}

module.exports = {
  MemoryLayer,
  MemoryType,
  LAYER_WEIGHT,
  RECENCY_HALF_LIFE_MS,
  MemoryService,
};
