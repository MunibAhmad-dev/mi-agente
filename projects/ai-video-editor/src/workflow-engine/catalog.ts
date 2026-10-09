/**
 * AI Creative OS - Workflow Catalog
 * §22: Integrates The_frizzy1-Workflows as Workflow Provider / Workflow Catalog.
 * 
 * Documents workflows for: Wan 2.1, Wan 2.2, Wan 2.2 Animate, FLUX,
 * Qwen Image/Edit, Z-Image, Hunyuan, LTX, and audio (including low-VRAM variants).
 * 
 * Workflow source: MIT (workflows/docs), models retain their own licenses.
 */

import type {
  WorkflowDefinition, UniqueId, Score, Bytes,
} from "../types/index.js";
import { Logger, EventBus, generateId } from "../core/index.js";

export interface CatalogWorkflow {
  id: UniqueId;
  name: string;
  family: "wan_2.1" | "wan_2.2" | "wan_2.2_animate" | "flux" | "qwen" | "hunyuan" | "ltx" | "audio";
  mode: "t2v" | "i2v" | "v2v" | "ti2v" | "txt2img" | "img2img" | "edit" | "audio_gen";
  variant: "standard" | "low_vram" | "quality" | "speed";
  minVRAM: Bytes;
  recommendedVRAM: Bytes;
  models: string[];
  quantizations: string[];
  description: string;
  sourceRepo: string;
  sourceLicense: string;
  modelLicense: string;
}

export class WorkflowCatalog {
  private logger = new Logger("WorkflowCatalog");
  private workflows = new Map<UniqueId, CatalogWorkflow>();

  constructor() {
    this.registerBuiltinWorkflows();
  }

