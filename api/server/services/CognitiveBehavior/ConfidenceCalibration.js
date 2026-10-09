'use strict';

/**
 * ConfidenceCalibration — Gen B reasoning quality.
 * Calibrates stated confidence scores against actual accuracy over time.
 *
 * Uses exponential moving average (EMA) over the last 100 samples.
 *
 * - calibrate(statedConfidence, actualOutcome) — record a calibration sample
 * - getCalibration() → { bias, calibrationError, reliability }
 * - adjust(rawConfidence) → calibration-corrected confidence
 */

const MAX_SAMPLES = 100;
const EMA_ALPHA = 0.1; // smoothing factor for EMA

class ConfidenceCalibration {
  constructor() {
    // Circular buffer of { stated, actual } samples
    this._samples = [];
    // EMA state
    this._emaBias = 0; // running EMA of (stated - actual)
    this._emaError = 0; // running EMA of |stated - actual|
    this._sampleCount = 0;
    this.stats = { calibrations: 0, adjustments: 0 };
  }

  /**
   * Record a calibration data point.
   * @param {number} statedConfidence  — 0 to 1
   * @param {number} actualOutcome     — 0 (wrong) or 1 (correct), or fraction
   * @returns {{ recorded: boolean, sampleCount: number }}
   */
  calibrate(statedConfidence, actualOutcome) {
    try {
      const stated = parseFloat(statedConfidence);
      const actual = parseFloat(actualOutcome);

      if (isNaN(stated) || isNaN(actual)) {
        return { recorded: false, error: 'statedConfidence and actualOutcome must be numbers' };
      }

      const clampedStated = Math.max(0, Math.min(1, stated));
      const clampedActual = Math.max(0, Math.min(1, actual));

      // Update EMA
      const diff = clampedStated - clampedActual;
      const absDiff = Math.abs(diff);

      if (this._sampleCount === 0) {
        this._emaBias = diff;
        this._emaError = absDiff;
      } else {
        this._emaBias = EMA_ALPHA * diff + (1 - EMA_ALPHA) * this._emaBias;
        this._emaError = EMA_ALPHA * absDiff + (1 - EMA_ALPHA) * this._emaError;
      }

      // Store sample (circular buffer)
      this._samples.push({ stated: clampedStated, actual: clampedActual, at: Date.now() });
      if (this._samples.length > MAX_SAMPLES) {
        this._samples.shift();
      }

      this._sampleCount++;
      this.stats.calibrations++;

      return { recorded: true, sampleCount: this._sampleCount };
    } catch (err) {
      return { recorded: false, error: err.message };
    }
  }

  /**
   * Get current calibration metrics.
   * @returns {{ bias: number, calibrationError: number, reliability: number }}
   *   bias             — positive = overconfident, negative = underconfident
   *   calibrationError — mean absolute error between stated and actual
   *   reliability      — 0-1, higher = better calibrated
   */
  getCalibration() {
    try {
      if (this._sampleCount === 0) {
        return { bias: 0, calibrationError: 0, reliability: 1, sampleCount: 0 };
      }

      const bias = Math.round(this._emaBias * 1000) / 1000;
      const calibrationError = Math.round(this._emaError * 1000) / 1000;

      // Reliability: 1 when error=0, 0 when error=0.5 or more
      const reliability = Math.max(0, Math.min(1, 1 - this._emaError * 2));

      return {
        bias,
        calibrationError,
        reliability: Math.round(reliability * 1000) / 1000,
        sampleCount: this._sampleCount,
      };
    } catch (err) {
      return { bias: 0, calibrationError: 0, reliability: 1, sampleCount: 0, error: err.message };
    }
  }

  /**
   * Adjust a raw confidence score using the calibration data.
   * @param {number} rawConfidence  — 0 to 1
   * @returns {number}  — calibration-corrected confidence, clamped to [0, 1]
   */
  adjust(rawConfidence) {
    try {
      const raw = parseFloat(rawConfidence);
      if (isNaN(raw)) return 0.5;

      this.stats.adjustments++;

      if (this._sampleCount < 5) {
        // Not enough data to calibrate — return as-is
        return Math.max(0, Math.min(1, raw));
      }

      // Subtract the bias to correct for systematic over/under confidence
      const adjusted = raw - this._emaBias;
      return Math.round(Math.max(0, Math.min(1, adjusted)) * 1000) / 1000;
    } catch (err) {
      return Math.max(0, Math.min(1, parseFloat(rawConfidence) || 0.5));
    }
  }

  /**
   * Compute reliability score from recent samples (last N).
   * @param {number} [n=20]
   * @returns {number}
   */
  recentReliability(n = 20) {
    try {
      const recent = this._samples.slice(-n);
      if (recent.length === 0) return 1;
      const avgError = recent.reduce((sum, s) => sum + Math.abs(s.stated - s.actual), 0) / recent.length;
      return Math.max(0, Math.min(1, 1 - avgError * 2));
    } catch (err) {
      return 1;
    }
  }

  getStats() {
    return {
      ...this.stats,
      sampleCount: this._sampleCount,
      ...this.getCalibration(),
    };
  }
}

let _instance = null;
function getConfidenceCalibration() {
  if (!_instance) _instance = new ConfidenceCalibration();
  return _instance;
}

module.exports = { ConfidenceCalibration, getConfidenceCalibration };
