/**
 * SandboxManager - Gestor centralizado de sandboxes
 * 
 * Administra múltiples instancias de sandbox, provee abstracción
 * para el sistema de supervisión y conecta con el EventBus.
 */

import { EventEmitter } from 'events';
import type {
  SandboxConfig,
  SandboxType,
  SandboxCapabilities,
  SandboxFile,
  SandboxCommand,
  SandboxCommandResult,
  SandboxExecutionResult,
  SandboxDiff,
  SandboxSnapshot,
  SandboxStats,
  SandboxContext,
  SandboxEventType,
  ApplySandboxChangesOptions,
  SandboxChangePreview,
} from './types';
import { SandboxInterface, SandboxFactory } from './SandboxInterface';
import { logger } from '../utils/logger';

export interface SandboxManagerConfig {
  defaultType?: SandboxType;
  maxSandboxes?: number;
  defaultTimeout?: number;
  autoCleanup?: boolean;
  cleanupTimeout?: number;
}

export interface SandboxHandle {
  id: string;
  type: SandboxType;
  instance: SandboxInterface;
  sessionId?: string;
  userId?: string;
  conversationId?: string;
  createdAt: Date;
  lastUsed: Date;
  referenceCount: number;
}

const DEFAULT_CONFIG: Required<SandboxManagerConfig> = {
  defaultType: 'filesystem',
  maxSandboxes: 10,
  defaultTimeout: 300000, // 5 minutos
  autoCleanup: true,
  cleanupTimeout: 3600000, // 1 hora
};

/**
 * SandboxManager - Administrador central de sandboxes
 */
