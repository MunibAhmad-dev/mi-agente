'use strict';

/**
 * ResourceEstimator — Gen B runtime phase.
 * Estimates tokens, time, and cost for a given task before execution,
 * and calibrates future estimates from recorded actuals.
 *
 * Token heuristic: ~0.75 tokens per word (English text).
 * Cost table (per 1k tokens):
 *   gpt-4            $0.030
 *   gpt-3.5-turbo    $0.002
 *   claude-3-opus    $0.015
 *   claude-3-sonnet  $0.003
 *   claude-3-haiku   $0.00025
 */

const COST_TABLE = {
  'gpt-4': 0.03,
  'gpt-4-turbo': 0.01,
  'gpt-3.5': 0.002,
  'gpt-3.5-turbo': 0.002,
  'claude-3-opus': 0.015,
  'claude-3-sonnet': 0.003,
  'claude-3-haiku': 0.00025,
  'claude-sonnet-4': 0.003,
  'claude-opus-4': 0.015,
};

// Tokens-per-ms: rough throughput estimates per model
const SPEED_TABLE = {
  'gpt-4': 0.04,
  'gpt-4-turbo': 0.06,
  'gpt-3.5': 0.15,
  'gpt-3.5-turbo': 0.15,
  'claude-3-opus': 0.05,
  'claude-3-sonnet': 0.10,
  'claude-3-haiku': 0.20,
  'default': 0.08,
};

let _estimateCounter = 0;

function estimateInputTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 0.75));
}

function estimateOutputTokens(inputTokens, opts = {}) {
  const ratio = opts.outputRatio || 1.5; // default: output is ~1.5x input
  return Math.round(inputTokens * ratio);
}

function getCostPerToken(modelId) {
  if (!modelId) return COST_TABLE['gpt-3.5'] / 1000;
  const id = modelId.toLowerCase();
  for (const [key, rate] of Object.entries(COST_TABLE)) {
    if (id.includes(key)) return rate / 1000;
  }
  return COST_TABLE['gpt-3.5'] / 1000; // fallback
}

function getTokensPerMs(modelId) {
  if (!modelId) return SPEED_TABLE['default'];
  const id = modelId.toLowerCase();
  for (const [key, rate] of Object.entries(SPEED_TABLE)) {
    if (id.includes(key)) return rate;
  }
  return SPEED_TABLE['default'];
}

class ResourceEstimator {
  constructor() {
    this.stats = { estimates: 0, actuals: 0 };
    // estimateId -> { estimated, actual }
    this._records = new Map();
  }

  /**
   * Estimate resources for a task before execution.
   * @param {string} text - input text / prompt
   * @param {string} modelId - model identifier
   * @param {object} [options] - { outputRatio?, systemPrompt? }
   * @returns {{ estimateId, tokens: { input, output, total }, costUsd, durationMs, confidence }}
   */
  estimate(text, modelId, options = {}) {
    try {
      this.stats.estimates++;
      const id = `est_${Date.now()}_${++_estimateCounter}`;
      const systemTokens = options.systemPrompt
        ? estimateInputTokens(options.systemPrompt)
        : 0;
      const inputTokens = estimateInputTokens(text) + systemTokens;
      const outputTokens = estimateOutputTokens(inputTokens, options);
      const totalTokens = inputTokens + outputTokens;

      const costPerToken = getCostPerToken(modelId);
      const costUsd = Math.round(totalTokens * costPerToken * 10000) / 10000;

      const tokensPerMs = getTokensPerMs(modelId);
      const durationMs = Math.round(totalTokens / tokensPerMs);

      // Confidence decreases for very long or very short inputs
      const confidence = inputTokens < 10 || inputTokens > 8000
        ? 0.6
        : 0.85;

      const result = {
        estimateId: id,
        tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
        costUsd,
        durationMs,
        confidence,
      };
      this._records.set(id, { estimated: result, actual: null });
      return result;
    } catch (err) {
      return {
        estimateId: null,
        tokens: { input: 0, output: 0, total: 0 },
        costUsd: 0,
        durationMs: 0,
        confidence: 0,
        error: err.message,
      };
    }
  }

  /**
   * Record the actual values after execution to calibrate future estimates.
   * @param {string} estimateId
   * @param {{ tokens?: { input, output, total }, costUsd?: number, durationMs?: number }} actual
   */
  recordActual(estimateId, actual) {
    try {
      if (!estimateId || !actual) return;
      const record = this._records.get(estimateId);
      if (record) {
        record.actual = actual;
        this.stats.actuals++;
      }
    } catch (_) {
      // non-throwing
    }
  }

  /**
   * Calculate estimation accuracy from recorded actuals.
   * @returns {{ avgTokenError: number, avgCostError: number, calibrated: boolean }}
   */
  getAccuracy() {
    try {
      const withActuals = [...this._records.values()].filter((r) => r.actual);
      if (withActuals.length === 0) {
        return { avgTokenError: 0, avgCostError: 0, calibrated: false };
      }

      let tokenErrSum = 0;
      let costErrSum = 0;
      for (const { estimated, actual } of withActuals) {
        const estTokens = estimated.tokens.total;
        const actTokens = actual.tokens ? actual.tokens.total : estTokens;
        tokenErrSum += Math.abs(estTokens - actTokens) / Math.max(1, actTokens);

        const estCost = estimated.costUsd;
        const actCost = actual.costUsd != null ? actual.costUsd : estCost;
        costErrSum += Math.abs(estCost - actCost) / Math.max(0.0001, actCost);
      }

      return {
        avgTokenError: Math.round((tokenErrSum / withActuals.length) * 10000) / 10000,
        avgCostError: Math.round((costErrSum / withActuals.length) * 10000) / 10000,
        calibrated: withActuals.length >= 5,
      };
    } catch (err) {
      return { avgTokenError: 0, avgCostError: 0, calibrated: false, error: err.message };
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getResourceEstimator() {
  if (!_instance) _instance = new ResourceEstimator();
  return _instance;
}

module.exports = { ResourceEstimator, getResourceEstimator };
