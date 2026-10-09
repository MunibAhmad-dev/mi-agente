/**
 * AI Creative OS - Creative Compiler
 * 
 * Transforms human creative intent into a structured CreativeSpecification.
 * Input: "Haz un Short de 45 segundos, ritmo rápido, cinematográfico"
 * Output: Complete CreativeSpecification with all parameters resolved.
 */

import type {
  CreativeSpecification, Platform, Pacing, AspectRatio, QualityPreset,
  StoryStructure, VisualStyle, AnimationStyle, AudioStyle,
  CaptionSpecification, ColorSpecification, SceneDescription,
  ShotDescription, UniqueId, Duration, TransitionType, ShotType, CameraMovement,
} from "../types/index.js";
import { Logger, generateId, EventBus } from "../core/index.js";

export interface IntentAnalysis {
  rawInput: string;
  detectedPlatform: Platform;
  detectedDuration: Duration;
  detectedPacing: Pacing;
  detectedStyle: string;
  detectedMood: string;
  confidence: number;
  keywords: string[];
  ambiguities: string[];
}

export class CreativeCompiler {
  private logger = new Logger("CreativeCompiler");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Compile a natural language intent into a CreativeSpecification.
   */
  async compile(intent: string, options: Partial<CreativeSpecification> = {}): Promise<{
    specification: CreativeSpecification;
    analysis: IntentAnalysis;
  }> {
    this.logger.info("Compiling creative intent...");

    const analysis = this.analyzeIntent(intent);
    const specification = this.buildSpecification(analysis, options);

    await this.eventBus.emit("INTENT_COMPILED", "CreativeCompiler", {
      analysis,
      specification,
    });

    return { specification, analysis };
  }

  /**
   * Analyze natural language intent to extract creative parameters.
   */
  analyzeIntent(intent: string): IntentAnalysis {
    const lower = intent.toLowerCase();
    const keywords = this.extractKeywords(lower);

    const detectedPlatform = this.detectPlatform(lower);
    const detectedDuration = this.detectDuration(lower);
    const detectedPacing = this.detectPacing(lower);
    const detectedStyle = this.detectStyle(lower);
    const detectedMood = this.detectMood(lower);

    const ambiguities: string[] = [];
    if (detectedPlatform === "generic") ambiguities.push("Platform not specified");
    if (detectedDuration === 30000) ambiguities.push("Duration defaulted to 30s");
    if (detectedPacing === "medium") ambiguities.push("Pacing not explicitly specified");

    return {
      rawInput: intent,
      detectedPlatform,
      detectedDuration,
      detectedPacing,
      detectedStyle,
      detectedMood,
      confidence: this.calculateConfidence(keywords, ambiguities),
      keywords,
      ambiguities,
    };
  }

  /**
   * Build a full CreativeSpecification from analysis and overrides.
   */
  buildSpecification(
    analysis: IntentAnalysis,
    overrides: Partial<CreativeSpecification>,
  ): CreativeSpecification {
    const platform = overrides.platform ?? analysis.detectedPlatform;
    const aspectRatio = overrides.aspectRatio ?? this.platformToAspectRatio(platform);
    const resolution = overrides.resolution ?? this.aspectRatioToResolution(aspectRatio);
    const duration = overrides.duration ?? analysis.detectedDuration;
    const fps = overrides.fps ?? 30;

    const storyStructure: StoryStructure = {
      hook: { duration: Math.min(3000, duration * 0.1), description: "Opening hook" },
      setup: { duration: duration * 0.2, description: "Setup and context" },
      development: { duration: duration * 0.5, description: "Main content" },
      payoff: { duration: duration * 0.15, description: "Payoff" },
      cta: { duration: duration * 0.05, description: "Call to action" },
      scenes: this.generateScenes(analysis, duration),
    };

    return {
      platform,
      duration,
      aspectRatio,
      resolution,
      fps,
      style: overrides.style ?? analysis.detectedStyle,
      pacing: overrides.pacing ?? analysis.detectedPacing,
      storyStructure,
      visualStyle: overrides.visualStyle ?? this.buildVisualStyle(analysis),
      animation: overrides.animation ?? this.buildAnimationStyle(analysis),
      audio: overrides.audio ?? this.buildAudioStyle(analysis),
      captions: overrides.captions ?? this.buildCaptionSpec(analysis),
      color: overrides.color ?? this.buildColorSpec(analysis),
      effects: overrides.effects ?? this.detectEffects(analysis),
      qualityTarget: overrides.qualityTarget ?? "balanced",
    };
  }

  // ─── Detection Methods ──────────────────────────────────────────────

