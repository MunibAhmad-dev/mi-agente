// ============================================================================
// Vision Engine
// ============================================================================
// Real image analysis using sharp for metrics: sharpness, noise, blur,
// contrast, brightness, color, resolution. No mocks.
// ============================================================================

import sharp from "sharp";
import fs from "node:fs";
import { createHash } from "node:crypto";
import type {
  ImageAnalysis,
  VideoAnalysis,
  QualityScore,
  QualityWeights,
  CaioDatabase,
} from "../../core/types/index.js";
import { newId } from "../../core/types/index.js";

const DEFAULT_WEIGHTS: QualityWeights = {
  sharpness: 0.2,
  noise: 0.15,
  composition: 0.15,
  lighting: 0.15,
  artifacts: 0.15,
  resolution: 0.2,
};

export class VisionEngine {
  private defaultWeights: QualityWeights;

  constructor(private db?: CaioDatabase, weights?: Partial<QualityWeights>) {
    this.defaultWeights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Analyze an image file using sharp for real metrics.
   */
  async analyzeImage(imagePath: string): Promise<ImageAnalysis> {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    const stat = fs.statSync(imagePath);
    const ext = imagePath.split(".").pop()?.toLowerCase() || "unknown";

    // Get image metadata via sharp
    const metadata = await sharp(imagePath).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const channels = metadata.channels || 3;

    // Get raw pixel data for analysis
    const { data: rawPixels, info } = await sharp(imagePath)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate real metrics from pixel data
    const sharpnessScore = this.calculateSharpness(rawPixels, info.width, info.height);
    const noiseScore = this.calculateNoise(rawPixels, info.width, info.height);
    const blurScore = this.calculateBlur(rawPixels, info.width, info.height);
    const contrastScore = this.calculateContrast(rawPixels);
    const brightnessScore = this.calculateBrightness(rawPixels);
    const colorfulness = await this.calculateColorfulness(imagePath);
    const composition = this.estimateComposition(width, height);

    const analysis: ImageAnalysis = {
      path: imagePath,
      width,
      height,
      channels,
      format: ext,
      sizeBytes: stat.size,
      sharpness: sharpnessScore,
      noise: noiseScore,
      blur: blurScore,
      contrast: contrastScore,
      brightness: brightnessScore,
      colorfulness,
      composition,
      overallQuality: 0,
      analyzedAt: new Date(),
    };

    analysis.overallQuality = this.calculateOverallQuality(analysis);

    // Store analysis in database if available
    if (this.db) {
      const hash = this.computeHash(imagePath);
      this.db.run(
        `INSERT OR REPLACE INTO discovery_cache (key, provider, query, result, expires_at)
         VALUES (?, 'vision', ?, ?, datetime('now', '+1 hour'))`,
        `vision:${hash}`,
        imagePath,
        JSON.stringify(analysis)
      );
    }

    return analysis;
  }

  /**
   * Compare two images and return detailed diff.
   */
  async compareImages(originalPath: string, modifiedPath: string): Promise<{
    improved: boolean;
    resolutionChanged: boolean;
    sizeChanged: boolean;
    qualityDelta: number;
    details: string[];
    originalAnalysis: ImageAnalysis;
    modifiedAnalysis: ImageAnalysis;
  }> {
    const original = await this.analyzeImage(originalPath);
    const modified = await this.analyzeImage(modifiedPath);

    const resolutionChanged = original.width !== modified.width || original.height !== modified.height;
    const sizeChanged = Math.abs(original.sizeBytes - modified.sizeBytes) > original.sizeBytes * 0.1;
    const qualityDelta = modified.overallQuality - original.overallQuality;

    const details: string[] = [];
    if (resolutionChanged) {
      details.push(`Resolution: ${original.width}x${original.height} → ${modified.width}x${modified.height}`);
    }
    if (qualityDelta > 5) details.push(`Quality improved by ${qualityDelta.toFixed(1)} points`);
    if (qualityDelta < -5) details.push(`Quality decreased by ${Math.abs(qualityDelta).toFixed(1)} points`);
    if (modified.sharpness > original.sharpness + 5) details.push(`Sharpness improved: ${original.sharpness} → ${modified.sharpness}`);
    if (modified.noise < original.noise - 5) details.push(`Noise reduced: ${original.noise} → ${modified.noise}`);
    if (sizeChanged) {
      details.push(`File size: ${(original.sizeBytes / 1024).toFixed(0)}KB → ${(modified.sizeBytes / 1024).toFixed(0)}KB`);
    }

    return {
      improved: qualityDelta > 0,
      resolutionChanged,
      sizeChanged,
      qualityDelta,
      details,
      originalAnalysis: original,
      modifiedAnalysis: modified,
    };
  }

  /**
   * Score quality with configurable weights.
   */
  scoreQuality(analysis: ImageAnalysis, weights?: Partial<QualityWeights>): QualityScore {
    const w = { ...this.defaultWeights, ...weights };

    const sharpness = analysis.sharpness;
    const noise = 100 - analysis.noise; // Invert: lower noise = higher score
    const composition = analysis.composition || 50;
    const lighting = 100 - Math.abs(analysis.brightness - 55); // Optimal around 55
    const artifacts = analysis.artifacts || 90;
    const resolution = this.normalizeResolution(analysis.width, analysis.height);

    const overall = Math.round(
      sharpness * w.sharpness +
      noise * w.noise +
      composition * w.composition +
      lighting * w.lighting +
      artifacts * w.artifacts +
      resolution * w.resolution
    );

    return {
      sharpness: Math.round(sharpness),
      noise: Math.round(noise),
      composition: Math.round(composition),
      lighting: Math.round(lighting),
      artifacts: Math.round(artifacts),
      resolution: Math.round(resolution),
      overall: Math.min(100, Math.max(0, overall)),
      weights: w,
    };
  }

  /**
   * Generate improvement suggestions.
   */
  suggestImprovements(analysis: ImageAnalysis): string[] {
    const suggestions: string[] = [];
    if (analysis.sharpness < 40) suggestions.push("Apply sharpening — image lacks detail");
    if (analysis.noise > 60) suggestions.push("Apply denoising — high noise detected");
    if (analysis.blur > 40) suggestions.push("Image is blurry — consider stabilization or face restoration");
    if (analysis.contrast < 30) suggestions.push("Increase contrast — image appears flat");
    if (analysis.brightness < 25) suggestions.push("Too dark — increase brightness");
    if (analysis.brightness > 80) suggestions.push("Too bright — reduce exposure");
    if (analysis.width < 512 || analysis.height < 512) suggestions.push("Low resolution — consider upscaling");
    if (analysis.colorfulness < 30) suggestions.push("Low color saturation — consider color enhancement");
    return suggestions;
  }

  /**
   * Generate visual diff report.
   */
  async generateDiffReport(originalPath: string, modifiedPath: string): Promise<{
    summary: string;
    metrics: Array<{ name: string; before: number; after: number; change: number }>;
    recommendation: string;
  }> {
    const comparison = await this.compareImages(originalPath, modifiedPath);
    const o = comparison.originalAnalysis;
    const m = comparison.modifiedAnalysis;

    const metrics = [
      { name: "Sharpness", before: o.sharpness, after: m.sharpness, change: m.sharpness - o.sharpness },
      { name: "Noise", before: o.noise, after: m.noise, change: o.noise - m.noise },
      { name: "Contrast", before: o.contrast, after: m.contrast, change: m.contrast - o.contrast },
      { name: "Brightness", before: o.brightness, after: m.brightness, change: m.brightness - o.brightness },
      { name: "Color", before: o.colorfulness, after: m.colorfulness, change: m.colorfulness - o.colorfulness },
      { name: "Resolution", before: o.width * o.height, after: m.width * m.height, change: (m.width * m.height) - (o.width * o.height) },
    ];

    const improvedCount = metrics.filter((m) => m.change > 0).length;
    const summary = `${improvedCount}/${metrics.length} metrics improved. Quality: ${comparison.qualityDelta > 0 ? "+" : ""}${comparison.qualityDelta.toFixed(1)}`;
    const recommendation = comparison.improved
      ? "Modified version is better. Keep the changes."
      : "Original version is better. Consider rollback.";

    return { summary, metrics, recommendation };
  }

  // --- Real pixel analysis methods ---

  private calculateSharpness(pixels: Buffer, width: number, height: number): number {
    // Laplacian variance — higher = sharper
    let sum = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const laplacian =
          -4 * pixels[idx]! +
          (pixels[idx - 1] ?? 0) +
          (pixels[idx + 1] ?? 0) +
          (pixels[idx - width] ?? 0) +
          (pixels[idx + width] ?? 0);
        sum += laplacian * laplacian;
        count++;
      }
    }
    const variance = count > 0 ? sum / count : 0;
    // Normalize to 0-100 (typical variance 0-2000)
    return Math.min(100, Math.round((variance / 2000) * 100));
  }

  private calculateNoise(pixels: Buffer, width: number, height: number): number {
    // Estimate noise using median absolute deviation
    const blockSize = 8;
    const diffs: number[] = [];
    for (let y = 0; y < height - blockSize; y += blockSize) {
      for (let x = 0; x < width - blockSize; x += blockSize) {
        const blockPixels: number[] = [];
        for (let by = 0; by < blockSize; by++) {
          for (let bx = 0; bx < blockSize; bx++) {
            blockPixels.push(pixels[(y + by) * width + (x + bx)] ?? 128);
          }
        }
        blockPixels.sort((a, b) => a - b);
        const median = blockPixels[blockPixels.length / 2] ?? 128;
        const deviations = blockPixels.map((p) => Math.abs(p - median));
        deviations.sort((a, b) => a - b);
        diffs.push(deviations[deviations.length / 2] ?? 0);
      }
    }
    const avgDeviation = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    // Normalize: 0=no noise, 100=very noisy (typical MAD 0-30)
    return Math.min(100, Math.round((avgDeviation / 30) * 100));
  }

  private calculateBlur(pixels: Buffer, width: number, height: number): number {
    // Estimate blur from high-frequency content
    let hfEnergy = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx = (pixels[idx + 1] ?? 0) - (pixels[idx - 1] ?? 0);
        const gy = (pixels[idx + width] ?? 0) - (pixels[idx - width] ?? 0);
        hfEnergy += Math.sqrt(gx * gx + gy * gy);
        count++;
      }
    }
    const avgHF = count > 0 ? hfEnergy / count : 0;
    // Low HF = blurry; High HF = sharp
    // Invert so higher = more blurry
    return Math.min(100, Math.max(0, Math.round(100 - (avgHF / 50) * 100)));
  }

  private calculateContrast(pixels: Buffer): number {
    let min = 255, max = 0, sum = 0;
    for (let i = 0; i < pixels.length; i++) {
      const v = pixels[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const range = max - min;
    // Normalize: full range (255) = 100
    return Math.round((range / 255) * 100);
  }

  private calculateBrightness(pixels: Buffer): number {
    let sum = 0;
    for (let i = 0; i < pixels.length; i++) {
      sum += pixels[i]!;
    }
    const avg = pixels.length > 0 ? sum / pixels.length : 128;
    // Normalize 0-255 to 0-100
    return Math.round((avg / 255) * 100);
  }

  private async calculateColorfulness(imagePath: string): Promise<number> {
    try {
      const { data: pixels, info } = await sharp(imagePath)
        .raw()
        .toBuffer({ resolveWithObject: true });

      if (info.channels < 3) return 50; // Greyscale

      let rgDiff = 0, ybDiff = 0;
      const pixelCount = pixels.length / info.channels;
      for (let i = 0; i < pixels.length; i += info.channels) {
        const r = pixels[i] ?? 128;
        const g = pixels[i + 1] ?? 128;
        const b = pixels[i + 2] ?? 128;
        rgDiff += Math.abs(r - g);
        ybDiff += Math.abs(0.5 * (r + g) - b);
      }

      const meanRG = rgDiff / pixelCount;
      const meanYB = ybDiff / pixelCount;
      const colorfulness = Math.sqrt(meanRG * meanRG + meanYB * meanYB);

      // Normalize (typical range 0-100)
      return Math.min(100, Math.round(colorfulness));
    } catch {
      return 50;
    }
  }

  private estimateComposition(width: number, height: number): number {
    // Basic composition based on aspect ratio
    const ratio = width / height;
    // Golden ratio ~1.618 is ideal
    const goldenDiff = Math.abs(ratio - 1.618);
    if (goldenDiff < 0.1) return 90;
    if (goldenDiff < 0.3) return 75;
    if (goldenDiff < 0.5) return 60;
    if (ratio >= 0.8 && ratio <= 2.0) return 50;
    return 30;
  }

  private calculateOverallQuality(analysis: ImageAnalysis): number {
    const scores = [
      analysis.sharpness * 0.2,
      (100 - analysis.noise) * 0.15,
      (analysis.composition || 50) * 0.15,
      (100 - Math.abs(analysis.brightness - 55)) * 0.15,
      (analysis.artifacts || 90) * 0.15,
      this.normalizeResolution(analysis.width, analysis.height) * 0.2,
    ];
    return Math.round(Math.min(100, Math.max(0, scores.reduce((a, b) => a + b, 0))));
  }

  private normalizeResolution(width: number, height: number): number {
    const pixels = width * height;
    if (pixels >= 8000000) return 100;
    if (pixels >= 4000000) return 85;
    if (pixels >= 2000000) return 70;
    if (pixels >= 1000000) return 55;
    if (pixels >= 500000) return 40;
    return 25;
  }

  private computeHash(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return createHash("sha256").update(data).digest("hex").slice(0, 16);
  }
}
