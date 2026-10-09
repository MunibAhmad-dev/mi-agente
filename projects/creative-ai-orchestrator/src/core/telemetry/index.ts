// ============================================================================
// Telemetry (Opt-in, Disabled by Default)
// ============================================================================
// No data sent externally unless explicitly enabled.
// Tracks: actions performed, errors encountered, performance metrics.
// NEVER sends: images, prompts, models, user files.
// ============================================================================

import type { CaioDatabase } from "../types/index.js";

export interface TelemetryEvent {
  category: string;
  action: string;
  value?: number;
  metadata?: Record<string, string>;
  timestamp: Date;
}

export class Telemetry {
  private enabled: boolean;
  private events: TelemetryEvent[] = [];

  constructor(db: CaioDatabase, enabled: boolean = false) {
    this.enabled = enabled;
    // Check database setting
    if (!enabled) {
      const row = db.get<{ value: string }>("SELECT value FROM schema_meta WHERE key = 'telemetry'");
      this.enabled = row?.value === "true";
    }
  }

  /**
   * Record a telemetry event.
   */
  record(category: string, action: string, value?: number, metadata?: Record<string, string>): void {
    if (!this.enabled) return;

    this.events.push({
      category,
      action,
      value,
      metadata,
      timestamp: new Date(),
    });
  }

  /**
   * Enable telemetry (requires explicit user consent).
   */
  enable(db: CaioDatabase): void {
    this.enabled = true;
    db.run("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('telemetry', 'true')");
  }

  /**
   * Disable telemetry.
   */
  disable(db: CaioDatabase): void {
    this.enabled = false;
    db.run("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('telemetry', 'false')");
    this.events = [];
  }

  /**
   * Check if telemetry is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get collected events (for debugging).
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }
}
