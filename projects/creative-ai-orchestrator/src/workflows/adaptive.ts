// ============================================================================
// Adaptive Workflow Engine
// ============================================================================
// Switches between Quality/Balanced/Fast/LowVRAM/UltraLowVRAM profiles.
// Adapts parameters based on real-time hardware constraints.
// ============================================================================

import type { Workflow, OperationMode, HardwareProfile } from "../core/types/index.js";

export interface WorkflowProfile {
  name: string;
  mode: OperationMode;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  maxResolution: number;
  enableTiling: boolean;
  enableOffloading: boolean;
  batch_size: number;
}

const PROFILES: Record<string, WorkflowProfile> = {
  ultra_quality: {
    name: "Ultra Quality",
    mode: "max_quality" as OperationMode,
    steps: 40,
    cfg: 8.0,
    sampler: "dpmpp_2m_sde",
    scheduler: "karras",
    maxResolution: 2048,
    enableTiling: false,
    enableOffloading: false,
    batch_size: 1,
  },
  quality: {
    name: "Quality",
    mode: "max_quality" as OperationMode,
    steps: 30,
    cfg: 7.0,
    sampler: "dpmpp_2m",
    scheduler: "karras",
    maxResolution: 1024,
    enableTiling: false,
    enableOffloading: false,
    batch_size: 1,
  },
  balanced: {
    name: "Balanced",
    mode: "balanced" as OperationMode,
    steps: 20,
    cfg: 7.0,
    sampler: "euler",
    scheduler: "normal",
    maxResolution: 1024,
    enableTiling: false,
    enableOffloading: false,
    batch_size: 1,
  },
  fast: {
    name: "Fast",
    mode: "max_speed" as OperationMode,
    steps: 12,
    cfg: 6.0,
    sampler: "euler",
    scheduler: "normal",
    maxResolution: 768,
    enableTiling: false,
    enableOffloading: false,
    batch_size: 1,
  },
  low_vram: {
    name: "Low VRAM",
    mode: "min_vram" as OperationMode,
    steps: 15,
    cfg: 6.5,
    sampler: "euler",
    scheduler: "normal",
    maxResolution: 512,
    enableTiling: true,
    enableOffloading: true,
    batch_size: 1,
  },
  ultra_low_vram: {
    name: "Ultra Low VRAM",
    mode: "min_vram" as OperationMode,
    steps: 10,
    cfg: 6.0,
    sampler: "euler",
    scheduler: "normal",
    maxResolution: 384,
    enableTiling: true,
    enableOffloading: true,
    batch_size: 1,
  },
};

export class AdaptiveWorkflow {
  /**
   * Get the best profile for available hardware.
   */
  static selectProfile(availableVramMb: number): WorkflowProfile {
    if (availableVramMb >= 16000) return PROFILES.ultra_quality!;
    if (availableVramMb >= 10000) return PROFILES.quality!;
    if (availableVramMb >= 6000) return PROFILES.balanced!;
    if (availableVramMb >= 4000) return PROFILES.fast!;
    if (availableVramMb >= 2000) return PROFILES.low_vram!;
    return PROFILES.ultra_low_vram!;
  }

  /**
   * Get a named profile.
   */
  static getProfile(name: string): WorkflowProfile | undefined {
    return PROFILES[name];
  }

  /**
   * List all available profiles.
   */
  static listProfiles(): WorkflowProfile[] {
    return Object.values(PROFILES);
  }

  /**
   * Adapt a workflow to a specific profile.
   */
  static adaptWorkflow(workflow: Workflow, profileName: string): Workflow {
    const profile = PROFILES[profileName];
    if (!profile) return workflow; // profile is guaranteed non-null after this

    // Clone workflow
    const adapted: Workflow = {
      ...workflow,
      nodes: workflow.nodes.map((node) => {
        const adaptedNode = { ...node, inputs: { ...node.inputs } };

        if (node.type === "KSampler") {
          adaptedNode.inputs.steps = profile.steps;
          adaptedNode.inputs.cfg = profile.cfg;
          adaptedNode.inputs.sampler_name = profile.sampler;
          adaptedNode.inputs.scheduler = profile.scheduler;
        }

        if (node.type === "EmptyLatentImage") {
          const w = adaptedNode.inputs.width as number || 512;
          const h = adaptedNode.inputs.height as number || 512;
          if (w > profile.maxResolution) adaptedNode.inputs.width = profile.maxResolution;
          if (h > profile.maxResolution) adaptedNode.inputs.height = profile.maxResolution;
          adaptedNode.inputs.batch_size = profile.batch_size;
        }

        return adaptedNode;
      }),
      metadata: {
        ...workflow.metadata,
        tags: [...(workflow.metadata.tags || []), profile.name.toLowerCase().replace(/\s/g, "_")],
        estimatedVramMb: Math.round((workflow.metadata.estimatedVramMb || 4000) * (profile.steps / 20)),
      },
    };

    return adapted;
  }

  /**
   * Auto-select best profile and adapt workflow.
   */
  static autoAdapt(workflow: Workflow, availableVramMb: number): Workflow {
    const profile = this.selectProfile(availableVramMb);
    return this.adaptWorkflow(workflow, Object.keys(PROFILES).find((k) => PROFILES[k as keyof typeof PROFILES] === profile) || "balanced");
  }
}
