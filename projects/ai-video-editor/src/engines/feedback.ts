/**
 * AI Creative OS - Feedback, Experiment, Platform, Template, LongVideo Engines
 * Implements spec sections: §45, §80-84, §85, §52-53, §24, §88-89
 */

import type {
  UniqueId, Platform, AspectRatio, Duration, Score, Timestamp,
  CreativeDNA, UniversalProject,
} from "../types/index.js";
import { Logger, EventBus, generateId, timestamp, StorageEngine } from "../core/index.js";

// ─── Human-in-the-Loop Engine (§80) ──────────────────────────────────────────

export type FeedbackAction = "approve" | "reject" | "modify" | "retry" | "regenerate" | "use_alternative" | "lock";

export interface FeedbackRecord {
  id: UniqueId;
  timestamp: Timestamp;
  targetId: UniqueId;
  targetType: "output" | "shot" | "scene" | "asset" | "audio_segment" | "caption";
  action: FeedbackAction;
  reason?: string;
  modification?: Record<string, unknown>;
  sessionId: UniqueId;
}

export class HumanInTheLoop {
  private logger = new Logger("HumanInTheLoop");
  private eventBus: EventBus;
  private records: FeedbackRecord[] = [];
  private pendingReviews = new Map<UniqueId, PendingReview>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Request human review for an output.
   */
  requestReview(targetId: UniqueId, targetType: FeedbackRecord["targetType"], preview: unknown): UniqueId {
    const reviewId = generateId();
    this.pendingReviews.set(reviewId, {
      id: reviewId, targetId, targetType, preview,
      requestedAt: Date.now(), status: "pending",
    });
    this.eventBus.emit("REVIEW_REQUESTED", "HumanInTheLoop", { reviewId, targetId, targetType });
    return reviewId;
  }

  /**
   * Submit feedback on an output.
   */
  submitFeedback(reviewId: UniqueId, action: FeedbackAction, reason?: string, modification?: Record<string, unknown>): FeedbackRecord | null {
    const review = this.pendingReviews.get(reviewId);
    if (!review) return null;

    const record: FeedbackRecord = {
      id: generateId(), timestamp: Date.now(),
      targetId: review.targetId, targetType: review.targetType as FeedbackRecord["targetType"],
      action, reason, modification, sessionId: (review as any).sessionId ?? "",
    };
    this.records.push(record);
    review.status = action === "approve" ? "approved" : "rejected";
    this.pendingReviews.delete(reviewId);

    this.eventBus.emit("FEEDBACK_SUBMITTED", "HumanInTheLoop", { reviewId, action });
    return record;
  }

  /**
   * Get patterns from rejections (§81: learn from feedback).
   */
  getRejectionPatterns(): { pattern: string; count: number }[] {
    const patterns = new Map<string, number>();
    for (const r of this.records.filter((r) => r.action === "reject" && r.reason)) {
      patterns.set(r.reason!, (patterns.get(r.reason!) ?? 0) + 1);
    }
    return [...patterns.entries()]
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count);
  }

  getPendingReviews(): PendingReview[] {
    return [...this.pendingReviews.values()];
  }

  getApprovalRate(): number {
    if (this.records.length === 0) return 0;
    const approved = this.records.filter((r) => r.action === "approve").length;
    return Math.round(approved / this.records.length * 100);
  }
}

interface PendingReview {
  id: UniqueId; targetId: UniqueId; targetType: string;
  preview: unknown; requestedAt: number; status: string; sessionId?: UniqueId;
}

// ─── Experiment Manager (§83-84) ─────────────────────────────────────────────

export interface Experiment {
  id: UniqueId;
  name: string;
  status: "draft" | "running" | "completed" | "cancelled";
  variants: ExperimentVariant[];
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  winner?: UniqueId;
}

export interface ExperimentVariant {
  id: UniqueId;
  name: string;
  config: Record<string, unknown>;
  output?: unknown;
  score?: Score;
  feedback?: { approved: number; rejected: number };
}

export class ExperimentManager {
  private logger = new Logger("ExperimentManager");
  private experiments = new Map<UniqueId, Experiment>();

  create(name: string, variants: { name: string; config: Record<string, unknown> }[]): Experiment {
    const exp: Experiment = {
      id: generateId(), name, status: "draft",
      variants: variants.map((v) => ({ id: generateId(), name: v.name, config: v.config })),
    };
    this.experiments.set(exp.id, exp);
    return exp;
  }

