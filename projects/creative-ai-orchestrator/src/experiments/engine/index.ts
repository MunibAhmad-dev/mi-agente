// ============================================================================
// Experiment Engine
// ============================================================================
// Manages experiments with variables (model, resolution, steps, CFG, sampler,
// seed, LoRA, upscaler, denoise, frames).
// Supports grid search, random search, plateau detection, resource limits.
// ============================================================================

import type {
  Experiment,
  ExperimentId,
  ExperimentVariables,
  ProjectId,
  ExecutionOutput,
  QualityScore,
  ResourceUsage,
  CaioDatabase,
} from "../../core/types/index.js";
import { newId } from "../../core/types/index.js";

export interface ExperimentConfig {
  maxIterations: number;
  maxGpuTimeMs: number;
  maxStorageMb: number;
  qualityThreshold: number;
  plateauWindow: number;
  plateauThreshold: number;
}

export interface ExperimentSearch {
  type: "grid" | "random" | "manual";
  variables: Record<string, unknown[]>;
}

const DEFAULT_CONFIG: ExperimentConfig = {
  maxIterations: 20,
  maxGpuTimeMs: 300000,
  maxStorageMb: 4096,
  qualityThreshold: 90,
  plateauWindow: 5,
  plateauThreshold: 1.0,
};

export class ExperimentEngine {
  private scoreHistory: Map<string, number[]> = new Map();

  constructor(
    private db: CaioDatabase,
    private config: ExperimentConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Create a new experiment.
   */
  create(
    projectId: ProjectId,
    name: string,
    variables: ExperimentVariables
  ): Experiment {
    const id = newId() as ExperimentId;

    this.db.run(
      `INSERT INTO experiments (id, project_id, name, variables, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      id,
      projectId,
      name,
      JSON.stringify(variables)
    );

    return {
      id,
      projectId,
      name,
      variables,
      workflowVersion: "" as any,
      status: "pending",
      createdAt: new Date(),
    };
  }

  /**
   * Generate experiment grid from variable ranges.
   */
  generateGrid(
    projectId: ProjectId,
    name: string,
    search: ExperimentSearch
  ): Experiment[] {
    const experiments: Experiment[] = [];
    const keys = Object.keys(search.variables);
    const values = Object.values(search.variables);

    if (search.type === "grid") {
      // Cartesian product
      const combos = this.cartesianProduct(values);
      for (const combo of combos) {
        const vars: ExperimentVariables = {};
        for (let i = 0; i < keys.length; i++) {
          vars[keys[i]!] = combo[i];
        }
        experiments.push(this.create(projectId, `${name} #${experiments.length + 1}`, vars));
      }
    } else if (search.type === "random") {
      // Random sampling within ranges
      for (let i = 0; i < this.config.maxIterations; i++) {
        const vars: ExperimentVariables = {};
        for (let j = 0; j < keys.length; j++) {
          const range = values[j];
          if (Array.isArray(range) && range.length > 0) {
            vars[keys[j]!] = range[Math.floor(Math.random() * range.length)];
          }
        }
        experiments.push(this.create(projectId, `${name} #${i + 1}`, vars));
      }
    }

    return experiments;
  }

  /**
   * Record experiment result.
   */
  recordResult(
    experimentId: ExperimentId,
    output: ExecutionOutput,
    qualityScore: QualityScore,
    resourceUsage: ResourceUsage
  ): void {
    const result = { output, qualityScore, resourceUsage };
    this.db.run(
      `UPDATE experiments SET status = 'completed', quality_score = ?, result = ?, completed_at = datetime('now')
       WHERE id = ?`,
      qualityScore.overall,
      JSON.stringify(result),
      experimentId
    );

    // Track score history for plateau detection
    const row = this.db.get<{ project_id: string }>("SELECT project_id FROM experiments WHERE id = ?", experimentId);
    if (row?.project_id) {
      const key = row.project_id;
      if (!this.scoreHistory.has(key)) this.scoreHistory.set(key, []);
      this.scoreHistory.get(key)!.push(qualityScore.overall);
    }
  }

  /**
   * Check if we should stop (plateau or threshold reached).
   */
  shouldStop(projectId: ProjectId): { stop: boolean; reason: string } {
    const history = this.scoreHistory.get(projectId);
    if (!history || history.length < 3) return { stop: false, reason: "" };

    // Threshold reached
    const max = Math.max(...history);
    if (max >= this.config.qualityThreshold) {
      return { stop: true, reason: `Quality threshold reached: ${max}/${this.config.qualityThreshold}` };
    }

    // Max iterations
    if (history.length >= this.config.maxIterations) {
      return { stop: true, reason: `Max iterations reached: ${history.length}/${this.config.maxIterations}` };
    }

    // Plateau detection
    const recent = history.slice(-this.config.plateauWindow);
    const variance = Math.max(...recent) - Math.min(...recent);
    if (variance < this.config.plateauThreshold && recent.length >= this.config.plateauWindow) {
      return { stop: true, reason: `Quality plateau detected (variance: ${variance.toFixed(2)})` };
    }

    return { stop: false, reason: "" };
  }

  /**
   * Get experiment history for a project.
   */
  getHistory(projectId: ProjectId, limit: number = 20): Experiment[] {
    const rows = this.db.all<{
      id: string; project_id: string; name: string; variables: string;
      status: string; quality_score: number | null; result: string | null;
      created_at: string; completed_at: string | null;
    }>(
      "SELECT * FROM experiments WHERE project_id = ? ORDER BY created_at DESC LIMIT ?",
      projectId,
      limit
    );

    return rows.map((r) => ({
      id: r.id as ExperimentId,
      projectId: r.project_id as ProjectId,
      name: r.name,
      variables: JSON.parse(r.variables),
      workflowVersion: "" as any,
      status: r.status as Experiment["status"],
      result: r.result ? JSON.parse(r.result) : undefined,
      createdAt: new Date(r.created_at),
      completedAt: r.completed_at ? new Date(r.completed_at) : undefined,
    }));
  }

  /**
   * Get the best experiment result.
   */
  getBest(projectId: ProjectId): Experiment | null {
    const row = this.db.get<{
      id: string; project_id: string; name: string; variables: string;
      status: string; quality_score: number | null; result: string | null;
      created_at: string; completed_at: string | null;
    }>(
      "SELECT * FROM experiments WHERE project_id = ? AND status = 'completed' ORDER BY quality_score DESC LIMIT 1",
      projectId
    );
    if (!row) return null;
    return {
      id: row.id as ExperimentId,
      projectId: row.project_id as ProjectId,
      name: row.name,
      variables: JSON.parse(row.variables),
      workflowVersion: "" as any,
      status: row.status as Experiment["status"],
      result: row.result ? JSON.parse(row.result) : undefined,
      qualityScore: row.quality_score ?? undefined,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    } as Experiment;
  }

  private cartesianProduct(arrays: unknown[][]): unknown[][] {
    return arrays.reduce<unknown[][]>(
      (acc, curr) => acc.flatMap((a) => curr.map((b) => [...a, b])),
      [[]]
    );
  }
}
