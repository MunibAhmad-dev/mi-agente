/**
 * AI Creative OS - Natron Adapter
 * Compositing, keying, tracking, rotoscoping, VFX.
 * License: GPL-2.0
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";
import { execCommand } from "../core/index.js";

export class NatronAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "natron";

  private _caps: AdapterCapability[] = [
    { name: "compositing", supported: true, quality: 82, speed: 78 },
    { name: "keying", supported: true, quality: 80, speed: 80 },
    { name: "tracking", supported: true, quality: 78, speed: 75 },
    { name: "rotoscoping", supported: true, quality: 76, speed: 72 },
    { name: "motion_graphics", supported: true, quality: 65, speed: 70 },
  ];

  async detect(): Promise<boolean> {
    const result = execCommand("natron --version 2>/dev/null");
    if (result.exitCode === 0 && result.stdout) {
      this._installed = true;
      this._version = result.stdout.match(/Natron\s+([\d.]+)/)?.[1] ?? "detected";
      return true;
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["scripting", "cli", "project_file"]; }

  async renderProject(projectPath: FilePath, outputPath: FilePath, frameRange?: { start: number; end: number }): Promise<AdapterResult<string>> {
    const rangeArg = frameRange ? `--frame-range ${frameRange.start}-${frameRange.end}` : "";
    return this.executeWithRetry(
      `natron -b "${projectPath}" -o "${outputPath}" ${rangeArg}`,
      { timeout: 600000 },
    );
  }
}
