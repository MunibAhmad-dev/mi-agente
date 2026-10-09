/**
 * AI Creative OS - Canva Adapter
 * Templates, thumbnails, social media design.
 * License: Proprietary (Canva)
 * Automation: API (limited free tier), browser automation
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult } from "../types/index.js";

export class CanvaAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "canva";

  private _caps: AdapterCapability[] = [
    { name: "templates", supported: true, quality: 82, speed: 85 },
    { name: "thumbnail_generation", supported: true, quality: 80, speed: 88 },
    { name: "social_media_design", supported: true, quality: 85, speed: 90 },
    { name: "text_design", supported: true, quality: 80, speed: 88 },
    { name: "image_editing", supported: true, quality: 75, speed: 85 },
  ];

  async detect(): Promise<boolean> {
    // Canva is web-based; check if accessible
    const result = await this.executeCommand(
      'curl -s -o /dev/null -w "%{http_code}" "https://www.canva.com" 2>/dev/null',
      { timeout: 10000 },
    );
    // Canva doesn't have a local installation - it's a web service
    this._installed = false;
    this._version = "web-based";
    return false; // Not locally available
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["accessibility", "gui_automation"]; }
}
