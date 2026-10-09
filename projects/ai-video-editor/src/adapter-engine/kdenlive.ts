/**
 * AI Creative OS - Kdenlive Adapter
 * Open source video editor, fallback editor, timeline, audio, subtitles, effects.
 * License: GPL-2.0+
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";
import { execCommand, getPlatform } from "../core/index.js";

export class KdenliveAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "kdenlive";

  private _caps: AdapterCapability[] = [
    { name: "timeline_editing", supported: true, quality: 80, speed: 88 },
    { name: "transitions", supported: true, quality: 78, speed: 88 },
    { name: "audio_editing", supported: true, quality: 75, speed: 85 },
    { name: "effects", supported: true, quality: 78, speed: 85 },
    { name: "subtitles", supported: true, quality: 72, speed: 85 },
    { name: "rendering", supported: true, quality: 82, speed: 88 },
    { name: "proxy_editing", supported: true, quality: 78, speed: 92 },
  ];

  async detect(): Promise<boolean> {
    const result = execCommand(
      process.platform === "win32"
        ? 'where kdenlive 2>nul'
        : "which kdenlive 2>/dev/null",
    );
    if (result.exitCode === 0) {
      this._installed = true;
      this._version = "detected";
      return true;
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["cli", "project_file"]; }

  async renderProject(projectPath: FilePath, outputPath: FilePath): Promise<AdapterResult<string>> {
    return this.executeWithRetry(
      `kdenlive -r "${projectPath}" -o "${outputPath}"`,
      { timeout: 600000 },
    );
  }
}
