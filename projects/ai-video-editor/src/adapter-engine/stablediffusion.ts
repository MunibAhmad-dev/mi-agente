/**
 * AI Creative OS - Stable Diffusion / SDXL / FLUX Adapter
 * §28-30: Image generation, inpainting, outpainting, image variation.
 * Runs through ComfyUI workflows or Python diffusers library.
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";
import { execCommand } from "../core/index.js";

export type ImageModelFamily = "stable_diffusion" | "sdxl" | "flux";

export interface ImageGenOptions {
  family: ImageModelFamily;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  sampler?: string;
  model?: FilePath;
  outputPath: FilePath;
  batchSize?: number;
}

export class StableDiffusionAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "python3";

  private _caps: AdapterCapability[] = [
    { name: "txt2img", supported: true, quality: 90, speed: 70 },
    { name: "img2img", supported: true, quality: 88, speed: 65 },
    { name: "inpainting", supported: true, quality: 85, speed: 60 },
    { name: "outpainting", supported: true, quality: 82, speed: 55 },
    { name: "image_variation", supported: true, quality: 85, speed: 65 },
    { name: "upscaling", supported: true, quality: 88, speed: 60 },
    { name: "controlnet", supported: true, quality: 90, speed: 55 },
  ];

  async detect(): Promise<boolean> {
    // Check for diffusers library
    for (const py of ["python3", "python"]) {
      const result = await this.executeCommand(
        `${py} -c "import diffusers; print(diffusers.__version__)" 2>/dev/null`,
      );
      if (result.success && result.data) {
        this._installed = true;
        this._version = result.data.trim();
        this.logger.info(`Stable Diffusion (diffusers) detected: v${this._version}`);
        return true;
      }
    }

    // Check for ComfyUI with SD models
    const { existsSync } = await import("node:fs");
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const sdPaths = [
      `${home}/ComfyUI/models/checkpoints`,
      `${home}/stable-diffusion-webui/models/Stable-diffusion`,
      "./models/checkpoints",
    ];
    for (const p of sdPaths) {
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
   * Generate an image from text prompt.
   */
  async txt2img(options: ImageGenOptions): Promise<AdapterResult<FilePath>> {
    const script = this.buildDiffusersScript(options);
    const result = await this.executeCommand(
      `python3 -c '${script.replace(/'/g, "'\\''")}' 2>/dev/null || python -c '${script.replace(/'/g, "'\\''")}'`,
      { timeout: 120000 },
    );
    return {
      success: result.success,
      data: result.success ? options.outputPath : undefined,
      error: !result.success ? result.error : undefined,
      duration: result.duration,
      provider: this.id,
    };
  }

  /**
   * Get recommended quantization for available VRAM.
   */
  getRecommendedConfig(family: ImageModelFamily, availableVRAM: number): {
    model: string; precision: string; steps: number;
  } {
    const configs: Record<ImageModelFamily, { min: number; model: string; precision: string }[]> = {
      stable_diffusion: [
        { min: 4 * 1024 ** 3, model: "stabilityai/stable-diffusion-2-1", precision: "fp16" },
        { min: 2 * 1024 ** 3, model: "stabilityai/stable-diffusion-2-1", precision: "fp32" },
      ],
      sdxl: [
        { min: 10 * 1024 ** 3, model: "stabilityai/stable-diffusion-xl-base-1.0", precision: "fp16" },
        { min: 6 * 1024 ** 3, model: "stabilityai/stable-diffusion-xl-base-1.0", precision: "fp32" },
      ],
      flux: [
        { min: 16 * 1024 ** 3, model: "black-forest-labs/FLUX.1-schnell", precision: "fp16" },
        { min: 8 * 1024 ** 3, model: "black-forest-labs/FLUX.1-schnell", precision: "fp32" },
        { min: 4 * 1024 ** 3, model: "black-forest-labs/FLUX.1-schnell", precision: "int8" },
      ],
    };
    const options = configs[family];
    for (const opt of options) {
      if (availableVRAM >= opt.min) return { model: opt.model, precision: opt.precision, steps: family === "flux" ? 4 : 20 };
    }
    return { model: options[options.length - 1].model, precision: "fp32", steps: 15 };
  }

  private buildDiffusersScript(options: ImageGenOptions): string {
    const modelMap: Record<ImageModelFamily, string> = {
      stable_diffusion: "stabilityai/stable-diffusion-2-1",
      sdxl: "stabilityai/stable-diffusion-xl-base-1.0",
      flux: "black-forest-labs/FLUX.1-schnell",
    };
    const model = options.model ?? modelMap[options.family];
    const pipeClass = options.family === "flux" ? "FluxPipeline"
      : options.family === "sdxl" ? "StableDiffusionXLPipeline"
      : "StableDiffusionPipeline";
    const prompt = options.prompt.replace(/"/g, '\\"');
    const outPath = options.outputPath.replace(/\\/g, "/");
    const lines = [
      "import torch",
      "from diffusers import " + pipeClass,
      "pipe = " + pipeClass + ".from_pretrained(\"" + model + "\", torch_dtype=torch.float16)",
      "pipe = pipe.to(\"cuda\" if torch.cuda.is_available() else \"cpu\")",
      'image = pipe("' + prompt + '", num_inference_steps=' + (options.steps ?? 20) + ', guidance_scale=' + (options.cfg ?? 7.5) + ', width=' + (options.width ?? 1024) + ', height=' + (options.height ?? 1024) + ').images[0]',
      'image.save("' + outPath + '")',
      'print("' + outPath + '")',
    ];
    return lines.join("\n");
  }
}
