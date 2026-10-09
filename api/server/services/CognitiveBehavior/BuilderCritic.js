'use strict';

/**
 * BuilderCritic — Gen B Phase 20.
 *
 * Implements a two-agent critique loop:
 *   Builder  — drafts a response/plan/proposal.
 *   Critic   — evaluates the draft against a rubric and produces scored feedback.
 *
 * Runs entirely in-process (no extra LLM calls). The Builder uses the provided
 * draft directly; the Critic applies heuristic rubric checks. Iterations stop
 * when the score meets the threshold or maxRounds is reached.
 */

// Default critique rubric dimensions
const DEFAULT_RUBRIC = [
  { id: 'completeness', label: 'Completeness',   weight: 0.30, test: (d) => d.length > 200 ? 1 : d.length / 200 },
  { id: 'coherence',    label: 'Coherence',       weight: 0.25, test: (d) => {
    const sents = d.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sents.length < 2) return 0.5;
    const avgWords = d.split(/\s+/).length / sents.length;
    return avgWords >= 5 && avgWords <= 40 ? 1 : 0.5;
  }},
  { id: 'specificity',  label: 'Specificity',     weight: 0.25, test: (d) => {
    const specific = (d.match(/\d+|example|instance|specifically|such as|for example/gi) || []).length;
    return Math.min(specific / 3, 1);
  }},
  { id: 'no_filler',    label: 'No filler phrases', weight: 0.20, test: (d) => {
    const filler = (d.match(/\b(certainly|absolutely|of course|as an ai|great question)\b/gi) || []).length;
    return Math.max(0, 1 - filler * 0.5);
  }},
];

function clamp(v) { return Math.max(0, Math.min(1, v || 0)); }

class BuilderCritic {
  constructor(config = {}) {
    this._rubric = config.rubric || DEFAULT_RUBRIC;
    this._threshold = config.threshold || 0.70;
    this._maxRounds = config.maxRounds || 2;
    this.stats = { sessions: 0, totalRounds: 0, improved: 0 };
  }

  /**
   * Critique a draft against the rubric.
   * @param {string} draft
   * @returns {{ score: number, passed: boolean, feedback: string[], dimensions: object[] }}
   */
  critique(draft) {
    try {
      const dimensions = this._rubric.map((dim) => {
        let score = 0;
        try { score = clamp(dim.test(draft)); } catch { score = 0; }
        return { id: dim.id, label: dim.label, score: Math.round(score * 100) / 100, weight: dim.weight };
      });
      const totalWeight = this._rubric.reduce((s, d) => s + d.weight, 0);
      const weightedScore = dimensions.reduce((s, d) => s + d.score * d.weight, 0);
      const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
      const passed = finalScore >= this._threshold;
      const feedback = dimensions
        .filter((d) => d.score < this._threshold)
        .map((d) => `${d.label}: ${Math.round(d.score * 100)}% — below threshold`);
      return { score: Math.round(finalScore * 100) / 100, passed, feedback, dimensions };
    } catch (err) {
      return { score: 0, passed: false, feedback: [err.message], dimensions: [] };
    }
  }

  /**
   * Run a builder-critic cycle.
   * Builder produces the initial draft; critic evaluates it. If the draft
   * doesn't pass in round 1, the builder is called again with feedback, up to
   * maxRounds. Returns the best draft found.
   *
   * @param {Function|string} builderFn  () => string | draft string directly
   * @param {{ maxRounds?: number, threshold?: number }} opts
   * @returns {{ draft: string, score: number, rounds: number, passed: boolean, history: object[] }}
   */
  run(builderFn, opts = {}) {
    this.stats.sessions++;
    const maxRounds = opts.maxRounds || this._maxRounds;
    const threshold = opts.threshold || this._threshold;
    const history = [];
    let bestDraft = '';
    let bestScore = 0;
    let draft = typeof builderFn === 'function' ? builderFn() : String(builderFn || '');

    for (let round = 1; round <= maxRounds; round++) {
      this.stats.totalRounds++;
      const result = this.critique(draft);
      history.push({ round, score: result.score, passed: result.passed, feedback: result.feedback });

      if (result.score > bestScore) {
        bestScore = result.score;
        bestDraft = draft;
      }

      if (result.passed) {
        this.stats.improved++;
        return { draft: bestDraft, score: bestScore, rounds: round, passed: true, history };
      }

      // For subsequent rounds, if builderFn is callable, pass feedback for "revision"
      if (round < maxRounds && typeof builderFn === 'function') {
        const feedbackStr = result.feedback.join('; ');
        try {
          const revised = builderFn(feedbackStr);
          if (revised && revised !== draft) draft = revised;
        } catch { break; }
      }
    }

    return { draft: bestDraft, score: bestScore, rounds: maxRounds, passed: bestScore >= threshold, history };
  }

  /**
   * Add a custom rubric dimension.
   */
  addDimension(dimension) {
    try {
      if (!dimension.id || typeof dimension.test !== 'function') return { ok: false };
      this._rubric.push(dimension);
      return { ok: true, id: dimension.id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  getStats() {
    return { ...this.stats, rubricDimensions: this._rubric.length, threshold: this._threshold };
  }
}

let _instance = null;
function getBuilderCritic() {
  if (!_instance) _instance = new BuilderCritic();
  return _instance;
}

module.exports = { BuilderCritic, getBuilderCritic };
