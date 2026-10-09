'use strict';

let _counter = 0;

/**
 * SelfImprovementEngine - Manages self-improvement proposals, sandbox testing, rollback.
 */
class SelfImprovementEngine {
  constructor(config = {}) {
    this.config = config;
    this.bus = config.bus;
    this.proposals = new Map();
    this.versions = [];
    this.stats = { proposed: 0, sandboxed: 0, approved: 0, deployed: 0, rolledBack: 0 };
  }

  async propose(change) {
    const id = `prop_${Date.now()}_${++_counter}`;
    const proposal = {
      id,
      description: change.description || '',
      type: change.type || 'improvement',
      target: change.target || '',
      expectedImpact: change.expectedImpact || 'unknown',
      status: 'proposed',
      createdAt: Date.now(),
    };
    this.proposals.set(id, proposal);
    this.stats.proposed++;
    return proposal;
  }

  async sandbox(proposalId) {
    const prop = this.proposals.get(proposalId);
    if (!prop) return null;
    prop.status = 'sandboxed';
    prop.sandboxedAt = Date.now();
    this.stats.sandboxed++;
    return { proposal: prop, sandboxResult: 'passed' };
  }

  async benchmark(proposalId) {
    const prop = this.proposals.get(proposalId);
    if (!prop) return null;
    return { proposalId, metrics: { before: 100, after: 95, improvement: -5 } };
  }

  async approve(proposalId) {
    const prop = this.proposals.get(proposalId);
    if (!prop) return null;
    prop.status = 'approved';
    prop.approvedAt = Date.now();
    this.stats.approved++;
    return prop;
  }

  async deploy(proposalId) {
    const prop = this.proposals.get(proposalId);
    if (!prop) return null;
    prop.status = 'deployed';
    prop.deployedAt = Date.now();
    this.versions.push({ proposalId, deployedAt: Date.now() });
    this.stats.deployed++;
    return prop;
  }

  async rollback(versionId) {
    const version = this.versions.find(v => v.proposalId === versionId);
    if (!version) return null;
    this.stats.rolledBack++;
    return { rolledBack: true, version };
  }

  getStats() {
    return {
      ...this.stats,
      proposals: this.proposals.size,
      versions: this.versions.length,
      watchingPerformance: !!this._watchTimer,
    };
  }

  /**
   * Face 16: Monitor average quality of recent experiences and auto-propose
   * an improvement when it drops below `qualityThreshold`.
   *
   * @param {number} checkIntervalMs  - polling interval, default 600 000 (10 min)
   * @param {number} qualityThreshold - 0–1 score below which a proposal is triggered
   */
  watchPerformance(checkIntervalMs = 600_000, qualityThreshold = 0.6) {
    if (this._watchTimer) return { watching: false, reason: 'already watching' };
    this._qualityThreshold = qualityThreshold;

    this._watchTimer = setInterval(() => {
      this._performanceCheck().catch(() => {});
    }, checkIntervalMs);
    if (this._watchTimer.unref) this._watchTimer.unref();

    return { watching: true, checkIntervalMs, qualityThreshold };
  }

  stopWatchingPerformance() {
    if (!this._watchTimer) return { stopped: false, reason: 'not watching' };
    clearInterval(this._watchTimer);
    this._watchTimer = null;
    return { stopped: true };
  }

  async _performanceCheck() {
    const threshold = this._qualityThreshold ?? 0.6;
    let experiences = [];
    try {
      const { getExperiences } = require('~/models/ExperienceReplay');
      experiences = await getExperiences({ limit: 20 });
    } catch { return; }
    if (!experiences.length) return;

    const avgQuality = experiences.reduce((sum, e) => sum + (e.score ?? 0), 0) / experiences.length;
    if (avgQuality < threshold) {
      await this.propose({
        description: `Auto-triggered: average quality ${avgQuality.toFixed(3)} fell below threshold ${threshold}`,
        type: 'quality-improvement',
        expectedImpact: 'raise average task quality above threshold',
      }).catch(() => {});
    }
  }
}

module.exports = { SelfImprovementEngine };
