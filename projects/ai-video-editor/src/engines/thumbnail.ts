/**
 * AI Creative OS - Thumbnail Engine
 * §112: Thumbnail extraction, scoring, generation, comparison, batch processing.
 * Uses FFmpeg for extraction, OpenCV-style analysis for scoring.
 */

import type { UniqueId, FilePath, Score, Color } from "../types/index.js";
import { Logger, EventBus, generateId, execCommand } from "../core/index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;        // 1-31 (lower = better for JPEG)
  format?: "jpg" | "png" | "webp";
  timestamp?: number;      // specific time in seconds
  strategy?: "first" | "middle" | "best_scene" | "most_colorful" | "most_sharp" | "face_best";
  maxCandidates?: number;
}

export interface ThumbnailResult {
  path: FilePath;
  timestamp: number;
  score: ThumbnailScore;
  format: string;
}

export interface ThumbnailScore {
  overall: Score;
  sharpness: Score;       // edge density (proxy: laplacian variance)
  brightness: Score;      // 0-255 average
  contrast: Score;        // standard deviation
  colorfulness: Score;    // color variance
  composition: Score;     // rule-of-thirds center weight
  facePresence: Score;    // estimated face region
}

export interface BatchThumbnailResult {
  video: FilePath;
  thumbnails: ThumbnailResult[];
  best: ThumbnailResult;
  count: number;
}

// ─── Thumbnail Engine ────────────────────────────────────────────────────────

export class ThumbnailEngine {
  private logger = new Logger("ThumbnailEngine");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Extract a single thumbnail from video at a specific time.
   */
  async extract(
    videoPath: FilePath,
    outputPath: FilePath,
    options: ThumbnailOptions = {},
  ): Promise<ThumbnailResult | null> {
    const time = options.timestamp ?? 1;
    const width = options.width ?? 1280;
    const height = options.height ?? 720;
    const quality = options.quality ?? 2;
    const format = options.format ?? "jpg";

    const result = execCommand(
      `ffmpeg -y -ss ${time} -i "${videoPath}" -vframes 1 -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2" -q:v ${quality} "${outputPath}" 2>/dev/null`,
      { timeout: 15000 },
    );

    if (result.exitCode !== 0) return null;

    const score = await this.scoreThumbnail(outputPath);

    return {
      path: outputPath,
      timestamp: time,
      score,
      format,
    };
  }

  /**
   * Extract the best thumbnail using a scoring strategy.
   */
  async extractBest(
    videoPath: FilePath,
    outputPath: FilePath,
    options: ThumbnailOptions = {},
  ): Promise<ThumbnailResult | null> {
    const strategy = options.strategy ?? "best_scene";
    const maxCandidates = options.maxCandidates ?? 10;

    // Get video duration
    const duration = await this.getVideoDuration(videoPath);
    if (duration <= 0) return null;

    // Generate candidate timestamps
    const timestamps = this.generateCandidateTimestamps(duration, strategy, maxCandidates);

    // Extract and score each candidate
    let bestResult: ThumbnailResult | null = null;
    let bestScore = -1;

    for (const ts of timestamps) {
      const candidatePath = `${outputPath}.candidate_${ts.toFixed(2)}.${options.format ?? "jpg"}`;
      const result = await this.extract(videoPath, candidatePath, { ...options, timestamp: ts });
      if (!result) continue;

      if (result.score.overall > bestScore) {
        bestScore = result.score.overall;
        bestResult = result;
      }
    }

    // Copy best to final output
    if (bestResult) {
      execCommand(`cp "${bestResult.path}" "${outputPath}"`, { timeout: 5000 });
      bestResult.path = outputPath;

      // Cleanup candidates
      for (const ts of timestamps) {
        const candidatePath = `${outputPath}.candidate_${ts.toFixed(2)}.${options.format ?? "jpg"}`;
        execCommand(`rm -f "${candidatePath}"`, { timeout: 3000 });
      }
    }

    await this.eventBus.emit("THUMBNAIL_GENERATED", "ThumbnailEngine", {
      video: videoPath,
      output: outputPath,
      score: bestResult?.score.overall ?? 0,
      strategy,
    });

    return bestResult;
  }

  /**
   * Extract multiple thumbnails at different timestamps.
   */
  async extractMultiple(
    videoPath: FilePath,
    outputDir: FilePath,
    count: number = 5,
    options: ThumbnailOptions = {},
  ): Promise<BatchThumbnailResult> {
    const duration = await this.getVideoDuration(videoPath);
    const timestamps = this.generateCandidateTimestamps(duration, options.strategy ?? "best_scene", count);

    execCommand(`mkdir -p "${outputDir}"`, { timeout: 5000 });

    const thumbnails: ThumbnailResult[] = [];
    for (const ts of timestamps) {
      const ext = options.format ?? "jpg";
      const outPath = `${outputDir}/thumb_${ts.toFixed(2)}.${ext}`;
      const result = await this.extract(videoPath, outPath, { ...options, timestamp: ts });
      if (result) thumbnails.push(result);
    }

    // Sort by score
    thumbnails.sort((a, b) => b.score.overall - a.score.overall);

    return {
      video: videoPath,
      thumbnails,
      best: thumbnails[0],
      count: thumbnails.length,
    };
  }

