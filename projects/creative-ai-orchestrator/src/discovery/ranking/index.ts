// ============================================================================
// Resource Ranking / Scoring System
// ============================================================================
// Evaluates discovered resources on multiple dimensions.
// ============================================================================

import type {
  DiscoveredResource,
  ResourceScore,
  HardwareProfile,
  GpuInfo,
} from "../../core/types/index.js";

export interface RankingWeights {
  license: number;
  maintenance: number;
  activity: number;
  documentation: number;
  quality: number;
  compatibility: number;
  hardwareFit: number;
  security: number;
  dependencies: number;
  popularity: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  license: 1.0,
  maintenance: 1.0,
  activity: 1.0,
  documentation: 1.0,
  quality: 1.0,
  compatibility: 1.0,
  hardwareFit: 1.0,
  security: 1.0,
  dependencies: 1.0,
  popularity: 1.0,
};

function scoreLicense(resource: DiscoveredResource): number {
  const lic = resource.license;
  if (!lic || lic.name === "Unknown") return 30;
  if (!lic.copyleft && lic.commercialUse) return 95;
  if (lic.spdxId?.startsWith("MIT")) return 100;
  if (lic.spdxId?.startsWith("Apache")) return 95;
  if (lic.spdxId?.startsWith("BSD")) return 95;
  if (lic.spdxId?.startsWith("MPL")) return 80;
  if (lic.spdxId?.includes("LGPL")) return 60;
  if (lic.spdxId?.includes("GPL")) return 30;
  if (lic.spdxId?.includes("AGPL")) return 20;
  return 50;
}

function scoreMaintenance(resource: DiscoveredResource): number {
  if (!resource.lastUpdated) return 30;
  const daysSince = (Date.now() - resource.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 7) return 100;
  if (daysSince < 30) return 90;
  if (daysSince < 90) return 75;
  if (daysSince < 180) return 60;
  if (daysSince < 365) return 40;
  return 20;
}

function scoreActivity(resource: DiscoveredResource): number {
  const stars = resource.stars || 0;
  const downloads = resource.downloads || 0;
  let score = 0;
  score += Math.min(Math.log10(stars + 1) * 15, 50);
  score += Math.min(Math.log10(downloads + 1) * 10, 50);
  return Math.round(Math.min(score, 100));
}

function scoreDocumentation(resource: DiscoveredResource): number {
  let score = 50; // Base
  if (resource.description && resource.description.length > 50) score += 20;
  if (resource.description && resource.description.length > 200) score += 10;
  if (resource.tags && resource.tags.length > 3) score += 10;
  if (resource.url.includes("github.com")) score += 10;
  return Math.min(score, 100);
}

function scoreQuality(resource: DiscoveredResource): number {
  // Use overall score from provider as proxy
  return resource.overallScore || 50;
}

function scoreCompatibility(resource: DiscoveredResource, _hw?: HardwareProfile): number {
  // Basic compatibility — more sophisticated checks happen in CompatibilityEngine
  let score = 70; // Base assumption
  const meta = resource.metadata;
  if (meta?.compatibility === "green") score = 95;
  if (meta?.compatibility === "yellow") score = 60;
  if (meta?.compatibility === "red") score = 20;
  return score;
}

function scoreHardwareFit(resource: DiscoveredResource, hw?: HardwareProfile): number {
  if (!hw) return 70; // Unknown hardware, assume fit
  const meta = resource.metadata;
  const vramRequired = Number(meta?.vramEstimateMb || meta?.vram_required || 0);
  const totalVram = hw.gpus.reduce((s: number, g: GpuInfo) => s + g.vramMb, 0);

  if (vramRequired === 0) return 80; // Unknown requirement
  if (totalVram >= vramRequired * 1.5) return 100;
  if (totalVram >= vramRequired) return 85;
  if (totalVram >= vramRequired * 0.8) return 50;
  return 20;
}

function scoreSecurity(resource: DiscoveredResource): number {
  if (resource.securityScore) return resource.securityScore.overall;
  return 60; // Unknown security status
}

function scoreDependencies(resource: DiscoveredResource): number {
  const meta = resource.metadata;
  if (meta?.dependencyCount === 0) return 95;
  if (meta?.dependencyCount && Number(meta.dependencyCount) < 10) return 85;
  return 65;
}

function scorePopularity(resource: DiscoveredResource): number {
  const stars = resource.stars || 0;
  const downloads = resource.downloads || 0;
  const combined = Math.log10(stars + downloads + 1);
  return Math.round(Math.min(combined * 15, 100));
}

export function calculateResourceScore(
  resource: DiscoveredResource,
  hw?: HardwareProfile,
  weights: RankingWeights = DEFAULT_WEIGHTS
): ResourceScore {
  const license = scoreLicense(resource);
  const maintenance = scoreMaintenance(resource);
  const activity = scoreActivity(resource);
  const documentation = scoreDocumentation(resource);
  const quality = scoreQuality(resource);
  const compatibility = scoreCompatibility(resource, hw);
  const hardwareFit = scoreHardwareFit(resource, hw);
  const security = scoreSecurity(resource);
  const dependencies = scoreDependencies(resource);
  const popularity = scorePopularity(resource);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const overall = Math.round(
    (license * weights.license +
      maintenance * weights.maintenance +
      activity * weights.activity +
      documentation * weights.documentation +
      quality * weights.quality +
      compatibility * weights.compatibility +
      hardwareFit * weights.hardwareFit +
      security * weights.security +
      dependencies * weights.dependencies +
      popularity * weights.popularity) /
      totalWeight
  );

  return {
    overall,
    license,
    maintenance,
    activity,
    documentation,
    quality,
    compatibility,
    hardwareFit,
    security,
    dependencies,
    popularity,
    explanation: generateExplanation(overall, { license, maintenance, activity, quality, hardwareFit, security }),
  };
}

function generateExplanation(overall: number, scores: Record<string, number>): string {
  const parts: string[] = [];

  if ((scores.license ?? 0) >= 90) parts.push("permissive license");
  else if ((scores.license ?? 0) < 50) parts.push("restrictive license — verify before use");

  if ((scores.maintenance ?? 0) >= 80) parts.push("actively maintained");
  else if ((scores.maintenance ?? 0) < 40) parts.push("not recently updated");

  if ((scores.activity ?? 0) >= 70) parts.push("strong community adoption");
  if ((scores.quality ?? 0) >= 80) parts.push("high quality indicators");
  if ((scores.hardwareFit ?? 100) < 50) parts.push("may exceed your hardware capabilities");

  if (parts.length === 0) {
    parts.push(overall >= 70 ? "solid overall score" : "moderate score — check details");
  }

  return parts.join("; ");
}

/**
 * Rank a list of discovered resources.
 */
export function rankResources(
  resources: DiscoveredResource[],
  hw?: HardwareProfile,
  weights?: RankingWeights
): Array<{ resource: DiscoveredResource; score: ResourceScore }> {
  return resources
    .map((r) => ({
      resource: r,
      score: calculateResourceScore(r, hw, weights),
    }))
    .sort((a, b) => b.score.overall - a.score.overall);
}
