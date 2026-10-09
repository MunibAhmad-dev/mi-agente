/**
 * AI Creative OS - OpenTimelineIO Adapter
 * Timeline interchange format for universal timeline translation.
 * License: Apache 2.0
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";

export class OpenTimelineIOAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "otioconvert";

  private _caps: AdapterCapability[] = [
    { name: "timeline_import", supported: true, quality: 85, speed: 90 },
    { name: "timeline_export", supported: true, quality: 85, speed: 90 },
    { name: "format_conversion", supported: true, quality: 80, speed: 85 },
    { name: "metadata_preservation", supported: true, quality: 88, speed: 95 },
  ];

  async detect(): Promise<boolean> {
    for (const cmd of [
      'python3 -c "import opentimelineio; print(opentimelineio.__version__)" 2>/dev/null',
      'python -c "import opentimelineio; print(opentimelineio.__version__)" 2>/dev/null',
    ]) {
      const result = await this.executeCommand(cmd);
      if (result.success && result.data) {
        this._installed = true;
        this._version = result.data.trim();
        return true;
      }
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["scripting", "cli"]; }

  async convertTimeline(
    inputPath: FilePath,
    outputPath: FilePath,
  ): Promise<AdapterResult<string>> {
    return this.executeWithRetry(
      `python3 -c "import opentimelineio as otio; t = otio.adapters.read_from_file('${inputPath}'); otio.adapters.write_to_file(t, '${outputPath}')" 2>/dev/null || otioconvert "${inputPath}" "${outputPath}"`,
      { timeout: 60000 },
    );
  }
}
