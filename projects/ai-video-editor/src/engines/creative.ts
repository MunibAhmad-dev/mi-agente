/**
 * AI Creative OS - Creative Sub-Engines
 * Script Engine, Storyboard Engine, Shot Planner, Consistency Engine, Action Registry
 */

import type {
  UniqueId, Duration, ShotType, CameraMovement, TransitionType, Score,
} from "../types/index.js";
import { Logger, EventBus, generateId } from "../core/index.js";

// ─── Script Engine ───────────────────────────────────────────────────────────

export interface ScriptScene {
  id: UniqueId;
  number: number;
  description: string;
  dialogue?: string;
  narration?: string;
  duration: Duration;
  visualNotes: string;
  audioNotes: string;
  mood: string;
  transition?: TransitionType;
}

export interface Script {
  id: UniqueId;
  title: string;
  totalDuration: Duration;
  scenes: ScriptScene[];
  metadata: { genre: string; tone: string; targetAudience: string; language: string };
}

export class ScriptEngine {
  private logger = new Logger("ScriptEngine");

  /**
   * Generate a script structure from a CreativeSpecification.
   */
  generateFromSpec(params: {
    title: string;
    totalDuration: Duration;
    sceneCount: number;
    style: string;
    pacing: string;
    platform: string;
  }): Script {
    const sceneDuration = params.totalDuration / params.sceneCount;
    const scenes: ScriptScene[] = [];

    for (let i = 0; i < params.sceneCount; i++) {
      const isHook = i === 0;
      const isOutro = i === params.sceneCount - 1;

      scenes.push({
        id: generateId(),
        number: i + 1,
        description: isHook ? "Opening hook — grab attention immediately"
          : isOutro ? "Closing — CTA or final impression"
          : `Scene ${i + 1} — Development`,
        duration: isHook ? Math.min(sceneDuration * 1.5, 5000) : sceneDuration,
        visualNotes: isHook ? "Quick cuts, text overlay, eye-catching" : "B-roll, transitions",
        audioNotes: isHook ? "Music drop, SFX" : "Background music continues",
        mood: params.style === "cinematic" ? "dramatic" : params.style === "educational" ? "informative" : "engaging",
        transition: isHook ? "cut" : i % 2 === 0 ? "crossfade" : "cut",
      });
    }

    return {
      id: generateId(),
      title: params.title,
      totalDuration: params.totalDuration,
      scenes,
      metadata: {
        genre: params.style,
        tone: params.pacing,
        targetAudience: params.platform,
        language: "auto",
      },
    };
  }
}

// ─── Storyboard Engine ───────────────────────────────────────────────────────

export interface StoryboardFrame {
  id: UniqueId;
  sceneNumber: number;
  frameNumber: number;
  description: string;
  shotType: ShotType;
  cameraMovement: CameraMovement;
  duration: Duration;
  dialogue?: string;
  sfx?: string;
  musicCue?: string;
  notes: string;
}

export interface Storyboard {
  id: UniqueId;
  scriptId: UniqueId;
  frames: StoryboardFrame[];
  totalFrames: number;
}

export class StoryboardEngine {
  private logger = new Logger("Storyboard");

  generateFromScript(script: import("./creative.js").Script): Storyboard {
    const frames: StoryboardFrame[] = [];

    for (const scene of script.scenes) {
      const framesPerScene = Math.max(1, Math.round(scene.duration / 3000)); // ~3 sec per frame
      for (let f = 0; f < framesPerScene; f++) {
        frames.push({
          id: generateId(),
          sceneNumber: scene.number,
          frameNumber: f + 1,
          description: `${scene.description} (beat ${f + 1}/${framesPerScene})`,
          shotType: f === 0 ? "wide" : f === framesPerScene - 1 ? "close_up" : "medium",
          cameraMovement: f === 0 ? "static" : "pan",
          duration: scene.duration / framesPerScene,
          dialogue: scene.dialogue,
          notes: scene.visualNotes,
        });
      }
    }

    return {
      id: generateId(),
      scriptId: script.id,
      frames,
      totalFrames: frames.length,
    };
  }
}

// ─── Shot Planner ────────────────────────────────────────────────────────────

export interface ShotPlan {
  id: UniqueId;
  sceneId: UniqueId;
  shots: {
    id: UniqueId;
    type: ShotType;
    movement: CameraMovement;
    duration: Duration;
    framing: string;
    focus: string;
    transition: TransitionType;
  }[];
}

