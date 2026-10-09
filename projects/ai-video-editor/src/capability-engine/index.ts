/**
 * AI Creative OS - Capability Engine
 * 
 * The core system that maps abstract capability requirements to concrete providers.
 * The AI never thinks "I need DaVinci." It thinks "I need editing + color + audio + compositing."
 */

import {
  Capability, CapabilityDomain, CapabilityMatch, CapabilityRequirements,
  Provider, ProviderScore, Score, HardwareProfile, LicenseInfo, UniqueId,
} from "../types/index.js";
import { Registry, EventBus, Logger, generateId } from "../core/index.js";

// ─── Capability Registry ─────────────────────────────────────────────────────

export class CapabilityRegistry extends Registry<Capability> {
  private logger = new Logger("CapabilityRegistry");

  register(cap: Capability): void {
    super.register(cap);
    this.logger.debug(`Registered capability: ${cap.id} (${cap.name})`);
  }

  getByDomain(domain: CapabilityDomain): Capability[] {
    return this.filter((c) => c.domain === domain);
  }

  getByCategory(category: string): Capability[] {
    return this.filter((c) => c.category === category);
  }

  search(query: string): Capability[] {
    const lower = query.toLowerCase();
    return this.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.description.toLowerCase().includes(lower) ||
        c.subcapabilities.some((s) => s.toLowerCase().includes(lower)),
    );
  }
}

// ─── Capability Equivalence Engine ───────────────────────────────────────────

export interface EquivalenceResult {
  matchType: "exact" | "functional" | "approximate" | "partial" | "none";
  score: Score;
  coverageScore: Score;
  qualityScore: Score;
  automationScore: Score;
  speedScore: Score;
  resourceScore: Score;
  compatibilityScore: Score;
  notes: string[];
}

export class CapabilityEquivalenceEngine {
  private logger = new Logger("CapabilityEquivalence");

  /**
   * Calculate how well a provider covers a requested capability.
   */
  evaluateCapabilityCoverage(
    capability: Capability,
    provider: Provider,
  ): EquivalenceResult {
    const notes: string[] = [];
    const providerCaps = provider.capabilities;

    // Check if the provider claims this capability
    const hasCapability = providerCaps.includes(capability.id);
    if (!hasCapability) {
      // Check fuzzy match via subcapabilities
      const partialMatch = this.checkPartialCapabilityMatch(capability, provider);
      if (partialMatch > 0) {
        notes.push(`Partial capability match: ${Math.round(partialMatch * 100)}%`);
        return {
          matchType: partialMatch > 0.7 ? "approximate" : "partial",
          score: Math.round(partialMatch * 60),
          coverageScore: Math.round(partialMatch * 100),
          qualityScore: provider.quality,
          automationScore: provider.automationScore,
          speedScore: provider.speed,
          resourceScore: this.calculateResourceScore(capability.requirements, provider.hardware),
          compatibilityScore: this.calculateCompatibilityScore(provider),
          notes,
        };
      }
      return {
        matchType: "none",
        score: 0,
        coverageScore: 0,
        qualityScore: 0,
        automationScore: 0,
        speedScore: 0,
        resourceScore: 0,
        compatibilityScore: 0,
        notes: ["Provider does not support this capability"],
      };
    }

    // Full capability match
    const coverageScore: Score = 100;
    const qualityScore = provider.quality;
    const automationScore = provider.automationScore;
    const speedScore = provider.speed;
    const resourceScore = this.calculateResourceScore(capability.requirements, provider.hardware);
    const compatibilityScore = this.calculateCompatibilityScore(provider);

    // Calculate overall score (weighted)
    const overallScore = Math.round(
      coverageScore * 0.25 +
      qualityScore * 0.25 +
      automationScore * 0.15 +
      speedScore * 0.10 +
      resourceScore * 0.15 +
      compatibilityScore * 0.10
    );

    const matchType: EquivalenceResult["matchType"] =
      overallScore >= 80 ? "exact" :
      overallScore >= 60 ? "functional" :
      overallScore >= 40 ? "approximate" : "partial";

    if (provider.status !== "available") {
      notes.push(`Provider status: ${provider.status}`);
    }
    if (provider.health !== "healthy") {
      notes.push(`Provider health: ${provider.health}`);
    }

    return {
      matchType,
      score: overallScore,
      coverageScore,
      qualityScore,
      automationScore,
      speedScore,
      resourceScore,
      compatibilityScore,
      notes,
    };
  }

