/**
 * AI Creative OS - DaVinci Resolve Adapter
 * Professional editing, color correction/grading, Fairlight audio, Fusion VFX.
 * License: Proprietary (free version available)
 * Automation: Scripting API (Python/Lua), project file manipulation
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";
import { execCommand, getPlatform } from "../core/index.js";

export class DaVinciAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "resolve";

  private _caps: AdapterCapability[] = [
    { name: "timeline_editing", supported: true, quality: 98, speed: 90 },
    { name: "color_correction", supported: true, quality: 99, speed: 92 },
    { name: "color_grading", supported: true, quality: 99, speed: 88 },
    { name: "audio_editing", supported: true, quality: 92, speed: 85 },
    { name: "audio_mixing", supported: true, quality: 95, speed: 82 },
    { name: "compositing", supported: true, quality: 90, speed: 80 },
    { name: "vfx_fusion", supported: true, quality: 92, speed: 78 },
    { name: "transitions", supported: true, quality: 90, speed: 90 },
    { name: "multicam", supported: true, quality: 88, speed: 85 },
    { name: "proxy_editing", supported: true, quality: 85, speed: 95 },
    { name: "rendering", supported: true, quality: 96, speed: 90 },
    { name: "color_scopes", supported: true, quality: 95, speed: 90 },
    { name: "noise_reduction", supported: true, quality: 88, speed: 75 },
    { name: "luts", supported: true, quality: 95, speed: 95 },
  ];

  async detect(): Promise<boolean> {
    const os = getPlatform();
    let cmd = "";

    if (os === "windows") {
      cmd = 'where "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe" 2>nul || dir /b "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe" 2>nul';
    } else if (os === "linux") {
      cmd = 'which resolve 2>/dev/null || ls /opt/resolve/bin/resolve 2>/dev/null || ls /opt/Resolve/bin/resolve 2>/dev/null';
    } else if (os === "macos") {
      cmd = 'ls "/Applications/DaVinci Resolve/Contents/MacOS/Resolve" 2>/dev/null';
    }

    const result = execCommand(cmd);
    if (result.exitCode === 0 && result.stdout.trim()) {
      this._installed = true;
      this._executablePath = result.stdout.trim();
      this._version = "detected";
      return true;
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] {
    return ["scripting", "project_file", "cli"];
  }

  /**
   * Execute DaVinci Resolve scripting API command via Python.
   */
  async runScript(script: string): Promise<AdapterResult<unknown>> {
    const pyScript = `
import sys
sys.path.insert(0, "/opt/resolve/Developer/Scripting/Modules" if sys.platform == "linux" else ".")
try:
    import DaVinciResolveScript as dvr
    resolve = dvr.scriptapp("Resolve")
    if resolve is None:
        print("Could not connect to Resolve")
        sys.exit(1)
    ${script}
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
`;
    return this.executeCommand(
      `python3 -c '${pyScript.replace(/'/g, "'\\''")}' 2>/dev/null || python -c '${pyScript.replace(/'/g, "'\\''")}'`,
      { timeout: 30000 },
    );
  }
}
