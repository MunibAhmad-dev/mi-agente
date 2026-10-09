/**
 * AI Creative OS - Adobe After Effects Adapter
 * Motion graphics, VFX, compositing, animation.
 * License: Proprietary (Adobe)
 * Automation: ExtendScript (JSX), CEP panels, project file manipulation
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";
import { execCommand, getPlatform } from "../core/index.js";

export class AfterEffectsAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "afterfx";

  private _caps: AdapterCapability[] = [
    { name: "motion_graphics", supported: true, quality: 95, speed: 85 },
    { name: "titles", supported: true, quality: 92, speed: 88 },
    { name: "lower_thirds", supported: true, quality: 90, speed: 88 },
    { name: "kinetic_typography", supported: true, quality: 90, speed: 82 },
    { name: "compositing", supported: true, quality: 95, speed: 80 },
    { name: "keying", supported: true, quality: 92, speed: 82 },
    { name: "tracking", supported: true, quality: 90, speed: 78 },
    { name: "rotoscoping", supported: true, quality: 88, speed: 75 },
    { name: "particles", supported: true, quality: 85, speed: 72 },
    { name: "3d_composition", supported: true, quality: 88, speed: 70 },
    { name: "expressions", supported: true, quality: 90, speed: 95 },
    { name: "rendering", supported: true, quality: 92, speed: 80 },
    { name: "transitions", supported: true, quality: 88, speed: 85 },
    { name: "motion_paths", supported: true, quality: 90, speed: 82 },
  ];

  async detect(): Promise<boolean> {
    const os = getPlatform();
    let cmd = "";

    if (os === "windows") {
      cmd = 'dir /b "C:\\Program Files\\Adobe\\Adobe After Effects*" 2>nul';
    } else if (os === "macos") {
      cmd = 'ls /Applications/Adobe\ After\ Effects*/Contents/MacOS/AfterFX 2>/dev/null';
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
    return ["scripting", "project_file", "gui_automation"];
  }

  /**
   * After Effects can be scripted via ExtendScript (.jsx) files.
   */
  async runExtendScript(scriptPath: FilePath): Promise<AdapterResult<string>> {
    // AE scripting via aescript/aejs or command line
    return this.executeCommand(
      `aerender -project "${scriptPath}"`,
      { timeout: 600000 },
    );
  }
}
