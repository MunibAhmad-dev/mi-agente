// ============================================================================
// Runtime Manager
// ============================================================================
// Manages runtime adapters. ComfyUI is the first; the interface is general.
// ============================================================================

import type {
  RuntimeAdapter,
  RuntimeInfo,
  RuntimeInstallConfig,
  RuntimeConfig,
  RuntimeStartConfig,
  RuntimeModel,
  RuntimeExtension,
  RuntimeExtensionInstallRequest,
  RuntimeSystemInfo,
  WorkflowExecutionRequest,
  ExecutionResult,
  ExecutionStatus,
  LogEntry,
  SnapshotId,
  InstallResult,
  CaioDatabase,
  CaioEvent,
} from "../../core/types/index.js";
import { HealthStatus, ErrorCode, RuntimeId, newId, EventType } from "../../core/types/index.js";
import { EventBus } from "../../core/events/index.js";

export class RuntimeManager {
  private adapters = new Map<string, RuntimeAdapter>();
  private processes = new Map<string, RuntimeInfo>();

  constructor(
    private db: CaioDatabase,
    private eventBus: EventBus
  ) {}

  /**
   * Register a runtime adapter.
   */
  registerAdapter(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Get a registered adapter.
   */
  getAdapter(id: string): RuntimeAdapter | undefined {
    return this.adapters.get(id);
  }

  /**
   * List all registered adapters.
   */
  listAdapters(): string[] {
    return [...this.adapters.keys()];
  }

  /**
   * Detect an installed runtime.
   */
  async detect(adapterId: string): Promise<RuntimeInfo | null> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) return null;
    return adapter.detect();
  }

  /**
   * Install a runtime.
   */
  async install(
    adapterId: string,
    config: RuntimeInstallConfig
  ): Promise<InstallResult> {      const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      return {
        success: false,
        duration: 0,
        warnings: [],
        error: {
          code: ErrorCode.NotFound,
          message: `Adapter '${adapterId}' not registered`,
          recoverable: false,
          timestamp: new Date(),
        },
      };
    }

    const start = Date.now();
    const result = await adapter.install(config);
    result.duration = Date.now() - start;

    // Store in database
    if (result.success) {
      this.db.run(
        `INSERT OR REPLACE INTO runtimes (id, name, adapter_id, version, path, status, config, capabilities, installed_at)
         VALUES (?, ?, ?, ?, ?, 'installed', '{}', '{}', datetime('now'))`,
        newId(),
        adapter.name,
        adapterId,
        result.version || "unknown",
        result.path || ""
      );

    await this.eventBus.emit({
      type: EventType.RuntimeInstalled,
      runtimeId: adapterId as any,
      data: { adapterId, path: result.path, version: result.version },
    });
    }

    return result;
  }

  /**
   * Start a runtime.
   */
  async start(adapterId: string, config?: RuntimeStartConfig): Promise<void> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error(`Adapter '${adapterId}' not found`);
    await adapter.start(config);
    const info = await adapter.detect();
    this.processes.set(adapterId, info);

    await this.eventBus.emit({
      type: EventType.RuntimeStarted,
      runtimeId: adapterId as any,
      data: { port: info.port, pid: info.pid },
    });
  }

  /**
   * Stop a runtime.
   */
  async stop(adapterId: string): Promise<void> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error(`Adapter '${adapterId}' not found`);
    await adapter.stop();
    this.processes.delete(adapterId);

    await this.eventBus.emit({
      type: EventType.RuntimeStopped,
      runtimeId: adapterId as any,
      data: {},
    });
  }

  /**
   * Execute a workflow via a runtime.
   */
  async execute(adapterId: string, request: WorkflowExecutionRequest): Promise<ExecutionResult> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Adapter '${adapterId}' not found`);
    }
    return adapter.execute(request);
  }

  /**
   * Health check all registered runtimes.
   */
  async healthCheckAll(): Promise<Array<{ adapterId: string; status: HealthStatus }>> {
    const results: Array<{ adapterId: string; status: HealthStatus }> = [];
    for (const [id, adapter] of this.adapters) {
      try {
        const status = await adapter.healthCheck();
        results.push({ adapterId: id, status });
      } catch {
        results.push({ adapterId: id, status: HealthStatus.Unknown });
      }
    }
    return results;
  }
}
