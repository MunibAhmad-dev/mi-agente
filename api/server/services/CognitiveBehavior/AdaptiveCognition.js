'use strict';

/**
 * AdaptiveCognition — Gen B Phase 7.
 * Adjusts the agent's cognitive strategy based on session feedback.
 * Tracks per-session strategy and adapts based on feedback signals.
 *
 * Strategies:
 *   analytical   — systematic, step-by-step, factual
 *   creative     — divergent, exploratory, imaginative
 *   systematic   — structured, methodical, exhaustive
 *   exploratory  — open-ended, hypothesis-driven, iterative
 */

const STRATEGIES = {
  analytical: {
    name: 'analytical',
    description: 'Systematic, step-by-step, factual reasoning',
    systemHint: 'Break down the problem into logical steps. Be precise and factual.',
    temperature: 0.3,
  },
  creative: {
    name: 'creative',
    description: 'Divergent, exploratory, imaginative thinking',
    systemHint: 'Think creatively and consider unconventional approaches.',
    temperature: 0.9,
  },
  systematic: {
    name: 'systematic',
    description: 'Structured, methodical, exhaustive coverage',
    systemHint: 'Cover all aspects systematically. Use structured output.',
    temperature: 0.5,
  },
  exploratory: {
    name: 'exploratory',
    description: 'Open-ended, hypothesis-driven, iterative discovery',
    systemHint: 'Explore multiple hypotheses. Question assumptions.',
    temperature: 0.7,
  },
};

const DEFAULT_STRATEGY = 'analytical';

class AdaptiveCognition {
  constructor() {
    this._sessions = new Map(); // sessionId → { strategy, history, feedbackCount }
    this.stats = { adaptations: 0, sessions: 0 };
  }

  /**
   * Adapt the cognitive strategy for a session based on feedback.
   * @param {string} sessionId
   * @param {object} feedback  - { signal: 'too_slow'|'too_verbose'|'too_creative'|'needs_more_detail'|'correct'|'incorrect', score? }
   * @returns {object} { sessionId, newStrategy, previousStrategy, reason }
   */
  adapt(sessionId, feedback = {}) {
    try {
      const session = this._getOrCreate(sessionId);
      const previousStrategy = session.strategy;
      const signal = feedback.signal || '';

      let newStrategy = previousStrategy;

      // Adaptation rules
      if (signal === 'too_creative' || signal === 'incorrect') {
        newStrategy = 'analytical';
      } else if (signal === 'too_slow' || signal === 'too_verbose') {
        newStrategy = 'systematic';
      } else if (signal === 'needs_more_detail') {
        newStrategy = 'exploratory';
      } else if (signal === 'boring' || signal === 'needs_creativity') {
        newStrategy = 'creative';
      } else if (signal === 'correct' && feedback.score && feedback.score > 0.8) {
        // Keep current strategy — it's working
        newStrategy = previousStrategy;
      }

      session.strategy = newStrategy;
      session.history.push({ from: previousStrategy, to: newStrategy, signal, at: new Date().toISOString() });
      session.feedbackCount++;
      this.stats.adaptations++;

      return {
        sessionId,
        newStrategy,
        previousStrategy,
        strategyConfig: STRATEGIES[newStrategy],
        reason: signal || 'manual override',
      };
    } catch (err) {
      return { error: err.message, sessionId };
    }
  }

  /**
   * Get the current strategy for a session.
   * @param {string} sessionId
   * @returns {object} { strategy, config, history }
   */
  getStrategy(sessionId) {
    try {
      const session = this._getOrCreate(sessionId);
      return {
        sessionId,
        strategy: session.strategy,
        config: STRATEGIES[session.strategy],
        history: session.history.slice(-10),
        feedbackCount: session.feedbackCount,
      };
    } catch (err) {
      return { error: err.message, strategy: DEFAULT_STRATEGY, config: STRATEGIES[DEFAULT_STRATEGY] };
    }
  }

  /**
   * Manually set strategy for a session.
   * @param {string} sessionId
   * @param {string} strategy
   * @returns {object}
   */
  setStrategy(sessionId, strategy) {
    try {
      if (!STRATEGIES[strategy]) {
        return { error: `Unknown strategy: ${strategy}. Valid: ${Object.keys(STRATEGIES).join(', ')}` };
      }
      const session = this._getOrCreate(sessionId);
      session.strategy = strategy;
      return { sessionId, strategy, config: STRATEGIES[strategy] };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Reset a session to default strategy.
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

  listStrategies() {
    return Object.values(STRATEGIES);
  }

  _getOrCreate(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, {
        strategy: DEFAULT_STRATEGY,
        history: [],
        feedbackCount: 0,
        createdAt: new Date().toISOString(),
      });
      this.stats.sessions++;
    }
    return this._sessions.get(sessionId);
  }

  getStats() {
    return { ...this.stats, activeSessions: this._sessions.size };
  }
}

let _instance = null;
function getAdaptiveCognition() {
  if (!_instance) _instance = new AdaptiveCognition();
  return _instance;
}

module.exports = { AdaptiveCognition, getAdaptiveCognition, STRATEGIES };
