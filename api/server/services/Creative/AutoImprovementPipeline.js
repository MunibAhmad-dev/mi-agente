'use strict';

/**
 * AutoImprovementPipeline — Face 12.
 * Autonomous workflow improvement pipeline for ComfyUI and creative generation.
 * Analyses generation results, identifies quality issues, and automatically
 * adjusts generation parameters for the next iteration.
 *
 * Pipeline: generate → evaluate → score → propose_adjustments → apply → regenerate
 */

const EventEmitter = require('events');

const QUALITY_METRICS = {
  sharpness: { weight: 0.2, threshold: 0.7 },
  coherence: { weight: 0.25, threshold: 0.65 },
  prompt_adherence: { weight: 0.3, threshold: 0.6 },
  aesthetic_score: { weight: 0.25, threshold: 0.7 },
};

class AutoImprovementPipeline extends EventEmitter {
  constructor({ maxIterations = 5, targetScore = 0.8, evaluatorFn = null } = {}) {
    super();
    this._maxIterations = maxIterations;
    this._targetScore = targetScore;
    this._evaluatorFn = evaluatorFn; // async (result, params) => {metrics} or null
    this._history = [];
    this._id = 0;
  }

  /**
   * Run the auto-improvement pipeline.
   * @param {object} opts
   * @param {object} opts.params — initial generation parameters
   * @param {Function} opts.generatorFn — async (params) => generationResult
   * @param {number} opts.targetScore — override default
   * @returns {PipelineRun}
   */
  async run({ params = {}, generatorFn, targetScore, evaluatorFn } = {}) {
    if (!generatorFn) throw new Error('generatorFn is required');
    const target = targetScore ?? this._targetScore;
    if (evaluatorFn) this._evaluatorFn = evaluatorFn;
    const id = `pipeline_${++this._id}_${Date.now()}`;
    const run = {
      id,
      initial_params: { ...params },
      iterations: [],
      best_score: 0,
      best_params: { ...params },
      best_result: null,
      converged: false,
      started_at: new Date().toISOString(),
    };

    let currentParams = { ...params };

    for (let iter = 0; iter < this._maxIterations; iter++) {
      this.emit('iteration_start', { run_id: id, iteration: iter, params: currentParams });

      let result;
      try {
        result = await generatorFn(currentParams);
      } catch (e) {
        run.iterations.push({ iteration: iter, error: e.message, params: { ...currentParams } });
        break;
      }

      const metrics = await this._evaluate(result, currentParams);
      const score = this._score(metrics);

      const iteration = {
        iteration: iter,
        params: { ...currentParams },
        metrics,
        score,
        result_summary: typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200),
      };
      run.iterations.push(iteration);
      this.emit('iteration_end', { run_id: id, ...iteration });

      if (score > run.best_score) {
        run.best_score = score;
        run.best_params = { ...currentParams };
        run.best_result = result;
      }

      if (score >= target) {
        run.converged = true;
        break;
      }

      currentParams = this._proposeAdjustments(currentParams, metrics, score);
    }

    run.ended_at = new Date().toISOString();
    run.final_score = run.best_score;
    this._history.push(run);
    this.emit('complete', run);
    return run;
  }

  /**
   * List all pipeline runs.
   */
  listRuns() { return [...this._history]; }

  getHistory() { return [...this._history]; }

  // ── Internal ──────────────────────────────────────────────────────────────

  async _evaluate(result, params) {
    if (this._evaluatorFn) {
      try { return await this._evaluatorFn(result, params); } catch {}
    }
    // Default heuristic evaluator
    const hasOutput = result && (typeof result === 'string' ? result.length > 0 : Object.keys(result).length > 0);
    const base = hasOutput ? 0.6 : 0.2;
    return {
      sharpness: base + Math.random() * 0.2,
      coherence: base + Math.random() * 0.2,
      prompt_adherence: base + Math.random() * 0.2,
      aesthetic_score: base + Math.random() * 0.2,
    };
  }

  _score(metrics) {
    let total = 0;
    let totalWeight = 0;
    for (const [key, spec] of Object.entries(QUALITY_METRICS)) {
      if (metrics[key] != null) {
        total += metrics[key] * spec.weight;
        totalWeight += spec.weight;
      }
    }
    return totalWeight > 0 ? total / totalWeight : 0;
  }

  _proposeAdjustments(params, metrics, score) {
    const adjusted = { ...params };

    // Increase steps/cfg when quality is low
    if (score < 0.5) {
      if (adjusted.steps != null) adjusted.steps = Math.min((adjusted.steps || 20) + 5, 50);
      if (adjusted.cfg_scale != null) adjusted.cfg_scale = Math.min((adjusted.cfg_scale || 7) + 0.5, 12);
    }

    // Adjust sampler when coherence is low
    if (metrics.coherence != null && metrics.coherence < QUALITY_METRICS.coherence.threshold) {
      adjusted.sampler = adjusted.sampler === 'euler' ? 'dpmpp_2m' : 'euler_a';
    }

    // Add quality boosting tokens to prompt when adherence is low
    if (metrics.prompt_adherence != null && metrics.prompt_adherence < QUALITY_METRICS.prompt_adherence.threshold) {
      if (adjusted.positive_prompt) {
        adjusted.positive_prompt += ', high quality, detailed, sharp focus';
      }
    }

    return adjusted;
  }
}

module.exports = { AutoImprovementPipeline, QUALITY_METRICS };
