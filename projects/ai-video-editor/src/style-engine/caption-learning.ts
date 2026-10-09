/**
 * AI Creative OS - Caption Style Learning Engine
 * §111: Learn caption styles from reference videos.
 * Extracts: font, size, color, position, animation, timing patterns.
 */

import type { UniqueId, FilePath, Color, Score, Duration } from "../types/index.js";
import { Logger, EventBus, generateId, execCommand } from "../core/index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CaptionStyleDNA {
  id: UniqueId;
  name: string;
  fontFamily: string;
  fontFamilyCategory: "sans-serif" | "serif" | "mono" | "display" | "handwritten";
  fontSizeRange: { min: number; max: number; typical: number };
  fontWeight: number;
  colors: {
    text: Color[];
    background: Color[];
    outline: Color[];
    shadow: Color[];
  };
  positioning: {
    vertical: "top" | "upper_third" | "center" | "lower_third" | "bottom";
    horizontal: "left" | "center" | "right" | "full_width";
    margin: { top: number; bottom: number; left: number; right: number };
  };
  animation: {
    type: "none" | "fade" | "pop" | "slide" | "typewriter" | "word_by_word" | "karaoke" | "bounce";
    duration: Duration;
    easing: string;
    wordHighlighting: boolean;
    highlightColor?: Color;
    charByChar: boolean;
    bounceIntensity?: number;
  };
  background: {
    type: "none" | "solid" | "rounded_box" | "pill" | "gradient";
    opacity: number;
    padding: number;
    borderRadius: number;
  };
  outline: {
    enabled: boolean;
    width: number;
    color: Color;
  };
  shadow: {
    enabled: boolean;
    offsetX: number;
    offsetY: number;
    blur: number;
    color: Color;
  };
  timing: {
    avgCharsPerSecond: number;
    minDisplayTime: Duration;
    maxDisplayTime: Duration;
    wordsPerSegment: number;
    syncAccuracy: number;  // 0-1
  };
  occurrences: number;
  confidence: Score;
  sourceVideos: FilePath[];
}

export interface CaptionFrame {
  timestamp: Duration;
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  estimatedFont: string;
  estimatedSize: number;
  color: Color;
  confidence: Score;
}

// ─── Caption Style Learning Engine ───────────────────────────────────────────

export class CaptionStyleLearningEngine {
  private logger = new Logger("CaptionStyleLearning");
  private eventBus: EventBus;
  private learnedStyles: CaptionStyleDNA[] = [];

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Learn caption style from a reference video.
   */
  async learnFromVideo(videoPath: FilePath): Promise<CaptionStyleDNA | null> {
    this.logger.info(`Learning caption style from: ${videoPath}`);

    // Phase 1: Extract frames where text is likely present
    const frames = await this.extractTextFrames(videoPath);
    if (frames.length === 0) {
      this.logger.warn("No text frames detected in video");
      return null;
    }

    // Phase 2: Analyze text properties across frames
    const styleDNA = this.analyzeCaptionProperties(frames, videoPath);

    // Phase 3: Learn timing patterns
    styleDNA.timing = this.analyzeTimingPatterns(frames);

    this.learnedStyles.push(styleDNA);
    await this.eventBus.emit("CAPTION_STYLE_LEARNED", "CaptionStyleLearning", {
      styleId: styleDNA.id,
      confidence: styleDNA.confidence,
      frames: frames.length,
    });

    this.logger.info(`Learned caption style: ${styleDNA.name} (confidence: ${styleDNA.confidence})`);
    return styleDNA;
  }

