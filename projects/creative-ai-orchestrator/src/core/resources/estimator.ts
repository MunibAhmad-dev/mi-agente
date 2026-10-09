// ============================================================================
// Resource Estimator
// ============================================================================
// Estimates VRAM, RAM, storage, and runtime for workflows.
// Uses hardware profile + model metadata + node requirements.
// ============================================================================

import type { HardwareProfile, Workflow } from "../types/index.js";

export interface ResourceEstimate {
  vramMb: number;
  ramMb: number;
  storageMb: number;
  runtimeSeconds: number;
  fitsHardware: boolean;
  bottleneck: string | null;
  suggestions: string[];
}

// Model VRAM requirements (in MB) — curated database
const MODEL_VRAM: Record<string, number> = {
  // Checkpoints
  "sdxl": 6500, "sd_xl_base": 6500, "sd_xl_refiner": 6500,
  "sd_1_5": 4000, "sd_2_1": 5000, "stable_diffusion": 4000,
  "flux_dev": 12000, "flux_schnell": 8000,
  "anything_v5": 4000, "dreamshaper": 4000,
  // LoRA
  "lora": 200, "lycoris": 200,
  // VAE
  "vae": 300, "sdxl_vae": 350,
  // ControlNet
  "controlnet": 1500,
  // Upscalers
  "upscaler": 500, "esrgan": 500, "real_esrgan": 500,
  // Default
  "default": 4000,
};

// Node VRAM requirements
const NODE_VRAM: Record<string, number> = {
  "KSampler": 500,
  "VAEDecode": 300,
  "VAEEncode": 300,
  "CLIPTextEncode": 100,
  "EmptyLatentImage": 200,
  "CheckpointLoaderSimple": 0, // Loaded by model
  "CheckpointLoader": 0,
  "LoraLoader": 0, // Loaded by model
  "ControlNetLoader": 0,
  "UpscaleModelLoader": 0,
  "SaveImage": 50,
  "PreviewImage": 50,
  "LoadImage": 100,
  "ImageUpscaleWithModel": 500,
  "ImageScale": 200,
  "FaceRestoreModelLoader": 1000,
};

export class ResourceEstimator {
  /**
   * Estimate resources needed for a workflow.
   */
  estimate(
    workflow: Workflow,
    hw?: HardwareProfile,
    modelNames?: string[]
  ): ResourceEstimate {
    let vramMb = 0;
    let ramMb = 512; // Base RAM for Node.js
    let storageMb = 0;
    const suggestions: string[] = [];

    // Estimate VRAM from nodes
    for (const node of workflow.nodes) {
      const nodeVram = NODE_VRAM[node.type] ?? 100;
      vramMb += nodeVram;

      // Check for resolution in EmptyLatentImage
      if (node.type === "EmptyLatentImage") {
        const w = (node.inputs.width as number) || 512;
        const h = (node.inputs.height as number) || 512;
        const pixels = w * h;
        // VRAM scales with resolution
        const resFactor = pixels / (512 * 512);
        vramMb += Math.round(500 * resFactor);

        // Check steps
        if (node.inputs.steps) {
          const steps = node.inputs.steps as number;
          if (steps > 30) suggestions.push("High step count — consider reducing for faster execution");
        }
      }
    }

    // Add model VRAM
    if (modelNames) {
      for (const name of modelNames) {
        const lower = name.toLowerCase();
        for (const [key, vram] of Object.entries(MODEL_VRAM)) {
          if (lower.includes(key)) {
            vramMb += vram;
            break;
          }
        }
      }
    } else {
      vramMb += MODEL_VRAM["default"]!;
    }

    // Estimate storage (models + outputs)
    storageMb = 2000; // Base
    if (modelNames) {
      for (const name of modelNames) {
        const lower = name.toLowerCase();
        if (lower.includes("xl") || lower.includes("flux")) storageMb += 6000;
        else if (lower.includes("sd_1") || lower.includes("1.5")) storageMb += 4000;
        else storageMb += 4000;
      }
    }

    // Estimate runtime (rough)
    const steps = this.getMaxSteps(workflow);
    const pixels = this.getMaxResolution(workflow);
    const pixelsFactor = pixels / (512 * 512);
    const secondsPerStep = 0.5 * pixelsFactor; // ~0.5s per step at 512x512
    const runtimeSeconds = Math.round(steps * secondsPerStep * 1000) / 1000;

    // Check hardware fit
    let fitsHardware = true;
    let bottleneck: string | null = null;

    if (hw) {
      const totalVram = hw.gpus.reduce((s, g) => s + g.vramMb, 0);
      if (totalVram > 0 && vramMb > totalVram) {
        fitsHardware = false;
        bottleneck = `VRAM: needs ${vramMb}MB, have ${totalVram}MB`;
        suggestions.push(`Reduce resolution or enable tiling to fit in ${totalVram}MB VRAM`);
      }
      if (ramMb > hw.ramMb * 0.8) {
        fitsHardware = false;
        bottleneck = bottleneck ? `${bottleneck}; RAM: needs ${ramMb}MB` : `RAM: needs ${ramMb}MB`;
      }
      if (storageMb > hw.freeDiskMb) {
        fitsHardware = false;
        suggestions.push(`Not enough disk space: need ${storageMb}MB, have ${hw.freeDiskMb}MB`);
      }
    }

    if (vramMb > 12000) suggestions.push("High VRAM usage — consider using a smaller model");
    if (runtimeSeconds > 120) suggestions.push("Long execution time — consider reducing steps");

    return {
      vramMb,
      ramMb,
      storageMb,
      runtimeSeconds,
      fitsHardware,
      bottleneck,
      suggestions,
    };
  }

  /**
   * Check if a workflow fits within VRAM budget.
   */
  fitsBudget(workflow: Workflow, budgetMb: number): boolean {
    const estimate = this.estimate(workflow);
    return estimate.vramMb <= budgetMb;
  }

  /**
   * Suggest adaptations to fit hardware.
   */
  suggestAdaptations(workflow: Workflow, availableVramMb: number): string[] {
    const estimate = this.estimate(workflow);
    if (estimate.vramMb <= availableVramMb) return [];

    const suggestions: string[] = [];
    const ratio = availableVramMb / estimate.vramMb;

    if (ratio < 0.5) {
      suggestions.push("Switch to a lighter model (SD 1.5 instead of SDXL)");
      suggestions.push("Reduce resolution to 512x512");
      suggestions.push("Enable tiling for large images");
    } else if (ratio < 0.8) {
      suggestions.push("Reduce resolution by 25%");
      suggestions.push("Enable model offloading");
    } else {
      suggestions.push("Reduce batch size to 1");
      suggestions.push("Use FP16 precision");
    }

    return suggestions;
  }

  private getMaxSteps(workflow: Workflow): number {
    let max = 20;
    for (const node of workflow.nodes) {
      if (node.type === "KSampler" && typeof node.inputs.steps === "number") {
        max = Math.max(max, node.inputs.steps);
      }
    }
    return max;
  }

  private getMaxResolution(workflow: Workflow): number {
    let maxPixels = 512 * 512;
    for (const node of workflow.nodes) {
      if (node.type === "EmptyLatentImage") {
        const w = (node.inputs.width as number) || 512;
        const h = (node.inputs.height as number) || 512;
        maxPixels = Math.max(maxPixels, w * h);
      }
    }
    return maxPixels;
  }
}
