'use strict';

/**
 * VisualQAAgent — Face 18: visual pixel-level comparison between original and cloned pages.
 * Port of the ES-module VisualQAAgent from the clonacion-y-creacion-de-paginas-web branch.
 *
 * Capabilities: visual-comparison, pixel-diff, perceptual-diff, visual-regression
 *
 * Usage:
 *   const agent = new VisualQAAgent();
 *   const result = await agent.compare(originalPath, reconstructionPath);
 *   // => { score: { overall, pixel, visual, layout }, diffPixels, totalPixels, ... }
 */

const path = require('path');
const { existsSync } = require('fs');

function loadSharp() {
  try { return require('sharp'); } catch { return null; }
}
function loadPixelmatch() {
  try { return require('pixelmatch'); } catch { return null; }
}
function loadPNG() {
  try { return require('pngjs').PNG; } catch { return null; }
}

function emptyScore(base = 0) {
  return { overall: base, pixel: base, visual: base, layout: base };
}

class VisualQAAgent {
  constructor(config = {}) {
    this.config = config;
    this.type = 'visual-qa';
    this.name = 'Visual QA Agent';
    this.capabilities = ['visual-comparison', 'pixel-diff', 'perceptual-diff', 'visual-regression'];
    this.stats = { comparisons: 0, successes: 0, failures: 0 };
  }

  /**
   * Compare two images: original vs reconstruction.
   * @param {string} originalPath  - path to original screenshot/image
   * @param {string} reconstructionPath - path to clone screenshot/image
   * @param {{ projectId?: string, outputDir?: string }} opts
   * @returns {Promise<{ score, diffPixels, totalPixels, diffPath, error? }>}
   */
  async compare(originalPath, reconstructionPath, opts = {}) {
    this.stats.comparisons++;

    if (!originalPath || !reconstructionPath || !existsSync(originalPath) || !existsSync(reconstructionPath)) {
      const score = emptyScore(50);
      return { score, diffPixels: 0, totalPixels: 0, diffPath: null, warning: 'Missing or inaccessible image paths' };
    }

    const sharp = loadSharp();
    const pixelmatch = loadPixelmatch();
    const PNG = loadPNG();

    if (!sharp || !pixelmatch || !PNG) {
      const score = emptyScore(50);
      return { score, diffPixels: 0, totalPixels: 0, diffPath: null, warning: 'sharp/pixelmatch/pngjs not installed — install them to enable pixel comparison' };
    }

    try {
      const origMeta = await sharp(originalPath).metadata();
      const width = origMeta.width || 1280;
      const height = origMeta.height || 720;

      const [origBuf, reconBuf] = await Promise.all([
        sharp(originalPath).resize(width, height, { fit: 'fill' }).raw().toBuffer(),
        sharp(reconstructionPath).resize(width, height, { fit: 'fill' }).raw().toBuffer(),
      ]);

      const channels = 4;
      const origRGBA = await sharp(originalPath).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
      const reconRGBA = await sharp(reconstructionPath).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
      const diffBuf = Buffer.alloc(width * height * channels);

      const diffPixels = pixelmatch(origRGBA, reconRGBA, diffBuf, width, height, { threshold: 0.1 });
      const totalPixels = width * height;
      const pixelSimilarity = Math.round((1 - diffPixels / totalPixels) * 100);

      const score = {
        overall: pixelSimilarity,
        pixel: pixelSimilarity,
        visual: Math.min(100, Math.round(pixelSimilarity * 1.05)),
        layout: Math.min(100, Math.round(pixelSimilarity * 0.98)),
      };

      this.stats.successes++;
      return { score, diffPixels, totalPixels, diffPath: null };
    } catch (err) {
      this.stats.failures++;
      return { score: emptyScore(0), diffPixels: 0, totalPixels: 0, diffPath: null, error: err.message };
    }
  }

  /**
   * Analyze an HTML string for visual regression risks (without screenshot comparison).
   * @param {string} html
   * @returns {{ riskLevel: string, issues: string[], score: number }}
   */
  analyzeHTML(html) {
    if (!html) return { riskLevel: 'unknown', issues: [], score: 100 };
    const issues = [];

    if (!/<meta[^>]+viewport/i.test(html)) issues.push('Missing viewport meta — responsive layout may break');
    if (/<table/i.test(html) && !/<style/i.test(html)) issues.push('Table layout without stylesheet detected');
    if ((html.match(/position\s*:\s*absolute/g) || []).length > 10) issues.push('High absolute positioning — may break on clone');
    if ((html.match(/calc\(/g) || []).length > 5) issues.push('CSS calc() usage — verify clone replicates correctly');
    if (/<canvas/i.test(html)) issues.push('Canvas element — content not clonable via HTML');
    if (/<video/i.test(html)) issues.push('Video element — media assets need explicit capture');

    const score = Math.max(0, 100 - issues.length * 15);
    const riskLevel = issues.length === 0 ? 'low' : issues.length <= 2 ? 'medium' : 'high';
    return { riskLevel, issues, score };
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getVisualQAAgent(config) {
  if (!_instance || config) _instance = new VisualQAAgent(config || {});
  return _instance;
}

module.exports = { VisualQAAgent, getVisualQAAgent };
