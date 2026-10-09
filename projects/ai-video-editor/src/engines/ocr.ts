/**
 * AI Creative OS - OCR Integration
 * §34: Text Detection (OCR) via tesseract-ocr CLI.
 * Used for: on-screen text detection, subtitle extraction, text overlay analysis.
 */

import type { UniqueId, FilePath, Score, Duration } from "../types/index.js";
import { Logger, EventBus, generateId, execCommand } from "../core/index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OCRDetectedText {
  text: string;
  confidence: Score;
  boundingBox: { x: number; y: number; width: number; height: number };
  language: string;
  orientation: number;
}

export interface OCRFrameResult {
  timestamp: Duration;
  texts: OCRDetectedText[];
  totalTextLength: number;
  avgConfidence: Score;
}

export interface VideoTextAnalysis {
  filePath: FilePath;
  frames: OCRFrameResult[];
  uniqueTexts: string[];
  timeline: { time: Duration; text: string; confidence: Score }[];
  totalTextDetected: number;
  avgConfidence: Score;
}

export interface OCROptions {
  language?: string;       // tesseract language code
  preprocessMode?: "none" | "threshold" | "sharpen" | "denoise";
  minConfidence?: Score;   // minimum confidence to include
  maxFrames?: number;      // max frames to analyze
  region?: { x: number; y: number; width: number; height: number }; // restrict OCR area
}

// ─── OCR Engine ──────────────────────────────────────────────────────────────

export class OCREngine {
  private logger = new Logger("OCREngine");
  private eventBus: EventBus;
  private tesseractAvailable: boolean | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Check if tesseract is installed.
   */
  async isAvailable(): Promise<boolean> {
    if (this.tesseractAvailable !== null) return this.tesseractAvailable;
    const result = execCommand("which tesseract 2>/dev/null || which tesseract-ocr 2>/dev/null", { timeout: 5000 });
    this.tesseractAvailable = result.exitCode === 0;
    return this.tesseractAvailable;
  }

  /**
   * OCR a single image file.
   */
  async recognizeImage(
    imagePath: FilePath,
    options: OCROptions = {},
  ): Promise<OCRDetectedText[]> {
    if (!await this.isAvailable()) {
      this.logger.warn("Tesseract not installed, skipping OCR");
      return [];
    }

    const lang = options.language ?? "eng";
    const minConf = options.minConfidence ?? 30;

    // Run tesseract with TSV output for bounding boxes
    const result = execCommand(
      `tesseract "${imagePath}" stdout --psm 6 -l ${lang} tsv 2>/dev/null`,
      { timeout: 30000 },
    );

    if (result.exitCode !== 0) return [];

    return this.parseTSVOutput(result.stdout, minConf);
  }

  /**
   * OCR a specific region of an image.
   */
  async recognizeRegion(
    imagePath: FilePath,
    region: { x: number; y: number; width: number; height: number },
    options: OCROptions = {},
  ): Promise<OCRDetectedText[]> {
    // Crop the region first using FFmpeg
    const tmpCrop = `/tmp/ai-creative-os/ocr_crop_${Date.now()}.png`;
    execCommand(`mkdir -p /tmp/ai-creative-os`, { timeout: 3000 });
    
    const result = execCommand(
      `ffmpeg -y -i "${imagePath}" -vf "crop=${region.width}:${region.height}:${region.x}:${region.y}" "${tmpCrop}" 2>/dev/null`,
      { timeout: 10000 },
    );

    if (result.exitCode !== 0) return [];

    const texts = await this.recognizeImage(tmpCrop, options);
    execCommand(`rm -f "${tmpCrop}"`, { timeout: 3000 });

    // Adjust bounding boxes to original coordinates
    return texts.map(t => ({
      ...t,
      boundingBox: {
        x: t.boundingBox.x + region.x,
        y: t.boundingBox.y + region.y,
        width: t.boundingBox.width,
        height: t.boundingBox.height,
      },
    }));
  }

  /**
   * Extract text from video frames at regular intervals.
   */
  async analyzeVideo(
    videoPath: FilePath,
    options: OCROptions = {},
  ): Promise<VideoTextAnalysis> {
    const maxFrames = options.maxFrames ?? 20;
    const minConf = options.minConfidence ?? 40;

    // Get video duration
    const durResult = execCommand(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { timeout: 10000 },
    );
    const duration = parseFloat(durResult.stdout) || 0;
    if (duration <= 0) return this.emptyAnalysis(videoPath);

    // Sample frames
    const tmpDir = `/tmp/ai-creative-os/ocr-${Date.now()}`;
    execCommand(`mkdir -p "${tmpDir}"`, { timeout: 5000 });

    const interval = Math.max(duration / maxFrames, 1);
    execCommand(
      `ffmpeg -y -i "${videoPath}" -vf "fps=1/${interval}" -q:v 5 "${tmpDir}/frame_%04d.jpg" 2>/dev/null`,
      { timeout: 120000 },
    );

    const frames: OCRFrameResult[] = [];
    const allTexts: { time: Duration; text: string; confidence: Score }[] = [];
    const uniqueTexts = new Set<string>();

    // Get list of frames
    const listResult = execCommand(`ls "${tmpDir}"/frame_*.jpg 2>/dev/null`, { timeout: 5000 });
    const frameFiles = listResult.stdout.trim().split("\n").filter(Boolean);

    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = frameFiles[i];
      const timestamp = i * interval;

      let texts = await this.recognizeImage(framePath, options);

      // Apply region restriction
      if (options.region) {
        texts = await this.recognizeRegion(framePath, options.region, options);
      }

      const filtered = texts.filter(t => t.confidence >= minConf);
      const totalLength = filtered.reduce((s, t) => s + t.text.length, 0);
      const avgConf = filtered.length > 0
        ? filtered.reduce((s, t) => s + t.confidence, 0) / filtered.length
        : 0;

      frames.push({
        timestamp,
        texts: filtered,
        totalTextLength: totalLength,
        avgConfidence: avgConf,
      });

      for (const t of filtered) {
        const trimmed = t.text.trim();
        if (trimmed.length > 2) {
          allTexts.push({ time: timestamp, text: trimmed, confidence: t.confidence });
          uniqueTexts.add(trimmed.toLowerCase());
        }
      }
    }

