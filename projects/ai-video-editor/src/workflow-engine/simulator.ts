/**
 * AI Creative OS - Workflow Simulator
 * Pre-execution validation: VRAM, RAM, disk, time estimation, risk assessment.
 * Never execute without simulating first.
 */

import type {
  ProductionGraph, ProductionNode, HardwareProfile, UniqueId, Score, Bytes,
} from "../types/index.js";
import { Logger, EventBus } from "../core/index.js";

export interface SimulationResult {
  valid: boolean;
  estimatedTime: number;
  estimatedVRAM: Bytes;
  estimatedRAM: Bytes;
  estimatedDisk: Bytes;
  risks: SimulationRisk[];
  resourceTimeline: ResourceSnapshot[];
  bottleneckNode?: UniqueId;
  parallelEfficiency: number;
  warnings: string[];
  recommendations: string[];
}

export interface SimulationRisk {
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  description: string;
  mitigation?: string;
}

export interface ResourceSnapshot {
  time: number;
  vramUsed: Bytes;
  ramUsed: Bytes;
  activeNodes: number;
}

export class WorkflowSimulator {
  private logger = new Logger("WorkflowSimulator");
  private eventBus: EventBus;

  // Resource requirements per node type (approximate)
  private nodeResources: Record<string, { vram: Bytes; ram: Bytes; cpuCores: number; durationMs: number }> = {
    script:            { vram: 0, ram: 512 * 1024 * 1024, cpuCores: 1, durationMs: 5000 },
    storyboard:        { vram: 0, ram: 512 * 1024 * 1024, cpuCores: 1, durationMs: 8000 },
    character_design:  { vram: 6 * 1024 * 1024 * 1024, ram: 8 * 1024 * 1024 * 1024, cpuCores: 4, durationMs: 30000 },
    background:        { vram: 4 * 1024 * 1024 * 1024, ram: 6 * 1024 * 1024 * 1024, cpuCores: 4, durationMs: 25000 },
    animation:         { vram: 12 * 1024 * 1024 * 1024, ram: 16 * 1024 * 1024 * 1024, cpuCores: 8, durationMs: 120000 },
    music:             { vram: 2 * 1024 * 1024 * 1024, ram: 4 * 1024 * 1024 * 1024, cpuCores: 2, durationMs: 20000 },
    voiceover:         { vram: 2 * 1024 * 1024 * 1024, ram: 4 * 1024 * 1024 * 1024, cpuCores: 2, durationMs: 15000 },
    editing:           { vram: 0, ram: 4 * 1024 * 1024 * 1024, cpuCores: 4, durationMs: 30000 },
    compositing:       { vram: 4 * 1024 * 1024 * 1024, ram: 8 * 1024 * 1024 * 1024, cpuCores: 4, durationMs: 20000 },
    color:             { vram: 2 * 1024 * 1024 * 1024, ram: 4 * 1024 * 1024 * 1024, cpuCores: 4, durationMs: 15000 },
    captions:          { vram: 1 * 1024 * 1024 * 1024, ram: 2 * 1024 * 1024 * 1024, cpuCores: 2, durationMs: 10000 },
    render:            { vram: 2 * 1024 * 1024 * 1024, ram: 4 * 1024 * 1024 * 1024, cpuCores: 8, durationMs: 45000 },
  };

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Full simulation of a production graph.
   */
  async simulate(
    graph: ProductionGraph,
    hardware?: HardwareProfile,
  ): Promise<SimulationResult> {
    this.logger.info(`Simulating workflow: ${graph.name}`);
    const risks: SimulationRisk[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Get execution levels (topological sort)
    const levels = this.getExecutionLevels(graph);

    // Calculate resources per level
    let totalVRAM: Bytes = 0;
    let totalRAM: Bytes = 0;
    let totalDisk: Bytes = 0;
    let totalTime = 0;
    let maxLevelVRAM: Bytes = 0;
    const resourceTimeline: ResourceSnapshot[] = [];

    for (let i = 0; i < levels.length; i++) {
      const levelNodes = levels[i].map((id) => graph.nodes.find((n) => n.id === id)).filter(Boolean) as ProductionNode[];

      let levelVRAM: Bytes = 0;
      let levelRAM: Bytes = 0;
      let levelTime = 0;

      for (const node of levelNodes) {
        const res = this.getNodeResources(node);
        // Parallel nodes share the same time slot but their VRAM/RAM stacks
        levelVRAM += res.vram;
        levelRAM += res.ram;
        levelTime = Math.max(levelTime, res.durationMs);
      }

      maxLevelVRAM = Math.max(maxLevelVRAM, levelVRAM);
      totalRAM = Math.max(totalRAM, levelRAM);
      totalTime += levelTime;

      resourceTimeline.push({
        time: totalTime,
        vramUsed: levelVRAM,
        ramUsed: levelRAM,
        activeNodes: levelNodes.length,
      });
    }

    totalVRAM = maxLevelVRAM;
    totalDisk = graph.nodes.length * 500 * 1024 * 1024; // Estimate 500MB per node

    // Risk: VRAM
    if (hardware) {
      const hwVRAM = hardware.gpus.reduce((s, g) => s + g.vram, 0);
      if (totalVRAM > hwVRAM) {
        risks.push({
          severity: "critical",
          category: "vram",
          description: `Estimated VRAM (${this.formatBytes(totalVRAM)}) exceeds available (${this.formatBytes(hwVRAM)})`,
          mitigation: "Use quantized models, lower resolution, or process sequentially",
        });
      } else if (totalVRAM > hwVRAM * 0.85) {
        risks.push({
          severity: "high",
          category: "vram",
          description: `VRAM usage (${this.formatBytes(totalVRAM)}) near limit (${this.formatBytes(hwVRAM)})`,
          mitigation: "Consider reducing concurrent GPU tasks",
        });
      }

      // Risk: RAM
      if (totalRAM > hardware.totalRAM * 0.9) {
        risks.push({
          severity: "high",
          category: "ram",
          description: `Estimated RAM (${this.formatBytes(totalRAM)}) may cause swapping`,
          mitigation: "Reduce batch sizes or use proxy editing",
        });
      }

      // Risk: Disk
      if (totalDisk > hardware.diskSpace.available) {
        risks.push({
          severity: "critical",
          category: "disk",
          description: `Estimated disk usage (${this.formatBytes(totalDisk)}) exceeds free space (${this.formatBytes(hardware.diskSpace.available)})`,
          mitigation: "Clear cache or use external storage",
        });
      }

      // Recommendations
      if (!hardware.cudaAvailable && totalVRAM > 0) {
        recommendations.push("CUDA not available — GPU acceleration disabled, expect 5-10x slower AI generation");
      }
      if (hardware.aiScore < 40) {
        recommendations.push("Low AI score — consider using CPU fallback models and lower quantization");
      }
    }

    // Find bottleneck node
    let bottleneckNode: UniqueId | undefined;
    let maxDuration = 0;
    for (const node of graph.nodes) {
      const res = this.getNodeResources(node);
      if (res.durationMs > maxDuration) {
        maxDuration = res.durationMs;
        bottleneckNode = node.id;
      }
    }

    // Calculate parallel efficiency
    const sequentialTime = graph.nodes.reduce((s, n) => s + this.getNodeResources(n).durationMs, 0);
    const parallelEfficiency = sequentialTime > 0 ? Math.round((totalTime / sequentialTime) * 100) : 100;

    const result: SimulationResult = {
      valid: risks.filter((r) => r.severity === "critical").length === 0,
      estimatedTime: totalTime,
      estimatedVRAM: totalVRAM,
      estimatedRAM: totalRAM,
      estimatedDisk: totalDisk,
      risks,
      resourceTimeline,
      bottleneckNode,
      parallelEfficiency,
      warnings,
      recommendations,
    };

    await this.eventBus.emit("SIMULATION_COMPLETED", "Simulator", {
      valid: result.valid,
      estimatedTime: totalTime,
      riskCount: risks.length,
    });

    return result;
  }

  private getNodeResources(node: ProductionNode): { vram: Bytes; ram: Bytes; cpuCores: number; durationMs: number } {
    const base = this.nodeResources[node.type] ?? {
      vram: 0, ram: 1 * 1024 * 1024 * 1024, cpuCores: 2, durationMs: node.estimatedDuration ?? 10000,
    };
    return {
      ...base,
      durationMs: node.estimatedDuration ?? base.durationMs,
    };
  }

  private getExecutionLevels(graph: ProductionGraph): UniqueId[][] {
    const inDegree = new Map<UniqueId, number>();
    const adj = new Map<UniqueId, UniqueId[]>();
    for (const n of graph.nodes) { inDegree.set(n.id, 0); adj.set(n.id, []); }
    for (const e of graph.edges) { inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1); adj.get(e.from)?.push(e.to); }

    const levels: UniqueId[][] = [];
    let queue = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
    while (queue.length > 0) {
      levels.push([...queue]);
      const next: UniqueId[] = [];
      for (const id of queue) {
        for (const nb of adj.get(id) ?? []) {
          const d = (inDegree.get(nb) ?? 1) - 1;
          inDegree.set(nb, d);
          if (d === 0) next.push(nb);
        }
      }
      queue = next;
    }
    return levels;
  }

  private formatBytes(bytes: Bytes): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${bytes} B`;
  }
}
