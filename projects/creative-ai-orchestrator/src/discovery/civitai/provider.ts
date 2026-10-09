// ============================================================================
// Civitai Discovery Provider
// ============================================================================
// Searches checkpoints, LoRA, embeddings, resources, workflows.
// Uses official Civitai API.
// ============================================================================

import type {
  DiscoveryResult,
  DiscoveredResource,
  LicenseInfo,
  CaioConfig,
} from "../../core/types/index.js";

interface CivitaiModel {
  id: number;
  name: string;
  description?: string;
  type?: string;
  creator?: { username: string };
  stats?: {
    downloadCount?: number;
    rating?: number;
    ratingCount?: number;
    favoriteCount?: number;
    commentCount?: number;
  };
  modelVersions?: Array<{
    id: number;
    name: string;
    baseModel?: string;
    files?: Array<{
      name: string;
      sizeKb?: number;
      type?: string;
      metadata?: { format?: string };
    }>;
    images?: Array<{ url: string }>;
  }>;
  tags?: string[];
}

interface CivitaiSearchResponse {
  items: CivitaiModel[];
  metadata?: { totalItems: number; currentPage: number; pageSize: number };
}

export class CivitaiDiscoveryProvider {
  private baseUrl = "https://civitai.com/api/v1";
  private apiKey: string;

  constructor(config: CaioConfig) {
    this.civitaiApiKey = config.civitaiApiKey;
    this.apiKey = config.civitaiApiKey;
  }

  private civitaiApiKey: string;

  private async apiFetch(path: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Civitai API error ${res.status}: ${await res.text()}`);
    }

    return res.json();
  }

  /**
   * Search models on Civitai.
   */
  async search(query: string, options?: {
    type?: string; // checkpoint, lora, etc.
    sort?: "Most Downloaded" | "Most Liked" | "Newest";
    baseModel?: string; // SDXL, SD 1.5, Flux, etc.
    limit?: number;
  }): Promise<DiscoveryResult> {
    const start = Date.now();
    const limit = options?.limit ?? 20;

    const params: Record<string, string> = {
      query,
      limit: String(limit),
      sort: options?.sort || "Most Downloaded",
    };

    if (options?.type) params.types = options.type;
    if (options?.baseModel) params.baseModels = options.baseModel;

    const data: CivitaiSearchResponse = await this.apiFetch("/models", params);

    const results: DiscoveredResource[] = data.items.map((m) => ({
      id: String(m.id),
      name: m.name,
      description: m.description?.slice(0, 200) || "",
      url: `https://civitai.com/models/${m.id}`,
      source: "civitai" as const,
      downloads: m.stats?.downloadCount,
      stars: m.stats?.favoriteCount,
      license: this.inferLicense(m),
      overallScore: this.calculateScore(m),
      tags: m.tags || [],
      metadata: {
        type: m.type,
        creator: m.creator?.username,
        rating: m.stats?.rating,
        ratingCount: m.stats?.ratingCount,
        versions: m.modelVersions?.length,
      },
    }));

    return {
      provider: "civitai",
      query,
      results,
      totalResults: data.metadata?.totalItems ?? data.items.length,
      searchTime: Date.now() - start,
      cached: false,
    };
  }

  /**
   * Search for checkpoints.
   */
  async searchCheckpoints(query: string, limit?: number): Promise<DiscoveryResult> {
    return this.search(query, { type: "Checkpoint", limit });
  }

  /**
   * Search for LoRA models.
   */
  async searchLora(query: string, limit?: number): Promise<DiscoveryResult> {
    return this.search(query, { type: "LORA", limit });
  }

  /**
   * Get model details.
   */
  async inspectModel(modelId: number): Promise<CivitaiModel> {
    return this.apiFetch(`/models/${modelId}`);
  }

  /**
   * Get model version details.
   */
  async inspectVersion(versionId: number): Promise<any> {
    return this.apiFetch(`/model-versions/${versionId}`);
  }

  /**
   * Civitai doesn't always expose explicit licenses.
   * Use CreativeML OpenRAIL-M as default for unknown.
   */
  private inferLicense(model: CivitaiModel): LicenseInfo {
    // Civitai models often don't have explicit licenses
    // We return a cautious default
    return {
      name: "Check model page for license",
      commercialUse: false, // Conservative until verified
      modificationAllowed: false,
      redistributionAllowed: false,
      copyleft: false,
      additionalTerms: "License must be verified on the Civitai model page",
    };
  }

  private calculateScore(model: CivitaiModel): number {
    let score = 0;
    const downloads = model.stats?.downloadCount || 0;
    const favorites = model.stats?.favoriteCount || 0;
    const rating = model.stats?.rating || 0;
    const ratingCount = model.stats?.ratingCount || 0;

    score += Math.min(Math.log10(downloads + 1) * 10, 35);
    score += Math.min(favorites / 10, 20);
    score += Math.min(rating * 15, 20);
    score += Math.min(ratingCount / 5, 10);
    if (model.modelVersions && model.modelVersions.length > 0) {
      score += 5;
    }
    if (model.tags && model.tags.length > 0) {
      score += Math.min(model.tags.length, 10);
    }

    return Math.round(Math.min(score, 100));
  }
}