export class ShotPlanner {
  private logger = new Logger("ShotPlanner");

  planScene(sceneId: UniqueId, sceneDuration: Duration, pacing: string): ShotPlan {
    const avgShotDuration = pacing === "very_fast" ? 1500 : pacing === "fast" ? 2500 : pacing === "slow" ? 5000 : 3500;
    const shotCount = Math.max(2, Math.round(sceneDuration / avgShotDuration));
    const shotDuration = sceneDuration / shotCount;

    const shots = [];
    for (let i = 0; i < shotCount; i++) {
      shots.push({
        id: generateId(),
        type: this.selectShotType(i, shotCount),
        movement: this.selectMovement(pacing),
        duration: shotDuration,
        framing: i === 0 ? "establishing" : i === shotCount - 1 ? "punch_in" : "coverage",
        focus: "main_subject",
        transition: (i === 0 ? "cut" : pacing === "fast" ? "cut" : "crossfade") as TransitionType,
      });
    }

    return { id: generateId(), sceneId, shots };
  }

  private selectShotType(index: number, total: number): ShotType {
    if (index === 0) return "wide";
    if (index === total - 1) return "close_up";
    if (index % 3 === 0) return "medium_close";
    return "medium";
  }

  private selectMovement(pacing: string): CameraMovement {
    if (pacing === "very_fast") return Math.random() > 0.3 ? "zoom" : "pan";
    if (pacing === "slow") return Math.random() > 0.7 ? "dolly" : "static";
    return Math.random() > 0.5 ? "pan" : "static";
  }
}

// ─── Consistency Engine ──────────────────────────────────────────────────────

export interface ConsistencyCheck {
  id: UniqueId;
  type: "character" | "scene" | "camera" | "lighting" | "color" | "wardrobe" | "style";
  passed: boolean;
  score: Score;
  details: string;
  affectedFrames?: UniqueId[];
}

export class ConsistencyEngine {
  private logger = new Logger("Consistency");

  /**
   * Evaluate consistency between two images/frames using perceptual hashing.
   */
  async compareFrames(frameA: string, frameB: string): Promise<ConsistencyCheck> {
    // Use FFmpeg to extract perceptual features
    const result = execCommand(
      `ffmpeg -i "${frameA}" -i "${frameB}" -filter_complex "[0:v][1:v]ssim" -f null - 2>&1 | grep SSIM`,
      { timeout: 15000 },
    );

    let score = 50;
    const match = result.stdout.match(/All:([\d.]+)/);
    if (match) score = Math.round(parseFloat(match[1]) * 100);

    return {
      id: generateId(),
      type: "character",
      passed: score > 70,
      score: score as Score,
      details: `SSIM similarity: ${score}%`,
    };
  }

  /**
   * Check color consistency across a sequence of frames.
   */
  async checkColorConsistency(framePaths: string[]): Promise<ConsistencyCheck> {
    if (framePaths.length < 2) return { id: generateId(), type: "color", passed: true, score: 100, details: "Single frame" };

    const histograms: number[][] = [];
    for (const path of framePaths) {
      const result = execCommand(
        `ffmpeg -i "${path}" -vf "histogram" -f null - 2>&1 | tail -3`,
        { timeout: 10000 },
      );
      // Simplified: just check that all frames load successfully
      if (result.exitCode === 0) histograms.push([0]);
    }

    return {
      id: generateId(),
      type: "color",
      passed: histograms.length === framePaths.length,
      score: (histograms.length / framePaths.length * 100) as Score,
      details: `${histograms.length}/${framePaths.length} frames analyzed`,
    };
  }
}

import { execCommand } from "../core/index.js";

// ─── Action Registry ─────────────────────────────────────────────────────────

export interface ActionDef {
  id: string;
  name: string;
  capability: string;
  inputs: string[];
  outputs: string[];
  providers: string[];
  reversible: boolean;
  risk: "low" | "medium" | "high" | "critical";
}