  /**
   * Check if a provider partially covers a capability via subcapabilities.
   */
  private checkPartialCapabilityMatch(capability: Capability, provider: Provider): number {
    // Approximate: count how many subcapabilities the provider might support
    // This is a heuristic based on provider score and domain relevance
    if (provider.capabilities.length === 0) return 0;
    const domainScore = provider.score?.capability ?? provider.quality;
    return Math.min(domainScore / 100, 0.7);
  }

  /**
   * Score how well a provider's resource needs match available hardware.
   */
  private calculateResourceScore(
    requirements: CapabilityRequirements,
    providerHardware: Provider["hardware"],
  ): Score {
    let score = 100;

    if (requirements.minVRAM && providerHardware.minVRAM) {
      if (providerHardware.minVRAM > requirements.minVRAM) {
        score -= 20;
      }
    }
    if (requirements.minRAM && providerHardware.minRAM) {
      if (providerHardware.minRAM > requirements.minRAM) {
        score -= 15;
      }
    }
    if (requirements.gpu && !providerHardware.gpu) {
      score -= 30;
    }

    return Math.max(0, score);
  }

  /**
   * Score compatibility based on provider health, status, license.
   */
  private calculateCompatibilityScore(provider: Provider): Score {
    let score = 100;
    if (provider.status === "missing") score -= 50;
    if (provider.status === "broken") score -= 80;
    if (provider.status === "incompatible") score -= 90;
    if (provider.health === "degraded") score -= 20;
    if (provider.health === "broken") score -= 50;
    if (provider.license.commercialUse === false) score -= 5;
    return Math.max(0, score);
  }

  /**
   * Find the best equivalence between two providers for the same capability.
   */
  compareProviders(
    capability: Capability,
    providerA: Provider,
    providerB: Provider,
  ): { winner: UniqueId; margin: number; analysis: string } {
    const evalA = this.evaluateCapabilityCoverage(capability, providerA);
    const evalB = this.evaluateCapabilityCoverage(capability, providerB);

    const diff = evalA.score - evalB.score;

    return {
      winner: diff >= 0 ? providerA.id : providerB.id,
      margin: Math.abs(diff),
      analysis: `${providerA.name} (${evalA.score}) vs ${providerB.name} (${evalB.score})`,
    };
  }
}

// ─── Capability Resolver ─────────────────────────────────────────────────────

export interface ProviderCandidate {
  provider: Provider;
  equivalence: EquivalenceResult;
  rank: number;
}

export class CapabilityResolver {
  private registry: CapabilityRegistry;
  private equivalenceEngine: CapabilityEquivalenceEngine;
  private logger = new Logger("CapabilityResolver");

  constructor(registry: CapabilityRegistry, equivalenceEngine: CapabilityEquivalenceEngine) {
    this.registry = registry;
    this.equivalenceEngine = equivalenceEngine;
  }