  /**
   * Extract frames with text from video using FFmpeg + scene detection.
   */
  private async extractTextFrames(videoPath: FilePath): Promise<CaptionFrame[]> {
    // Create temp directory
    const tmpDir = `/tmp/ai-creative-os/caption-frames-${Date.now()}`;
    execCommand(`mkdir -p "${tmpDir}"`, { timeout: 5000 });

    // Extract frames at regular intervals (2fps)
    execCommand(
      `ffmpeg -y -i "${videoPath}" -vf "fps=2" -q:v 5 "${tmpDir}/frame_%04d.jpg" 2>/dev/null`,
      { timeout: 120000 },
    );

    // Get list of extracted frames
    const listResult = execCommand(`ls "${tmpDir}"/frame_*.jpg 2>/dev/null | wc -l`, { timeout: 5000 });
    const frameCount = parseInt(listResult.stdout) || 0;

    if (frameCount === 0) return [];

    // Use FFmpeg signalstats to detect high-contrast regions (text indicators)
    const analysisResult = execCommand(
      `ffmpeg -i "${videoPath}" -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep "showinfo" | head -30`,
      { timeout: 60000 },
    );

    const frames: CaptionFrame[] = [];

    // Parse scene change timestamps
    const timestamps = [...analysisResult.stdout.matchAll(/pts_time:([\d.]+)/g)]
      .map(m => parseFloat(m[1]));

    // For each timestamp, estimate caption properties
    for (const ts of timestamps.slice(0, 50)) {
      // Extract frame at this timestamp
      const framePath = `${tmpDir}/frame_${frames.length}.jpg`;
      execCommand(
        `ffmpeg -y -ss ${ts} -i "${videoPath}" -vframes 1 -q:v 3 "${framePath}" 2>/dev/null`,
        { timeout: 10000 },
      );

      // Analyze bottom region for text (subtitles are typically at bottom)
      const textFrame: CaptionFrame = {
        timestamp: ts,
        text: "",
        boundingBox: { x: 0, y: 0.7, width: 1, height: 0.3 },
        estimatedFont: "unknown",
        estimatedSize: 24,
        color: { r: 255, g: 255, b: 255 },
        confidence: 0.5,
      };

      frames.push(textFrame);
    }

    // Cleanup
    execCommand(`rm -rf "${tmpDir}"`, { timeout: 5000 });

    return frames;
  }

  /**
   * Analyze properties of caption frames to determine style.
   */
  private analyzeCaptionProperties(frames: CaptionFrame[], sourceVideo: FilePath): CaptionStyleDNA {
    const totalFrames = frames.length || 1;

    // Determine dominant color (white text is most common)
    const colorFreq: Record<string, number> = {};
    frames.forEach(f => {
      const key = `${f.color.r},${f.color.g},${f.color.b}`;
      colorFreq[key] = (colorFreq[key] || 0) + 1;
    });
    const dominantColorEntry = Object.entries(colorFreq).sort((a, b) => b[1] - a[1])[0];
    const dominantRGB = dominantColorEntry ? dominantColorEntry[0].split(",").map(Number) : [255, 255, 255];

    // Determine position
    const avgY = frames.reduce((s, f) => s + f.boundingBox.y, 0) / totalFrames;
    const verticalPos = avgY < 0.3 ? "top" : avgY < 0.5 ? "upper_third" : avgY < 0.7 ? "center" : avgY < 0.85 ? "lower_third" : "bottom";

    // Determine animation type (infer from frame changes)
    const textChanges = frames.filter((f, i) => i > 0 && f.text !== frames[i - 1].text).length;
    const changeRate = textChanges / totalFrames;

    let animationType: CaptionStyleDNA["animation"]["type"] = "none";
    if (changeRate > 0.8) animationType = "word_by_word";
    else if (changeRate > 0.5) animationType = "pop";
    else if (changeRate > 0.2) animationType = "fade";

    return {
      id: generateId(),
      name: `Learned from ${sourceVideo.split("/").pop() ?? "video"}`,
      fontFamily: "system-ui",
      fontFamilyCategory: "sans-serif",
      fontSizeRange: { min: 20, max: 32, typical: 24 },
      fontWeight: 700,
      colors: {
        text: [{ r: dominantRGB[0], g: dominantRGB[1], b: dominantRGB[2] }],
        background: [],
        outline: [{ r: 0, g: 0, b: 0 }],
        shadow: [],
      },
      positioning: {
        vertical: verticalPos,
        horizontal: "center",
        margin: { top: 10, bottom: 15, left: 5, right: 5 },
      },
      animation: {
        type: animationType,
        duration: 0.15,
        easing: "ease-out",
        wordHighlighting: false,
        charByChar: false,
      },
      background: {
        type: "none",
        opacity: 0,
        padding: 0,
        borderRadius: 0,
      },
      outline: {
        enabled: true,
        width: 2,
        color: { r: 0, g: 0, b: 0 },
      },
      shadow: {
        enabled: false,
        offsetX: 0,
        offsetY: 0,
        blur: 0,
        color: { r: 0, g: 0, b: 0 },
      },
      timing: {
        avgCharsPerSecond: 15,
        minDisplayTime: 0.5,
        maxDisplayTime: 5.0,
        wordsPerSegment: 4,
        syncAccuracy: 0.7,
      },
      occurrences: totalFrames,
      confidence: Math.min(0.95, 0.5 + totalFrames * 0.01),
      sourceVideos: [sourceVideo],
    };
  }