  start(experimentId: UniqueId): boolean {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== "draft") return false;
    exp.status = "running";
    exp.startedAt = Date.now();
    return true;
  }

  recordResult(experimentId: UniqueId, variantId: UniqueId, output: unknown, score: Score): void {
    const exp = this.experiments.get(experimentId);
    if (!exp) return;
    const variant = exp.variants.find((v) => v.id === variantId);
    if (variant) { variant.output = output; variant.score = score; }
  }

  recordFeedback(experimentId: UniqueId, variantId: UniqueId, approved: boolean): void {
    const exp = this.experiments.get(experimentId);
    if (!exp) return;
    const variant = exp.variants.find((v) => v.id === variantId);
    if (variant) {
      if (!variant.feedback) variant.feedback = { approved: 0, rejected: 0 };
      if (approved) variant.feedback.approved++;
      else variant.feedback.rejected++;
    }
  }

  complete(experimentId: UniqueId): Experiment | null {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;
    exp.status = "completed";
    exp.completedAt = Date.now();
    // Select winner by score
    const scored = exp.variants.filter((v) => v.score !== undefined);
    if (scored.length > 0) {
      scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      exp.winner = scored[0].id;
    }
    return exp;
  }

  getAll(): Experiment[] { return [...this.experiments.values()]; }
}

// ─── Platform Optimizer (§85) ────────────────────────────────────────────────

export interface PlatformConfig {
  platform: Platform;
  aspectRatio: AspectRatio;
  resolution: { width: number; height: number };
  maxDuration: Duration;
  maxFileSize: number; // bytes
  recommendedBitrate: string;
  fps: number;
  captionStyle: string;
  safeZones: { top: number; bottom: number; left: number; right: number }; // percentage
  hooks: { maxLength: Duration; style: string };
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  tiktok: {
    platform: "tiktok", aspectRatio: "9:16", resolution: { width: 1080, height: 1920 },
    maxDuration: 180000, maxFileSize: 287 * 1024 * 1024, recommendedBitrate: "8M",
    fps: 30, captionStyle: "bold_centered", safeZones: { top: 10, bottom: 15, left: 5, right: 5 },
    hooks: { maxLength: 3000, style: "text_overlay" },
  },
  youtube_shorts: {
    platform: "youtube_shorts", aspectRatio: "9:16", resolution: { width: 1080, height: 1920 },
    maxDuration: 60000, maxFileSize: 256 * 1024 * 1024, recommendedBitrate: "8M",
    fps: 30, captionStyle: "bold_centered", safeZones: { top: 10, bottom: 15, left: 5, right: 5 },
    hooks: { maxLength: 3000, style: "visual_hook" },
  },
  instagram_reels: {
    platform: "instagram_reels", aspectRatio: "9:16", resolution: { width: 1080, height: 1920 },
    maxDuration: 90000, maxFileSize: 250 * 1024 * 1024, recommendedBitrate: "6M",
    fps: 30, captionStyle: "minimal", safeZones: { top: 10, bottom: 20, left: 5, right: 5 },
    hooks: { maxLength: 2000, style: "aesthetic" },
  },
  youtube: {
    platform: "youtube", aspectRatio: "16:9", resolution: { width: 1920, height: 1080 },
    maxDuration: 43200000, maxFileSize: 128 * 1024 * 1024 * 1024, recommendedBitrate: "12M",
    fps: 30, captionStyle: "standard", safeZones: { top: 5, bottom: 5, left: 5, right: 5 },
    hooks: { maxLength: 5000, style: "teaser" },
  },
};

export class PlatformOptimizer {
  private logger = new Logger("PlatformOptimizer");

  getConfig(platform: Platform): PlatformConfig {
    return PLATFORM_CONFIGS[platform] ?? PLATFORM_CONFIGS.youtube;
  }

  /**
   * Optimize a project for a target platform.
   */
  optimize(project: UniversalProject, targetPlatform: Platform): {
    changes: string[];
    optimized: Partial<UniversalProject>;
  } {
    const config = this.getConfig(targetPlatform);
    const changes: string[] = [];

    if (project.aspectRatio !== config.aspectRatio) {
      changes.push(`Aspect ratio: ${project.aspectRatio} → ${config.aspectRatio}`);
    }
    if (project.resolution.width !== config.resolution.width || project.resolution.height !== config.resolution.height) {
      changes.push(`Resolution: ${project.resolution.width}x${project.resolution.height} → ${config.resolution.width}x${config.resolution.height}`);
    }
    if (project.fps !== config.fps) {
      changes.push(`FPS: ${project.fps} → ${config.fps}`);
    }

    return {
      changes,
      optimized: {
        platform: targetPlatform,
        aspectRatio: config.aspectRatio,
        resolution: config.resolution,
        fps: config.fps,
      },
    };
  }

