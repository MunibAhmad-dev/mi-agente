'use strict';

/**
 * MultiTurnMemory.js — Gen B Batch-C Phase 4.
 * Tracks full conversation context across many turns with relevance decay.
 */

const MAX_TURNS_PER_SESSION = 100;

class MultiTurnMemory {
  constructor() {
    // Map: sessionId → { turns: [], summary: string, keyEntities: string[] }
    this._sessions = new Map();
    this.stats = { sessions: 0, totalTurns: 0, summaries: 0 };
  }

  /**
   * Add a message turn to a session.
   * @param {string} sessionId
   * @param {'user'|'assistant'|'system'} role
   * @param {string} content
   * @param {object} metadata
   */
  addTurn(sessionId, role, content, metadata = {}) {
    try {
      if (!sessionId) return { error: 'sessionId is required' };
      if (!content || typeof content !== 'string') return { error: 'content must be a non-empty string' };

      if (!this._sessions.has(sessionId)) {
        this._sessions.set(sessionId, { turns: [], summary: '', keyEntities: [] });
        this.stats.sessions++;
      }

      const session = this._sessions.get(sessionId);
      const turn = {
        turnId: `${sessionId}-${session.turns.length + 1}`,
        role: role || 'user',
        content,
        metadata,
        addedAt: new Date().toISOString(),
        index: session.turns.length,
      };

      session.turns.push(turn);
      this.stats.totalTurns++;

      // Enforce MAX_TURNS_PER_SESSION — drop oldest
      if (session.turns.length > MAX_TURNS_PER_SESSION) {
        session.turns.shift();
      }

      return { turnId: turn.turnId, sessionId, totalTurns: session.turns.length };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get conversation context for a session.
   * @param {string} sessionId
   * @param {number} maxTurns
   * @returns {{ turns: object[], summary: string, keyEntities: string[] }}
   */
  getContext(sessionId, maxTurns = 20) {
    try {
      const session = this._sessions.get(sessionId);
      if (!session) return { turns: [], summary: '', keyEntities: [] };

      const recentTurns = session.turns.slice(-maxTurns);
      return {
        turns: recentTurns.map((t) => ({ ...t })),
        summary: session.summary || this._buildSummary(session.turns),
        keyEntities: [...session.keyEntities],
      };
    } catch (err) {
      return { turns: [], summary: '', keyEntities: [], error: err.message };
    }
  }

  /**
   * Summarize conversation so far.
   * @param {string} sessionId
   * @returns {string}
   */
  summarize(sessionId) {
    try {
      const session = this._sessions.get(sessionId);
      if (!session || session.turns.length === 0) return '';
      const summary = this._buildSummary(session.turns);
      session.summary = summary;
      this.stats.summaries++;
      return summary;
    } catch (err) {
      return '';
    }
  }

  /**
   * Get most relevant turns for a query using keyword matching.
   * @param {string} sessionId
   * @param {string} query
   * @param {number} topK
   * @returns {object[]}
   */
  getRelevant(sessionId, query, topK = 5) {
    try {
      const session = this._sessions.get(sessionId);
      if (!session || session.turns.length === 0) return [];
      if (!query) return session.turns.slice(-topK);

      const queryWords = new Set(
        query.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
      );

      const scored = session.turns.map((turn, idx) => {
        const words = turn.content.toLowerCase().split(/\W+/);
        const matchCount = words.filter((w) => queryWords.has(w)).length;
        // Relevance decay: older turns get lower base score
        const recency = (idx + 1) / session.turns.length; // 0..1, higher = newer
        const score = matchCount * (0.6 + 0.4 * recency);
        return { turn, score };
      });

      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ turn }) => ({ ...turn }));
    } catch (err) {
      return [];
    }
  }

  // ── private ──────────────────────────────────────────────────────────────────

  _buildSummary(turns) {
    if (turns.length === 0) return '';
    const userTurns = turns.filter((t) => t.role === 'user').map((t) => t.content);
    const topics = userTurns.slice(0, 3).map((c) => c.slice(0, 60));
    return `Conversation with ${turns.length} turns. Topics include: ${topics.join('; ')}.`;
  }

  getStats() {
    return { ...this.stats, activeSessions: this._sessions.size };
  }
}

let _instance = null;
function getMultiTurnMemory() {
  if (!_instance) _instance = new MultiTurnMemory();
  return _instance;
}

module.exports = { MultiTurnMemory, getMultiTurnMemory };
