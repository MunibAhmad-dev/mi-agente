'use strict';

/**
 * UserCorrectionLearning — Gen B Safety Phase 3.
 * Learns from user corrections in real-time within a session.
 * All state is session-scoped; corrections do NOT persist across sessions.
 */

const MAX_CORRECTIONS_PER_SESSION = 200;
const MAX_SESSIONS = 500;

/**
 * Very lightweight text similarity: word overlap ratio.
 */
function wordOverlapRatio(a, b) {
  const wa = new Set((a || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const wb = (b || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (wa.size === 0 || wb.length === 0) return 0;
  const common = wb.filter((w) => wa.has(w)).length;
  return common / Math.max(wa.size, wb.length);
}

/**
 * Derive a short error label from a correction pair.
 * Very heuristic — good enough for in-session pattern matching.
 */
function deriveErrorType(original, correction) {
  const orig = (original || '').toLowerCase();
  const corr = (correction || '').toLowerCase();

  if (orig.length > 0 && corr.length < orig.length * 0.5) return 'verbosity';
  if (corr.length > orig.length * 1.5) return 'insufficient_detail';
  if (/wrong|incorrect|not right|that's not|that is not/.test(corr)) return 'factual_error';
  if (/tone|formal|casual|polite|rude/.test(corr)) return 'tone_mismatch';
  if (/format|bullet|list|table|code/.test(corr)) return 'format_mismatch';
  if (wordOverlapRatio(orig, corr) < 0.2) return 'topic_drift';
  return 'general_correction';
}

class UserCorrectionLearning {
  constructor() {
    // sessionId → { corrections: [], errorCounts: Map, createdAt }
    this._sessions = new Map();
    this.stats = { totalCorrections: 0, sessionsWithCorrections: 0 };
  }

  /**
   * Record a correction for a session.
   * @param {string} sessionId
   * @param {string} originalResponse
   * @param {string} correction       - User's corrected version or feedback text
   * @param {object} context          - { topic?, intent?, timestamp? }
   * @returns {{ recorded: boolean, correctionId: string }}
   */
  recordCorrection(sessionId, originalResponse, correction, context = {}) {
    try {
      if (!sessionId || correction == null) {
        return { recorded: false, error: 'sessionId and correction are required' };
      }

      const session = this._getOrCreate(sessionId);
      const errorType = deriveErrorType(originalResponse, correction);
      const correctionId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const entry = {
        correctionId,
        originalResponse: originalResponse || '',
        correction,
        errorType,
        context: { ...context, timestamp: context.timestamp || new Date().toISOString() },
        recordedAt: new Date().toISOString(),
      };

      session.corrections.push(entry);
      if (session.corrections.length > MAX_CORRECTIONS_PER_SESSION) {
        session.corrections.shift();
      }

      session.errorCounts.set(errorType, (session.errorCounts.get(errorType) || 0) + 1);
      session.lastCorrectedAt = entry.recordedAt;
      this.stats.totalCorrections++;

      return { recorded: true, correctionId, errorType };
    } catch (err) {
      return { recorded: false, error: err.message };
    }
  }

  /**
   * Get correction patterns for a session.
   * @param {string} sessionId
   * @returns {{ corrections: Array, commonErrors: Array, lastCorrectedAt: string|null }}
   */
  getPatterns(sessionId) {
    try {
      const session = this._sessions.get(sessionId);
      if (!session) {
        return { corrections: [], commonErrors: [], lastCorrectedAt: null };
      }

      const commonErrors = [];
      for (const [error, frequency] of session.errorCounts) {
        commonErrors.push({ error, frequency });
      }
      commonErrors.sort((a, b) => b.frequency - a.frequency);

      return {
        corrections: session.corrections.slice(-50),
        commonErrors,
        lastCorrectedAt: session.lastCorrectedAt || null,
      };
    } catch (err) {
      return { corrections: [], commonErrors: [], lastCorrectedAt: null, error: err.message };
    }
  }

  /**
   * Apply session learnings to amend a response.
   * Currently applies heuristic amendments based on known error patterns.
   * @param {string} sessionId
   * @param {string} response
   * @returns {string} — amended response
   */
  applyLearning(sessionId, response) {
    try {
      const session = this._sessions.get(sessionId);
      if (!session || session.corrections.length === 0) return response;

      let amended = response;
      const topErrors = [];
      for (const [error, frequency] of session.errorCounts) {
        topErrors.push({ error, frequency });
      }
      topErrors.sort((a, b) => b.frequency - a.frequency);

      for (const { error } of topErrors.slice(0, 3)) {
        switch (error) {
          case 'verbosity':
            // Truncate if significantly longer than average corrections
            if (amended.length > 600) {
              amended = amended.slice(0, 600) + '… [abbreviated based on your feedback]';
            }
            break;
          case 'insufficient_detail':
            amended += '\n\n[Note: Previous responses were too brief — please let me know if you need more detail.]';
            break;
          case 'tone_mismatch': {
            // Check last correction for tone hint
            const lastCorr = session.corrections[session.corrections.length - 1];
            if (/formal|professional/.test((lastCorr.correction || '').toLowerCase())) {
              amended = amended.replace(/\bHey\b/g, 'Hello').replace(/\bguys\b/g, 'team');
            }
            break;
          }
          default:
            break;
        }
      }

      return amended;
    } catch (err) {
      return response;
    }
  }

  /**
   * Export structured learning data for persistence.
   * @param {string} sessionId
   * @returns {object}
   */
  exportLearning(sessionId) {
    try {
      const session = this._sessions.get(sessionId);
      if (!session) return { sessionId, corrections: [], patterns: [], exportedAt: new Date().toISOString() };

      const patterns = [];
      for (const [error, frequency] of session.errorCounts) {
        patterns.push({ error, frequency });
      }

      return {
        sessionId,
        corrections: session.corrections,
        patterns: patterns.sort((a, b) => b.frequency - a.frequency),
        lastCorrectedAt: session.lastCorrectedAt,
        createdAt: session.createdAt,
        exportedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { sessionId, error: err.message, exportedAt: new Date().toISOString() };
    }
  }

  _getOrCreate(sessionId) {
    if (!this._sessions.has(sessionId)) {
      if (this._sessions.size >= MAX_SESSIONS) {
        // Evict oldest
        const oldest = this._sessions.keys().next().value;
        this._sessions.delete(oldest);
      }
      this._sessions.set(sessionId, {
        corrections: [],
        errorCounts: new Map(),
        createdAt: new Date().toISOString(),
        lastCorrectedAt: null,
      });
      this.stats.sessionsWithCorrections++;
    }
    return this._sessions.get(sessionId);
  }

  getStats() {
    return { ...this.stats, activeSessions: this._sessions.size };
  }
}

let _instance = null;
function getUserCorrectionLearning() {
  if (!_instance) _instance = new UserCorrectionLearning();
  return _instance;
}

module.exports = { UserCorrectionLearning, getUserCorrectionLearning };