  /**
   * Register the built-in workflow catalog based on The_frizzy1 documentation.
   */
  private registerBuiltinWorkflows(): void {
    const workflows: Omit<CatalogWorkflow, "id">[] = [
      // ─── Wan 2.2 T2V ────────────────────────────────────────────
      {
        name: "Wan 2.2 T2V (Standard)", family: "wan_2.2", mode: "t2v", variant: "standard",
        minVRAM: 14 * 1024 ** 3, recommendedVRAM: 24 * 1024 ** 3,
        models: ["wan2.2_t2v_14B_fp16.safetensors"],
        quantizations: ["fp16", "fp8", "q8"],
        description: "Text-to-video with Wan 2.2 14B model, full precision",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },
      {
        name: "Wan 2.2 T2V (Low VRAM)", family: "wan_2.2", mode: "t2v", variant: "low_vram",
        minVRAM: 4 * 1024 ** 3, recommendedVRAM: 8 * 1024 ** 3,
        models: ["wan2.2_t2v_14B_q4.gguf"],
        quantizations: ["q4", "q3", "q2"],
        description: "Text-to-video with Wan 2.2, GGUF quantized for low VRAM",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },

      // ─── Wan 2.2 I2V ────────────────────────────────────────────
      {
        name: "Wan 2.2 I2V (Standard)", family: "wan_2.2", mode: "i2v", variant: "standard",
        minVRAM: 12 * 1024 ** 3, recommendedVRAM: 24 * 1024 ** 3,
        models: ["wan2.2_i2v_14B_fp16.safetensors"],
        quantizations: ["fp16", "fp8", "q8"],
        description: "Image-to-video with Wan 2.2",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },
      {
        name: "Wan 2.2 I2V (Low VRAM)", family: "wan_2.2", mode: "i2v", variant: "low_vram",
        minVRAM: 4 * 1024 ** 3, recommendedVRAM: 8 * 1024 ** 3,
        models: ["wan2.2_i2v_14B_q4.gguf"],
        quantizations: ["q4", "q3"],
        description: "Image-to-video with Wan 2.2, GGUF quantized",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },

      // ─── Wan 2.2 Animate ────────────────────────────────────────
      {
        name: "Wan 2.2 Animate (Standard)", family: "wan_2.2_animate", mode: "ti2v", variant: "standard",
        minVRAM: 16 * 1024 ** 3, recommendedVRAM: 24 * 1024 ** 3,
        models: ["wan2.2_animate_fp16.safetensors"],
        quantizations: ["fp16", "fp8", "q8"],
        description: "Animation pipeline with Wan 2.2 Animate",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },
      {
        name: "Wan 2.2 Animate (Low VRAM)", family: "wan_2.2_animate", mode: "ti2v", variant: "low_vram",
        minVRAM: 6 * 1024 ** 3, recommendedVRAM: 12 * 1024 ** 3,
        models: ["wan2.2_animate_q5.gguf"],
        quantizations: ["q5", "q4", "q3"],
        description: "Animation pipeline, GGUF quantized for 6-8GB VRAM",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },

      // ─── FLUX ───────────────────────────────────────────────────
      {
        name: "FLUX.1 Schnell (Standard)", family: "flux", mode: "txt2img", variant: "standard",
        minVRAM: 8 * 1024 ** 3, recommendedVRAM: 16 * 1024 ** 3,
        models: ["flux1-schnell.safetensors"],
        quantizations: ["fp16", "fp8"],
        description: "Fast image generation with FLUX.1 Schnell (4 steps)",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },
      {
        name: "FLUX.1 Dev (Quality)", family: "flux", mode: "txt2img", variant: "quality",
        minVRAM: 16 * 1024 ** 3, recommendedVRAM: 24 * 1024 ** 3,
        models: ["flux1-dev.safetensors"],
        quantizations: ["fp16", "fp8"],
        description: "High-quality image generation with FLUX.1 Dev",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "FLUX.1 [dev] non-commercial",
      },

      // ─── Hunyuan Video ──────────────────────────────────────────
      {
        name: "Hunyuan Video (Standard)", family: "hunyuan", mode: "t2v", variant: "standard",
        minVRAM: 20 * 1024 ** 3, recommendedVRAM: 24 * 1024 ** 3,
        models: ["hunyuan_video_fp16.safetensors"],
        quantizations: ["fp16"],
        description: "Text-to-video with HunyuanVideo",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Tencent Community License",
      },

      // ─── LTX Video ──────────────────────────────────────────────
      {
        name: "LTX Video (Standard)", family: "ltx", mode: "t2v", variant: "standard",
        minVRAM: 6 * 1024 ** 3, recommendedVRAM: 12 * 1024 ** 3,
        models: ["ltx-video-sft-v0.9.safetensors"],
        quantizations: ["fp16", "fp8"],
        description: "Fast video generation with LTX-Video",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },

      // ─── Wan 2.1 (Legacy) ──────────────────────────────────────
      {
        name: "Wan 2.1 T2V", family: "wan_2.1", mode: "t2v", variant: "standard",
        minVRAM: 10 * 1024 ** 3, recommendedVRAM: 24 * 1024 ** 3,
        models: ["wan2.1_t2v_14B_fp16.safetensors"],
        quantizations: ["fp16", "fp8", "q4"],
        description: "Legacy Wan 2.1 text-to-video (use 2.2 for new projects)",
        sourceRepo: "The_frizzy1-Workflows", sourceLicense: "MIT", modelLicense: "Apache-2.0",
      },
    ];

    for (const wf of workflows) {
      const full: CatalogWorkflow = { ...wf, id: generateId() };
      this.workflows.set(full.id, full);
    }

    this.logger.info(`Registered ${workflows.length} catalog workflows`);
  }

  /**
   * Find the best workflow for a capability + hardware combination.
   */
  findBest(
    family: CatalogWorkflow["family"],
    mode: CatalogWorkflow["mode"],
    availableVRAM: Bytes,
  ): CatalogWorkflow | null {
    const candidates = [...this.workflows.values()]
      .filter((w) => w.family === family && w.mode === mode && w.minVRAM <= availableVRAM)
      .sort((a, b) => a.minVRAM - b.minVRAM); // Prefer lowest VRAM requirement

    return candidates[0] ?? null;
  }

  /**
   * Get all workflows for a given family.
   */
  getByFamily(family: CatalogWorkflow["family"]): CatalogWorkflow[] {
    return [...this.workflows.values()].filter((w) => w.family === family);
  }

  /**
   * Get all low-VRAM workflows.
   */
  getLowVRAM(maxVRAM: Bytes): CatalogWorkflow[] {
    return [...this.workflows.values()].filter((w) => w.variant === "low_vram" && w.minVRAM <= maxVRAM);
  }

  getAll(): CatalogWorkflow[] { return [...this.workflows.values()]; }
}
