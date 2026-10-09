// ============================================================================
// HuggingFace Discovery Provider
// ============================================================================
// Searches models, datasets, Spaces, adapters, LoRA, VAE, etc.
// Uses official HuggingFace Hub API.
// ============================================================================

import type {
  DiscoveryResult,
  DiscoveredResource,
  LicenseInfo,
  CaioConfig,
} from "../../core/types/index.js";

interface HFSearchResult {
  id: string;
  modelId?: string;
  author?: string;
  pipeline_tag?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  lastModified?: string;
  private?: boolean;
  disabled?: boolean;
  gated?: boolean;
  cardData?: {
    license?: string;
    license_name?: string;
    license_url?: string;
    library_name?: string;
    tags?: string[];
    inference?: boolean;
  };
  siblings?: Array<{
    rfilename: string;
    size?: number;
  }>;
}

export class HuggingFaceDiscoveryProvider {
  private baseUrl = "https://huggingface.co/api";
  private token: string;

  constructor(config: CaioConfig) {
    this.token = config.huggingfaceToken;
  }

  private async apiFetch(path: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`HuggingFace API error ${res.status}: ${await res.text()}`);
    }

    return res.json();
  }

  /**
   * Search models on HuggingFace Hub.
   */
  async searchModels(query: string, options?: {
    pipelineTag?: string;
    library?: string;
    sort?: "downloads" | "likes" | "modified";
    limit?: number;
  }): Promise<DiscoveryResult> {
    const start = Date.now();
    const limit = options?.limit ?? 20;

    const params: Record<string, string> = {
      search: query,
      limit: String(limit),
      sort: options?.sort || "downloads",
      direction: "-1",
    };

    if (options?.pipelineTag) params.pipeline_tag = options.pipelineTag;
    if (options?.library) params.library = options.library;

    const data: HFSearchResult[] = await this.apiFetch("/models", params);

    const results: DiscoveredResource[] = data
      .filter((m) => !m.disabled)
      .map((m) => ({
        id: m.id,
        name: m.modelId || m.id,
        description: m.pipeline_tag || "",
        url: `https://huggingface.co/${m.modelId || m.id}`,
        source: "huggingface" as const,
        downloads: m.downloads,
        stars: m.likes,
        lastUpdated: m.lastModified ? new Date(m.lastModified) : undefined,
        license: this.parseLicense(m.cardData?.license, m.cardData?.license_name),
        overallScore: this.calculateScore(m),
        tags: m.tags || [],
        metadata: {
          pipelineTag: m.pipeline_tag,
          libraryName: m.cardData?.library_name,
          gated: m.gated,
          private: m.private,
          siblings: m.siblings?.length,
        },
      }));

    return {
      provider: "huggingface",
      query,
      results,
      totalResults: data.length,
      searchTime: Date.now() - start,
      cached: false,
    };
  }

  /**
   * Search for LoRA models.
   */
  async searchLora(query: string, limit?: number): Promise<DiscoveryResult> {
    return this.searchModels(query, { sort: "downloads", limit });
  }

  /**
   * Search for VAE models.
   */
  async searchVae(query: string, limit?: number): Promise<DiscoveryResult> {
    return this.searchModels(query, { library: "diffusers", limit });
  }

  /**
   * Get model details.
   */
  async inspectModel(modelId: string): Promise<any> {
    return this.apiFetch(`/models/${modelId}`);
  }

  /**
   * Get model files (siblings).
   */
  async inspectModelFiles(modelId: string): Promise<Array<{ path: string; size?: number }>> {
    const data = await this.apiFetch(`/models/${modelId}`);
    return (data.siblings || []).map((s: any) => ({
      path: s.rfilename,
      size: s.size,
    }));
  }

  /**
   * Get model size estimate.
   */
  async getModelSize(modelId: string): Promise<number> {
    const files = await this.inspectModelFiles(modelId);
    return files.reduce((sum, f) => sum + (f.size || 0), 0);
  }

  /**
   * Parse license from HF metadata.
   */
  private parseLicense(license?: string, licenseName?: string): LicenseInfo {
    const name = licenseName || license || "Unknown";
    const spdx = name.toUpperCase().replace(/\s+/g, "-");

    // Known permissive licenses
    const permissive = ["MIT", "APACHE-2.0", "BSD", "ISC", "0BSD", "UNLICENSE", "CC0-1.0"];
    const isPermissive = permissive.some((p) => spdx.includes(p));
    const isCopyleft = spdx.includes("GPL") || spdx.includes("AGPL");
    const isCreative = spdx.startsWith("CC-BY");

    return {
      spdxId: spdx,
      name,
      commercialUse: isPermissive || isCreative || (!isCopyleft && name !== "Unknown"),
      modificationAllowed: isPermissive || isCreative || spdx.includes("CC-BY-SA"),
      redistributionAllowed: isPermissive || isCreative,
      copyleft: isCopyleft,
    };
  }

  private calculateScore(model: HFSearchResult): number {
    let score = 0;
    const downloads = model.downloads || 0;
    const likes = model.likes || 0;
    score += Math.min(Math.log10(downloads + 1) * 10, 40);
    score += Math.min(likes * 2, 30);
    if (model.cardData?.license) score += 10;
    if (model.pipeline_tag) score += 10;
    if (model.tags && model.tags.length > 0) score += Math.min(model.tags.length, 10);
    return Math.round(Math.min(score, 100));
  }
}
