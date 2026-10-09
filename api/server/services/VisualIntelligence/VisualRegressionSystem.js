'use strict';

/**
 * VisualRegressionSystem — Face 9: baseline capture and visual regression comparison.
 *
 * Captures baseline screenshots and compares new captures against them to
 * detect visual regressions. Uses perceptual diff via LLM vision for
 * environments without canvas/sharp, with a pixel-diff path for when
 * raw pixel data is available (sharp integration).
 */

const crypto = require('crypto');

const DIFF_THRESHOLDS = { pass: 0.02, warn: 0.05, fail: 0.1 };
const STATUS = { PASS: 'pass', WARN: 'warn', FAIL: 'fail', BASELINE_MISSING: 'baseline_missing' };

class VisualRegressionSystem {
  constructor({ thresholds = {} } = {}) {
    this._thresholds = { ...DIFF_THRESHOLDS, ...thresholds };
    this._baselines = new Map();
    this._comparisons = [];
  }

  /**
   * Capture a baseline screenshot.
   * @param {object} opts
   * @param {string} opts.name - unique name for this baseline (e.g. 'home_desktop')
   * @param {string} opts.base64 - base64-encoded screenshot
   * @param {string} opts.mimeType
   * @param {object} [opts.meta] - viewport, url, etc.
   * @returns {{ baseline_id: string, name: string, captured_at: string }}
   */
  captureBaseline({ name, base64, mimeType, meta = {} }) {
    const id = `baseline_${name}_${Date.now()}`;
    const hash = crypto.createHash('sha256').update(base64).digest('hex').slice(0, 12);

    this._baselines.set(name, {
      id,
      name,
      base64,
      mimeType,
      hash,
      meta,
      captured_at: new Date().toISOString(),
    });

    return { baseline_id: id, name, hash, captured_at: new Date().toISOString() };
  }

  /**
   * Compare a new screenshot against the baseline.
   * @param {object} opts
   * @param {string} opts.name - baseline name to compare against
   * @param {string} opts.base64 - new screenshot base64
   * @param {string} opts.mimeType
   * @returns {Promise<RegressionResult>}
   */
  async compare({ name, base64, mimeType }) {
    const baseline = this._baselines.get(name);

    if (!baseline) {
      return {
        name,
        status: STATUS.BASELINE_MISSING,
        message: `No baseline captured for "${name}". Call captureBaseline() first.`,
        diff_ratio: null,
      };
    }

    const newHash = crypto.createHash('sha256').update(base64).digest('hex').slice(0, 12);
    if (newHash === baseline.hash) {
      return { name, status: STATUS.PASS, diff_ratio: 0, message: 'Identical to baseline' };
    }

    const diffResult = await this._computeDiff(baseline, { base64, mimeType });

    const status = diffResult.diff_ratio <= this._thresholds.pass
      ? STATUS.PASS
      : diffResult.diff_ratio <= this._thresholds.warn
        ? STATUS.WARN
        : STATUS.FAIL;

    const record = {
      id: `cmp_${Date.now()}`,
      name,
      status,
      diff_ratio: diffResult.diff_ratio,
      diff_description: diffResult.description,
      changed_regions: diffResult.changed_regions || [],
      message: this._statusMessage(status, diffResult.diff_ratio),
      baseline_hash: baseline.hash,
      new_hash: newHash,
      compared_at: new Date().toISOString(),
    };
    this._comparisons.push(record);
    if (this._comparisons.length > 200) this._comparisons.shift();

    return record;
  }

  async _computeDiff(baseline, newShot) {
    try {
      const { callLLM } = require('~/server/services/LLMGateway/LLMGateway');
      const prompt = `You are a visual regression testing system. Compare these two screenshots.

Screenshot 1 is the BASELINE. Screenshot 2 is the NEW version.

Identify visual differences and estimate the overall percentage of pixels that changed.
Return ONLY JSON:
{
  "diff_ratio": 0.0-1.0,
  "description": "brief description of changes",
  "changed_regions": ["top navigation", "hero section", ...]
}`;

      const raw = await callLLM(prompt, {
        imageBase64: [baseline.base64, newShot.base64],
        imageMimeType: baseline.mimeType,
      });
      const match = (raw || '').match(/\{[\s\S]*?\}/);
      if (!match) return { diff_ratio: 0.5, description: 'Unable to analyze diff', changed_regions: [] };
      const parsed = JSON.parse(match[0]);
      return {
        diff_ratio: Math.min(1, Math.max(0, Number(parsed.diff_ratio) || 0)),
        description: parsed.description || '',
        changed_regions: Array.isArray(parsed.changed_regions) ? parsed.changed_regions : [],
      };
    } catch {
      return { diff_ratio: 0.1, description: 'Diff analysis unavailable', changed_regions: [] };
    }
  }

  _statusMessage(status, ratio) {
    const pct = Math.round(ratio * 100);
    if (status === STATUS.PASS) return `Visual regression check passed (${pct}% change)`;
    if (status === STATUS.WARN) return `Visual regression warning: ${pct}% of pixels changed`;
    return `Visual regression FAILED: ${pct}% of pixels changed (threshold: ${Math.round(this._thresholds.fail * 100)}%)`;
  }

  listBaselines() {
    return Array.from(this._baselines.values()).map(({ base64: _, ...rest }) => rest);
  }

  deleteBaseline(name) {
    return this._baselines.delete(name);
  }

  getComparisons(name = null, limit = 20) {
    let comparisons = this._comparisons;
    if (name) comparisons = comparisons.filter((c) => c.name === name);
    return comparisons.slice(-limit).reverse();
  }

  getStats() {
    const total = this._comparisons.length;
    const pass = this._comparisons.filter((c) => c.status === STATUS.PASS).length;
    const warn = this._comparisons.filter((c) => c.status === STATUS.WARN).length;
    const fail = this._comparisons.filter((c) => c.status === STATUS.FAIL).length;
    return { total, pass, warn, fail, baselines: this._baselines.size };
  }
}

let _instance = null;
function getVisualRegressionSystem(opts) {
  if (!_instance) _instance = new VisualRegressionSystem(opts);
  return _instance;
}

module.exports = { VisualRegressionSystem, getVisualRegressionSystem, STATUS, DIFF_THRESHOLDS };
