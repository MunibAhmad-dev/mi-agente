/**
 * AI Creative OS - Style Engine
 * 
 * Extracts, compares, learns, and mixes audiovisual styles.
 * Converts abstract style descriptions into concrete parameters.
 */

import type {
  CreativeDNA, EditingDNA, PacingDNA, MotionDNA, ColorDNA,
  AudioDNA, TypographyDNA, CameraDNA, AnimationDNA, NarrativeDNA,
  PlatformDNA, StyleProfile, UniqueId, Score, Platform, AspectRatio,
  Pacing, TransitionType, CameraMovement, ShotType,
} from "../types/index.js";
import { Logger, EventBus, generateId, timestamp } from "../core/index.js";

// ─── Style Analyzer ──────────────────────────────────────────────────────────

export class StyleAnalyzer {
  private logger = new Logger("StyleAnalyzer");

  /**
   * Analyze a video reference and extract its Creative DNA.
   * In a full implementation, this would analyze actual video content.
   */
  async analyzeVideo(videoPath: string): Promise<CreativeDNA> {
    this.logger.info(`Analyzing style of: ${videoPath}`);

    // Placeholder analysis — in production this uses FFmpeg, OpenCV, Whisper, PySceneDetect
    // to extract real metrics from the video
    return this.extractDefaultDNA();
  }

  /**
   * Create DNA from explicit parameters.
   */
  createFromParameters(params: {
    averageShotLength?: number;
    cutFrequency?: number;
    brollDensity?: number;
    zoomFrequency?: number;
    captionDensity?: number;
    musicPresence?: number;
    contrast?: number;
    saturation?: number;
  }): CreativeDNA {
    const defaults = this.extractDefaultDNA();
    return {
      ...defaults,
      editing: {
        ...defaults.editing,
        averageShotLength: params.averageShotLength ?? defaults.editing.averageShotLength,
        cutFrequency: params.cutFrequency ?? defaults.editing.cutFrequency,
        brollDensity: params.brollDensity ?? defaults.editing.brollDensity,
      },
      motion: {
        ...defaults.motion,
        zoomFrequency: params.zoomFrequency ?? defaults.motion.zoomFrequency,
      },
      typography: {
        ...defaults.typography,
        captionDensity: params.captionDensity ?? defaults.typography.captionDensity,
      },
      audio: {
        ...defaults.audio,
        musicPresence: params.musicPresence ?? defaults.audio.musicPresence,
      },
      color: {
        ...defaults.color,
        averageContrast: params.contrast ?? defaults.color.averageContrast,
        averageSaturation: params.saturation ?? defaults.color.averageSaturation,
      },
    };
  }

  private extractDefaultDNA(): CreativeDNA {
    return {
      editing: {
        averageShotLength: 3.0,
        medianShotLength: 2.5,
        cutFrequency: 0.5,
        brollDensity: 0.3,
        transitionFrequency: 0.1,
        transitionTypes: [{ type: "cut", probability: 0.8 }],
      },
      pacing: {
        tempo: "medium",
        hookDuration: 3000,
        beatFrequency: 0.5,
        silenceDensity: 0.1,
        musicDensity: 0.7,
        sfxDensity: 0.2,
      },
      motion: {
        zoomFrequency: 0.2,
        panFrequency: 0.1,
        cameraMovement: [{ movement: "static", probability: 0.6 }],
        motionIntensity: 0.5,
      },
      color: {
        averageBrightness: 0.5,
        averageSaturation: 0.5,
        averageContrast: 0.5,
        colorTemperature: 5500,
        dominantColors: [{ r: 128, g: 128, b: 128 }],
        colorVariation: 0.3,
      },
      audio: {
        musicPresence: 0.7,
        sfxPresence: 0.3,
        voicePresence: 0.5,
        dynamicRange: 0.6,
        loudness: -14,
      },
      typography: {
        captionDensity: 0.5,
        captionAnimation: "fade",
        averageFontSize: 36,
        fontCategory: "sans-serif",
        textPosition: "center",
        wordHighlighting: false,
      },
      camera: {
        shotDistribution: [{ type: "medium", probability: 0.5 }],
        movementDistribution: [{ movement: "static", probability: 0.6 }],
        focalLengthRange: { min: 24, max: 85 },
        staticPercentage: 0.6,
      },
      animation: {
        titleFrequency: 0.3,
        lowerThirdFrequency: 0.1,
        kineticTypography: 0.2,
        motionGraphicsIntensity: 0.3,
        transitionComplexity: 0.2,
      },
      narrative: {
        hookDuration: 3000,
        structure: "linear",
        dialogueRatio: 0.4,
        visualStorytellingRatio: 0.6,
        callToAction: false,
        ctaTiming: "end",
      },
      platform: {
        platform: "youtube" as Platform,
        aspectRatio: "16:9" as AspectRatio,
        resolution: { width: 1920, height: 1080 },
        maxDuration: 600000,
        captionStyle: "centered",
      },
    };
  }
}

