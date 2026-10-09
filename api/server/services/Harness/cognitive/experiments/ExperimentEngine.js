'use strict';

/**
 * ExperimentEngine - Manages hypotheses, experiments, measurements, and comparisons.
 */
class ExperimentEngine {
  constructor(config = {}) {
    this.config = config;
    this.hypotheses = new Map();
    this.experiments = new Map();
    this.measurements = [];
    this.stats = { hypothesized: 0, experimented: 0, measured: 0 };
  }

  async hypothesize(claim) {
    const id = `hyp_${Date.now()}`;
    const hypothesis = {
      id,
      claim: claim.content || claim,
      confidence: claim.confidence || 0.5,
      evidence: claim.evidence || [],
      status: 'proposed',
      createdAt: Date.now(),
    };
    this.hypotheses.set(id, hypothesis);
    this.stats.hypothesized++;
    return hypothesis;
  }

  async run(hypothesisId, config = {}) {
    const hyp = this.hypotheses.get(hypothesisId);
    if (!hyp) return null;

    const experiment = {
      id: `exp_${Date.now()}`,
      hypothesisId,
      config,
      status: 'running',
      startedAt: Date.now(),
      results: null,
    };
    this.experiments.set(experiment.id, experiment);
    hyp.status = 'testing';
    this.stats.experimented++;
    return experiment;
  }

  async measure(experimentId, result) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    const measurement = {
      experimentId,
      metric: result.metric,
      value: result.value,
      baseline: result.baseline,
      improvement: result.baseline ? ((result.value - result.baseline) / result.baseline) * 100 : null,
      timestamp: Date.now(),
    };
    this.measurements.push(measurement);
    exp.results = result;
    exp.status = 'completed';
    exp.completedAt = Date.now();
    this.stats.measured++;
    return measurement;
  }

  async compare(expIds) {
    return expIds.map(id => ({
      experiment: this.experiments.get(id),
      measurements: this.measurements.filter(m => m.experimentId === id),
    }));
  }

  getStats() {
    return {
      ...this.stats,
      hypotheses: this.hypotheses.size,
      experiments: this.experiments.size,
      measurements: this.measurements.length,
    };
  }
}

module.exports = { ExperimentEngine };