  /**
   * Get platform-specific safe zones.
   */
  getSafeZones(platform: Platform): { top: number; bottom: number; left: number; right: number } {
    return this.getConfig(platform).safeZones;
  }

  /**
   * Auto-detect platform from dimensions.
   */
  detectPlatform(width: number, height: number): Platform {
    if (height > width * 1.5) return "tiktok";
    if (width > height * 1.5) return "youtube";
    if (width === height) return "instagram_reels";
    return "youtube";
  }
}

// ─── Template Engine (§52) ───────────────────────────────────────────────────

export interface Template {
  id: UniqueId;
  name: string;
  category: string;
  platform: Platform;
  duration: Duration;
  parameters: TemplateParameter[];
  structure: TemplateScene[];
}

export interface TemplateParameter {
  name: string;
  type: "text" | "image" | "color" | "number" | "select";
  label: string;
  default: unknown;
  options?: string[];
  required: boolean;
}

export interface TemplateScene {
  duration: Duration;
  elements: { type: string; position: string; style: Record<string, unknown>; paramBinding?: string }[];
}

export class TemplateEngine {
  private templates = new Map<UniqueId, Template>();
  private logger = new Logger("Template");

  register(template: Template): void { this.templates.set(template.id, template); }

  get(id: UniqueId): Template | undefined { return this.templates.get(id); }

  getAll(): Template[] { return [...this.templates.values()]; }

  getByPlatform(platform: Platform): Template[] {
    return [...this.templates.values()].filter((t) => t.platform === platform);
  }

  /**
   * Instantiate a template with user-provided parameters.
   */
  instantiate(templateId: UniqueId, params: Record<string, unknown>): TemplateInstance | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    // Validate required params
    for (const p of template.parameters) {
      if (p.required && !(p.name in params) && p.default === undefined) {
        this.logger.warn(`Missing required parameter: ${p.name}`);
        return null;
      }
    }

    return {
      id: generateId(),
      templateId,
      parameters: { ...Object.fromEntries(template.parameters.map((p) => [p.name, p.default ?? ""])), ...params },
      structure: template.structure,
      createdAt: Date.now(),
    };
  }

  /**
   * Create a preset template library.
   */
  createPresets(): void {
    this.register({
      id: "tpl.tiktok_hook", name: "TikTok Hook", category: "short_form",
      platform: "tiktok", duration: 15000,
      parameters: [
        { name: "headline", type: "text", label: "Main Text", default: "", required: true },
        { name: "color", type: "color", label: "Accent Color", default: "#FF0050", required: false },
      ],
      structure: [
        { duration: 3000, elements: [{ type: "text", position: "center", style: { fontSize: 48, fontWeight: "bold" }, paramBinding: "headline" }] },
        { duration: 12000, elements: [{ type: "video", position: "full", style: {} }] },
      ],
    });

    this.register({
      id: "tpl.youtube_intro", name: "YouTube Intro", category: "long_form",
      platform: "youtube", duration: 10000,
      parameters: [
        { name: "channel_name", type: "text", label: "Channel Name", default: "", required: true },
        { name: "topic", type: "text", label: "Topic", default: "", required: true },
      ],
      structure: [
        { duration: 3000, elements: [{ type: "logo", position: "center", style: { animation: "scale_in" } }] },
        { duration: 4000, elements: [{ type: "text", position: "center", style: { fontSize: 36 }, paramBinding: "topic" }] },
        { duration: 3000, elements: [{ type: "transition", position: "full", style: { type: "fade_to_black" } }] },
      ],
    });
  }
}

interface TemplateInstance {
  id: UniqueId; templateId: UniqueId; parameters: Record<string, unknown>;
  structure: TemplateScene[]; createdAt: Timestamp;
}

// ─── Long Video Engine (§24) ─────────────────────────────────────────────────

export interface LongVideoSegment {
  id: UniqueId;
  sceneNumber: number;
  script: string;
  duration: Duration;
  keyframes: string[];
  status: "pending" | "generating" | "completed" | "failed";
  outputPath?: string;
  error?: string;
  retries: number;
}

export interface LongVideoPlan {
  id: UniqueId;
  totalDuration: Duration;
  segments: LongVideoSegment[];
  consistencyProfile?: CreativeDNA;
}