// ─── Style Comparator ────────────────────────────────────────────────────────

export interface StyleComparison {
  pacingScore: Score;
  editingScore: Score;
  colorScore: Score;
  motionScore: Score;
  typographyScore: Score;
  audioScore: Score;
  narrativeScore: Score;
  overallScore: Score;
  distances: Record<string, number>;
  deviations: string[];
}

export class StyleComparator {
  private logger = new Logger("StyleComparator");

  /**
   * Compare two Creative DNAs and produce a similarity report.
   */
  compare(reference: CreativeDNA, generated: CreativeDNA): StyleComparison {
    const pacingScore = this.comparePacing(reference.pacing, generated.pacing);
    const editingScore = this.compareEditing(reference.editing, generated.editing);
    const colorScore = this.compareColor(reference.color, generated.color);
    const motionScore = this.compareMotion(reference.motion, generated.motion);
    const typographyScore = this.compareTypography(reference.typography, generated.typography);
    const audioScore = this.compareAudio(reference.audio, generated.audio);
    const narrativeScore = this.compareNarrative(reference.narrative, generated.narrative);

    const overallScore = Math.round(
      pacingScore * 0.20 +
      editingScore * 0.20 +
      colorScore * 0.15 +
      motionScore * 0.10 +
      typographyScore * 0.10 +
      audioScore * 0.10 +
      narrativeScore * 0.15
    );

    const deviations: string[] = [];
    if (pacingScore < 60) deviations.push("Pacing differs significantly");
    if (editingScore < 60) deviations.push("Editing rhythm differs");
    if (colorScore < 60) deviations.push("Color style differs");
    if (motionScore < 60) deviations.push("Motion patterns differ");
    if (typographyScore < 60) deviations.push("Typography differs");
    if (audioScore < 60) deviations.push("Audio approach differs");

    return {
      pacingScore,
      editingScore,
      colorScore,
      motionScore,
      typographyScore,
      audioScore,
      narrativeScore,
      overallScore,
      distances: {
        pacing: 100 - pacingScore,
        editing: 100 - editingScore,
        color: 100 - colorScore,
        motion: 100 - motionScore,
        typography: 100 - typographyScore,
        audio: 100 - audioScore,
        narrative: 100 - narrativeScore,
      },
      deviations,
    };
  }

  private comparePacing(ref: PacingDNA, gen: PacingDNA): Score {
    const diff = Math.abs(ref.hookDuration - gen.hookDuration) / 5000;
    const beatDiff = Math.abs(ref.beatFrequency - gen.beatFrequency);
    return Math.max(0, Math.round(100 - (diff * 40 + beatDiff * 60)));
  }

  private compareEditing(ref: EditingDNA, gen: EditingDNA): Score {
    const shotDiff = Math.abs(ref.averageShotLength - gen.averageShotLength) / 5;
    const cutDiff = Math.abs(ref.cutFrequency - gen.cutFrequency);
    const brollDiff = Math.abs(ref.brollDensity - gen.brollDensity);
    return Math.max(0, Math.round(100 - (shotDiff * 30 + cutDiff * 40 + brollDiff * 30)));
  }

  private compareColor(ref: ColorDNA, gen: ColorDNA): Score {
    const brightDiff = Math.abs(ref.averageBrightness - gen.averageBrightness);
    const satDiff = Math.abs(ref.averageSaturation - gen.averageSaturation);
    const contDiff = Math.abs(ref.averageContrast - gen.averageContrast);
    return Math.max(0, Math.round(100 - (brightDiff * 30 + satDiff * 35 + contDiff * 35)));
  }

  private compareMotion(ref: MotionDNA, gen: MotionDNA): Score {
    const zoomDiff = Math.abs(ref.zoomFrequency - gen.zoomFrequency);
    const intensityDiff = Math.abs(ref.motionIntensity - gen.motionIntensity);
    return Math.max(0, Math.round(100 - (zoomDiff * 50 + intensityDiff * 50)));
  }

  private compareTypography(ref: TypographyDNA, gen: TypographyDNA): Score {
    const densityDiff = Math.abs(ref.captionDensity - gen.captionDensity);
    const fontDiff = ref.fontCategory === gen.fontCategory ? 0 : 0.3;
    return Math.max(0, Math.round(100 - (densityDiff * 60 + fontDiff * 40)));
  }

  private compareAudio(ref: AudioDNA, gen: AudioDNA): Score {
    const musicDiff = Math.abs(ref.musicPresence - gen.musicPresence);
    const sfxDiff = Math.abs(ref.sfxPresence - gen.sfxPresence);
    const voiceDiff = Math.abs(ref.voicePresence - gen.voicePresence);
    return Math.max(0, Math.round(100 - (musicDiff * 35 + sfxDiff * 30 + voiceDiff * 35)));
  }

