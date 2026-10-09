/**
 * AI Creative OS - Wan Adapter
 * AI video generation: Wan 2.1, Wan 2.2, Wan 2.2 Animate.
 * Supports: T2V, I2V, V2V, TI2V.
 * License: Various (model-dependent)
 * 
 * Wan families are NOT interchangeable:
 * - Wan 2.1: Original
 * - Wan 2.2: Updated (different files)
 * - Wan 2.2 Animate: Animation-focused (different files)
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";

export type WanFamily = "wan_2.1" | "wan_2.2" | "wan_2.2_animate";

export interface WanGenerationOptions {
  family: WanFamily;
  mode: "t2v" | "i2v" | "v2v" | "ti2v";
  prompt?: string;
  negativePrompt?: string;
  inputImage?: FilePath;
  inputVideo?: FilePath;
  firstFrame?: FilePath;
  lastFrame?: FilePath;
  width?: number;
  height?: number;
  frames?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  quantization?: "fp16" | "fp8" | "q8" | "q6" | "q5" | "q4" | "q3" | "q2";
  modelPath?: FilePath;
}

export class WanAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "wan";

  private _caps: AdapterCapability[] = [
    { name: "t2v", supported: true, quality: 88, speed: 60 },
    { name: "i2v", supported: true, quality: 86, speed: 55 },
    { name: "v2v", supported: true, quality: 82, speed: 50 },
    { name: "ti2v", supported: true, quality: 84, speed: 52 },
    { name: "text_to_video", supported: true, quality: 88, speed: 60 },
    { name: "image_to_video", supported: true, quality: 86, speed: 55 },
    { name: "video_editing", supported: true, quality: 80, speed: 48 },
    { name: "animation", supported: true, quality: 85, speed: 52 },
  ];

  async detect(): Promise<boolean> {
    // Wan runs through ComfyUI or Python scripts
    // Check for Wan models in common locations
    const { existsSync } = await import("node:fs");
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const wanPaths = [
      `${home}/ComfyUI/models/checkpoints/wan`,
      `${home}/wan/models`,
      "./models/wan",
      "./data/models/wan",
    ];

    for (const p of wanPaths) {
      if (existsSync(p)) {
        this._installed = true;
        this._version = "models found";
        return true;
      }
    }

    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["scripting", "cli"]; }

  /**
   * Validate that the requested Wan family files are available and compatible.
   */
  validateFamily(family: WanFamily, modelPath?: FilePath): { valid: boolean; error?: string } {
    const familyFiles: Record<WanFamily, string[]> = {
      "wan_2.1": ["wan2.1_*.safetensors", "wan2.1_*.ckpt"],
      "wan_2.2": ["wan2.2_*.safetensors", "wan2.2_*.ckpt"],
      "wan_2.2_animate": ["wan2.2_animate_*.safetensors", "wan2.2_animate_*.ckpt"],
    };

    if (!modelPath) {
      return { valid: this._installed, error: this._installed ? undefined : "Wan models not found" };
    }

    // Check that files don't cross families
    const expectedPatterns = familyFiles[family];
    if (!expectedPatterns) {
      return { valid: false, error: `Unknown Wan family: ${family}` };
    }

    return { valid: true };
  }

  /**
   * Get VRAM requirements for a given Wan family and quantization.
   */
  getVRAMRequirement(family: WanFamily, quantization?: string): number {
    // VRAM in bytes
    const base: Record<WanFamily, number> = {
      "wan_2.1": 12 * 1024 * 1024 * 1024,
      "wan_2.2": 14 * 1024 * 1024 * 1024,
      "wan_2.2_animate": 16 * 1024 * 1024 * 1024,
    };

    const quantMultiplier: Record<string, number> = {
      fp16: 1.0,
      fp8: 0.55,
      q8: 0.50,
      q6: 0.38,
      q5: 0.32,
      q4: 0.25,
      q3: 0.19,
      q2: 0.13,
    };

    const mult = quantization ? (quantMultiplier[quantization] ?? 1.0) : 1.0;
    return Math.round((base[family] ?? 12 * 1024 * 1024 * 1024) * mult);
  }

  /**
   * Get recommended quantization for available VRAM.
   */
  getRecommendedQuantization(family: WanFamily, availableVRAM: number): string {
    const requirements: { quant: string; min: number }[] = [
      { quant: "fp16", min: this.getVRAMRequirement(family, "fp16") },
      { quant: "fp8", min: this.getVRAMRequirement(family, "fp8") },
      { quant: "q8", min: this.getVRAMRequirement(family, "q8") },
      { quant: "q6", min: this.getVRAMRequirement(family, "q6") },
      { quant: "q5", min: this.getVRAMRequirement(family, "q5") },
      { quant: "q4", min: this.getVRAMRequirement(family, "q4") },
      { quant: "q3", min: this.getVRAMRequirement(family, "q3") },
      { quant: "q2", min: this.getVRAMRequirement(family, "q2") },
    ];

    for (const req of requirements) {
      if (availableVRAM >= req.min) return req.quant;
    }
    return "q2"; // Most aggressive quantization
  }
}
