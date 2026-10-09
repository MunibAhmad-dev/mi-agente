/**
 * AI Creative OS - Remotion Adapter
 * §53: Programmatic video for templates, data-driven video, social, motion graphics.
 * License: MIT
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";
import { execCommand } from "../core/index.js";

export class RemotionAdapter extends BaseAdapter {
  readonly version = "4.x";
  readonly executableName = "remotion";

  private _caps: AdapterCapability[] = [
    { name: "programmatic_video", supported: true, quality: 85, speed: 90 },
    { name: "templates", supported: true, quality: 82, speed: 88 },
    { name: "motion_graphics", supported: true, quality: 80, speed: 85 },
    { name: "data_driven_video", supported: true, quality: 78, speed: 90 },
    { name: "social_media", supported: true, quality: 80, speed: 88 },
    { name: "titles", supported: true, quality: 82, speed: 90 },
  ];

  async detect(): Promise<boolean> {
    // Check if Remotion CLI or a Remotion project exists
    for (const cmd of [
      "npx remotion --version 2>/dev/null",
      "remotion --version 2>/dev/null",
    ]) {
      const result = await this.executeCommand(cmd, { timeout: 15000 });
      if (result.success && result.data) {
        this._installed = true;
        this._version = result.data.trim().match(/[\d.]+/)?.[0] ?? "detected";
        this.logger.info(`Remotion detected: v${this._version}`);
        return true;
      }
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["scripting", "cli"]; }

  /**
   * Render a Remotion composition.
   */
  async renderComposition(
    projectPath: FilePath,
    compositionId: string,
    outputPath: FilePath,
    options: { fps?: number; width?: number; height?: number; frames?: number } = {},
  ): Promise<AdapterResult<string>> {
    const args = [
      "npx", "remotion", "render",
      projectPath, compositionId, outputPath,
    ];
    if (options.fps) args.push("--fps", String(options.fps));
    if (options.width) args.push("--width", String(options.width));
    if (options.height) args.push("--height", String(options.height));
    if (options.frames) args.push("--frames", `0-${options.frames - 1}`);
    return this.executeWithRetry(args.join(" "), { timeout: 300000 });
  }

  /**
   * List available compositions in a Remotion project.
   */
  async listCompositions(projectPath: FilePath): Promise<AdapterResult<string[]>> {
    const result = await this.executeCommand(
      `npx remotion compositions "${projectPath}" --json 2>/dev/null`,
      { timeout: 30000 },
    );
    if (!result.success || !result.data) return { ...result, data: [] };
    try {
      const comps = JSON.parse(result.data);
      return { ...result, data: Array.isArray(comps) ? comps.map((c: any) => c.id ?? c) : [] };
    } catch { return { ...result, data: [] }; }
  }

  /**
   * Preview a Remotion composition in the browser.
   */
  async preview(projectPath: FilePath, compositionId: string): Promise<AdapterResult<string>> {
    return this.executeCommand(
      `npx remotion preview "${projectPath}" --composition "${compositionId}"`,
      { timeout: 10000 },
    );
  }
}
