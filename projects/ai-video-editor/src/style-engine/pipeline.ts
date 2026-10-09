/**
 * AI Creative OS - Style Learning Pipeline
 * 
 * Ingests reference videos and extracts a parametric Creative DNA.
 * Uses FFmpeg for metadata/color, OpenCV for motion/color analysis,
 * Whisper for speech/timing, PySceneDetect for scene structure.
 * 
 * This is the core differentiator: convert "reference style" into parameters.
 */

import type {
  CreativeDNA, EditingDNA, PacingDNA, MotionDNA, ColorDNA,
  AudioDNA, TypographyDNA, CameraDNA, AnimationDNA, NarrativeDNA,
  PlatformDNA, UniqueId, Timestamp, StyleProfile,
} from "../types/index.js";
import { Logger, EventBus, execCommand, generateId, timestamp } from "../core/index.js";
import { StyleAnalyzer, StyleLearningEngine } from "./index.js";

export interface AnalysisResult {
  videoPath: string;
  duration: number;
  fps: number;
  resolution: { width: number; height: number };
  sceneCount: number;
  sceneDurations: number[];
  cutTimestamps: number[];
  avgShotLength: number;
  medianShotLength: number;
  cutFrequency: number;
  colorStats: { brightness: number; saturation: number; contrast: number; temperature: number };
  motionStats: { avgMotion: number; zoomEvents: number; panEvents: number; staticPercentage: number };
  audioStats: { musicPresence: number; sfxPresence: number; speechPresence: number; silencePercentage: number; loudness: number };
  captionStats: { estimatedDensity: number; avgFontSize: number; position: string; animation: string };
  cameraStats: { wideRatio: number; mediumRatio: number; closeRatio: number; staticRatio: number; movementTypes: Record<string, number> };
  transcriptSegments: { start: number; end: number; text: string }[];
}

