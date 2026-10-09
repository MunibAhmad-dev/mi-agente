'use strict';

/**
 * IQAScorer — Face 12: Image Quality Assessment.
 *
 * Scores images on 6 dimensions (0-100 each) using sharp pixel analysis:
 *   sharpness, noise, contrast, brightness, colorfulness, exposure.
 *
 * Degrades gracefully when sharp is not installed — returns null scores.
 * Port of the TypeScript IQA scorer from the creative-ai-orchestrator branch.
 */

const DEFAULT_WEIGHTS = {
  sharpness:    0.25,
  noise:        0.20,
  contrast:     0.15,
  brightness:   0.10,
  colorfulness: 0.15,
  exposure:     0.15,
};

function getLuma(data, idx, channels) {
  const r = data[idx] ?? 0;
  const g = channels > 1 ? (data[idx + 1] ?? r) : r;
  const b = channels > 2 ? (data[idx + 2] ?? r) : r;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

class IQAScorer {
  constructor(weights = {}) {
    this._weights = { ...DEFAULT_WEIGHTS, ...weights };
    this._sharp = null;
    this._sharpLoaded = false;
  }

  _getSharp() {
    if (!this._sharpLoaded) {
      this._sharpLoaded = true;
      try { this._sharp = require('sharp'); } catch { this._sharp = null; }
    }
    return this._sharp;
  }

  /**
   * Score an image file (path) or buffer.
   * @param {string|Buffer} input
   * @returns {Promise<{sharpness,noise,contrast,brightness,colorfulness,exposure,overall,method,timeMs}|null>}
   */
  async score(input) {
    const sharp = this._getSharp();
    if (!sharp) return null;

    const start = Date.now();
    try {
      const { data, info } = await sharp(input)
        .ensureAlpha(0)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height, channels } = info;
      const pixelCount = width * height;

      // ── Sharpness (Laplacian variance) ──────────────────────────────────
      let lapSum = 0;
      let lapSumSq = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const c  = getLuma(data, (y * width + x) * channels, channels);
          const n  = getLuma(data, ((y - 1) * width + x) * channels, channels);
          const s  = getLuma(data, ((y + 1) * width + x) * channels, channels);
          const ww = getLuma(data, (y * width + (x - 1)) * channels, channels);
          const e  = getLuma(data, (y * width + (x + 1)) * channels, channels);
          const lap = Math.abs(4 * c - n - s - ww - e);
          lapSum   += lap;
          lapSumSq += lap * lap;
        }
      }
      const lapPixels = (width - 2) * (height - 2) || 1;
      const lapMean  = lapSum / lapPixels;
      const lapVar   = lapSumSq / lapPixels - lapMean * lapMean;
      const sharpness = Math.min(100, Math.round((lapVar / 1000) * 100));

      // ── Noise (local variance of dark pixels) ────────────────────────────
      let noiseSum = 0;
      let noiseCount = 0;
      const sampleStep = Math.max(1, Math.floor(Math.sqrt(pixelCount / 1000)));
      for (let i = 0; i < pixelCount; i += sampleStep) {
        const luma = getLuma(data, i * channels, channels);
        if (luma < 50) { noiseSum += luma; noiseCount++; }
      }
      const noiseLevel = noiseCount > 0 ? noiseSum / noiseCount : 0;
      const noise = Math.min(100, Math.round(Math.max(0, 100 - noiseLevel * 8)));

      // ── Contrast (std dev of luma) ───────────────────────────────────────
      let lumaSum = 0;
      const lumas = new Float64Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        const l = getLuma(data, i * channels, channels);
        lumas[i] = l;
        lumaSum += l;
      }
      const meanLuma = lumaSum / pixelCount;
      let variance = 0;
      for (let i = 0; i < pixelCount; i++) variance += (lumas[i] - meanLuma) ** 2;
      const stdDev   = Math.sqrt(variance / pixelCount);
      const contrast = Math.min(100, Math.round((stdDev / 64) * 100));

      // ── Brightness ───────────────────────────────────────────────────────
      const brightness = Math.min(100, Math.round((meanLuma / 255) * 100));

      // ── Colorfulness (Hasler & Süsstrunk) ────────────────────────────────
      let rgSum = 0, ybSum = 0;
      for (let i = 0; i < pixelCount; i++) {
        const idx = i * channels;
        const r = data[idx] ?? 0;
        const g = channels > 1 ? (data[idx + 1] ?? r) : r;
        const b = channels > 2 ? (data[idx + 2] ?? r) : r;
        rgSum += Math.abs(r - g);
        ybSum += Math.abs(0.5 * (r + g) - b);
      }
      const rgMean = rgSum / pixelCount;
      const ybMean = ybSum / pixelCount;
      const colorfulnessRaw = Math.sqrt(rgMean ** 2 + ybMean ** 2);
      const colorfulness = Math.min(100, Math.round((colorfulnessRaw / 50) * 100));

      // ── Exposure (histogram clipping) ────────────────────────────────────
      const histogram = new Uint32Array(256);
      for (let i = 0; i < pixelCount; i++) {
        const hi = Math.min(255, Math.max(0, Math.round(lumas[i])));
        histogram[hi]++;
      }
      const clipped  = ((histogram[0] || 0) + (histogram[255] || 0)) / pixelCount;
      const exposure = Math.min(100, Math.round(Math.max(0, 100 - clipped * 200)));

      // ── Weighted overall ──────────────────────────────────────────────────
      const w = this._weights;
      const overall = Math.round(
        sharpness    * w.sharpness    +
        noise        * w.noise        +
        contrast     * w.contrast     +
        brightness   * w.brightness   +
        colorfulness * w.colorfulness +
        exposure     * w.exposure,
      );

      return {
        sharpness:    Math.round(sharpness),
        noise:        Math.round(noise),
        contrast:     Math.round(contrast),
        brightness:   Math.round(brightness),
        colorfulness: Math.round(colorfulness),
        exposure:     Math.round(exposure),
        overall:      Math.round(overall),
        method:       'sharp_analysis',
        timeMs:       Date.now() - start,
      };
    } catch (err) {
      return { error: err.message, overall: null, method: 'sharp_analysis', timeMs: Date.now() - start };
    }
  }

  getWeights() {
    return { ...this._weights };
  }
}

let _singleton = null;

function getIQAScorer(weights) {
  if (!_singleton || weights) _singleton = new IQAScorer(weights);
  return _singleton;
}

module.exports = { IQAScorer, getIQAScorer };
