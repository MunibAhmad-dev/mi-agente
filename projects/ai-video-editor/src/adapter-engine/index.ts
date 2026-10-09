/**
 * AI Creative OS - Adapter Engine Index
 * 
 * Exports all adapters and the AdapterRegistry that manages them.
 * The adapter layer provides uniform interfaces to external tools.
 * No logic specific to a tool lives in Core.
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import { FFmpegAdapter } from "./ffmpeg.js";
import { OpenCVAdapter } from "./opencv.js";
import { WhisperAdapter } from "./whisper.js";
import { PySceneDetectAdapter } from "./pyscenedetect.js";
import { OpenTimelineIOAdapter } from "./opentimelineio.js";
import { ComfyUIAdapter } from "./comfyui.js";
import { DaVinciAdapter } from "./davinci.js";
import { CapCutAdapter } from "./capcut.js";
import { AfterEffectsAdapter } from "./aftereffects.js";
import { CanvaAdapter } from "./canva.js";
import { KdenliveAdapter } from "./kdenlive.js";
import { BlenderAdapter } from "./blender.js";
import { NatronAdapter } from "./natron.js";
import { WanAdapter } from "./wan.js";
import { RemotionAdapter } from "./remotion.js";
import { StableDiffusionAdapter } from "./stablediffusion.js";
import type { UniqueId } from "../types/index.js";
import { EventBus, Logger, Registry } from "../core/index.js";

// Re-export all adapters
export { BaseAdapter, type AutomationMethod } from "./base.js";
export { FFmpegAdapter } from "./ffmpeg.js";
export { OpenCVAdapter } from "./opencv.js";
export { WhisperAdapter } from "./whisper.js";
export { PySceneDetectAdapter } from "./pyscenedetect.js";
export { OpenTimelineIOAdapter } from "./opentimelineio.js";
export { ComfyUIAdapter } from "./comfyui.js";
export { DaVinciAdapter } from "./davinci.js";
export { CapCutAdapter } from "./capcut.js";
export { AfterEffectsAdapter } from "./aftereffects.js";
export { CanvaAdapter } from "./canva.js";
export { KdenliveAdapter } from "./kdenlive.js";
export { BlenderAdapter } from "./blender.js";
export { NatronAdapter } from "./natron.js";
export { WanAdapter } from "./wan.js";
export { RemotionAdapter } from "./remotion.js";
export { StableDiffusionAdapter } from "./stablediffusion.js";
export type { WanFamily, WanGenerationOptions } from "./wan.js";
export type { ImageModelFamily, ImageGenOptions } from "./stablediffusion.js";

// ─── Adapter Registry ────────────────────────────────────────────────────────

export class AdapterRegistry extends Registry<BaseAdapter> {
  private logger = new Logger("AdapterRegistry");

  register(adapter: BaseAdapter): void {
    super.register(adapter);
    this.logger.debug(`Registered adapter: ${adapter.name}`);
  }

  getInstalled(): BaseAdapter[] {
    return this.filter((a) => a.isInstalled);
  }

  getByName(name: string): BaseAdapter | undefined {
    return this.find((a) => a.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Detect all registered adapters and update their status.
   */
  async detectAll(): Promise<AdapterDetectionResult[]> {
    const results: AdapterDetectionResult[] = [];
    for (const adapter of this.getAll()) {
      try {
        const detected = await adapter.detect();
        results.push({ id: adapter.id, name: adapter.name, detected, version: adapter.detectedVersion });
      } catch (err) {
        results.push({
          id: adapter.id,
          name: adapter.name,
          detected: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }
}

export interface AdapterDetectionResult {
  id: UniqueId;
  name: string;
  detected: boolean;
  version?: string | null;
  error?: string;
}

// ─── Factory: Create All Adapters ────────────────────────────────────────────

export function createAllAdapters(): BaseAdapter[] {
  return [
    new FFmpegAdapter("adapter.ffmpeg", "FFmpeg"),
    new OpenCVAdapter("adapter.opencv", "OpenCV"),
    new WhisperAdapter("adapter.whisper", "Whisper"),
    new PySceneDetectAdapter("adapter.pyscenedetect", "PySceneDetect"),
    new OpenTimelineIOAdapter("adapter.opentimelineio", "OpenTimelineIO"),
    new ComfyUIAdapter("adapter.comfyui", "ComfyUI"),
    new DaVinciAdapter("adapter.davinci", "DaVinci Resolve"),
    new CapCutAdapter("adapter.capcut", "CapCut"),
    new AfterEffectsAdapter("adapter.aftereffects", "After Effects"),
    new CanvaAdapter("adapter.canva", "Canva"),
    new KdenliveAdapter("adapter.kdenlive", "Kdenlive"),
    new BlenderAdapter("adapter.blender", "Blender"),
    new NatronAdapter("adapter.natron", "Natron"),
    new WanAdapter("adapter.wan", "Wan"),
    new RemotionAdapter("adapter.remotion", "Remotion"),
    new StableDiffusionAdapter("adapter.stablediffusion", "Stable Diffusion / SDXL / FLUX"),
  ];
}

// ─── Create Adapter Registry ─────────────────────────────────────────────────

export function createAdapterRegistry(eventBus: EventBus): AdapterRegistry {
  const registry = new AdapterRegistry("AdapterRegistry");
  for (const adapter of createAllAdapters()) {
    registry.register(adapter);
  }
  return registry;
}