export class LongVideoEngine {
  private logger = new Logger("LongVideo");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Plan a long video by splitting into segments.
   */
  planLongVideo(
    totalDuration: Duration,
    segments: { script: string; duration: Duration }[],
    consistencyDNA?: CreativeDNA,
  ): LongVideoPlan {
    const plan: LongVideoPlan = {
      id: generateId(),
      totalDuration,
      segments: segments.map((s, i) => ({
        id: generateId(),
        sceneNumber: i + 1,
        script: s.script,
        duration: s.duration,
        keyframes: [],
        status: "pending",
        retries: 0,
      })),
      consistencyProfile: consistencyDNA,
    };

    this.logger.info(`Long video plan: ${plan.segments.length} segments, ${totalDuration / 1000}s total`);
    return plan;
  }

  /**
   * Mark a segment as completed.
   */
  completeSegment(planId: string, segmentId: UniqueId, outputPath: string): void {
    this.eventBus.emit("SEGMENT_COMPLETED", "LongVideo", { planId, segmentId, outputPath });
  }

  /**
   * Get segments that need (re)generation.
   */
  getPendingSegments(plan: LongVideoPlan): LongVideoSegment[] {
    return plan.segments.filter((s) => s.status === "pending" || (s.status === "failed" && s.retries < 3));
  }

  /**
   * Get stitch command for final assembly.
   */
  getStitchCommand(plan: LongVideoPlan, outputPath: string): string {
    const completed = plan.segments.filter((s) => s.status === "completed" && s.outputPath);
    if (completed.length === 0) return "";
    const listContent = completed.map((s) => `file '${s.outputPath}'`).join("\n");
    return `ffmpeg -y -f concat -safe 0 -i "concat_list.txt" -c copy "${outputPath}"`;
  }
}

// ─── Failure Memory (§89, enhanced) ──────────────────────────────────────────

export interface FailureEntry {
  id: UniqueId;
  timestamp: Timestamp;
  provider: string;
  model?: string;
  capability: string;
  error: string;
  cause: string;
  hardware: string;
  solution?: string;
  resolved: boolean;
  occurrenceCount: number;
}

export class FailureMemory {
  private failures = new Map<string, FailureEntry>();
  private logger = new Logger("FailureMemory");

  record(entry: Omit<FailureEntry, "id" | "timestamp" | "occurrenceCount">): void {
    const key = `${entry.provider}:${entry.capability}:${entry.error.slice(0, 50)}`;
    const existing = this.failures.get(key);
    if (existing) {
      existing.occurrenceCount++;
      existing.timestamp = Date.now();
    } else {
      this.failures.set(key, {
        ...entry, id: generateId(), timestamp: Date.now(), occurrenceCount: 1,
      });
    }
  }

  shouldAvoid(provider: string, capability: string): boolean {
    for (const f of this.failures.values()) {
      if (f.provider === provider && f.capability === capability &&
          f.occurrenceCount >= 3 && f.timestamp > Date.now() - 86400000) {
        return true;
      }
    }
    return false;
  }

  getSolution(error: string): string | undefined {
    for (const f of this.failures.values()) {
      if (f.error.includes(error.slice(0, 20)) && f.solution) return f.solution;
    }
    return undefined;
  }

  getAll(): FailureEntry[] { return [...this.failures.values()]; }
}

// ─── Checkpoint System (§88) ─────────────────────────────────────────────────

export interface Checkpoint {
  id: UniqueId;
  workflowId: UniqueId;
  nodeId: UniqueId;
  timestamp: Timestamp;
  state: Record<string, unknown>;
  canResume: boolean;
}

export class CheckpointSystem {
  private checkpoints = new Map<UniqueId, Checkpoint[]>();
  private logger = new Logger("Checkpoint");

  save(workflowId: UniqueId, nodeId: UniqueId, state: Record<string, unknown>): Checkpoint {
    const cp: Checkpoint = {
      id: generateId(), workflowId, nodeId,
      timestamp: Date.now(), state, canResume: true,
    };
    const existing = this.checkpoints.get(workflowId) ?? [];
    existing.push(cp);
    this.checkpoints.set(workflowId, existing);
    return cp;
  }

  getLatestCheckpoint(workflowId: UniqueId): Checkpoint | undefined {
    const cps = this.checkpoints.get(workflowId);
    return cps?.[cps.length - 1];
  }

  canResume(workflowId: UniqueId): boolean {
    const latest = this.getLatestCheckpoint(workflowId);
    return latest?.canResume ?? false;
  }

  rollback(workflowId: UniqueId, checkpointId?: UniqueId): Checkpoint | null {
    const cps = this.checkpoints.get(workflowId) ?? [];
    const target = checkpointId ? cps.find((c) => c.id === checkpointId) : cps[cps.length - 1];
    if (target) {
      this.logger.info(`Rolling back to checkpoint ${target.id}`);
      return target;
    }
    return null;
  }
}