  /**
   * Resolve which providers can fulfill a capability, ranked by score.
   */
  resolve(
    capabilityId: UniqueId,
    providers: Provider[],
    hardwareProfile?: HardwareProfile,
    licenseFilter?: (license: LicenseInfo) => boolean,
  ): ProviderCandidate[] {
    const capability = this.registry.get(capabilityId);
    if (!capability) {
      this.logger.warn(`Unknown capability: ${capabilityId}`);
      return [];
    }

    const candidates: ProviderCandidate[] = [];

    for (const provider of providers) {
      // License filter
      if (licenseFilter && !licenseFilter(provider.license)) {
        continue;
      }

      // Hardware filter
      if (hardwareProfile && !this.hardwareCompatible(capability.requirements, hardwareProfile)) {
        continue;
      }

      const equivalence = this.equivalenceEngine.evaluateCapabilityCoverage(capability, provider);
      if (equivalence.matchType !== "none") {
        candidates.push({ provider, equivalence, rank: 0 });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.equivalence.score - a.equivalence.score);

    // Assign ranks
    candidates.forEach((c, i) => { c.rank = i + 1; });

    return candidates;
  }

  /**
   * Resolve the best provider for a capability.
   */
  resolveBest(
    capabilityId: UniqueId,
    providers: Provider[],
    hardwareProfile?: HardwareProfile,
  ): ProviderCandidate | null {
    const candidates = this.resolve(capabilityId, providers, hardwareProfile);
    return candidates[0] ?? null;
  }

  /**
   * Resolve all capabilities needed for a list of capability IDs.
   */
  resolveMultiple(
    capabilityIds: UniqueId[],
    providers: Provider[],
    hardwareProfile?: HardwareProfile,
  ): Map<UniqueId, ProviderCandidate[]> {
    const results = new Map<UniqueId, ProviderCandidate[]>();
    for (const capId of capabilityIds) {
      results.set(capId, this.resolve(capId, providers, hardwareProfile));
    }
    return results;
  }

  /**
   * Check if hardware is compatible with capability requirements.
   */
  private hardwareCompatible(
    requirements: CapabilityRequirements,
    hardware: HardwareProfile,
  ): boolean {
    if (requirements.os && !requirements.os.includes(hardware.platform)) {
      return false;
    }
    if (requirements.gpu && hardware.gpus.length === 0) {
      return false;
    }
    if (requirements.minVRAM && hardware.gpus.every((g) => g.vram < requirements.minVRAM!)) {
      return false;
    }
    if (requirements.minRAM && hardware.totalRAM < requirements.minRAM) {
      return false;
    }
    if (requirements.minCPUCores && hardware.cpu.cores < requirements.minCPUCores) {
      return false;
    }
    return true;
  }
}

// ─── Capability Factory ──────────────────────────────────────────────────────

export function createCapability(
  id: string,
  name: string,
  domain: CapabilityDomain,
  description: string,
  subcapabilities: string[] = [],
  requirements: CapabilityRequirements = {},
): Capability {
  return {
    id,
    domain,
    name,
    description,
    subcapabilities,
    requirements,
    required: true,
  };
}

// ─── Built-in Capabilities ───────────────────────────────────────────────────

export function createBuiltinCapabilities(): Capability[] {
  return [
    // Editing
    createCapability("cap.timeline_editing", "Timeline Editing", "editing",
      "Multi-track timeline editing with cuts, trims, and arrangement",
      ["cutting", "trimming", "multicam", "proxy_editing"], { gpu: false }),
    createCapability("cap.speed_ramping", "Speed Ramping", "editing",
      "Variable speed changes with smooth interpolation",
      ["speed_change", "reverse", "time_remapping"], { gpu: false }),
    createCapability("cap.transitions", "Transitions", "editing",
      "Video transitions between clips",
      ["crossfade", "wipe", "dissolve", "push", "custom"], { gpu: false }),

    // Color
    createCapability("cap.color_correction", "Color Correction", "color",
      "Basic color correction and white balance",
      ["exposure", "white_balance", "levels"], { gpu: true }),
    createCapability("cap.color_grading", "Color Grading", "color",
      "Advanced color grading with LUTs, curves, and wheels",
      ["lut", "curves", "wheels", "hdr", "color_matching"], { gpu: true }),
    createCapability("cap.color_scopes", "Color Scopes", "color",
      "Waveform, vectorscope, histogram analysis",
      ["waveform", "vectorscope", "histogram"], { gpu: false }),

    // Audio
    createCapability("cap.audio_editing", "Audio Editing", "audio",
      "Audio track editing, trimming, and arrangement",
      ["cutting", "trimming", "volume", "pan"], { gpu: false }),
    createCapability("cap.audio_mixing", "Audio Mixing", "audio",
      "Multi-track audio mixing with EQ and effects",
      ["eq", "compression", "limiter", "reverb", "delay"], { gpu: false }),
    createCapability("cap.noise_reduction", "Noise Reduction", "audio",
      "AI-powered noise reduction and voice isolation",
      ["denoise", "voice_isolation", "deverb"], { gpu: true }),
    createCapability("cap.stt", "Speech-to-Text", "audio",
      "Speech recognition for transcription and captions",
      ["whisper", "transcription", "timestamps"], { gpu: true }),
    createCapability("cap.tts", "Text-to-Speech", "audio",
      "AI text-to-speech generation",
      ["voice_synthesis", "cloning", "multiple_voices"], { gpu: true }),

    // Motion Graphics
    createCapability("cap.titles", "Titles", "motion_graphics",
      "Title cards and text overlays",
      ["basic_titles", "animated_titles", "kinetic_typography"], { gpu: true }),
    createCapability("cap.lower_thirds", "Lower Thirds", "motion_graphics",
      "Lower third overlays for names and info",
      ["static_lower_thirds", "animated_lower_thirds"], { gpu: true }),
    createCapability("cap.motion_paths", "Motion Paths", "motion_graphics",
      "Objects following custom motion paths",
      ["bezier_paths", "physics_paths"], { gpu: true }),

    // VFX
    createCapability("cap.compositing", "Compositing", "vfx",
      "Layer compositing with blending modes",
      ["blending", "masking", "matte", "alpha"], { gpu: true }),
    createCapability("cap.tracking", "Motion Tracking", "vfx",
      "Point, planar, and 3D motion tracking",
      ["point_tracking", "planar_tracking", "3d_tracking"], { gpu: true }),
    createCapability("cap.rotoscoping", "Rotoscoping", "vfx",
      "Frame-by-frame or AI-assisted rotoscoping",
      ["manual_roto", "ai_roto", "edge_detection"], { gpu: true }),
    createCapability("cap.keying", "Chroma Keying", "vfx",
      "Green/blue screen keying",
      ["chroma_key", "luma_key", "difference_key"], { gpu: true }),
    createCapability("cap.particles", "Particle Systems", "vfx",
      "Particle generation for effects",
      ["emitters", "physics", "rendering"], { gpu: true }),

    // Image Generation
    createCapability("cap.img_gen", "Image Generation", "image",
      "AI image generation from text or image prompts",
      ["txt2img", "img2img", "inpainting", "outpainting"], { gpu: true, minVRAM: 4 * 1024 * 1024 * 1024 }),
    createCapability("cap.img_upscale", "Image Upscaling", "image",
      "AI-powered image upscaling",
      ["super_resolution", "face_enhancement"], { gpu: true }),
    createCapability("cap.img_segmentation", "Image Segmentation", "image",
      "Object detection and image segmentation",
      ["object_detection", "semantic_segmentation", "matting"], { gpu: true }),

    // Video AI
    createCapability("cap.t2v", "Text-to-Video", "video_ai",
      "Generate video from text prompts",
      ["text_to_video", "style_transfer"], { gpu: true, minVRAM: 8 * 1024 * 1024 * 1024 }),
    createCapability("cap.i2v", "Image-to-Video", "video_ai",
      "Animate still images into video",
      ["image_to_video", "motion_transfer"], { gpu: true, minVRAM: 8 * 1024 * 1024 * 1024 }),
    createCapability("cap.v2v", "Video-to-Video", "video_ai",
      "Transform existing video",
      ["style_transfer", "video_editing", "interpolation"], { gpu: true, minVRAM: 8 * 1024 * 1024 * 1024 }),
    createCapability("cap.video_interp", "Video Interpolation", "video_ai",
      "Generate intermediate frames for smooth motion",
      ["frame_interpolation", "slow_motion"], { gpu: true }),

    // Scene Analysis
    createCapability("cap.scene_detection", "Scene Detection", "editing",
      "Automatic detection of scene boundaries and cuts",
      ["shot_detection", "scene_segmentation"], { gpu: false }),
    createCapability("cap.optical_flow", "Optical Flow", "video_ai",
      "Motion estimation between frames",
      ["dense_flow", "sparse_flow"], { gpu: true }),

    // Rendering
    createCapability("cap.render", "Rendering", "rendering",
      "Final video rendering and encoding",
      ["encoding", "muxing", "hardware_accel"], { gpu: false }),
    createCapability("cap.thumbnail", "Thumbnail Generation", "thumbnails",
      "Generate thumbnails for videos",
      ["auto_thumbnail", "template_thumbnail", "ai_thumbnail"], { gpu: true }),

    // Subtitles
    createCapability("cap.subtitles", "Subtitle Generation", "subtitles",
      "Generate, style, and animate subtitles",
      ["auto_subtitles", "manual_editing", "animation", "style"], { gpu: true }),
  ];
}
