// ============================================================================
// Model Manager
// ============================================================================
// Manages checkpoints, LoRA, VAE, ControlNet, embeddings, video models,
// upscalers, encoders. Global model store avoids duplicates.
// ============================================================================

import type {
  ModelDefinition,
  ModelId,
  ModelType,
  CaioDatabase,
} from "../../core/types/index.js";
import { newId } from "../../core/types/index.js";
import fs from "node:fs";
import { createHash } from "node:crypto";

export class ModelManager {
  constructor(
    private db: CaioDatabase,
    private modelsDir: string
  ) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  /**
   * Register a model in the database.
   */
  register(model: Omit<ModelDefinition, "id">): ModelDefinition {
    const id = newId() as ModelId;

    this.db.run(
      `INSERT INTO models (id, name, type, source_provider, source_url, source_author,
       license_name, license_url, license_spdx, license_commercial, license_modification,
       license_redistribution, license_copyleft, additional_terms,
       size_bytes, hash, format, vram_estimate_mb, tags, installed, installed_path, installed_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      model.name,
      model.type,
      model.source.provider,
      model.source.url,
      model.source.author || null,
      model.license.name,
      model.license.url || null,
      model.license.spdxId || null,
      model.license.commercialUse ? 1 : 0,
      model.license.modificationAllowed ? 1 : 0,
      model.license.redistributionAllowed ? 1 : 0,
      model.license.copyleft ? 1 : 0,
      model.license.additionalTerms || null,
      model.sizeBytes,
      model.hash || null,
      model.format || null,
      model.vramEstimateMb || null,
      JSON.stringify(model.tags),
      model.installed ? 1 : 0,
      model.installedPath || null,
      model.installedHash || null
    );

    return { ...model, id };
  }

  /**
   * Get a model by ID.
   */
  getModel(id: ModelId): ModelDefinition | null {
    const row = this.db.get<Record<string, any>>("SELECT * FROM models WHERE id = ?", id);
    if (!row) return null;
    return this.rowToModel(row);
  }

  /**
   * Find model by hash (dedup).
   */
  findByHash(hash: string): ModelDefinition | null {
    const row = this.db.get<Record<string, any>>("SELECT * FROM models WHERE hash = ? OR installed_hash = ?", hash, hash);
    if (!row) return null;
    return this.rowToModel(row);
  }

  /**
   * List all models, optionally filtered by type.
   */
  listModels(type?: ModelType): ModelDefinition[] {
    const sql = type
      ? "SELECT * FROM models WHERE type = ? ORDER BY name"
      : "SELECT * FROM models ORDER BY name";
    const rows = type
      ? this.db.all<Record<string, any>>(sql, type)
      : this.db.all<Record<string, any>>(sql);
    return rows.map((r) => this.rowToModel(r));
  }

  /**
   * List only installed models.
   */
  listInstalled(type?: ModelType): ModelDefinition[] {
    const sql = type
      ? "SELECT * FROM models WHERE installed = 1 AND type = ? ORDER BY name"
      : "SELECT * FROM models WHERE installed = 1 ORDER BY name";
    const rows = type
      ? this.db.all<Record<string, any>>(sql, type)
      : this.db.all<Record<string, any>>(sql);
    return rows.map((r) => this.rowToModel(r));
  }

  /**
   * Search models by name or tag.
   */
  search(query: string): ModelDefinition[] {
    const sql = "SELECT * FROM models WHERE name LIKE ? OR tags LIKE ? ORDER BY name";
    const pattern = `%${query}%`;
    return this.db.all<Record<string, any>>(sql, pattern, pattern).map((r) => this.rowToModel(r));
  }

  /**
   * Mark a model as installed.
   */
  markInstalled(id: ModelId, path: string, hash?: string): void {
    this.db.run(
      "UPDATE models SET installed = 1, installed_path = ?, installed_hash = ? WHERE id = ?",
      path,
      hash || null,
      id
    );
  }

  /**
   * Mark a model as not installed.
   */
  markUninstalled(id: ModelId): void {
    this.db.run("UPDATE models SET installed = 0, installed_path = NULL, installed_hash = NULL WHERE id = ?", id);
  }

  /**
   * Delete a model registration.
   */
  deleteModel(id: ModelId): void {
    this.db.run("DELETE FROM models WHERE id = ?", id);
  }

  /**
   * Compute file hash (SHA-256).
   */
  static computeHash(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Get disk usage of installed models.
   */
  getDiskUsage(): { totalSizeMb: number; modelCount: number } {
    const result = this.db.get<{ total: number; count: number }>(
      "SELECT COALESCE(SUM(size_bytes), 0) as total, COUNT(*) as count FROM models WHERE installed = 1"
    );
    return {
      totalSizeMb: Math.round((result?.total || 0) / (1024 * 1024)),
      modelCount: result?.count || 0,
    };
  }

  private rowToModel(row: Record<string, any>): ModelDefinition {
    return {
      id: row.id as ModelId,
      name: row.name,
      type: row.type as ModelType,
      source: {
        provider: row.source_provider || "local",
        url: row.source_url || "",
        author: row.source_author || undefined,
      },
      url: row.source_url || "",
      hash: row.hash || undefined,
      sizeBytes: row.size_bytes || 0,
      license: {
        spdxId: row.license_spdx || undefined,
        name: row.license_name || "Unknown",
        url: row.license_url || undefined,
        commercialUse: !!row.license_commercial,
        modificationAllowed: !!row.license_modification,
        redistributionAllowed: !!row.license_redistribution,
        copyleft: !!row.license_copyleft,
        additionalTerms: row.additional_terms || undefined,
      },
      format: row.format || undefined,
      vramEstimateMb: row.vram_estimate_mb || undefined,
      tags: JSON.parse(row.tags || "[]"),
      installed: !!row.installed,
      installedPath: row.installed_path || undefined,
      installedHash: row.installed_hash || undefined,
    };
  }
}
