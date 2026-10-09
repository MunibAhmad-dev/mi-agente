/**
 * AI Creative OS - PySceneDetect Adapter
 * Scene detection, shot detection, segmentation, pacing analysis.
 * License: BSD-3-Clause
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";

export class PySceneDetectAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "scenedetect";

  private _caps: AdapterCapability[] = [
    { name: "scene_detection", supported: true, quality: 90, speed: 88 },
    { name: "shot_detection", supported: true, quality: 88, speed: 90 },
    { name: "cut_detection", supported: true, quality: 92, speed: 92 },
    { name: "pacing_analysis", supported: true, quality: 80, speed: 85 },
  ];

  async detect(): Promise<boolean> {
    for (const cmd of ["scenedetect --version", "python3 -c \"import scenedetect; print(scenedetect.__version__)\" 2>/dev/null"]) {
      const result = await this.executeCommand(cmd);
      if (result.success && result.data) {
        this._installed = true;
        this._version = result.data.trim().replace(/[^0-9.]/g, "");
        this.logger.info(`PySceneDetect detected: v${this._version}`);
        return true;
      }
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["cli", "scripting"]; }

  async detectScenes(
    videoPath: FilePath,
    options: { threshold?: number; minSceneLen?: number } = {},
  ): Promise<AdapterResult<SceneInfo[]>> {
    const threshold = options.threshold ?? 27.0;
    const minLen = options.minSceneLen ?? 15;
    const cmd = `scenedetect -i "${videoPath}" detect-content -t ${threshold} -l ${minLen} list-scenes`;
    const result = await this.executeCommand(cmd, { timeout: 600000 });
    if (!result.success) return { success: false, error: result.error, duration: result.duration, provider: result.provider };

    // Parse the CSV output
    const scenes = this.parseSceneList(result.output || result.data || "");
    return { ...result, data: scenes };
  }

  private parseSceneList(output: string): SceneInfo[] {
    const scenes: SceneInfo[] = [];
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/(\d+)\s*,\s*([\d:.]+)\s*,\s*([\d:.]+)\s*,\s*([\d:.]+)/);
      if (match) {
        scenes.push({
          index: parseInt(match[1]),
          startTime: match[2],
          endTime: match[3],
          duration: match[4],
        });
      }
    }
    return scenes;
  }
}

interface SceneInfo { index: number; startTime: string; endTime: string; duration: string; }