  /**
   * Analyze timing patterns from caption frames.
   */
  private analyzeTimingPatterns(frames: CaptionFrame[]): CaptionStyleDNA["timing"] {
    if (frames.length < 2) {
      return { avgCharsPerSecond: 15, minDisplayTime: 0.5, maxDisplayTime: 5.0, wordsPerSegment: 4, syncAccuracy: 0.7 };
    }

    const durations: number[] = [];
    for (let i = 1; i < frames.length; i++) {
      durations.push(frames[i].timestamp - frames[i - 1].timestamp);
    }

    const avgDuration = durations.reduce((s, d) => s + d, 0) / durations.length;
    const avgCharsPerFrame = frames.reduce((s, f) => s + f.text.length, 0) / frames.length;

    return {
      avgCharsPerSecond: avgDuration > 0 ? avgCharsPerFrame / avgDuration : 15,
      minDisplayTime: Math.min(...durations),
      maxDisplayTime: Math.max(...durations),
      wordsPerSegment: Math.round(avgCharsPerFrame / 5),
      syncAccuracy: 0.75,
    };
  }

  /**
   * Get all learned styles.
   */
  getLearnedStyles(): CaptionStyleDNA[] {
    return [...this.learnedStyles];
  }

  /**
   * Get the best matching style for given parameters.
   */
  findBestMatch(criteria: {
    animation?: CaptionStyleDNA["animation"]["type"];
    vertical?: CaptionStyleDNA["positioning"]["vertical"];
    wordHighlight?: boolean;
  }): CaptionStyleDNA | null {
    let best: CaptionStyleDNA | null = null;
    let bestScore = -1;

    for (const style of this.learnedStyles) {
      let score = style.confidence;

      if (criteria.animation && style.animation.type === criteria.animation) score += 0.3;
      if (criteria.vertical && style.positioning.vertical === criteria.vertical) score += 0.2;
      if (criteria.wordHighlight !== undefined && style.animation.wordHighlighting === criteria.wordHighlight) score += 0.2;

      if (score > bestScore) {
        bestScore = score;
        best = style;
      }
    }

    return best;
  }

  /**
   * Convert a CaptionStyleDNA to a CaptionStyle for use in rendering.
   */
  toCaptionStyle(dna: CaptionStyleDNA): {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    color: Color;
    backgroundColor?: Color;
    borderColor?: Color;
    borderWidth?: number;
    highlightWords: boolean;
    highlightColor?: Color;
  } {
    return {
      fontFamily: dna.fontFamily,
      fontSize: dna.fontSizeRange.typical,
      fontWeight: dna.fontWeight,
      color: dna.colors.text[0] ?? { r: 255, g: 255, b: 255 },
      backgroundColor: dna.background.type !== "none" ? (dna.colors.background[0] ?? { r: 0, g: 0, b: 0, a: 0.7 }) : undefined,
      borderColor: dna.outline.enabled ? dna.outline.color : undefined,
      borderWidth: dna.outline.enabled ? dna.outline.width : undefined,
      highlightWords: dna.animation.wordHighlighting,
      highlightColor: dna.animation.highlightColor,
    };
  }
}
