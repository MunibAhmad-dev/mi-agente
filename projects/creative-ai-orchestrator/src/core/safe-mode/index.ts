// ============================================================================
// Safe Mode
// ============================================================================
// Allows starting a runtime without potentially dangerous custom nodes.
// Useful for recovery when a custom node causes crashes.
// ============================================================================

import fs from "node:fs";
import path from "node:path";

export interface SafeModeResult {
  entered: boolean;
  disabledNodes: string[];
  reason: string;
}

export class SafeMode {
  /**
   * Start in safe mode: disable all custom nodes.
   */
  static enter(runtimePath: string): SafeModeResult {
    const customNodesDir = path.join(runtimePath, "custom_nodes");
    if (!fs.existsSync(customNodesDir)) {
      return { entered: true, disabledNodes: [], reason: "No custom nodes directory found" };
    }

    const disabledNodes: string[] = [];
    const entries = fs.readdirSync(customNodesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const nodePath = path.join(customNodesDir, entry.name);
        const disabledPath = path.join(customNodesDir, `._disabled_${entry.name}`);

        try {
          fs.renameSync(nodePath, disabledPath);
          disabledNodes.push(entry.name);
        } catch {
          // Could not rename
        }
      }
    }

    return {
      entered: true,
      disabledNodes,
      reason: `Disabled ${disabledNodes.length} custom node(s) for safe mode`,
    };
  }

  /**
   * Exit safe mode: re-enable all disabled custom nodes.
   */
  static exit(runtimePath: string): SafeModeResult {
    const customNodesDir = path.join(runtimePath, "custom_nodes");
    if (!fs.existsSync(customNodesDir)) {
      return { entered: false, disabledNodes: [], reason: "No custom nodes directory found" };
    }

    const reenabledNodes: string[] = [];
    const entries = fs.readdirSync(customNodesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("._disabled_")) {
        const originalName = entry.name.replace("._disabled_", "");
        const disabledPath = path.join(customNodesDir, entry.name);
        const originalPath = path.join(customNodesDir, originalName);

        try {
          fs.renameSync(disabledPath, originalPath);
          reenabledNodes.push(originalName);
        } catch {
          // Could not rename
        }
      }
    }

    return {
      entered: false,
      disabledNodes: reenabledNodes,
      reason: `Re-enabled ${reenabledNodes.length} custom node(s)`,
    };
  }

  /**
   * Check if safe mode is active.
   */
  static isActive(runtimePath: string): boolean {
    const customNodesDir = path.join(runtimePath, "custom_nodes");
    if (!fs.existsSync(customNodesDir)) return false;

    const entries = fs.readdirSync(customNodesDir);
    return entries.some((e) => e.startsWith("._disabled_"));
  }
}