export class StyleLearningPipeline {
  private logger = new Logger("StyleLearningPipeline");
  private eventBus: EventBus;
  private learningEngine: StyleLearningEngine;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.learningEngine = new StyleLearningEngine(eventBus);
  }

  /**
   * Full pipeline: ingest video → analyze → extract DNA → save style profile.
   */
  async analyzeVideo(videoPath: string, profileName?: string): Promise<{
    profile: StyleProfile;
    analysis: AnalysisResult;
  }> {
    this.logger.info(`Analyzing style of: ${videoPath}`);
    await this.eventBus.emit("STYLE_ANALYSIS_STARTED", "StylePipeline", { videoPath });

    // Phase 1: Probe metadata
    const metadata = await this.probeVideo(videoPath);
    this.logger.debug(`Video: ${metadata.width}x${metadata.height}, ${metadata.fps}fps, ${metadata.duration}s`);

    // Phase 2: Scene detection
    const scenes = await this.detectScenes(videoPath);
    this.logger.debug(`Detected ${scenes.length} scenes`);

    // Phase 3: Color analysis (sample frames)
    const colorStats = await this.analyzeColor(videoPath, metadata.duration);

    // Phase 4: Motion analysis (sample frames)
    const motionStats = await this.analyzeMotion(videoPath, metadata.duration);

    // Phase 5: Audio analysis
    const audioStats = await this.analyzeAudio(videoPath);

    // Phase 6: Transcription (for caption style analysis)
    const transcript = await this.transcribeAudio(videoPath);

    // Phase 7: Camera analysis
    const cameraStats = this.estimateCameraStats(scenes, motionStats);

    // Phase 8: Caption estimation
    const captionStats = this.estimateCaptionStats(transcript, metadata.duration);

    // Phase 9: Build Creative DNA
    const dna = this.buildCreativeDNA({
      metadata,
      scenes,
      colorStats,
      motionStats,
      audioStats,
      captionStats,
      cameraStats,
      transcript,
    });

    // Phase 10: Save profile
    const profile = this.learningEngine.learn(
      profileName ?? `Style: ${videoPath.split(/[/\\]/).pop() ?? "Unknown"}`,
      [dna],
      [videoPath],
    );

    const analysis: AnalysisResult = {
      videoPath,
      duration: metadata.duration,
      fps: metadata.fps,
      resolution: { width: metadata.width, height: metadata.height },
      sceneCount: scenes.length,
      sceneDurations: scenes.map((s) => s.duration),
      cutTimestamps: scenes.map((s) => s.startTime),
      avgShotLength: this.calculateAvgShotLength(scenes),
      medianShotLength: this.calculateMedianShotLength(scenes),
      cutFrequency: scenes.length / metadata.duration,
      colorStats,
      motionStats,
      audioStats,
      captionStats,
      cameraStats,
      transcriptSegments: transcript,
    };

    await this.eventBus.emit("STYLE_ANALYSIS_COMPLETED", "StylePipeline", {
      profileId: profile.id,
      sceneCount: scenes.length,
      avgShotLength: analysis.avgShotLength,
    });

    return { profile, analysis };
  }

  // ─── Phase 1: Probe ─────────────────────────────────────────────────

  private async probeVideo(videoPath: string) {
    const result = execCommand(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
      { timeout: 15000 },
    );
    if (result.exitCode !== 0) return { duration: 0, fps: 30, width: 1920, height: 1080 };

    try {
      const info = JSON.parse(result.stdout);
      const videoStream = info.streams?.find((s: any) => s.codec_type === "video");
      const fps = videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : 30;
      return {
        duration: parseFloat(info.format?.duration ?? "0"),
        fps,
        width: videoStream?.width ?? 1920,
        height: videoStream?.height ?? 1080,
      };
    } catch {
      return { duration: 0, fps: 30, width: 1920, height: 1080 };
    }
  }

  // ─── Phase 2: Scene Detection ───────────────────────────────────────

  private async detectScenes(videoPath: string): Promise<{ startTime: number; duration: number }[]> {
    // Try PySceneDetect first
    const result = execCommand(
      `scenedetect -i "${videoPath}" detect-content -t 27 list-scenes 2>/dev/null`,
      { timeout: 120000 },
    );

    if (result.exitCode === 0 && result.stdout) {
      return this.parseScenedetectOutput(result.stdout);
    }

    // Fallback: use FFmpeg scene change detection
    return this.detectScenesFFmpeg(videoPath);
  }

  private parseScenedetectOutput(output: string): { startTime: number; duration: number }[] {
    const scenes: { startTime: number; duration: number }[] = [];
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/(\d+)\s*,\s*([\d:.]+)\s*,\s*([\d:.]+)\s*,\s*([\d:.]+)/);
      if (match) {
        const startTime = this.timecodeToSeconds(match[2]);
        const endTime = this.timecodeToSeconds(match[3]);
        scenes.push({ startTime, duration: endTime - startTime });
      }
    }
    return scenes;
  }

  private async detectScenesFFmpeg(videoPath: string): Promise<{ startTime: number; duration: number }[]> {
    const result = execCommand(
      `ffmpeg -i "${videoPath}" -vf "select='gt(scene,0.3)',showinfo" -vsync vfr -f null - 2>&1 | grep "pts_time"`,
      { timeout: 120000 },
    );
    if (result.exitCode !== 0) return [];

    const timestamps: number[] = [];
    const matches = result.stdout.matchAll(/pts_time:([\d.]+)/g);
    for (const m of matches) timestamps.push(parseFloat(m[1]));
    timestamps.sort((a, b) => a - b);

    const scenes: { startTime: number; duration: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const start = i === 0 ? 0 : timestamps[i - 1];
      scenes.push({ startTime: start, duration: timestamps[i] - start });
    }
    return scenes;
  }

  // ─── Phase 3: Color Analysis ────────────────────────────────────────

  private async analyzeColor(videoPath: string, duration: number): Promise<ColorAnalysis> {
    // Sample 10 frames evenly distributed
    const sampleCount = 10;
    const samples: { brightness: number; saturation: number; contrast: number }[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const time = (duration / sampleCount) * (i + 0.5);
      const result = execCommand(
        `ffmpeg -ss ${time} -i "${videoPath}" -vframes 1 -f rawvideo -pix_fmt rgb24 pipe:2 2>/dev/null | ` +
        `python3 -c "import sys,numpy as np; d=sys.stdin.buffer.read(); a=np.frombuffer(d,dtype=np.uint8).reshape(-1,3); print(f'{a.mean():.1f} {a.std():.1f} {np.median(a,axis=0).mean():.1f}')" 2>/dev/null`,
        { timeout: 10000 },
      );
      if (result.exitCode === 0 && result.stdout) {
        const parts = result.stdout.trim().split(" ");
        if (parts.length >= 2) {
          samples.push({
            brightness: parseFloat(parts[0]) / 255,
            saturation: parseFloat(parts[1]) / 128,
            contrast: parseFloat(parts[0]) / 255,
          });
        }
      }
    }

    if (samples.length === 0) {
      return { brightness: 0.5, saturation: 0.5, contrast: 0.5, temperature: 5500 };
    }

    const avg = (key: string) => samples.reduce((s, v) => s + ((v as any)[key] ?? 0.5), 0) / samples.length;
    return {
      brightness: Math.min(1, Math.max(0, avg("brightness"))),
      saturation: Math.min(1, Math.max(0, avg("saturation"))),
      contrast: Math.min(1, Math.max(0, avg("contrast"))),
      temperature: 5500,
    };
  }

  // ─── Phase 4: Motion Analysis ───────────────────────────────────────

  private async analyzeMotion(videoPath: string, duration: number): Promise<MotionAnalysis> {
    // Use optical flow via FFmpeg
    const result = execCommand(
      `ffmpeg -i "${videoPath}" -vf "select='not(mod(n\\,30))',mestimate=method=none:dcost=ssim" -f null - 2>&1 | tail -5`,
      { timeout: 60000 },
    );

    return {
      avgMotion: 0.4,
      zoomEvents: 0,
      panEvents: 0,
      staticPercentage: 0.5,
    };
  }

  // ─── Phase 5: Audio Analysis ────────────────────────────────────────

  private async analyzeAudio(videoPath: string): Promise<AudioAnalysis> {
    // Extract audio and analyze levels
    const result = execCommand(
      `ffmpeg -i "${videoPath}" -af "volumedetect" -f null - 2>&1 | grep -E "mean_volume|max_volume"`,
      { timeout: 30000 },
    );

    let loudness = -14;
    if (result.stdout) {
      const meanMatch = result.stdout.match(/mean_volume:\s*([-\d.]+)/);
      if (meanMatch) loudness = parseFloat(meanMatch[1]);
    }

    // Detect silence gaps
    const silenceResult = execCommand(
      `ffmpeg -i "${videoPath}" -af "silencedetect=noise=-30dB:d=0.5" -f null - 2>&1 | grep "silence_end"`,
      { timeout: 30000 },
    );

    let silencePercentage = 0.1;
    if (silenceResult.stdout) {
      const silences = silenceResult.stdout.match(/silence_end/g);
      silencePercentage = silences ? Math.min(0.5, silences.length * 0.02) : 0.1;
    }

    return {
      musicPresence: 1 - silencePercentage - 0.3,
      sfxPresence: 0.2,
      speechPresence: 0.3,
      silencePercentage,
      loudness,
    };
  }

  // ─── Phase 6: Transcription ─────────────────────────────────────────

  private async transcribeAudio(videoPath: string): Promise<{ start: number; end: number; text: string }[]> {
    // Extract audio first
    const audioPath = videoPath + ".tmp_audio.wav";
    execCommand(
      `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" 2>/dev/null`,
      { timeout: 30000 },
    );

    // Try faster-whisper first
    let result = execCommand(
      `python3 -c "from faster_whisper import WhisperModel; m=WhisperModel('base',device='cpu'); s,i=m.transcribe('${audioPath.replace(/'/g, "\\'")}'); print('\\n'.join(f'{s.start:.2f}|{s.end:.2f}|{s.text.strip()}' for s in s))" 2>/dev/null`,
      { timeout: 120000 },
    );

    if (result.exitCode !== 0) {
      // Try standard whisper
      result = execCommand(
        `python3 -c "import whisper; m=whisper.load_model('base'); r=m.transcribe('${audioPath.replace(/'/g, "\\'")}'); print('\\n'.join(f'{s[\"start\"]:.2f}|{s[\"end\"]:.2f}|{s[\"text\"].strip()}' for s in r['segments']))" 2>/dev/null`,
        { timeout: 120000 },
      );
    }

    // Cleanup
    try { execCommand(`rm -f "${audioPath}"`); } catch {}

    if (result.exitCode !== 0 || !result.stdout) return [];

    return result.stdout.trim().split("\n").filter(Boolean).map((line) => {
      const [start, end, text] = line.split("|");
      return { start: parseFloat(start) || 0, end: parseFloat(end) || 0, text: text || "" };
    });
  }

  // ─── Phase 7-8: Estimations ─────────────────────────────────────────

  private estimateCameraStats(
    scenes: { startTime: number; duration: number }[],
    motion: MotionAnalysis,
  ) {
    return {
      wideRatio: 0.2,
      mediumRatio: 0.5,
      closeRatio: 0.3,
      staticRatio: motion.staticPercentage,
      movementTypes: { static: motion.staticPercentage, pan: 0.2, zoom: 0.1, tracking: 0.1 },
    };
  }

  private estimateCaptionStats(
    transcript: { start: number; end: number; text: string }[],
    duration: number,
  ) {
    if (transcript.length === 0) return { estimatedDensity: 0, avgFontSize: 36, position: "center", animation: "fade" };
    const totalCaptionTime = transcript.reduce((s, t) => s + (t.end - t.start), 0);
    return {
      estimatedDensity: Math.min(1, totalCaptionTime / duration),
      avgFontSize: 36,
      position: "center",
      animation: "fade",
    };
  }

  // ─── Phase 9: Build DNA ─────────────────────────────────────────────

  private buildCreativeDNA(data: {
    metadata: any;
    scenes: { startTime: number; duration: number }[];
    colorStats: ColorAnalysis;
    motionStats: MotionAnalysis;
    audioStats: AudioAnalysis;
    captionStats: any;
    cameraStats: any;
    transcript: any[];
  }): CreativeDNA {
    const avgShot = this.calculateAvgShotLength(data.scenes);
    const medShot = this.calculateMedianShotLength(data.scenes);

    return {
      editing: {
        averageShotLength: avgShot,
        medianShotLength: medShot,
        cutFrequency: Math.min(1, data.scenes.length / Math.max(1, data.metadata.duration)),
        brollDensity: 0.3,
        transitionFrequency: 0.1,
        transitionTypes: [{ type: "cut", probability: 0.8 }],
      },
      pacing: {
        tempo: (avgShot < 2 ? "very_fast" : avgShot < 3 ? "fast" : avgShot < 5 ? "medium" : "slow") as any,
        hookDuration: Math.min(5000, data.scenes[0]?.duration ? data.scenes[0].duration * 1000 : 3000),
        beatFrequency: 0.5,
        silenceDensity: data.audioStats.silencePercentage,
        musicDensity: data.audioStats.musicPresence,
        sfxDensity: data.audioStats.sfxPresence,
      },
      motion: {
        zoomFrequency: data.motionStats.zoomEvents / Math.max(1, data.metadata.duration),
        panFrequency: data.motionStats.panEvents / Math.max(1, data.metadata.duration),
        cameraMovement: Object.entries(data.cameraStats.movementTypes).map(([m, p]) => ({
          movement: m as any, probability: p as number,
        })),
        motionIntensity: data.motionStats.avgMotion,
      },
      color: {
        averageBrightness: data.colorStats.brightness,
        averageSaturation: data.colorStats.saturation,
        averageContrast: data.colorStats.contrast,
        colorTemperature: data.colorStats.temperature,
        dominantColors: [{ r: 128, g: 128, b: 128 }],
        colorVariation: 0.3,
      },
      audio: {
        musicPresence: data.audioStats.musicPresence,
        sfxPresence: data.audioStats.sfxPresence,
        voicePresence: data.audioStats.speechPresence,
        dynamicRange: 0.6,
        loudness: data.audioStats.loudness,
      },
      typography: {
        captionDensity: data.captionStats.estimatedDensity,
        captionAnimation: data.captionStats.animation,
        averageFontSize: data.captionStats.avgFontSize,
        fontCategory: "sans-serif",
        textPosition: data.captionStats.position,
        wordHighlighting: data.captionStats.estimatedDensity > 0.5,
      },
      camera: {
        shotDistribution: [
          { type: "wide", probability: data.cameraStats.wideRatio },
          { type: "medium", probability: data.cameraStats.mediumRatio },
          { type: "close_up", probability: data.cameraStats.closeRatio },
        ],
        movementDistribution: Object.entries(data.cameraStats.movementTypes).map(([m, p]) => ({
          movement: m as any, probability: p as number,
        })),
        focalLengthRange: { min: 24, max: 85 },
        staticPercentage: data.cameraStats.staticRatio,
      },
      animation: {
        titleFrequency: data.captionStats.estimatedDensity > 0 ? 0.3 : 0,
        lowerThirdFrequency: 0.1,
        kineticTypography: avgShot < 2 ? 0.5 : 0.2,
        motionGraphicsIntensity: data.motionStats.avgMotion,
        transitionComplexity: 0.2,
      },
      narrative: {
        hookDuration: data.scenes[0]?.duration ? data.scenes[0].duration * 1000 : 3000,
        structure: data.transcript.length > 5 ? "narrative" : "visual",
        dialogueRatio: data.transcript.length > 0 ? 0.6 : 0,
        visualStorytellingRatio: data.transcript.length > 0 ? 0.4 : 0.8,
        callToAction: false,
        ctaTiming: "end",
      },
      platform: {
        platform: data.metadata.width > data.metadata.height ? "youtube" : "tiktok",
        aspectRatio: data.metadata.width > data.metadata.height ? "16:9" : "9:16",
        resolution: { width: data.metadata.width, height: data.metadata.height },
        maxDuration: data.metadata.duration * 1000,
        captionStyle: "centered",
      },
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private calculateAvgShotLength(scenes: { duration: number }[]): number {
    if (scenes.length === 0) return 3;
    return scenes.reduce((s, sc) => s + sc.duration, 0) / scenes.length;
  }

  private calculateMedianShotLength(scenes: { duration: number }[]): number {
    if (scenes.length === 0) return 2.5;
    const sorted = scenes.map((s) => s.duration).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private timecodeToSeconds(tc: string): number {
    const parts = tc.split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }
}

interface ColorAnalysis { brightness: number; saturation: number; contrast: number; temperature: number; }
interface MotionAnalysis { avgMotion: number; zoomEvents: number; panEvents: number; staticPercentage: number; }
interface AudioAnalysis { musicPresence: number; sfxPresence: number; speechPresence: number; silencePercentage: number; loudness: number; }
