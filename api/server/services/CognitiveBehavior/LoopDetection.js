'use strict';

/**
 * LoopDetection — Gen B Phase 18.
 * Detects repetitive/circular thinking loops across session messages.
 * Hashes recent messages and checks for high-similarity repetition.
 *
 * Loop types:
 *   exact      — identical message sent multiple times
 *   semantic   — messages with >= 80% word overlap
 *   structural — same question structure repeated (different entities)
 */

const WINDOW_SIZE = 10; // how many recent messages to track
const EXACT_LOOP_THRESHOLD = 2; // same hash twice → loop
const SEMANTIC_OVERLAP_THRESHOLD = 0.75;

function hashMessage(text) {
  // Simple deterministic hash for equality comparison
  if (!text) return '';
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function normalizeMessage(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlap(a, b) {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = b.split(/\s+/).filter((w) => w.length > 3);
  if (wordsA.size === 0 || wordsB.length === 0) return 0;
  const common = wordsB.filter((w) => wordsA.has(w)).length;
  return common / Math.max(wordsA.size, wordsB.length);
}

class LoopDetection {
  constructor() {
    // sessionId → { messages: [{hash, normalized, at}], hashCounts: Map }
    this._sessions = new Map();
    this.stats = { checks: 0, loopsDetected: 0 };
  }

  /**
   * Check if the current message creates a loop in the session.
   * @param {string} sessionId
   * @param {string} message
   * @returns {{ loopDetected: boolean, loopType: string|null, iteration: number, similarity?: number }}
   */
  check(sessionId, message) {
    try {
      if (!sessionId || !message) {
        return { loopDetected: false, loopType: null, iteration: 0 };
      }

      this.stats.checks++;
      const session = this._getOrCreate(sessionId);
      const normalized = normalizeMessage(message);
      const hash = hashMessage(normalized);

      // Check exact loop
      const hashCount = (session.hashCounts.get(hash) || 0) + 1;
      session.hashCounts.set(hash, hashCount);

      if (hashCount >= EXACT_LOOP_THRESHOLD) {
        this._record(session, hash, normalized);
        this.stats.loopsDetected++;
        return { loopDetected: true, loopType: 'exact', iteration: hashCount };
      }

      // Check semantic loop against recent messages
      for (const prev of session.messages.slice(-WINDOW_SIZE)) {
        const overlap = wordOverlap(normalized, prev.normalized);
        if (overlap >= SEMANTIC_OVERLAP_THRESHOLD) {
          this._record(session, hash, normalized);
          this.stats.loopsDetected++;
          return { loopDetected: true, loopType: 'semantic', iteration: 2, similarity: Math.round(overlap * 100) };
        }
      }

      // Check structural loop (same question pattern)
      const structure = this._extractStructure(normalized);
      const structureCount = (session.structureCounts.get(structure) || 0) + 1;
      session.structureCounts.set(structure, structureCount);

      if (structureCount >= 3) {
        this._record(session, hash, normalized);
        this.stats.loopsDetected++;
        return { loopDetected: true, loopType: 'structural', iteration: structureCount };
      }

      this._record(session, hash, normalized);
      return { loopDetected: false, loopType: null, iteration: hashCount };
    } catch (err) {
      return { loopDetected: false, loopType: null, iteration: 0, error: err.message };
    }
  }

  /**
   * Reset loop detection state for a session.
   * @param {string} sessionId
   */
  reset(sessionId) {
    try {
      this._sessions.delete(sessionId);
      return { sessionId, reset: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  _extractStructure(normalized) {
    // Replace proper nouns / numbers to get structural skeleton
    return normalized
      .replace(/\b[a-z]{8,}\b/g, 'NOUN')
      .replace(/\b\d+\b/g, 'NUM')
      .substring(0, 60);
  }

  _record(session, hash, normalized) {
    session.messages.push({ hash, normalized, at: new Date().toISOString() });
    if (session.messages.length > WINDOW_SIZE * 2) {
      session.messages = session.messages.slice(-WINDOW_SIZE);
    }
  }

  _getOrCreate(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, {
        messages: [],
        hashCounts: new Map(),
        structureCounts: new Map(),
        createdAt: new Date().toISOString(),
      });
    }
    return this._sessions.get(sessionId);
  }

  getStats() {
    return { ...this.stats, activeSessions: this._sessions.size };
  }
}

let _instance = null;
function getLoopDetection() {
  if (!_instance) _instance = new LoopDetection();
  return _instance;
}

module.exports = { LoopDetection, getLoopDetection };
