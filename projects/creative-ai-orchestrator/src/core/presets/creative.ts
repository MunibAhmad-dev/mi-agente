// ============================================================================
// Creative Presets
// ============================================================================
// Pre-saved strategies for common creative tasks.
// ============================================================================

export interface CreativePreset {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: Record<string, unknown>;
  pipeline: string[];
  estimatedVramMb: number;
  tags: string[];
}

export const CREATIVE_PRESETS: CreativePreset[] = [
  {
    id: "photorealistic",
    name: "Photorealistic",
    description: "High-quality photorealistic image generation",
    category: "image",
    parameters: { steps: 30, cfg: 7.0, sampler: "dpmpp_2m", scheduler: "karras", width: 1024, height: 1024 },
    pipeline: ["checkpoint", "positive", "negative", "latent", "sampler", "vae_decode", "save"],
    estimatedVramMb: 6000,
    tags: ["photo", "realistic", "high quality"],
  },
  {
    id: "anime",
    name: "Anime",
    description: "Anime/illustration style generation",
    category: "image",
    parameters: { steps: 25, cfg: 7.5, sampler: "euler_a", scheduler: "normal", width: 768, height: 1024 },
    pipeline: ["checkpoint", "lora", "positive", "negative", "latent", "sampler", "vae_decode", "save"],
    estimatedVramMb: 5000,
    tags: ["anime", "illustration", "2d"],
  },
  {
    id: "product",
    name: "Product Photography",
    description: "Professional product photo with studio lighting",
    category: "image",
    parameters: { steps: 25, cfg: 7.5, sampler: "dpmpp_2m", denoise: 0.4, width: 1024, height: 1024 },
    pipeline: ["load_image", "checkpoint", "positive", "negative", "sampler", "vae_decode", "upscale", "save"],
    estimatedVramMb: 8000,
    tags: ["product", "commercial", "studio"],
  },
  {
    id: "portrait",
    name: "Portrait Enhancement",
    description: "Enhance portrait photos with face restoration",
    category: "enhancement",
    parameters: { faceRestoreStrength: 0.5, sharpenAmount: 0.3 },
    pipeline: ["load_image", "face_restore", "sharpen", "save"],
    estimatedVramMb: 2000,
    tags: ["portrait", "face", "enhancement"],
  },
  {
    id: "upscale_2x",
    name: "Upscale 2x",
    description: "Upscale image to 2x resolution",
    category: "upscaling",
    parameters: { scale: 2 },
    pipeline: ["load_image", "upscale", "save"],
    estimatedVramMb: 3000,
    tags: ["upscale", "resolution"],
  },
  {
    id: "upscale_4x",
    name: "Upscale 4x",
    description: "Upscale image to 4x resolution",
    category: "upscaling",
    parameters: { scale: 4 },
    pipeline: ["load_image", "upscale", "save"],
    estimatedVramMb: 5000,
    tags: ["upscale", "high resolution"],
  },
  {
    id: "denoise",
    name: "Denoise",
    description: "Remove noise/grain from image",
    category: "enhancement",
    parameters: { strength: 0.3 },
    pipeline: ["load_image", "denoise", "sharpen", "save"],
    estimatedVramMb: 2000,
    tags: ["denoise", "clean", "enhancement"],
  },
  {
    id: "concept_art",
    name: "Concept Art",
    description: "Concept art / matte painting style",
    category: "image",
    parameters: { steps: 35, cfg: 8.0, sampler: "dpmpp_2m", scheduler: "karras", width: 1024, height: 768 },
    pipeline: ["checkpoint", "positive", "negative", "latent", "sampler", "vae_decode", "upscale", "save"],
    estimatedVramMb: 7000,
    tags: ["concept", "art", "matte painting"],
  },
  {
    id: "restore_old",
    name: "Old Photo Restoration",
    description: "Restore damaged or old photographs",
    category: "restoration",
    parameters: { denoiseStrength: 0.25, faceRestoreStrength: 0.6, sharpenAmount: 0.4 },
    pipeline: ["load_image", "denoise", "face_restore", "sharpen", "upscale", "save"],
    estimatedVramMb: 4000,
    tags: ["restoration", "old photo", "repair"],
  },
  {
    id: "cinematic_video",
    name: "Cinematic Video Frame",
    description: "Generate cinematic-quality frames for video",
    category: "video",
    parameters: { steps: 30, cfg: 7.0, sampler: "dpmpp_2m", scheduler: "karras", width: 1280, height: 720 },
    pipeline: ["checkpoint", "positive", "negative", "latent", "sampler", "vae_decode", "save"],
    estimatedVramMb: 6000,
    tags: ["cinematic", "video", "film"],
  },
];

export class PresetManager {
  /**
   * List all presets.
   */
  listPresets(category?: string): CreativePreset[] {
    if (category) return CREATIVE_PRESETS.filter((p) => p.category === category);
    return CREATIVE_PRESETS;
  }

  /**
   * Get a preset by ID.
   */
  getPreset(id: string): CreativePreset | undefined {
    return CREATIVE_PRESETS.find((p) => p.id === id);
  }

  /**
   * Find presets compatible with available VRAM.
   */
  findCompatible(availableVramMb: number): CreativePreset[] {
    return CREATIVE_PRESETS.filter((p) => p.estimatedVramMb <= availableVramMb * 1.1);
  }

  /**
   * Get preset adapted for hardware.
   */
  adaptPreset(presetId: string, availableVramMb: number): CreativePreset | null {
    const preset = this.getPreset(presetId);
    if (!preset) return null;

    if (preset.estimatedVramMb <= availableVramMb) return preset;

    // Reduce resolution to fit
    const scaleFactor = Math.sqrt(availableVramMb / preset.estimatedVramMb);
    const adapted = { ...preset, parameters: { ...preset.parameters } };

    if (typeof adapted.parameters.width === "number") {
      adapted.parameters.width = Math.round((adapted.parameters.width as number) * scaleFactor / 64) * 64;
    }
    if (typeof adapted.parameters.height === "number") {
      adapted.parameters.height = Math.round((adapted.parameters.height as number) * scaleFactor / 64) * 64;
    }
    adapted.estimatedVramMb = availableVramMb;
    adapted.name = `${preset.name} (Adapted)`;

    return adapted;
  }
}
