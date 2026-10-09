// ============================================================================
// GitHub Discovery Provider
// ============================================================================
// Searches GitHub repos, releases, workflows, custom nodes.
// Uses official GitHub REST API — no scraping.
// ============================================================================

import type {
  DiscoveryResult,
  DiscoveredResource,
  LicenseInfo,
  CaioConfig,
} from "../../core/types/index.js";

interface GitHubSearchResponse {
  total_count: number;
  items: Array<{
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    description: string;
    stargazers_count: number;
    language: string;
    license: { spdx_id: string; name: string; url: string } | null;
    updated_at: string;
    topics: string[];
    open_issues_count: number;
    forks_count: number;
    archived: boolean;
  }>;
}

function mapLicense(raw: { spdx_id: string; name: string; url: string } | null): LicenseInfo {
  if (!raw) {
    return { name: "Unknown", commercialUse: false, modificationAllowed: false, redistributionAllowed: false, copyleft: false };
  }
  const spdx = raw.spdx_id?.toUpperCase() || "";
  return {
    spdxId: spdx,
    name: raw.name,
    url: raw.url,
    commercialUse: !spdx.includes("GPL") && !spdx.includes("AGPL"),
    modificationAllowed: !spdx.includes("GPL") || spdx.startsWith("LGPL"),
    redistributionAllowed: !spdx.includes("AGPL"),
    copyleft: spdx.includes("GPL") || spdx.includes("AGPL"),
  };
}

export class GitHubDiscoveryProvider {
  private baseUrl = "https://api.github.com";
  private token: string;

  constructor(config: CaioConfig) {
    this.token = config.githubToken;
  }

  private async apiFetch(path: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (this.token) {
      headers.Authorization = `token ${this.token}`;
    }

    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 403) {
      throw new Error("GitHub API rate limit exceeded. Add a GITHUB_TOKEN for higher limits.");
    }
    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
    }

    return res.json();
  }

  /**
   * Search repositories matching a query.
   */
  async search(query: string, options?: {
    language?: string;
    stars?: string;  // e.g. ">=100"
    limit?: number;
  }): Promise<DiscoveryResult> {
    const start = Date.now();
    const limit = options?.limit ?? 20;

    const q = [query];
    if (options?.language) q.push(`language:${options.language}`);
    if (options?.stars) q.push(`stars:${options.stars}`);

    const data: GitHubSearchResponse = await this.apiFetch("/search/repositories", {
      q: q.join(" "),
      sort: "stars",
      order: "desc",
      per_page: String(limit),
    });

    const results: DiscoveredResource[] = data.items.map((item) => ({
      id: String(item.id),
      name: item.full_name,
      description: item.description || "",
      url: item.html_url,
      source: "github" as const,
      stars: item.stargazers_count,
      lastUpdated: new Date(item.updated_at),
      language: item.language,
      license: mapLicense(item.license),
      overallScore: this.calculateScore(item),
      tags: item.topics || [],
      metadata: {
        forks: item.forks_count,
        openIssues: item.open_issues_count,
        archived: item.archived,
      },
    }));

    return {
      provider: "github",
      query,
      results,
      totalResults: data.total_count,
      searchTime: Date.now() - start,
      cached: false,
    };
  }

  /**
   * Search for ComfyUI custom nodes specifically.
   */
  async searchComfyNodes(query: string, limit?: number): Promise<DiscoveryResult> {
    return this.search(`${query} comfyui custom node`, { limit });
  }

  /**
   * Get repository details.
   */
  async inspect(owner: string, repo: string): Promise<any> {
    return this.apiFetch(`/repos/${owner}/${repo}`);
  }

  /**
   * Get latest release.
   */
  async getLatestRelease(owner: string, repo: string): Promise<any> {
    try {
      return await this.apiFetch(`/repos/${owner}/${repo}/releases/latest`);
    } catch {
      return null;
    }
  }

  /**
   * Get repository contents (files).
   */
  async getFile(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const data = await this.apiFetch(`/repos/${owner}/${repo}/contents/${path}`);
      if (data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get license info.
   */
  async getLicense(owner: string, repo: string): Promise<LicenseInfo | null> {
    try {
      const data = await this.apiFetch(`/repos/${owner}/${repo}/license`);
      return mapLicense(data.license);
    } catch {
      return null;
    }
  }

  /**
   * Calculate a basic score for ranking.
   */
  private calculateScore(item: GitHubSearchResponse["items"][0]): number {
    let score = 0;
    // Stars (0-40)
    score += Math.min(item.stargazers_count / 100, 40);
    // Recency (0-20)
    const daysSinceUpdate = (Date.now() - new Date(item.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 20 - daysSinceUpdate);
    // Has license (0-10)
    if (item.license) score += 10;
    // Not archived (0-5)
    if (!item.archived) score += 5;
    // Has description (0-5)
    if (item.description) score += 5;
    // Has topics (0-10)
    if (item.topics && item.topics.length > 0) score += Math.min(item.topics.length * 2, 10);
    // Active issues suggest users (0-10)
    score += Math.min(item.open_issues_count, 10);

    return Math.round(Math.min(score, 100));
  }
}