  private extractKeywords(text: string): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 3);
    return [...new Set(words)];
  }

  private detectPlatform(text: string): Platform {
    if (text.includes("tiktok") || text.includes("tik tok")) return "tiktok";
    if (text.includes("shorts") || text.includes("youtube short")) return "youtube_shorts";
    if (text.includes("reels") || text.includes("instagram")) return "instagram_reels";
    if (text.includes("youtube") && !text.includes("short")) return "youtube";
    if (text.includes("twitter") || text.includes("x.com")) return "twitter";
    if (text.includes("facebook")) return "facebook";
    if (text.includes("linkedin")) return "linkedin";
    if (text.includes("short") || text.includes("vertical")) return "tiktok";
    return "generic";
  }

  private detectDuration(text: string): Duration {
    const secMatch = text.match(/(\d+)\s*(?:segundos?|seconds?|secs?)/i);
    if (secMatch) return parseInt(secMatch[1]) * 1000;

    const minMatch = text.match(/(\d+)\s*(?:minutos?|minutes?|mins?)/i);
    if (minMatch) return parseInt(minMatch[1]) * 60000;

    const durationMatch = text.match(/(\d+)\s*s\b/i);
    if (durationMatch) return parseInt(durationMatch[1]) * 1000;

    if (text.includes("short") || text.includes("tiktok") || text.includes("reel")) return 30000;
    if (text.includes("long") || text.includes("youtube") || text.includes("documental")) return 300000;
    return 30000;
  }

  private detectPacing(text: string): Pacing {
    if (text.includes("muy rápido") || text.includes("very fast") || text.includes("frenetic")) return "very_fast";
    if (text.includes("rápido") || text.includes("fast") || text.includes("dinámico") || text.includes("dynamic")) return "fast";
    if (text.includes("lento") || text.includes("slow") || text.includes("calm")) return "slow";
    if (text.includes("muy lento") || text.includes("very slow")) return "very_slow";
    return "medium";
  }

  private detectStyle(text: string): string {
    if (text.includes("cinemat") || text.includes("cine")) return "cinematic";
    if (text.includes("anime") || text.includes("animación")) return "anime";
    if (text.includes("documental") || text.includes("documentary")) return "documentary";
    if (text.includes("comercial") || text.includes("commercial") || text.includes("ad")) return "commercial";
    if (text.includes("educativ") || text.includes("tutorial")) return "educational";
    if (text.includes("gaming") || text.includes("game")) return "gaming";
    if (text.includes("minimal") || text.includes("clean")) return "minimalist";
    if (text.includes("vintage") || text.includes("retro")) return "vintage";
    return "modern";
  }

  private detectMood(text: string): string {
    if (text.includes("épico") || text.includes("epic") || text.includes("dramatic")) return "dramatic";
    if (text.includes("divertid") || text.includes("fun") || text.includes("upbeat")) return "energetic";
    if (text.includes("triste") || text.includes("sad") || text.includes("melanchol")) return "melancholic";
    if (text.includes("relax") || text.includes("calm") || text.includes("peace")) return "calm";
    if (text.includes("mister") || text.includes("dark") || text.includes("noir")) return "mysterious";
    return "neutral";
  }

  private calculateConfidence(keywords: string[], ambiguities: string[]): number {
    const base = 60;
    const keywordBonus = Math.min(keywords.length * 3, 25);
    const ambiguityPenalty = ambiguities.length * 5;
    return Math.max(20, Math.min(95, base + keywordBonus - ambiguityPenalty));
  }

  // ─── Builder Methods ────────────────────────────────────────────────

  private platformToAspectRatio(platform: Platform): AspectRatio {
    switch (platform) {
      case "tiktok": case "youtube_shorts": case "instagram_reels": return "9:16";
      case "youtube": return "16:9";
      case "twitter": return "16:9";
      case "linkedin": return "16:9";
      case "facebook": return "16:9";
      default: return "16:9";
    }
  }

  private aspectRatioToResolution(ratio: AspectRatio): { width: number; height: number } {
    switch (ratio) {
      case "9:16": return { width: 1080, height: 1920 };
      case "16:9": return { width: 1920, height: 1080 };
      case "1:1": return { width: 1080, height: 1080 };
      case "4:5": return { width: 1080, height: 1350 };
      case "21:9": return { width: 2560, height: 1080 };
      case "2.39:1": return { width: 2560, height: 1070 };
      default: return { width: 1920, height: 1080 };
    }
  }

  private buildVisualStyle(analysis: IntentAnalysis): VisualStyle {
    const style = analysis.detectedStyle;
    return {
      contrast: style === "cinematic" ? "high" : style === "minimalist" ? "low" : "medium",
      saturation: style === "vintage" ? "desaturated" : style === "commercial" ? "vibrant" : "normal",
      brightness: analysis.detectedMood === "mysterious" ? "dark" : "normal",
      grain: style === "vintage" ? 0.3 : style === "cinematic" ? 0.1 : 0,
      vignette: style === "cinematic" ? 0.2 : 0,
    };
  }

  private buildAnimationStyle(analysis: IntentAnalysis): AnimationStyle {
    const pacing = analysis.detectedPacing;
    return {
      titles: pacing === "very_fast" || pacing === "fast" ? "moderate" : "minimal",
      lowerThirds: analysis.detectedStyle === "educational" || analysis.detectedStyle === "documentary",
      kineticTypography: pacing === "very_fast" || pacing === "fast",
      motionPaths: analysis.detectedStyle !== "minimalist",
      transitions: this.selectTransitions(analysis),
      zoomFrequency: pacing === "very_fast" ? "high" : pacing === "fast" ? "medium" : "low",
    };
  }

  private selectTransitions(analysis: IntentAnalysis): TransitionType[] {
    const transitions: TransitionType[] = ["cut"];
    if (analysis.detectedPacing === "slow") transitions.push("crossfade", "dissolve");
    if (analysis.detectedStyle === "cinematic") transitions.push("fade_to_black");
    if (analysis.detectedPacing === "very_fast") transitions.push("glitch");
    return transitions;
  }

  private buildAudioStyle(analysis: IntentAnalysis): AudioStyle {
    return {
      music: analysis.detectedPacing === "very_fast" ? "foreground" : "background",
      sfx: analysis.detectedPacing === "very_fast" || analysis.detectedPacing === "fast" ? "moderate" : "minimal",
      voiceover: analysis.detectedStyle === "educational" || analysis.detectedStyle === "documentary",
      ambient: analysis.detectedMood === "calm",
      dynamicRange: analysis.detectedStyle === "cinematic" ? "wide" : "compressed",
    };
  }

  private buildCaptionSpec(analysis: IntentAnalysis): CaptionSpecification {
    const platform = analysis.detectedPlatform;
    const isShort = platform === "tiktok" || platform === "youtube_shorts" || platform === "instagram_reels";
    return {
      enabled: true,
      position: "center",
      animation: analysis.detectedPacing === "very_fast" ? "pop" : analysis.detectedPacing === "fast" ? "word_by_word" : "fade",
      style: {
        fontFamily: "Impact",
        fontSize: isShort ? 48 : 36,
        fontWeight: 700,
        color: { r: 255, g: 255, b: 255 },
        backgroundColor: { r: 0, g: 0, b: 0, a: 0.7 },
        highlightWords: isShort,
        highlightColor: { r: 255, g: 255, b: 0 },
      },
    };
  }

  private buildColorSpec(analysis: IntentAnalysis): ColorSpecification {
    const style = analysis.detectedStyle;
    return {
      grade: style === "cinematic" ? "teal_and_orange" : style === "vintage" ? "warm_vintage" : undefined,
      contrast: style === "cinematic" ? 1.2 : 1.0,
      saturation: style === "vintage" ? 0.8 : style === "commercial" ? 1.3 : 1.0,
    };
  }

  private detectEffects(analysis: IntentAnalysis): string[] {
    const effects: string[] = [];
    if (analysis.detectedStyle === "cinematic") effects.push("film_grain", "lens_flare");
    if (analysis.detectedPacing === "very_fast") effects.push("motion_blur");
    if (analysis.detectedMood === "mysterious") effects.push("vignette", "color_shift");
    return effects;
  }

  private generateScenes(analysis: IntentAnalysis, duration: Duration): SceneDescription[] {
    const sceneCount = Math.max(2, Math.round(duration / 10000));
    const sceneDuration = duration / sceneCount;
    const scenes: SceneDescription[] = [];

    for (let i = 0; i < sceneCount; i++) {
      scenes.push({
        id: generateId(),
        name: `Scene ${i + 1}`,
        duration: sceneDuration,
        description: `Scene ${i + 1} of ${sceneCount}`,
        shots: this.generateShots(sceneDuration, analysis),
        audio: i === 0 ? "music_intro" : i === sceneCount - 1 ? "music_outro" : "music_loop",
        mood: analysis.detectedMood,
      });
    }

    return scenes;
  }

  private generateShots(sceneDuration: Duration, analysis: IntentAnalysis): ShotDescription[] {
    const avgShotDuration = analysis.detectedPacing === "very_fast" ? 1200
      : analysis.detectedPacing === "fast" ? 2000
      : analysis.detectedPacing === "slow" ? 5000
      : 3000;

    const shotCount = Math.max(1, Math.round(sceneDuration / avgShotDuration));
    const shots: ShotDescription[] = [];

    for (let i = 0; i < shotCount; i++) {
      shots.push({
        id: generateId(),
        camera: this.randomShotType(),
        movement: this.randomCameraMovement(),
        duration: sceneDuration / shotCount,
        description: `Shot ${i + 1}`,
        transition: i > 0 ? "cut" : undefined,
      });
    }

    return shots;
  }

  private randomShotType(): ShotType {
    const types: ShotType[] = ["wide", "medium", "close_up", "medium_close"];
    return types[Math.floor(Math.random() * types.length)];
  }

  private randomCameraMovement(): CameraMovement {
    const movements: CameraMovement[] = ["static", "pan", "zoom", "tracking"];
    return movements[Math.floor(Math.random() * movements.length)];
  }
}