export class SandboxManager extends EventEmitter {
  private sandboxes = new Map<string, SandboxHandle>();
  private config: Required<SandboxManagerConfig>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: SandboxManagerConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
  }

  // =========================================================================
  // CREACIÓN DE SANDBOXES
  // =========================================================================

  /**
   * Crear un nuevo sandbox
   */
  async createSandbox(options: {
    type?: SandboxType;
    sessionId?: string;
    userId?: string;
    conversationId?: string;
    workspacePath?: string;
    timeout?: number;
    env?: Record<string, string>;
  }): Promise<string> {
    const id = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const type = options.type || this.config.defaultType;

    // Verificar límite
    if (this.sandboxes.size >= this.config.maxSandboxes) {
      await this.cleanupOldest();
    }

    const config: SandboxConfig = {
      type,
      id,
      name: options.sessionId || id,
      workspacePath: options.workspacePath,
      timeout: options.timeout || this.config.defaultTimeout,
      env: options.env,
      userId: options.userId,
      conversationId: options.conversationId,
    };

    const instance = SandboxFactory.create(config);
    await instance.initialize();

    const handle: SandboxHandle = {
      id,
      type,
      instance,
      sessionId: options.sessionId,
      userId: options.userId,
      conversationId: options.conversationId,
      createdAt: new Date(),
      lastUsed: new Date(),
      referenceCount: 1,
    };

    this.sandboxes.set(id, handle);
    this.emit('sandbox.created', { id, type, sessionId: options.sessionId });

    logger.debug(`[SandboxManager] Created sandbox ${id} of type ${type}`);

    return id;
  }

  /**
   * Obtener un sandbox por ID
   */
  getSandbox(id: string): SandboxInterface | null {
    const handle = this.sandboxes.get(id);
    if (handle) {
      handle.lastUsed = new Date();
      return handle.instance;
    }
    return null;
  }

  /**
   * Verificar si existe un sandbox
   */
  hasSandbox(id: string): boolean {
    return this.sandboxes.has(id);
  }

  /**
   * Liberar referencia a un sandbox (no lo destruye)
   */
  releaseSandbox(id: string): void {
    const handle = this.sandboxes.get(id);
    if (handle) {
      handle.referenceCount = Math.max(0, handle.referenceCount - 1);
    }
  }

  /**
   * Destruir un sandbox específico
   */
  async destroySandbox(id: string): Promise<void> {
    const handle = this.sandboxes.get(id);
    if (!handle) {
      return;
    }

    try {
      await handle.instance.dispose();
      this.sandboxes.delete(id);
      this.emit('sandbox.destroyed', { id, type: handle.type });
      logger.debug(`[SandboxManager] Destroyed sandbox ${id}`);
    } catch (error) {
      logger.error(`[SandboxManager] Error destroying sandbox ${id}:`, error);
      throw error;
    }
  }

  /**
   * Listar todos los sandbox activos
   */
  listSandboxes(): SandboxHandle[] {
    return Array.from(this.sandboxes.values());
  }

  // =========================================================================
  // OPERACIONES DE ARCHIVOS
  // =========================================================================

  /**
   * Leer archivo(s) de un sandbox
   */
  async readFile(sandboxId: string, path: string): Promise<string> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    this.emitFileEvent('sandbox.file.reading', sandboxId, { path });
    const content = await sandbox.readFile(path);
    this.emitFileEvent('sandbox.file.read', sandboxId, { path, size: content.length });

    return content;
  }

  /**
   * Escribir archivo(s) en un sandbox
   */
  async writeFile(sandboxId: string, path: string, content: string, encoding?: string): Promise<void> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    this.emitFileEvent('sandbox.file.writing', sandboxId, { path, size: content.length });
    await sandbox.writeFile(path, content, encoding);
    this.emitFileEvent('sandbox.file.written', sandboxId, { path });
  }

  /**
   * Eliminar archivo de un sandbox
   */
  async deleteFile(sandboxId: string, path: string): Promise<void> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    this.emitFileEvent('sandbox.file.deleting', sandboxId, { path });
    await sandbox.deleteFile(path);
    this.emitFileEvent('sandbox.file.deleted', sandboxId, { path });
  }

  /**
   * Listar archivos en un sandbox
   */
  async listFiles(sandboxId: string, path: string, recursive = false): Promise<string[]> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return sandbox.listFiles(path, recursive);
  }

  // =========================================================================
  // OPERACIONES DE COMANDOS
  // =========================================================================

  /**
   * Ejecutar comando en un sandbox
   */
  async executeCommand(
    sandboxId: string,
    command: string,
    options?: { cwd?: string; env?: Record<string, string>; timeout?: number }
  ): Promise<SandboxCommandResult> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    this.emit('sandbox.command.started', { sandboxId, command });

    const startTime = Date.now();
    try {
      const result = await sandbox.executeCommand({
        id: `cmd_${Date.now()}`,
        command,
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout,
      });

      const duration = Date.now() - startTime;
      this.emit('sandbox.command.completed', {
        sandboxId,
        command,
        exitCode: result.exitCode,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.emit('sandbox.command.error', {
        sandboxId,
        command,
        error: (error as Error).message,
        duration,
      });
      throw error;
    }
  }

  // =========================================================================
  // GESTIÓN DE CAMBIOS
  // =========================================================================

  /**
   * Obtener cambios del sandbox
   */
  async getChanges(sandboxId: string): Promise<SandboxDiff[]> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return sandbox.getChanges();
  }

  /**
   * Vista previa de cambios
   */
  async previewChanges(sandboxId: string): Promise<SandboxChangePreview> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return sandbox.previewChanges();
  }

  /**
   * Aplicar cambios del sandbox al entorno principal
   */
  async applyChanges(sandboxId: string, options?: ApplySandboxChangesOptions): Promise<void> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    this.emit('sandbox.changes.applying', { sandboxId });

    try {
      await sandbox.applyChanges(options);
      this.emit('sandbox.changes.applied', { sandboxId, options });
    } catch (error) {
      this.emit('sandbox.changes.error', { sandboxId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Descartar cambios del sandbox
   */
  async discardChanges(sandboxId: string): Promise<void> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    await sandbox.discardChanges();
    this.emit('sandbox.changes.discarded', { sandboxId });
  }

  // =========================================================================
  // SNAPSHOTS
  // =========================================================================

  /**
   * Crear snapshot del sandbox
   */
  async createSnapshot(sandboxId: string, metadata?: Record<string, unknown>): Promise<SandboxSnapshot> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return sandbox.createSnapshot(metadata);
  }

  /**
   * Restaurar desde snapshot
   */
  async restoreSnapshot(sandboxId: string, snapshotId: string): Promise<void> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    await sandbox.restoreSnapshot(snapshotId);
    this.emit('sandbox.snapshot.restored', { sandboxId, snapshotId });
  }

  // =========================================================================
  // ESTADÍSTICAS
  // =========================================================================

  /**
   * Obtener estadísticas de un sandbox
   */
  getStats(sandboxId: string): SandboxStats | null {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      return null;
    }

    return sandbox.getStats();
  }

  /**
   * Obtener estadísticas globales
   */
  getGlobalStats(): {
    totalSandboxes: number;
    totalFilesCreated: number;
    totalFilesModified: number;
    totalCommandsExecuted: number;
    totalErrors: number;
  } {
    let totalFilesCreated = 0;
    let totalFilesModified = 0;
    let totalCommandsExecuted = 0;

    for (const handle of this.sandboxes.values()) {
      const stats = handle.instance.getStats();
      totalFilesCreated += stats.filesCreated;
      totalFilesModified += stats.filesModified;
      totalCommandsExecuted += stats.commandsExecuted;
    }

    return {
      totalSandboxes: this.sandboxes.size,
      totalFilesCreated,
      totalFilesModified,
      totalCommandsExecuted,
      totalErrors: 0,
    };
  }

  // =========================================================================
  // LIMPIEZA
  // =========================================================================

  /**
   * Limpiar sandbox más antiguo
   */
  private async cleanupOldest(): Promise<void> {
    if (this.sandboxes.size === 0) {
      return;
    }

    let oldest: SandboxHandle | null = null;
    let oldestTime = Infinity;

    for (const handle of this.sandboxes.values()) {
      if (handle.referenceCount === 0 && handle.lastUsed.getTime() < oldestTime) {
        oldest = handle;
        oldestTime = handle.lastUsed.getTime();
      }
    }

    if (oldest) {
      await this.destroySandbox(oldest.id);
    }
  }

  /**
   * Iniciar timer de limpieza automática
   */
  private startCleanupTimer(): void {
    if (!this.config.autoCleanup) {
      return;
    }

    this.cleanupInterval = setInterval(async () => {
      const now = Date.now();

      for (const [id, handle] of this.sandboxes) {
        if (
          handle.referenceCount === 0 &&
          now - handle.lastUsed.getTime() > this.config.cleanupTimeout
        ) {
          try {
            await this.destroySandbox(id);
          } catch (error) {
            logger.error(`[SandboxManager] Cleanup error for ${id}:`, error);
          }
        }
      }
    }, this.config.cleanupTimeout / 2);
  }

  /**
   * Detener timer de limpieza
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Destruir todos los sandboxes
   */
  async dispose(): Promise<void> {
    this.stopCleanupTimer();

    const destroyPromises = Array.from(this.sandboxes.keys()).map((id) =>
      this.destroySandbox(id).catch((error) => {
        logger.error(`[SandboxManager] Error disposing sandbox ${id}:`, error);
      })
    );

    await Promise.allSettled(destroyPromises);
    this.sandboxes.clear();

    logger.debug('[SandboxManager] Disposed all sandboxes');
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private emitFileEvent(type: SandboxEventType, sandboxId: string, payload: Record<string, unknown>): void {
    this.emit(type, { sandboxId, ...payload });
  }
}

// Singleton instance
let sandboxManagerInstance: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!sandboxManagerInstance) {
    sandboxManagerInstance = new SandboxManager();
  }
  return sandboxManagerInstance;
}

export function createSandboxManager(config?: SandboxManagerConfig): SandboxManager {
  if (sandboxManagerInstance) {
    sandboxManagerInstance.dispose();
  }
  sandboxManagerInstance = new SandboxManager(config);
  return sandboxManagerInstance;
}
