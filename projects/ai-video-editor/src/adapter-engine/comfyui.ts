/**
 * AI Creative OS - ComfyUI Adapter
 * Workflow engine for image/video generation via ComfyUI.
 * License: GPL-3.0 (treated as optional dependency)
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult } from "../types/index.js";
import { execCommand } from "../core/index.js";

export class ComfyUIAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "comfyui";

  private _serverUrl = "http://127.0.0.1:8188";

  private _caps: AdapterCapability[] = [
    { name: "workflow_execution", supported: true, quality: 90, speed: 80 },
    { name: "txt2img", supported: true, quality: 88, speed: 75 },
    { name: "img2img", supported: true, quality: 88, speed: 75 },
    { name: "inpainting", supported: true, quality: 85, speed: 70 },
    { name: "model_management", supported: true, quality: 80, speed: 85 },
    { name: "custom_nodes", supported: true, quality: 75, speed: 80 },
  ];

  async detect(): Promise<boolean> {
    // Check if ComfyUI is running or installed
    const portCheck = await this.executeCommand(
      process.platform === "win32"
        ? "netstat -an | findstr :8188"
        : "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8188/system_stats",
    );
    if (portCheck.success && (portCheck.data?.includes("8188") || portCheck.data?.includes("200"))) {
      this._installed = true;
      this._version = "detected";
      return true;
    }

    // Check if ComfyUI is installed locally
    const fsResult = execCommand(
      process.platform === "win32"
        ? 'dir /b "C:\\ComfyUI\\main.py" 2>nul || dir /b "%USERPROFILE%\\ComfyUI\\main.py" 2>nul'
        : "ls ~/ComfyUI/main.py 2>/dev/null || ls /opt/ComfyUI/main.py 2>/dev/null",
    );
    if (fsResult.exitCode === 0) {
      this._installed = true;
      this._version = "installed (not running)";
      return true;
    }

    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["cli", "ipc"]; }

  async getServerStats(): Promise<AdapterResult<Record<string, unknown>>> {
    const result = await this.executeCommand(
      `curl -s "${this._serverUrl}/system_stats" 2>/dev/null`,
    );
    if (!result.success || !result.data) return { success: false, error: result.error, duration: result.duration, provider: result.provider };
    try { return { ...result, data: JSON.parse(result.data) as Record<string, unknown> }; }
    catch { return { success: false, error: "Failed to parse stats", duration: result.duration, provider: result.provider }; }
  }

  async queueWorkflow(workflow: Record<string, unknown>): Promise<AdapterResult<{ prompt_id: string }>> {
    const jsonStr = JSON.stringify(workflow).replace(/"/g, '\\"');
    const result = await this.executeCommand(
      `curl -s -X POST "${this._serverUrl}/prompt" -H "Content-Type: application/json" -d "${jsonStr}"`,
    );
    if (!result.success || !result.data) return { success: false, error: result.error, duration: result.duration, provider: result.provider };
    try { return { ...result, data: JSON.parse(result.data) as { prompt_id: string } }; }
    catch { return { success: false, error: "Failed to parse response", duration: result.duration, provider: result.provider }; }
  }

  async getModelList(): Promise<AdapterResult<string[]>> {
    const result = await this.executeCommand(
      `curl -s "${this._serverUrl}/object_info" 2>/dev/null`,
    );
    if (!result.success || !result.data) return { success: result.success, data: [] as any, duration: result.duration, provider: result.provider };
    try {
      const info = JSON.parse(result.data) as Record<string, unknown>;
      return { ...result, data: Object.keys(info) };
    } catch {
      return { success: result.success, data: [] as any, duration: result.duration, provider: result.provider };
    }
  }

  async importWorkflow(filePath: string): Promise<AdapterResult<Record<string, unknown>>> {
    const { readFileSync } = await import("node:fs");
    try {
      const raw = readFileSync(filePath, "utf-8");
      const workflow = JSON.parse(raw);
      return { success: true, data: workflow, duration: 0, provider: this.id };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration: 0,
        provider: this.id,
      };
    }
  }
}
