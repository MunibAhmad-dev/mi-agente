// ============================================================================
// Evaluation Engine
// ============================================================================
// Evaluates technical validity, visual quality, performance, resource
// efficiency, and user satisfaction. Drives the improve/repeat loop.
// ============================================================================

import type {
  QualityScore,
  QualityWeights,
  ResourceUsage,
  ExecutionOutput,
  CaioDatabase,
  ProjectId,
  ExperimentId,
} from "../../core/types/index.js";
import { OperationMode, newId } from "../../core/types/index.js";
import { VisionEngine } from "../../vision/engine/index.js";

export interface EvaluationResult {
  id: string;
  technicalValid: boolean;
  qualityScore: QualityScore;
  performanceScore: number; // 0-100
  resourceEfficiencyScore: number; // 0-100
  overallScore: number; // 0-100
  suggestions: string[];
  shouldImprove: boolean;
  shouldStop: boolean;
}

export interface OptimizationObjective {
  type: "max_quality" | "max_speed" | "min_vram" | "min_cost" | "balanced";
  qualityWeight: number;
  speedWeight: number;
  vramWeight: number;
}

const OBJECTIVE_MAP: Record<string, OptimizationObjective> = {
  max_quality: { type: "max_quality", qualityWeight: 1.0, speedWeight: 0.1, vramWeight: 0.1 },
  max_speed: { type: "max_speed", qualityWeight: 0.3, speedWeight: 1.0, vramWeight: 0.3 },
  min_vram: { type: "min_vram", qualityWeight: 0.3, speedWeight: 0.3, vramWeight: 1.0 },
  min_cost: { type: "min_cost", qualityWeight: 0.5, speedWeight: 0.5, vramWeight: 0.5 },
  balanced: { type: "balanced", qualityWeight: 0.5, speedWeight: 0.5, vramWeight: 0.5 },
};

export class EvaluationEngine {
  private vision: VisionEngine;
  private scoreHistory: Map<string, number[]> = new Map(); // entity → scores

  constructor(private db: CaioDatabase) {
    this.vision = new VisionEngine();
  }

  /**
   * Evaluate an execution output.
   */
  async evaluateOutput(
    output: ExecutionOutput,
    resourceUsage: ResourceUsage,
    mode: OperationMode = OperationMode.Balanced
  ): Promise<EvaluationResult> {
    const evalId = newId();
    const objective = OBJECTIVE_MAP[mode] || OBJECTIVE_MAP["balanced"]!;

    // Technical validity
    const technicalValid = output.path.length > 0 && (output.type === "image" || output.type === "video" || output.type === "audio" || output.type === "text");

    // Quality score
    let qualityScore: QualityScore = {
      sharpness: 50, noise: 50, composition: 50, lighting: 50, artifacts: 50, resolution: 50,
      overall: 50, weights: { sharpness: 0.2, noise: 0.15, composition: 0.15, lighting: 0.15, artifacts: 0.15, resolution: 0.2 },
    };

    if (output.type === "image" && output.path && !output.path.startsWith("http")) {
      try {
        const analysis = await this.vision.analyzeImage(output.path);
        qualityScore = this.vision.scoreQuality(analysis);
      } catch {
        // Vision analysis not available — use default
      }
    }

    // Performance score (based on duration)
    const performanceScore = this.calculatePerformanceScore(resourceUsage);

    // Resource efficiency
    const resourceEfficiencyScore = this.calculateResourceEfficiency(resourceUsage);

    // Overall score weighted by objective
    const overallScore = Math.round(
      qualityScore.overall * objective.qualityWeight +
      performanceScore * objective.speedWeight +
      resourceEfficiencyScore * objective.vramWeight
    );

    // Suggestions
    const suggestions: string[] = [];
    if (qualityScore.sharpness < 40) suggestions.push("Improve sharpness");
    if (qualityScore.noise < 40) suggestions.push("Reduce noise");
    if (qualityScore.overall < 50) suggestions.push("Overall quality is low — consider different model or parameters");
    if (resourceUsage.peakVramMb && resourceUsage.peakVramMb > 12000) suggestions.push("High VRAM usage — consider optimization");

    // Smart stop: check if improvements have plateaued
    const shouldStop = this.detectPlateau(output.path, overallScore);
    const shouldImprove = overallScore < 85 && !shouldStop;

    const result: EvaluationResult = {
      id: evalId,
      technicalValid,
      qualityScore,
      performanceScore,
      resourceEfficiencyScore,
      overallScore,
      suggestions,
      shouldImprove,
      shouldStop,
    };

    // Store result
    this.db.run(
      `INSERT INTO experiments (id, project_id, name, variables, status, quality_score, result)
       VALUES (?, ?, 'evaluation', '{}', 'completed', ?, ?)`,
      evalId,
      null,
      overallScore,
      JSON.stringify(result)
    );

    return result;
  }

  /**
   * Compare two evaluations and determine which is better.
   */
  compare(a: EvaluationResult, b: EvaluationResult): "a" | "b" | "equal" {
    if (a.overallScore > b.overallScore) return "a";
    if (b.overallScore > a.overallScore) return "b";
    return "equal";
  }

  /**
   * Get experiment history for a project.
   */
  getExperimentHistory(projectId: ProjectId, limit: number = 20): EvaluationResult[] {
    const rows = this.db.all<{ id: string; quality_score: number; result: string }>(
      "SELECT id, quality_score, result FROM experiments WHERE project_id = ? ORDER BY created_at DESC LIMIT ?",
      projectId,
      limit
    );

    return rows
      .map((r) => {
        try {
          return JSON.parse(r.result) as EvaluationResult;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as EvaluationResult[];
  }

  /**
   * Detect if improvements have plateaued.
   */
  private detectPlateau(entityId: string, currentScore: number): boolean {
    if (!this.scoreHistory.has(entityId)) {
      this.scoreHistory.set(entityId, []);
    }
    const history = this.scoreHistory.get(entityId)!;
    history.push(currentScore);

    // Keep last 5 scores
    const recent = history.slice(-5);
    if (recent.length < 3) return false;

    // Check if variance is very low
    const max = Math.max(...recent);
    const min = Math.min(...recent);
    if (max - min < 2) return true;

    // Check if trend is flat or declining
    const lastThree = recent.slice(-3);
    if (lastThree[2]! <= lastThree[1]! && lastThree[1]! <= lastThree[0]!) {
      return true;
    }

    return false;
  }

  private calculatePerformanceScore(usage: ResourceUsage): number {
    // Score based on execution duration
    if (usage.duration < 5000) return 95;
    if (usage.duration < 15000) return 85;
    if (usage.duration < 30000) return 70;
    if (usage.duration < 60000) return 55;
    if (usage.duration < 120000) return 40;
    return 25;
  }

  private calculateResourceEfficiency(usage: ResourceUsage): number {
    let score = 80;

    if (usage.peakVramMb) {
      if (usage.peakVramMb < 4000) score += 10;
      else if (usage.peakVramMb > 12000) score -= 15;
    }

    if (usage.peakRamMb) {
      if (usage.peakRamMb < 8000) score += 5;
      else if (usage.peakRamMb > 16000) score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }
}