    // Cleanup
    execCommand(`rm -rf "${tmpDir}"`, { timeout: 5000 });

    const totalDetected = allTexts.length;
    const avgConf = totalDetected > 0
      ? allTexts.reduce((s, t) => s + t.confidence, 0) / totalDetected
      : 0;

    return {
      filePath: videoPath,
      frames,
      uniqueTexts: Array.from(uniqueTexts),
      timeline: allTexts,
      totalTextDetected: totalDetected,
      avgConfidence: avgConf,
    };
  }

  /**
   * Detect if a video has burned-in subtitles (hardcoded text).
   */
  async hasBurnedSubtitles(videoPath: FilePath): Promise<{
    detected: boolean;
    confidence: Score;
    framesWithText: number;
    totalFrames: number;
  }> {
    const analysis = await this.analyzeVideo(videoPath, {
      maxFrames: 10,
      minConfidence: 40,
    });

    const framesWithText = analysis.frames.filter(f => f.texts.length > 0).length;
    const totalFrames = analysis.frames.length || 1;
    const ratio = framesWithText / totalFrames;

    return {
      detected: ratio > 0.3,
      confidence: Math.round(ratio * 100),
      framesWithText,
      totalFrames,
    };
  }

  /**
   * Extract hardcoded subtitles as SRT file.
   */
  async extractBurnedSubtitles(
    videoPath: FilePath,
    outputPath: FilePath,
    options: OCROptions = {},
  ): Promise<{ success: boolean; subtitleCount: number }> {
    const analysis = await this.analyzeVideo(videoPath, {
      ...options,
      maxFrames: options.maxFrames ?? 60,
    });

    if (analysis.totalTextDetected === 0) {
      return { success: false, subtitleCount: 0 };
    }

    // Generate SRT from timeline
    let srt = "";
    let index = 1;
    for (const entry of analysis.timeline) {
      const start = this.secondsToSRT(entry.time);
      const end = this.secondsToSRT(entry.time + 2); // assume ~2s display time
      srt += `${index}\n${start} --> ${end}\n${entry.text}\n\n`;
      index++;
    }

    execCommand(`mkdir -p "$(dirname "${outputPath}")"`, { timeout: 5000 });

    // Write using echo (works cross-platform)
    const result = execCommand(
      `cat > "${outputPath}" << 'SRTEOF'\n${srt}SRTEOF`,
      { timeout: 10000 },
    );

    return { success: result.exitCode === 0, subtitleCount: index - 1 };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private parseTSVOutput(tsv: string, minConfidence: Score): OCRDetectedText[] {
    const lines = tsv.split("\n");
    const texts: OCRDetectedText[] = [];
    const wordBuffer: OCRDetectedText[] = [];

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      if (cols.length < 12) continue;

      const conf = parseFloat(cols[10]) || 0;
      const text = cols[11]?.trim();
      if (!text || conf < minConfidence) continue;

      const level = parseInt(cols[0]) || 0;
      const left = parseInt(cols[6]) || 0;
      const top = parseInt(cols[7]) || 0;
      const width = parseInt(cols[8]) || 0;
      const height = parseInt(cols[9]) || 0;

      if (level === 1) {
        // Line level - flush previous word
        const lineText = wordBuffer.map(w => w.text).join(" ");
        if (lineText) {
          const avgConf = wordBuffer.reduce((s, w) => s + w.confidence, 0) / wordBuffer.length;
          const minX = Math.min(...wordBuffer.map(w => w.boundingBox.x));
          const minY = Math.min(...wordBuffer.map(w => w.boundingBox.y));
          const maxX = Math.max(...wordBuffer.map(w => w.boundingBox.x + w.boundingBox.width));
          const maxY = Math.max(...wordBuffer.map(w => w.boundingBox.y + w.boundingBox.height));

          texts.push({
            text: lineText,
            confidence: avgConf,
            boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
            language: "eng",
            orientation: 0,
          });
        }
        wordBuffer.length = 0;
      } else if (level === 2 || level === 3 || level === 4) {
        wordBuffer.push({
          text,
          confidence: conf,
          boundingBox: { x: left, y: top, width, height },
          language: "eng",
          orientation: 0,
        });
      }
    }

    // Flush remaining
    if (wordBuffer.length > 0) {
      const lineText = wordBuffer.map(w => w.text).join(" ");
      const avgConf = wordBuffer.reduce((s, w) => s + w.confidence, 0) / wordBuffer.length;
      const minX = Math.min(...wordBuffer.map(w => w.boundingBox.x));
      const minY = Math.min(...wordBuffer.map(w => w.boundingBox.y));
      const maxX = Math.max(...wordBuffer.map(w => w.boundingBox.x + w.boundingBox.width));
      const maxY = Math.max(...wordBuffer.map(w => w.boundingBox.y + w.boundingBox.height));

      texts.push({
        text: lineText,
        confidence: avgConf,
        boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        language: "eng",
        orientation: 0,
      });
    }

    return texts;
  }

  private emptyAnalysis(filePath: FilePath): VideoTextAnalysis {
    return {
      filePath,
      frames: [],
      uniqueTexts: [],
      timeline: [],
      totalTextDetected: 0,
      avgConfidence: 0,
    };
  }

  private secondsToSRT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }
}
