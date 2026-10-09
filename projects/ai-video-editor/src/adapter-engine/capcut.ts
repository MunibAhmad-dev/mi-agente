/**
 * AI Creative OS - CapCut Adapter
 * Oriented toward: TikTok, Shorts, Reels, templates, captions, fast editing.
 * License: Proprietary (ByteDance)
 * Automation: Project file manipulation, CLI where available
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";
import { execCommand, getPlatform } from "../core/index.js";

export class CapCutAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "capcut";

  private _caps: AdapterCapability[] = [
    { name: "timeline_editing", supported: true, quality: 82, speed: 90 },
    { name: "transitions", supported: true, quality: 85, speed: 92 },
    { name: "auto_captions", supported: true, quality: 88, speed: 85 },
    { name: "templates", supported: true, quality: 85, speed: 90 },
    { name: "effects", supported: true, quality: 80, speed: 88 },
    { name: "music_integration", supported: true, quality: 82, speed: 90 },
    { name: "speed_ramping", supported: true, quality: 85, speed: 90 },
    { name: "chroma_key", supported: true, quality: 78, speed: 85 },
    { name: "rendering", supported: true, quality: 80, speed: 88 },
  ];

  async detect(): Promise<boolean> {
    const os = getPlatform();
    let cmd = "";

    if (os === "windows") {
      cmd = 'dir /b "%LOCALAPPDATA%\\CapCut\\Apps\\*.exe" 2>nul || dir /b "C:\\Program Files\\CapCut\\*.exe" 2>nul';
    } else if (os === "macos") {
      cmd = 'ls /Applications/CapCut.app/Contents/MacOS/CapCut 2>/dev/null';
    }

    if (cmd) {
      const result = execCommand(cmd);
      if (result.exitCode === 0 && result.stdout.trim()) {
        this._installed = true;
        this._version = "detected";
        return true;
      }
    }

    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] {
    return ["project_file", "gui_automation"];
  }

  /**
   * CapCut automation is primarily through project file manipulation.
   * The .capcut project format is JSON-based.
   */
  async parseProject(projectPath: FilePath): Promise<AdapterResult<Record<string, unknown>>> {
    const { readFileSync } = await import("node:fs");
    try {
      const raw = readFileSync(projectPath, "utf-8");
      return { success: true, data: JSON.parse(raw), duration: 0, provider: this.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), duration: 0, provider: this.id };
    }
  }
}
