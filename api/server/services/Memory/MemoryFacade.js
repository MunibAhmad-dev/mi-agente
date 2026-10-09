'use strict';

/**
 * MemoryFacade — Face 4 / top-10 gap #3.
 *
 * Unified interface to all three memory systems:
 *   1. MemoriaMulticapa  — three-layer (episodic/semantic/procedural) persistent memory
 *   2. CrossSessionMemory — flat cross-session recall
 *   3. WorldModel        — entity/relation/environment state
 *
 * Provides a single entry-point for all memory operations so callers
 * never need to know which backend holds what kind of data.
 *
 * Also consolidates duplicate CheckpointManager usage via a single
 * getCheckpoint() export so there is one instance per process.
 */

// ── Lazy singletons ────────────────────────────────────────────────────────────

let _multicapa = null;
let _crossSession = null;
let _worldModel = null;
let _checkpoint = null;

function getMulticapa() {
  if (!_multicapa) {
    try {
      const { getMemoriaMulticapa } = require('~/server/services/Harness/cognitive/MemoriaMulticapa');
      _multicapa = getMemoriaMulticapa();
    } catch {
      _multicapa = {
        recordEpisode: () => {},
        recallEpisodic: () => [],
        learnFact: () => {},
        recallFact: () => null,
        learnProcedure: () => {},
        recallProcedure: () => null,
        getContext: () => ({ context: '', episodicCount: 0 }),
      };
    }
  }
  return _multicapa;
}

function getCrossSession() {
  if (!_crossSession) {
    try {
      const { CrossSessionMemory } = require('~/server/services/Harness/cognitive/CrossSessionMemory');
      _crossSession = new CrossSessionMemory();
    } catch {
      _crossSession = { saveSession: () => {}, getContext: () => ({ context: '', sessions: [] }) };
    }
  }
  return _crossSession;
}

function getWorldModel() {
  if (!_worldModel) {
    try {
      const { getWorldModel: getter } = require('~/server/services/Harness/cognitive/WorldModel');
      _worldModel = getter();
    } catch {
      _worldModel = {
        upsertEntity: () => {},
        getEntity: () => null,
        addRelation: () => {},
        updateEnv: () => {},
        getEnv: () => ({}),
        getContextSummary: () => '',
      };
    }
  }
  return _worldModel;
}

function getCheckpoint() {
  if (!_checkpoint) {
    try {
      const { CheckpointManager } = require('~/server/services/Harness/cognitive/CheckpointManager');
      _checkpoint = new CheckpointManager({ autoCheckpoint: true });
    } catch {
      _checkpoint = { save: () => ({ success: false }), load: () => null };
    }
  }
  return _checkpoint;
}

// ── Facade API ─────────────────────────────────────────────────────────────────

/**
 * Get combined memory context for a user + query across all three memory systems.
 * Returns a single string suitable for injection into an LLM system prompt.
 *
 * @param {string} userId
 * @param {string} query  - current user message / task description
 * @param {object} [opts] { episodicLimit, includeCrossSession, includeWorldModel }
 * @returns {{ context: string, sources: string[] }}
 */
function getContext(userId, query, opts = {}) {
  const { episodicLimit = 3, includeCrossSession = true, includeWorldModel = true } = opts;
  const parts = [];
  const sources = [];

  // Primary: MemoriaMulticapa three-layer recall
  try {
    const mm = getMulticapa();
    const { context, episodicCount } = mm.getContext(userId, query, { episodicLimit });
    if (episodicCount > 0 && context) {
      parts.push(`[Episodic/Semantic Memory]\n${context}`);
      sources.push('multicapa');
    }
  } catch { /* non-fatal */ }

  // Fallback supplement: CrossSessionMemory
  if (includeCrossSession) {
    try {
      const cs = getCrossSession();
      const { context, sessions } = cs.getContext(userId, query, episodicLimit);
      if (sessions.length > 0 && context && !sources.includes('multicapa')) {
        parts.push(`[Session History]\n${context}`);
        sources.push('crossSession');
      }
    } catch { /* non-fatal */ }
  }

  // WorldModel environment context
  if (includeWorldModel) {
    try {
      const wm = getWorldModel();
      const worldSummary = wm.getContextSummary();
      if (worldSummary) {
        parts.push(`[World State]\n${worldSummary}`);
        sources.push('worldModel');
      }
    } catch { /* non-fatal */ }
  }

  return { context: parts.join('\n\n'), sources };
}

/**
 * Record an episodic memory entry (wraps MemoriaMulticapa).
 */
function recordEpisode(userId, content, tags = []) {
  try { getMulticapa().recordEpisode(userId, content, tags); } catch { /* non-fatal */ }
}

/**
 * Learn a semantic fact (wraps MemoriaMulticapa).
 */
function learnFact(key, value, meta = {}) {
  try { getMulticapa().learnFact(key, value, meta); } catch { /* non-fatal */ }
}

/**
 * Recall a semantic fact by key.
 */
function recallFact(key) {
  try { return getMulticapa().recallFact(key); } catch { return null; }
}

/**
 * Learn a procedural step sequence for a task type.
 */
function learnProcedure(taskType, steps, quality) {
  try { getMulticapa().learnProcedure(taskType, steps, quality); } catch { /* non-fatal */ }
}

/**
 * Recall the best procedure for a task type.
 */
function recallProcedure(taskType) {
  try { return getMulticapa().recallProcedure(taskType); } catch { return null; }
}

/**
 * Save a completed session to CrossSessionMemory.
 */
function saveSession(sessionData) {
  try { getCrossSession().saveSession(sessionData); } catch { /* non-fatal */ }
}

/**
 * Update the WorldModel environment snapshot.
 */
function updateWorld(patch) {
  try { getWorldModel().updateEnv(patch); } catch { /* non-fatal */ }
}

/**
 * Register or update an entity in the WorldModel.
 */
function upsertEntity(entity) {
  try { getWorldModel().upsertEntity(entity); } catch { /* non-fatal */ }
}

/**
 * Save a checkpoint (wraps canonical CheckpointManager instance).
 */
function saveCheckpoint(sessionId, state, opts) {
  try { return getCheckpoint().save(sessionId, state, opts); } catch { return { success: false }; }
}

/**
 * Load a checkpoint.
 */
function loadCheckpoint(sessionId) {
  try { return getCheckpoint().load(sessionId); } catch { return null; }
}

module.exports = {
  // Combined context
  getContext,
  // Episodic
  recordEpisode,
  // Semantic
  learnFact,
  recallFact,
  // Procedural
  learnProcedure,
  recallProcedure,
  // Cross-session
  saveSession,
  // WorldModel
  updateWorld,
  upsertEntity,
  // Checkpoints
  saveCheckpoint,
  loadCheckpoint,
  // Raw accessors (for advanced callers)
  getMulticapa,
  getCrossSession,
  getWorldModel,
  getCheckpoint,
};
