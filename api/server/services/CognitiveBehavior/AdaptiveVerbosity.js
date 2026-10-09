'use strict';

/**
 * AdaptiveVerbosity — Face 17 Phase 5.
 * Tracks conversation patterns and adapts response length/detail level.
 * Uses rolling window of user feedback signals to calibrate verbosity.
 */

const LEVELS = ['terse', 'brief', 'moderate', 'detailed', 'comprehensive'];
const DEFAULT_LEVEL = 'moderate';

const SHORTER_SIGNALS = [
  /\b(shorter|brief|concise|tldr|tl;dr|simpler|simple|quick|less|summarize)\b/i,
  /^(ok|yes|no|thanks|got it|understood|clear)\.?$/i,
  /\btoo (long|verbose|wordy|detailed)\b/i,
];

const LONGER_SIGNALS = [
  /\b(more detail|explain more|elaborate|expand|deeper|thorough|comprehensive|full)\b/i,
  /\bwhy\b.*\?$/i,
  /\b(step by step|step-by-step|in depth|in-depth|thoroughly)\b/i,
];

class AdaptiveVerbosity {
  constructor() {
    this._sessions = new Map(); // sessionId → { level, history }
  }

  _getSession(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, { level: DEFAULT_LEVEL, history: [] });
    }
    return this._sessions.get(sessionId);
  }

  getCurrentLevel(sessionId) {
    return this._getSession(sessionId).level;
  }

  /**
   * Process a new user message and possibly adjust verbosity.
   * @param {string} sessionId
   * @param {string} message
   * @returns {{ level: string, adjusted: boolean, direction: string|null }}
   */
  processMessage(sessionId, message) {
    const session = this._getSession(sessionId);
    const text = typeof message === 'string' ? message : '';
    const idx = LEVELS.indexOf(session.level);
    let direction = null;

    if (SHORTER_SIGNALS.some((re) => re.test(text))) {
      const newIdx = Math.max(0, idx - 1);
      if (newIdx !== idx) {
        session.level = LEVELS[newIdx];
        direction = 'shorter';
      }
    } else if (LONGER_SIGNALS.some((re) => re.test(text))) {
      const newIdx = Math.min(LEVELS.length - 1, idx + 1);
      if (newIdx !== idx) {
        session.level = LEVELS[newIdx];
        direction = 'longer';
      }
    }

    session.history.push({ message: text.substring(0, 80), level: session.level, ts: Date.now() });
    if (session.history.length > 50) session.history.shift();

    return { level: session.level, adjusted: direction !== null, direction };
  }

  setLevel(sessionId, level) {
    if (!LEVELS.includes(level)) throw new Error(`Invalid verbosity level: ${level}. Valid: ${LEVELS.join(', ')}`);
    this._getSession(sessionId).level = level;
    return { sessionId, level };
  }

  getStats(sessionId) {
    const session = this._getSession(sessionId);
    return { sessionId, current_level: session.level, history_count: session.history.length, recent: session.history.slice(-5) };
  }

  reset(sessionId) {
    this._sessions.set(sessionId, { level: DEFAULT_LEVEL, history: [] });
    return { sessionId, level: DEFAULT_LEVEL };
  }
}

let _instance = null;
function getAdaptiveVerbosity() {
  if (!_instance) _instance = new AdaptiveVerbosity();
  return _instance;
}

module.exports = { AdaptiveVerbosity, getAdaptiveVerbosity, LEVELS };
