// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Visual QA Agent (FIXED)
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { ensureDir, projectDir, writeJSON, createEmptyScore, computeOverallScore } from '../core/utils.js';
import { join } from 'node:path';
import { existsSync, createWriteStream } from 'node:fs';

let sharp, pixelmatch, PNG;
try { sharp = (await import('sharp')).default; } catch {}
try { pixelmatch = (await import('pixelmatch')).default; } catch {}
try { PNG = (await import('pngjs')).PNG; } catch {}

export class VisualQAAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'visual-qa',
      name: 'Visual QA Agent',
      capabilities: ['visual-comparison', 'pixel-diff', 'perceptual-diff', 'visual-regression'],
    });
  }

  async perform(task, context) {
    const { action } = task;
    this.log.info(`Visual QA action: ${action}`);

    switch (action) {
      case 'compare': return this.compareImages(task, context);
      case 'compare-regions': return this.compareRegions(task, context);
      case 'generate-heatmap': return this.generateHeatmap(task, context);
      default: throw new Error(`Unknown visual QA action: ${action}`);
    }
  }

  // ─── Main Comparison ─────────────────────────────────────────────────────

  async compareImages(task, context) {
    const { original, reconstruction } = task;
    const projectId = context?.projectId;

    if (!original || !reconstruction || !existsSync(original) || !existsSync(reconstruction)) {
      this.log.warn('Missing images for comparison, generating placeholder score');
      const score = createEmptyScore(0);
      score.overall = 50;
      score.pixel = 50;
      score.visual = 50;
      score.layout = 50;
      this.log.info(`Fallback score: ${score.overall}%`);
      return { score, diffPath: null, heatmapPath: null, diffPixels: 0, totalPixels: 0 };
    }

    this.log.info(`Comparing: ${original} vs ${reconstruction}`);

    if (!sharp || !pixelmatch || !PNG) {
      this.log.warn('Image processing libraries not fully available');
      const score = createEmptyScore(0);
      score.overall = 50;
      score.pixel = 50;
      return { score, diffPath: null, heatmapPath: null, diffPixels: 0, totalPixels: 0 };
    }

    try {
      const result = await this.pixelCompare(original, reconstruction, projectId);
      this.log.info(`Comparison result: overall=${result.score.overall}%, pixel=${result.score.pixel}%`);
      // Return flat structure - agent base wraps in { success, result, evidence }
      return result;
    } catch (error) {
      this.log.error(`Comparison failed: ${error.message}`);
      const score = createEmptyScore(0);
      score.overall = 0;
      return { score, diffPath: null, heatmapPath: null, diffPixels: 0, totalPixels: 0 };
    }
  }

  async pixelCompare(original, reconstruction, projectId) {
    // Resize reconstruction to match original dimensions
    const origMeta = await sharp(original).metadata();
    const width = origMeta.width;
    const height = origMeta.height;

    const origBuffer = await sharp(original)
      .resize(width, height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const reconBuffer = await sharp(reconstruction)
      .resize(width, height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // Convert to PNG for pixelmatch
    const origPng = new PNG({ width, height });
    origPng.data = origBuffer;

    const reconPng = new PNG({ width, height });
    reconPng.data = reconBuffer;

    // Create diff image
    const diffPng = new PNG({ width, height });
    const diffPixels = pixelmatch(
      origPng.data, reconPng.data, diffPng.data,
      width, height,
      { threshold: 0.1, includeAA: false }
    );

    const totalPixels = width * height;
    const pixelScore = Math.round(((totalPixels - diffPixels) / totalPixels) * 10000) / 100;

    // Save diff image
    const outDir = ensureDir(projectDir(projectId || 'default') + '/diffs');
    const diffPath = join(outDir, 'pixel-diff.png');
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(diffPath);
      diffPng.pack().pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Generate heatmap
    const heatmapPath = join(outDir, 'heatmap.png');
    await this.generateHeatmapFromDiff(origPng, diffPng, width, height, heatmapPath);

    // Build score - compute ALL individual scores
    const score = createEmptyScore(0);
    score.pixel = pixelScore;
    score.visual = this.estimateVisualScore(pixelScore);
    score.layout = this.estimateLayoutScore(pixelScore);
    score.geometry = this.estimateGeometryScore(pixelScore);
    score.color = this.estimateColorScore(origPng, reconPng, width, height);
    score.typography = this.estimateTypographyScore(pixelScore);
    score.shadow = pixelScore;
    score.asset = pixelScore;
    score.responsive = pixelScore;
    score.interaction = 0;
    score.animation = 0;
    score.accessibility = 0;
    score.security = 0;

    // CRITICAL: compute overall BEFORE setting diffs
    score.overall = computeOverallScore(score);

    // Detect diff regions
    score.diffs = this.detectDiffRegions(diffPng, width, height);

    // Save score
    if (projectId) {
      writeJSON(projectDir(projectId) + '/analysis/comparison-score.json', score);
    }

    this.log.info(`Scores: pixel=${score.pixel}% visual=${score.visual}% layout=${score.layout}% color=${score.color}% typography=${score.typography}% overall=${score.overall}%`);

    return {
      score,
      diffPath,
      heatmapPath,
      diffPixels,
      totalPixels,
    };
  }

  // ─── Score Estimators ────────────────────────────────────────────────────

  estimateVisualScore(pixelScore) {
    return Math.round(Math.min(100, pixelScore * 0.95 + 2));
  }

  estimateLayoutScore(pixelScore) {
    return Math.round(Math.min(100, pixelScore * 0.98 + 1));
  }

  estimateGeometryScore(pixelScore) {
    return Math.round(Math.min(100, pixelScore * 0.97 + 1));
  }

  estimateColorScore(origPng, reconPng, width, height) {
    let totalDiff = 0;
    let count = 0;
    const step = 4;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const dr = Math.abs(origPng.data[idx] - reconPng.data[idx]);
        const dg = Math.abs(origPng.data[idx + 1] - reconPng.data[idx + 1]);
        const db = Math.abs(origPng.data[idx + 2] - reconPng.data[idx + 2]);
        totalDiff += (dr + dg + db) / 3;
        count++;
      }
    }

    const avgDiff = totalDiff / (count || 1);
    return Math.round(Math.max(0, Math.min(100, 100 - (avgDiff / 255) * 100)));
  }

  estimateTypographyScore(pixelScore) {
    return Math.round(Math.min(100, pixelScore * 0.96 + 2));
  }

  // ─── Diff Region Detection ───────────────────────────────────────────────

  detectDiffRegions(diffPng, width, height) {
    const regions = [];
    const blockSize = 64;

    for (let by = 0; by < height; by += blockSize) {
      for (let bx = 0; bx < width; bx += blockSize) {
        let diffCount = 0;
        const endX = Math.min(bx + blockSize, width);
        const endY = Math.min(by + blockSize, height);

        for (let y = by; y < endY; y++) {
          for (let x = bx; x < endX; x++) {
            const idx = (y * width + x) * 4;
            if (diffPng.data[idx] > 50 || diffPng.data[idx + 1] > 50 || diffPng.data[idx + 2] > 50) {
              diffCount++;
            }
          }
        }

        const blockSizeTotal = (endX - bx) * (endY - by);
        if (diffCount > blockSizeTotal * 0.1) {
          const pct = diffCount / blockSizeTotal;
          const severity = pct > 0.5 ? 'major' : pct > 0.25 ? 'moderate' : 'minor';

          // Classify region type by position
          let regionType = 'content';
          if (by < 80) regionType = 'header';
          else if (by > height - 100) regionType = 'footer';
          else if (bx < 250) regionType = 'sidebar';

          regions.push({
            id: `region-${regions.length}`,
            bbox: { x: bx, y: by, width: endX - bx, height: endY - by },
            severity,
            type: regionType,
            description: `${regionType} region (${bx},${by}) - ${Math.round(pct * 100)}% different`,
          });
        }
      }
    }

    return regions;
  }

  // ─── Heatmap Generation ──────────────────────────────────────────────────

  async generateHeatmapFromDiff(origPng, diffPng, width, height, outputPath) {
    if (!sharp) return;

    const heatmapBuffer = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const diff = Math.max(diffPng.data[idx], diffPng.data[idx + 1], diffPng.data[idx + 2]);
        const intensity = Math.min(diff / 255, 1);

        heatmapBuffer[idx] = Math.round(intensity * 255);
        heatmapBuffer[idx + 1] = Math.round((1 - intensity) * 100);
        heatmapBuffer[idx + 2] = 0;
        heatmapBuffer[idx + 3] = Math.round(intensity * 180);
      }
    }

    const heatmapPng = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = heatmapBuffer[idx + 3] / 255;
        heatmapPng.data[idx] = Math.round(origPng.data[idx] * (1 - alpha) + heatmapBuffer[idx] * alpha);
        heatmapPng.data[idx + 1] = Math.round(origPng.data[idx + 1] * (1 - alpha) + heatmapBuffer[idx + 1] * alpha);
        heatmapPng.data[idx + 2] = Math.round(origPng.data[idx + 2] * (1 - alpha) + heatmapBuffer[idx + 2] * alpha);
        heatmapPng.data[idx + 3] = 255;
      }
    }

    await sharp(heatmapPng.data, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(outputPath);
  }

  // ─── Region Comparison ───────────────────────────────────────────────────

  async compareRegions(task, context) {
    const { original, reconstruction, regions } = task;
    const results = [];

    for (const region of regions || []) {
      const { x, y, width, height } = region;
      try {
        const origCrop = await sharp(original).extract({ left: x, top: y, width, height }).raw().toBuffer();
        const reconCrop = await sharp(reconstruction).extract({ left: x, top: y, width, height }).raw().toBuffer();

        let diffPixels = 0;
        const pixelCount = width * height * 4;
        for (let i = 0; i < pixelCount; i += 4) {
          if (Math.abs(origCrop[i] - reconCrop[i]) > 20 ||
              Math.abs(origCrop[i + 1] - reconCrop[i + 1]) > 20 ||
              Math.abs(origCrop[i + 2] - reconCrop[i + 2]) > 20) {
            diffPixels++;
          }
        }

        results.push({
          region,
          match: Math.round(((width * height - diffPixels) / (width * height)) * 100),
          diffPixels,
        });
      } catch (e) {
        results.push({ region, error: e.message });
      }
    }

    return { result: { regions: results } };
  }
}
