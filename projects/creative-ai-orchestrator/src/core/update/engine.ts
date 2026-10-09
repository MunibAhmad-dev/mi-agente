// ============================================================================
// Update Engine
// ============================================================================
// Check updates → Preview changes → Backup → Update → Test → Rollback
// ============================================================================

import type { RuntimeAdapter, SnapshotId, CaioDatabase } from "../types/index.js";
import { newId } from "../types/index.js";

export interface UpdateCheck {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  changelog?: string;
}

export interface UpdateResult {
  success: boolean;
  previousVersion: string;
  newVersion: string;
  snapshotId?: SnapshotId;
  error?: string;
}

export class UpdateEngine {
  constructor(private db: CaioDatabase) {}

  /**
   * Check if an update is available for a runtime.
   */
  async checkUpdate(adapter: RuntimeAdapter): Promise<UpdateCheck> {
    try {
      const info = await adapter.detect();
      const currentVersion = info.version;

      // For ComfyUI, check latest git tag
      const latestVersion = await this.getLatestVersion(adapter.id);

      return {
        currentVersion,
        latestVersion,
        updateAvailable: currentVersion !== latestVersion && latestVersion !== "unknown",
      };
    } catch (err: any) {
      return {
        currentVersion: "unknown",
        latestVersion: "unknown",
        updateAvailable: false,
        changelog: err.message,
      };
    }
  }

  /**
   * Create a backup snapshot before updating.
   */
  async backup(adapter: RuntimeAdapter): Promise<SnapshotId> {
    const snapshotId = newId() as SnapshotId;
    const info = await adapter.detect();

    this.db.run(
      `INSERT INTO snapshots (id, entity_type, entity_id, label, data) VALUES (?, 'runtime', ?, ?, ?)`,
      snapshotId,
      info.id,
      `backup-${Date.now()}`,
      JSON.stringify({
        version: info.version,
        path: info.path,
        timestamp: new Date().toISOString(),
      })
    );

    return snapshotId;
  }

  /**
   * Perform the update (git pull for ComfyUI-style runtimes).
   */
  async update(adapter: RuntimeAdapter, backupFirst: boolean = true): Promise<UpdateResult> {
    const info = await adapter.detect();
    const previousVersion = info.version;

    let snapshotId: SnapshotId | undefined;
    if (backupFirst) {
      snapshotId = await this.backup(adapter);
    }

    try {
      // Stop runtime before updating
      if (info.status === "running") {
        await adapter.stop();
      }

      // For ComfyUI: git pull
      if (adapter.id === "comfyui" && info.path) {
        const { execSync } = await import("node:child_process");
        execSync("git pull", { cwd: info.path, stdio: "pipe", timeout: 60000 });
      }

      const newInfo = await adapter.detect();
      return {
        success: true,
        previousVersion,
        newVersion: newInfo.version,
        snapshotId,
      };
    } catch (err: any) {
      return {
        success: false,
        previousVersion,
        newVersion: previousVersion,
        snapshotId,
        error: err.message,
      };
    }
  }

  /**
   * Rollback to a previous snapshot.
   */
  async rollback(snapshotId: SnapshotId, adapter: RuntimeAdapter): Promise<boolean> {
    try {
      await adapter.rollback(snapshotId);
      return true;
    } catch {
      return false;
    }
  }

  private async getLatestVersion(adapterId: string): Promise<string> {
    if (adapterId === "comfyui") {
      try {
        const res = await fetch("https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest", {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json() as any;
          return data.tag_name || "unknown";
        }
      } catch {
        // Fallback to git
      }
    }
    return "unknown";
  }
}
