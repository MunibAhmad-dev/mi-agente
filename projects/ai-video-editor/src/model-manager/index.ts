/**
 * AI Creative OS - Model Manager
 * §98: Shows Model, Version, VRAM, RAM, License, Provider, Location, Status
 */

import type { UniqueId, Bytes, Score } from "../types/index.js";
import { Logger, EventBus, generateId, timestamp, StorageEngine } from "../core/index.js";

export interface ModelEntry {
  id: UniqueId;
  name: string;
  family: string;
  version: string;
  vramRequired: Bytes;
  ramRequired: Bytes;
  license: string;
  provider: string;
  location?: string;
  status: "detected" | "downloaded" | "loading" | "ready" | "error" | "missing";
  quantizations: string[];
  selectedQuantization?: string;
  checksum?: string;
  sourceUrl?: string;
  downloadedAt?: number;
  lastUsedAt?: number;
  size: Bytes;
}

export class ModelManager {
  private logger = new Logger("ModelManager");
  private eventBus: EventBus;
  private models = new Map<UniqueId, ModelEntry>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.registerBuiltinModels();
  }

  private registerBuiltinModels(): void {
    const models: Omit<ModelEntry, "id">[] = [
      { name: "Wan 2.2 T2V 14B", family: "wan_2.2", version: "14B", vramRequired: 14 * 1024 ** 3, ramRequired: 16 * 1024 ** 3, license: "Apache-2.0", provider: "provider.wan", status: "missing", quantizations: ["fp16", "fp8", "q8", "q6", "q5", "q4", "q3", "q2"], size: 28 * 1024 ** 3 },
      { name: "Wan 2.2 I2V 14B", family: "wan_2.2", version: "14B", vramRequired: 12 * 1024 ** 3, ramRequired: 16 * 1024 ** 3, license: "Apache-2.0", provider: "provider.wan", status: "missing", quantizations: ["fp16", "fp8", "q8", "q4"], size: 28 * 1024 ** 3 },
      { name: "Wan 2.2 Animate", family: "wan_2.2_animate", version: "latest", vramRequired: 16 * 1024 ** 3, ramRequired: 16 * 1024 ** 3, license: "Apache-2.0", provider: "provider.wan", status: "missing", quantizations: ["fp16", "fp8", "q8", "q5", "q4", "q3"], size: 32 * 1024 ** 3 },
      { name: "Wan 2.1 T2V 14B", family: "wan_2.1", version: "14B", vramRequired: 10 * 1024 ** 3, ramRequired: 12 * 1024 ** 3, license: "Apache-2.0", provider: "provider.wan", status: "missing", quantizations: ["fp16", "fp8", "q4"], size: 28 * 1024 ** 3 },
      { name: "FLUX.1 Schnell", family: "flux", version: "1.0", vramRequired: 8 * 1024 ** 3, ramRequired: 8 * 1024 ** 3, license: "Apache-2.0", provider: "provider.comfyui", status: "missing", quantizations: ["fp16", "fp8"], size: 24 * 1024 ** 3 },
      { name: "FLUX.1 Dev", family: "flux", version: "1.0", vramRequired: 16 * 1024 ** 3, ramRequired: 16 * 1024 ** 3, license: "FLUX.1 [dev] non-commercial", provider: "provider.comfyui", status: "missing", quantizations: ["fp16", "fp8"], size: 24 * 1024 ** 3 },
      { name: "Stable Diffusion XL", family: "sdxl", version: "1.0", vramRequired: 6 * 1024 ** 3, ramRequired: 8 * 1024 ** 3, license: "CreativeML Open RAIL-M", provider: "provider.comfyui", status: "missing", quantizations: ["fp16", "fp8"], size: 6 * 1024 ** 3 },
      { name: "Stable Diffusion 2.1", family: "stable_diffusion", version: "2.1", vramRequired: 4 * 1024 ** 3, ramRequired: 4 * 1024 ** 3, license: "CreativeML Open RAIL-M", provider: "provider.comfyui", status: "missing", quantizations: ["fp16", "fp32"], size: 4 * 1024 ** 3 },
      { name: "HunyuanVideo", family: "hunyuan", version: "1.0", vramRequired: 20 * 1024 ** 3, ramRequired: 24 * 1024 ** 3, license: "Tencent Community License", provider: "provider.comfyui", status: "missing", quantizations: ["fp16"], size: 40 * 1024 ** 3 },
      { name: "LTX Video", family: "ltx", version: "0.9", vramRequired: 6 * 1024 ** 3, ramRequired: 8 * 1024 ** 3, license: "Apache-2.0", provider: "provider.comfyui", status: "missing", quantizations: ["fp16", "fp8"], size: 12 * 1024 ** 3 },
      { name: "Whisper Base", family: "whisper", version: "base", vramRequired: 1 * 1024 ** 3, ramRequired: 2 * 1024 ** 3, license: "MIT", provider: "provider.whisper", status: "missing", quantizations: ["fp16", "fp32"], size: 140 * 1024 ** 2 },
      { name: "Whisper Large v3", family: "whisper", version: "large-v3", vramRequired: 4 * 1024 ** 3, ramRequired: 6 * 1024 ** 3, license: "MIT", provider: "provider.whisper", status: "missing", quantizations: ["fp16", "int8"], size: 3 * 1024 ** 3 },
    ];

    for (const m of models) {
      const entry: ModelEntry = { ...m, id: generateId() };
      this.models.set(entry.id, entry);
    }
  }

  register(model: Omit<ModelEntry, "id">): ModelEntry {
    const entry: ModelEntry = { ...model, id: generateId() };
    this.models.set(entry.id, entry);
    this.eventBus.emit("MODEL_REGISTERED", "ModelManager", { modelId: entry.id, name: entry.name });
    return entry;
  }

  get(id: UniqueId): ModelEntry | undefined { return this.models.get(id); }
  getAll(): ModelEntry[] { return [...this.models.values()]; }

  getByFamily(family: string): ModelEntry[] {
    return [...this.models.values()].filter((m) => m.family === family);
  }

  getAvailable(): ModelEntry[] {
    return [...this.models.values()].filter((m) => m.status === "ready" || m.status === "downloaded");
  }

  getRecommendedForVRAM(vram: Bytes): ModelEntry[] {
    return [...this.models.values()]
      .filter((m) => m.vramRequired <= vram)
      .sort((a, b) => b.vramRequired - a.vramRequired);
  }

  updateStatus(id: UniqueId, status: ModelEntry["status"]): void {
    const model = this.models.get(id);
    if (model) { model.status = status; }
  }

  selectQuantization(id: UniqueId, quantization: string): boolean {
    const model = this.models.get(id);
    if (!model || !model.quantizations.includes(quantization)) return false;
    model.selectedQuantization = quantization;
    return true;
  }

  getStats(): { total: number; detected: number; downloaded: number; missing: number; byFamily: Record<string, number> } {
    const all = this.getAll();
    const byFamily: Record<string, number> = {};
    for (const m of all) byFamily[m.family] = (byFamily[m.family] ?? 0) + 1;
    return {
      total: all.length,
      detected: all.filter((m) => m.status !== "missing").length,
      downloaded: all.filter((m) => m.status === "downloaded" || m.status === "ready").length,
      missing: all.filter((m) => m.status === "missing").length,
      byFamily,
    };
  }
}