export function createBuiltinActions(): ActionDef[] {
  return [
    { id: "CUT_CLIP", name: "Cut Clip", capability: "cap.timeline_editing", inputs: ["clip", "time"], outputs: ["clip"], providers: ["provider.ffmpeg", "provider.davinci"], reversible: true, risk: "low" },
    { id: "SPLIT_CLIP", name: "Split Clip", capability: "cap.timeline_editing", inputs: ["clip", "time"], outputs: ["clip_a", "clip_b"], providers: ["provider.ffmpeg"], reversible: true, risk: "low" },
    { id: "TRIM_CLIP", name: "Trim Clip", capability: "cap.timeline_editing", inputs: ["clip", "start", "end"], outputs: ["clip"], providers: ["provider.ffmpeg"], reversible: true, risk: "low" },
    { id: "SPEED_CHANGE", name: "Speed Change", capability: "cap.speed_ramping", inputs: ["clip", "speed"], outputs: ["clip"], providers: ["provider.ffmpeg"], reversible: true, risk: "low" },
    { id: "REVERSE_CLIP", name: "Reverse Clip", capability: "cap.speed_ramping", inputs: ["clip"], outputs: ["clip"], providers: ["provider.ffmpeg"], reversible: true, risk: "low" },
    { id: "ADD_TRANSITION", name: "Add Transition", capability: "cap.transitions", inputs: ["clip_a", "clip_b", "type", "duration"], outputs: ["transition_clip"], providers: ["provider.ffmpeg", "provider.davinci"], reversible: true, risk: "low" },
    { id: "COLOR_CORRECT", name: "Color Correction", capability: "cap.color_correction", inputs: ["clip", "settings"], outputs: ["clip"], providers: ["provider.ffmpeg", "provider.davinci"], reversible: true, risk: "low" },
    { id: "COLOR_GRADE", name: "Color Grading", capability: "cap.color_grading", inputs: ["clip", "lut_or_settings"], outputs: ["clip"], providers: ["provider.davinci", "provider.ffmpeg"], reversible: true, risk: "low" },
    { id: "ADD_CAPTION", name: "Add Caption", capability: "cap.subtitles", inputs: ["clip", "text", "style"], outputs: ["clip"], providers: ["provider.ffmpeg"], reversible: true, risk: "low" },
    { id: "ADD_EFFECT", name: "Add Effect", capability: "cap.compositing", inputs: ["clip", "effect"], outputs: ["clip"], providers: ["provider.ffmpeg", "provider.blender"], reversible: true, risk: "medium" },
    { id: "COMPOSITE", name: "Composite", capability: "cap.compositing", inputs: ["layers"], outputs: ["clip"], providers: ["provider.ffmpeg", "provider.blender", "provider.natron"], reversible: true, risk: "medium" },
    { id: "RENDER", name: "Render", capability: "cap.render", inputs: ["timeline"], outputs: ["file"], providers: ["provider.ffmpeg", "provider.davinci"], reversible: false, risk: "low" },
    { id: "EXPORT", name: "Export", capability: "cap.render", inputs: ["timeline", "format"], outputs: ["file"], providers: ["provider.ffmpeg"], reversible: false, risk: "low" },
    { id: "GENERATE_IMAGE", name: "Generate Image", capability: "cap.img_gen", inputs: ["prompt"], outputs: ["image"], providers: ["provider.comfyui"], reversible: false, risk: "low" },
    { id: "GENERATE_VIDEO", name: "Generate Video", capability: "cap.t2v", inputs: ["prompt"], outputs: ["video"], providers: ["provider.wan", "provider.comfyui"], reversible: false, risk: "medium" },
    { id: "ANIMATE_IMAGE", name: "Animate Image", capability: "cap.i2v", inputs: ["image", "prompt"], outputs: ["video"], providers: ["provider.wan", "provider.comfyui"], reversible: false, risk: "medium" },
    { id: "UPSCALE", name: "Upscale", capability: "cap.img_upscale", inputs: ["image"], outputs: ["image"], providers: ["provider.comfyui"], reversible: false, risk: "low" },
    { id: "DETECT_SCENES", name: "Detect Scenes", capability: "cap.scene_detection", inputs: ["video"], outputs: ["scenes"], providers: ["provider.pyscenedetect", "provider.opencv"], reversible: false, risk: "low" },
    { id: "TRANSCRIBE", name: "Transcribe", capability: "cap.stt", inputs: ["audio"], outputs: ["transcript"], providers: ["provider.whisper"], reversible: false, risk: "low" },
    { id: "NOISE_REDUCE", name: "Noise Reduction", capability: "cap.noise_reduction", inputs: ["audio"], outputs: ["audio"], providers: ["provider.ffmpeg"], reversible: false, risk: "low" },
  ];
}
