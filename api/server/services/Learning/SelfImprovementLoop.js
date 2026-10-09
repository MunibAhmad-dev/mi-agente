'use strict';

/**
 * SelfImprovementLoop — Face 16: Periodic Self-Learning Cycle.
 *
 * Runs a setInterval that periodically drives FeedbackAdapter.processBatch,
 * pulling patterns from LearningEvaluationGate history and feeding them back
 * into PromptIR so future prompts benefit from past quality regressions.
 *
 * Auto-starts when NODE_ENV !== 'test' AND SELF_IMPROVEMENT_ENABLED=true.
 * All methods are non-throwing.
 */

const { logger } = require('@librechat/data-schemas');

class SelfImprovementLoop {
  constructor() {
    this._running = false;
    this._intervalId = null;
    this._lastRun = null;
    this._cyclesCompleted = 0;
    this._patternsDiscovered = 0;
  }

  /**
   * Start the periodic loop.
   * @param {number} intervalMs - Milliseconds between cycles (default 5 minutes).
   */
  start(intervalMs = 300000) {
    try {
      if (this._running) return;
      this._running = true;
      this._intervalId = setInterval(() => {
        this.runOnce();
      }, intervalMs);
      // Prevent the interval from blocking process exit in test/dev environments.
      if (this._intervalId && typeof this._intervalId.unref === 'function') {
        this._intervalId.unref();
      }
    } catch (err) {
      try { logger.warn('[SelfImprovementLoop] start error:', err?.message ?? err); } catch {}
    }
  }

  /**
   * Stop the periodic loop.
   */
  stop() {
    try {
      if (this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
      this._running = false;
    } catch (err) {
      try { logger.warn('[SelfImprovementLoop] stop error:', err?.message ?? err); } catch {}
    }
  }

  /**
   * Run one improvement cycle synchronously.
   * Reads LearningGate history → FeedbackAdapter.processBatch → logs patterns.
   *
   * @returns {{ patternsFound: number, processed: number }}
   */
  runOnce() {
    try {
      const { getLearningEvaluationGate } = require('./LearningEvaluationGate');
      const { getPromptIR } = require('../CognitiveBehavior/PromptIR');
      const { getFeedbackAdapter } = require('./FeedbackAdapter');

      const gate = getLearningEvaluationGate();
      const promptIR = getPromptIR();
      const adapter = getFeedbackAdapter();

      const result = adapter.processBatch(gate, promptIR);

      this._cyclesCompleted++;
      this._lastRun = new Date().toISOString();
      this._patternsDiscovered += result.patternsFound || 0;

      if (result.patternsFound > 0) {
        try {
          logger.info(
            `[SelfImprovementLoop] cycle ${this._cyclesCompleted}: ` +
            `${result.patternsFound} patterns from ${result.processed} entries`,
          );
        } catch {}
      }

      return result;
    } catch (err) {
      // Always increment cycle counter so callers can track calls even on error
      this._cyclesCompleted++;
      this._lastRun = new Date().toISOString();
      try { logger.warn('[SelfImprovementLoop] runOnce error:', err?.message ?? err); } catch {}
      return { patternsFound: 0, processed: 0 };
    }
  }

  /**
   * @returns {{ running: boolean, lastRun: string|null, cyclesCompleted: number, patternsDiscovered: number }}
   */
  getStatus() {
    return {
      running: this._running,
      lastRun: this._lastRun,
      cyclesCompleted: this._cyclesCompleted,
      patternsDiscovered: this._patternsDiscovered,
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

let _instance = null;
function getSelfImprovementLoop() {
  if (!_instance) _instance = new SelfImprovementLoop();
  return _instance;
}

// Auto-start: only when explicitly enabled AND not in test mode.
if (process.env.NODE_ENV !== 'test' && process.env.SELF_IMPROVEMENT_ENABLED === 'true') {
  try {
    getSelfImprovementLoop().start();
  } catch { /* non-fatal */ }
}

module.exports = { SelfImprovementLoop, getSelfImprovementLoop };
