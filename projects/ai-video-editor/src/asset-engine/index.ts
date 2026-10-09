/**
 * AI Creative OS - Asset Engine
 * Manages all creative assets with type, source, license, project, scene,
 * character, version, resolution, metadata, embeddings, and dependencies.
 */

import type { UniqueId, Timestamp, FilePath, MediaType } from "../types/index.js";
import { Logger, EventBus, generateId, timestamp, StorageEngine } from "../core/index.js";

export interface Asset {
  id: UniqueId;
  name: string;
  type: MediaType;
  source: "generated" | "imported" | "recorded" | "downloaded";
  filePath: FilePath;
  license?: string;
  projectIds: UniqueId[];
  sceneIds: UniqueId[];
  characterIds: UniqueId[];
  version: number;
  resolution?: { width: number; height: number };
  duration?: number;
  metadata: Record<string, unknown>;
  embedding?: number[];
  dependencies: UniqueId[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AssetGraph {
  id: UniqueId;
  name: string;
  assets: UniqueId[];
  relationships: { from: UniqueId; to: UniqueId; type: string }[];
}

export class AssetEngine {
  private logger = new Logger("AssetEngine");
  private eventBus: EventBus;
  private storage: StorageEngine;
  private assets = new Map<UniqueId, Asset>();

  constructor(eventBus: EventBus, storage: StorageEngine) {
    this.eventBus = eventBus;
    this.storage = storage;
    this.load();
  }

  /**
   * Register a new asset.
   */
  register(asset: Omit<Asset, "id" | "createdAt" | "updatedAt" | "version">): Asset {
    const full: Asset = {
      ...asset,
      id: generateId(),
      version: 1,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    this.assets.set(full.id, full);
    this.save();
    this.eventBus.emit("ASSET_CREATED", "AssetEngine", { assetId: full.id, type: full.type });
    return full;
  }

  /**
   * Get an asset by ID.
   */
  get(id: UniqueId): Asset | undefined {
    return this.assets.get(id);
  }

  /**
   * List all assets, optionally filtered.
   */
  list(filters?: { type?: MediaType; projectId?: UniqueId; characterId?: UniqueId }): Asset[] {
    let results = [...this.assets.values()];
    if (filters?.type) results = results.filter((a) => a.type === filters.type);
    if (filters?.projectId) results = results.filter((a) => a.projectIds.includes(filters.projectId!));
    if (filters?.characterId) results = results.filter((a) => a.characterIds.includes(filters.characterId!));
    return results;
  }

  /**
   * Update an asset.
   */
  update(id: UniqueId, changes: Partial<Asset>): boolean {
    const asset = this.assets.get(id);
    if (!asset) return false;
    Object.assign(asset, changes, { updatedAt: timestamp(), version: asset.version + 1 });
    this.save();
    return true;
  }

  /**
   * Delete an asset.
   */
  delete(id: UniqueId): boolean {
    const deleted = this.assets.delete(id);
    if (deleted) this.save();
    return deleted;
  }

  /**
   * Get assets that depend on a given asset (reverse dependency lookup).
   */
  getDependents(assetId: UniqueId): Asset[] {
    return [...this.assets.values()].filter((a) => a.dependencies.includes(assetId));
  }

  /**
   * Build the asset graph for a project.
   */
  buildGraph(projectId: UniqueId): AssetGraph {
    const projectAssets = this.list({ projectId });
    const relationships: AssetGraph["relationships"] = [];

    for (const asset of projectAssets) {
      for (const depId of asset.dependencies) {
        if (this.assets.has(depId)) {
          relationships.push({ from: depId, to: asset.id, type: "dependency" });
        }
      }
      for (const charId of asset.characterIds) {
        relationships.push({ from: charId, to: asset.id, type: "character" });
      }
    }

    return {
      id: generateId(),
      name: `Asset Graph for project ${projectId}`,
      assets: projectAssets.map((a) => a.id),
      relationships,
    };
  }

  /**
   * Get total size of all assets.
   */
  getTotalSize(): number {
    return [...this.assets.values()].reduce((sum, a) => {
      return sum + ((a.metadata["fileSize"] as number) ?? 0);
    }, 0);
  }

  getStats(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const asset of this.assets.values()) {
      byType[asset.type] = (byType[asset.type] ?? 0) + 1;
    }
    return { total: this.assets.size, byType };
  }

  private save(): void {
    this.storage.write("assets/index.json", [...this.assets.values()]);
  }

  private load(): void {
    try {
      const data = this.storage.read<Asset[]>("assets/index.json");
      if (data) {
        for (const a of data) this.assets.set(a.id, a);
      }
    } catch {}
  }
}
