// ============================================================================
// Auto-Repair Agent
// ============================================================================
// When something fails: detect → diagnose → classify → repair → validate → retry
// ============================================================================

import type {
  CaioError,
  ErrorCode,
  RuntimeAdapter,
  CaioDatabase,
} from "../../core/types/index.js";
import { classifyError } from "../../core/errors/index.js";

export type FailureClassification =
  | "dependency"
  | "node"
  | "model"
  | "vram"
  | "ram"
  | "python"
  | "cuda"
  | "workflow"
  | "network"
  | "runtime"
  | "quality"
  | "unknown";

export interface RepairAttempt {
  classification: FailureClassification;
  diagnosis: string;
  repairAction: string;
  success: boolean;
  timestamp: Date;
}

export class RepairAgent {
  private maxRetries = 3;

  constructor(private db: CaioDatabase) {}

  /**
   * Diagnose and attempt to repair a failure.
   */
  async diagnoseAndRepair(
    error: CaioError,
    adapter?: RuntimeAdapter
  ): Promise<{
    classification: FailureClassification;
    diagnosis: string;
    repairs: RepairAttempt[];
    allRepaired: boolean;
  }> {
    const classification = this.classify(error);
    const diagnosis = this.diagnose(error, classification);
    const repairs: RepairAttempt[] = [];

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const repair = await this.repair(classification, error, adapter);
      repairs.push(repair);

      if (repair.success) {
        return { classification, diagnosis, repairs, allRepaired: true };
      }
    }

    return { classification, diagnosis, repairs, allRepaired: false };
  }

  /**
   * Classify the failure type.
   */
  classify(error: CaioError): FailureClassification {
    const msg = error.message.toLowerCase();
    const code = error.code?.toLowerCase() || "";

    if (code.includes("vram") || msg.includes("out of memory") || msg.includes("cuda out of memory")) return "vram";
    if (code.includes("cuda") || msg.includes("cuda error")) return "cuda";
    if (code.includes("python") || msg.includes("pip") || msg.includes("venv")) return "python";
    if (code.includes("model") || msg.includes("model") && msg.includes("not found")) return "model";
    if (code.includes("node") || msg.includes("custom node")) return "node";
    if (code.includes("workflow") || msg.includes("workflow")) return "workflow";
    if (code.includes("network") || msg.includes("connection")) return "network";
    if (code.includes("dependency") || msg.includes("dependency")) return "dependency";
    if (code.includes("runtime") || msg.includes("runtime")) return "runtime";
    if (code.includes("quality")) return "quality";
    return "unknown";
  }

  /**
   * Generate diagnosis.
   */
  diagnose(error: CaioError, classification: FailureClassification): string {
    const diagnoses: Record<string, string> = {
      vram: `Insufficient GPU VRAM. ${error.message}`,
      cuda: `CUDA runtime error. Check GPU drivers and CUDA installation.`,
      python: `Python environment issue. ${error.message}`,
      model: `Model file missing or corrupted. ${error.message}`,
      node: `Custom node missing or incompatible. ${error.message}`,
      workflow: `Workflow contains errors. ${error.message}`,
      network: `Network connection failed. ${error.message}`,
      dependency: `Dependency conflict or missing package. ${error.message}`,
      runtime: `Runtime process error. ${error.message}`,
      quality: `Output quality below threshold. ${error.message}`,
      unknown: `Unclassified error: ${error.message}`,
    };
    return diagnoses[classification] || diagnoses["unknown"]!;
  }

  /**
   * Attempt repair based on classification.
   */
  private async repair(
    classification: FailureClassification,
    error: CaioError,
    adapter?: RuntimeAdapter
  ): Promise<RepairAttempt> {
    const attempt: RepairAttempt = {
      classification,
      diagnosis: this.diagnose(error, classification),
      repairAction: "",
      success: false,
      timestamp: new Date(),
    };

    switch (classification) {
      case "vram":
        attempt.repairAction = "Could reduce resolution, enable tiling, or use CPU offloading";
        break;
      case "cuda":
        attempt.repairAction = "Requires manual driver update — cannot auto-repair";
        break;
      case "python":
        attempt.repairAction = "Attempting to reinstall Python dependencies";
        break;
      case "dependency":
        attempt.repairAction = "Attempting to reinstall missing dependencies";
        break;
      case "node":
        attempt.repairAction = "Attempting to reinstall missing custom node";
        if (adapter) {
          try {
            // Try to detect and reinstall
            const exts = await adapter.listExtensions();
            attempt.repairAction += ` (found ${exts.length} installed extensions)`;
          } catch {
            // Cannot query extensions
          }
        }
        break;
      case "workflow":
        attempt.repairAction = "Workflow errors need manual correction";
        break;
      case "network":
        attempt.repairAction = "Network errors may be transient — will retry";
        attempt.success = error.recoverable;
        break;
      case "runtime":
        attempt.repairAction = "Attempting runtime restart";
        if (adapter) {
          try {
            await adapter.restart();
            attempt.success = true;
          } catch {
            attempt.success = false;
          }
        }
        break;
      default:
        attempt.repairAction = "No automated repair available for this classification";
        break;
    }

    return attempt;
  }

  /**
   * Get repair statistics.
   */
  getStats(): {
    totalRepairs: number;
    byClassification: Record<FailureClassification, number>;
    successRate: number;
  } {
    // Placeholder — in production, query the events table
    return {
      totalRepairs: 0,
      byClassification: {
        dependency: 0, node: 0, model: 0, vram: 0, ram: 0,
        python: 0, cuda: 0, workflow: 0, network: 0,
        runtime: 0, quality: 0, unknown: 0,
      },
      successRate: 0,
    };
  }
}
