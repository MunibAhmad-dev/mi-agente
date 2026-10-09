/**
 * AI Creative OS - Base Adapter
 * 
 * Abstract base class for all provider adapters.
 * No logic specific to any program lives in Core.
 * Each adapter implements the universal interface for its specific tool.
 */

import type {
  UniqueId, AdapterConfig, AdapterResult, AdapterCapability,
  FilePath, Duration,
} from "../types/index.js";
import { Logger, execCommand, generateId, timestamp } from "../core/index.js";

export type AutomationMethod = "native_api" | "cli" | "sdk" | "scripting" |
  "project_file" | "ipc" | "plugin" | "accessibility" | "gui_automation";

export abstract class BaseAdapter {
  readonly id: UniqueId;
  readonly name: string;
  abstract readonly version: string;
  abstract readonly executableName: string;

  protected logger: Logger;
  protected config: AdapterConfig;
  protected _installed = false;
  protected _version: string | null = null;
  protected _executablePath: string | null = null;

  constructor(id: string, name: string, config: AdapterConfig = {}) {
    this.id = id;
    this.name = name;
    this.config = config;
    this.logger = new Logger(`Adapter:${name}`);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Detect if this tool is installed and available on the system.
   */
  async detect(): Promise<boolean> {
    this.logger.debug(`Detecting ${this.name}...`);
    // Subclasses override with specific detection logic
    return this._installed;
  }

  /**
   * Get the capabilities this adapter supports.
   */
  abstract getCapabilities(): AdapterCapability[];

  /**
   * Get the automation methods this adapter supports, ordered by preference.
   */
  abstract getAutomationMethods(): AutomationMethod[];

  /**
   * Test the adapter with a simple operation.
   */
  async test(): Promise<AdapterResult<boolean>> {
    const start = Date.now();
    try {
      const detected = await this.detect();
      return {
        success: detected,
        data: detected,
        duration: Date.now() - start,
        provider: this.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
        provider: this.id,
      };
    }
  }

  // ─── Command Execution ──────────────────────────────────────────────

  /**
   * Execute a command through this adapter.
   */
  protected async executeCommand(
    command: string,
    options: { timeout?: number; cwd?: string } = {},
  ): Promise<AdapterResult<string>> {
    const start = Date.now();
    this.logger.debug(`Executing: ${command}`);

    const result = execCommand(command, {
      timeout: options.timeout ?? this.config.timeout ?? 60000,
      cwd: options.cwd ?? this.config.workingDirectory,
    });

    if (result.exitCode === 0) {
      return {
        success: true,
        data: result.stdout.trim(),
        duration: Date.now() - start,
        provider: this.id,
        command,
        output: result.stdout,
      };
    }

    return {
      success: false,
      error: result.stderr || `Command failed with exit code ${result.exitCode}`,
      duration: Date.now() - start,
      provider: this.id,
      command,
      output: result.stderr,
    };
  }

  /**
   * Execute a command with retry logic.
   */
  protected async executeWithRetry(
    command: string,
    options: { timeout?: number; cwd?: string; retries?: number } = {},
  ): Promise<AdapterResult<string>> {
    const retries = options.retries ?? this.config.retries ?? 1;
    let lastResult: AdapterResult<string>;

    for (let attempt = 0; attempt <= retries; attempt++) {
      lastResult = await this.executeCommand(command, options);
      if (lastResult.success) return lastResult;
      if (attempt < retries) {
        this.logger.warn(`Attempt ${attempt + 1} failed, retrying...`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    return lastResult!;
  }

  // ─── Utilities ──────────────────────────────────────────────────────

  get isInstalled(): boolean {
    return this._installed;
  }

  get detectedVersion(): string | null {
    return this._version;
  }

  get executablePath(): string | null {
    return this._executablePath;
  }

  /**
   * Get the JSON representation of this adapter's state.
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      installed: this._installed,
      detectedVersion: this._version,
      executablePath: this._executablePath,
      capabilities: this.getCapabilities(),
      automationMethods: this.getAutomationMethods(),
    };
  }
}