  /**
   * Score a thumbnail image using FFmpeg filters as proxy for visual analysis.
   */
  async scoreThumbnail(path: FilePath): Promise<ThumbnailScore> {
    // Get image dimensions
    const infoResult = execCommand(
      `ffprobe -v quiet -print_format json -show_streams "${path}"`,
      { timeout: 5000 },
    );
    let width = 1280;
    let height = 720;
    try {
      const info = JSON.parse(infoResult.stdout);
      const stream = info.streams?.[0];
      if (stream) {
        width = stream.width ?? 1280;
        height = stream.height ?? 720;
      }
    } catch { /* defaults */ }

    // Use signalstats for brightness/contrast
    const statsResult = execCommand(
      `ffmpeg -i "${path}" -vf "signalstats" -f null - 2>&1 | tail -5`,
      { timeout: 10000 },
    );

    const brightness = this.extractStat(statsResult.stdout, "YAVG") ?? 128;
    const contrast = (this.extractStat(statsResult.stdout, "YMAX") ?? 255) - (this.extractStat(statsResult.stdout, "YMIN") ?? 0);

    // Estimate sharpness from edge detection (using edgedetect filter + statistics)
    const edgeResult = execCommand(
      `ffmpeg -i "${path}" -vf "edgedetect=low=0.1:high=0.4,signalstats" -f null - 2>&1 | tail -3`,
      { timeout: 10000 },
    );
    const edgeDensity = this.extractStat(edgeResult.stdout, "YAVG") ?? 0;

    // Estimate colorfulness
    const colorResult = execCommand(
      `ffmpeg -i "${path}" -vf "format=rgb,signalstats" -f null - 2>&1 | tail -3`,
      { timeout: 10000 },
    );
    const saturation = this.extractStat(colorResult.stdout, "SAT") ?? 0;

    // Composition score (center-weighted brightness suggests good subject placement)
    const compositionScore = Math.min(100, Math.max(0,
      brightness > 60 && brightness < 200 ? 70 :
        brightness <= 60 ? 30 : 50
    ));

    const scores: ThumbnailScore = {
      overall: 0,
      sharpness: Math.min(100, Math.round(edgeDensity * 2)),
      brightness: Math.round((brightness / 255) * 100),
      contrast: Math.min(100, Math.round((contrast / 255) * 120)),
      colorfulness: Math.min(100, Math.round(saturation * 1.5)),
      composition: compositionScore,
      facePresence: 50,  // Default estimate without ML model
    };

    // Weighted average
    scores.overall = Math.round(
      scores.sharpness * 0.25 +
      scores.brightness * 0.15 +
      scores.contrast * 0.2 +
      scores.colorfulness * 0.2 +
      scores.composition * 0.15 +
      scores.facePresence * 0.05
    );

    return scores;
  }

  /**
   * Compare two thumbnails and return which is better.
   */
  async compare(
    thumbA: FilePath,
    thumbB: FilePath,
  ): Promise<{ winner: "a" | "b" | "tie"; scoreA: ThumbnailScore; scoreB: ThumbnailScore; difference: number }> {
    const [scoreA, scoreB] = await Promise.all([
      this.scoreThumbnail(thumbA),
      this.scoreThumbnail(thumbB),
    ]);

    const diff = scoreA.overall - scoreB.overall;
    const winner = Math.abs(diff) < 3 ? "tie" : diff > 0 ? "a" : "b";

    return { winner, scoreA, scoreB, difference: diff };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getVideoDuration(path: FilePath): Promise<number> {
    const result = execCommand(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${path}"`,
      { timeout: 10000 },
    );
    return parseFloat(result.stdout) || 0;
  }

  private generateCandidateTimestamps(duration: number, strategy: string, count: number): number[] {
    const timestamps: number[] = [];
    const safeDuration = Math.max(duration - 1, 1);

    switch (strategy) {
      case "first":
        timestamps.push(0.5);
        break;

      case "middle":
        timestamps.push(duration / 2);
        break;

      case "best_scene":
        // Sample evenly across the video, avoiding first/last 10%
        const start = duration * 0.1;
        const end = duration * 0.9;
        const step = (end - start) / Math.max(count - 1, 1);
        for (let i = 0; i < count; i++) {
          timestamps.push(start + step * i);
        }
        break;

      case "most_colorful":
        // Heavily sample middle section (usually more interesting)
        for (let i = 0; i < count; i++) {
          timestamps.push(0.1 * duration + Math.random() * 0.8 * duration);
        }
        break;

      case "most_sharp":
      case "face_best":
        // Even distribution
        for (let i = 0; i < count; i++) {
          timestamps.push((i / count) * safeDuration + 0.5);
        }
        break;

      default:
        for (let i = 0; i < count; i++) {
          timestamps.push((i / count) * safeDuration + 0.5);
        }
    }

    return timestamps.map(t => Math.max(0.1, Math.min(t, safeDuration)));
  }

  private extractStat(output: string, stat: string): number | null {
    const match = output.match(new RegExp(`${stat}:\\s*([\\d.]+)`));
    return match ? parseFloat(match[1]) : null;
  }
}
