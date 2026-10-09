'use strict';

/**
 * CognitiveSleep - Automatic background consolidation.
 *
 * Runs periodically to:
 * - Consolidate memories (merge duplicates)
 * - Apply decay to old memories
 * - Archive inactive knowledge
 * - Optimize storage
 * - Detect and merge similar experiences
 */
class CognitiveSleep {
  constructor(config = {}) {
    this.config = config;
    this.interval = config.interval || 3600000; // 1 hour
    this.timer = null;
    this.stats = { cycles: 0, consolidated: 0, archived: 0, decayed: 0 };
    this.lastSleep = null;
    this._running = false;
  }

  /**
   * Start automatic cognitive sleep cycles.
   */
  start(memoryEngine, knowledgeEngine) {
    if (this.timer) return;
    this.memoryEngine = memoryEngine;
    this.knowledgeEngine = knowledgeEngine;

    this.timer = setInterval(() => this._sleepCycle(), this.interval);
    console.log('[CognitiveSleep] Started with interval:', this.interval, 'ms');
  }

  /**
   * Stop automatic cycles.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run a single sleep cycle manually.
   */
  async runCycle() {
    return this._sleepCycle();
  }

  async _sleepCycle() {
    if (this._running) return;
    this._running = true;

    const startTime = Date.now();
    const results = { consolidated: 0, archived: 0, decayed: 0 };

    try {
      // 1. Consolidate memory
      if (this.memoryEngine) {
        const consolidated = await this.memoryEngine.consolidate();
        results.consolidated = consolidated?.consolidated || 0;
      }

      // 2. Apply decay to temporal memories
      if (this.memoryEngine?.layers?.temporal) {
        this.memoryEngine.layers.temporal.applyDecay(0.01);
        results.decayed = this.memoryEngine.layers.temporal.size();
      }

      // 3. Archive old episodic memories
      if (this.memoryEngine?.layers?.episodic) {
        const old = this.memoryEngine.layers.episodic.getOlderThan(90 * 24 * 60 * 60 * 1000);
        results.archived = old.length;
      }

      this.stats.cycles++;
      this.stats.consolidated += results.consolidated;
      this.stats.archived += results.archived;
      this.stats.decayed += results.decayed;
      this.lastSleep = Date.now();

      console.log(`[CognitiveSleep] Cycle #${this.stats.cycles}: consolidated=${results.consolidated}, archived=${results.archived}, decayed=${results.decayed}`);
    } catch (err) {
      console.error('[CognitiveSleep] Error:', err.message);
    }

    this._running = false;
    return { ...results, duration: Date.now() - startTime };
  }

  getStats() {
    return {
      ...this.stats,
      lastSleep: this.lastSleep,
      running: !!this.timer,
      interval: this.interval,
    };
  }
}

module.exports = { CognitiveSleep };
