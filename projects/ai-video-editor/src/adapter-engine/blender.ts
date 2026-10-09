/**
 * AI Creative OS - Blender Adapter
 * 3D animation, cameras, tracking, compositing, particles, scripting.
 * License: GPL-2.0+
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";
import { execCommand } from "../core/index.js";

export class BlenderAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "blender";

  private _caps: AdapterCapability[] = [
    { name: "3d_animation", supported: true, quality: 92, speed: 78 },
    { name: "motion_graphics", supported: true, quality: 86, speed: 75 },
    { name: "compositing", supported: true, quality: 85, speed: 72 },
    { name: "tracking", supported: true, quality: 82, speed: 70 },
    { name: "particles", supported: true, quality: 88, speed: 65 },
    { name: "rendering", supported: true, quality: 95, speed: 60 },
    { name: "camera_animation", supported: true, quality: 90, speed: 75 },
    { name: "modeling", supported: true, quality: 92, speed: 70 },
    { name: "scripting", supported: true, quality: 88, speed: 90 },
    { name: "geometry_nodes", supported: true, quality: 85, speed: 72 },
  ];

  async detect(): Promise<boolean> {
    const result = execCommand("blender --version 2>/dev/null");
    if (result.exitCode === 0 && result.stdout) {
      this._installed = true;
      this._version = result.stdout.match(/Blender\s+([\d.]+)/)?.[1] ?? "detected";
      return true;
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["scripting", "cli", "project_file"]; }

  async runPythonScript(script: string): Promise<AdapterResult<string>> {
    const escaped = script.replace(/"/g, '\\"');
    return this.executeWithRetry(
      `blender --background --python-expr "${escaped}"`,
      { timeout: 120000 },
    );
  }

  async renderFrame(blendFile: FilePath, outputPath: FilePath, frame?: number): Promise<AdapterResult<string>> {
    const frameArg = frame ? `-f ${frame}` : "-a";
    return this.executeWithRetry(
      `blender -b "${blendFile}" ${frameArg} -o "${outputPath}"`,
      { timeout: 600000 },
    );
  }
}