  private compareNarrative(ref: NarrativeDNA, gen: NarrativeDNA): Score {
    const hookDiff = Math.abs(ref.hookDuration - gen.hookDuration) / 5000;
    const structDiff = ref.structure === gen.structure ? 0 : 0.4;
    return Math.max(0, Math.round(100 - (hookDiff * 30 + structDiff * 70)));
  }
}

// ─── Style Mixing Engine ─────────────────────────────────────────────────────

export class StyleMixer {
  /**
   * Mix styles from multiple sources, taking specific aspects from each.
   */
  mix(styles: {
    dna: CreativeDNA;
    weight: number;
    aspects?: (keyof CreativeDNA)[];
  }[]): CreativeDNA {
    // Default: equal weight mixing
    const totalWeight = styles.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight === 0) throw new Error("Total weight is zero");

    const dnaKeys: (keyof CreativeDNA)[] = [
      "editing", "pacing", "motion", "color", "audio",
      "typography", "camera", "animation", "narrative", "platform",
    ];

    const result: Record<string, unknown> = {};

    for (const key of dnaKeys) {
      // Find which styles contribute to this key
      const contributors = styles.filter(
        (s) => !s.aspects || s.aspects.includes(key),
      );

      if (contributors.length > 0) {
        // Use the highest-weighted contributor's value
        contributors.sort((a, b) => b.weight - a.weight);
        result[key] = contributors[0].dna[key];
      } else {
        // Use first style's value as fallback
        result[key] = styles[0]?.dna[key];
      }
    }

    return result as any;
  }
}

// ─── Style Learning Engine ───────────────────────────────────────────────────

export class StyleLearningEngine {
  private profiles = new Map<UniqueId, StyleProfile>();
  private logger = new Logger("StyleLearning");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Learn a style from multiple analyzed videos.
   */
  learn(
    name: string,
    dnaSamples: CreativeDNA[],
    sourceVideos: string[] = [],
  ): StyleProfile {
    const averagedDNA = this.averageDNA(dnaSamples);

    const profile: StyleProfile = {
      id: generateId(),
      name,
      source: "learned",
      dna: averagedDNA,
      sourceVideos,
      created: timestamp(),
      updated: timestamp(),
    };

    this.profiles.set(profile.id, profile);
    this.eventBus.emit("STYLE_LEARNED", "StyleEngine", { profileId: profile.id, name });
    return profile;
  }

  /**
   * Create a style profile from explicit parameters.
   */
  create(name: string, dna: CreativeDNA): StyleProfile {
    const profile: StyleProfile = {
      id: generateId(),
      name,
      source: "created",
      dna,
      created: timestamp(),
      updated: timestamp(),
    };
    this.profiles.set(profile.id, profile);
    return profile;
  }

  get(id: UniqueId): StyleProfile | undefined {
    return this.profiles.get(id);
  }

  getAll(): StyleProfile[] {
    return [...this.profiles.values()];
  }

  /**
   * Convert abstract style descriptions to concrete parameters.
   * E.g., "fast pacing" → Average Shot Length = 1.2s, Cut Frequency = high
   */
  styleToParameters(dna: CreativeDNA): Record<string, unknown> {
    return {
      averageShotLength: dna.editing.averageShotLength,
      cutFrequency: dna.editing.cutFrequency > 0.7 ? "high" : dna.editing.cutFrequency > 0.4 ? "medium" : "low",
      brollDensity: dna.editing.brollDensity,
      transitionProbability: dna.editing.transitionFrequency,
      hookDuration: dna.narrative.hookDuration,
      captionDensity: dna.typography.captionDensity,
      zoomFrequency: dna.motion.zoomFrequency,
      musicPresence: dna.audio.musicPresence,
      sfxPresence: dna.audio.sfxPresence,
      contrast: dna.color.averageContrast > 0.7 ? "high" : dna.color.averageContrast > 0.4 ? "medium" : "low",
      saturation: dna.color.averageSaturation > 0.7 ? "vibrant" : dna.color.averageSaturation > 0.4 ? "normal" : "desaturated",
    };
  }

  private averageDNA(samples: CreativeDNA[]): CreativeDNA {
    if (samples.length === 0) throw new Error("No samples provided");
    if (samples.length === 1) return samples[0];

    // Simple average of numeric fields
    const result = JSON.parse(JSON.stringify(samples[0])) as CreativeDNA;

    const avgNum = (key: string, obj: Record<string, unknown>): void => {
      if (typeof obj[key] === "number") {
        const values = samples.map((s) => (s as any)[key] as number);
        (obj as Record<string, unknown>)[key] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    };

    // Average key fields
    avgNum("averageShotLength", result.editing as any);
    avgNum("cutFrequency", result.editing as any);
    avgNum("brollDensity", result.editing as any);
    avgNum("hookDuration", result.pacing as any);
    avgNum("beatFrequency", result.pacing as any);
    avgNum("averageBrightness", result.color as any);
    avgNum("averageSaturation", result.color as any);
    avgNum("averageContrast", result.color as any);
    avgNum("captionDensity", result.typography as any);
    avgNum("musicPresence", result.audio as any);

    return result;
  }
}
