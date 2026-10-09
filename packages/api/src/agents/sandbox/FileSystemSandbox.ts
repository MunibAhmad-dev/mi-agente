/**
 * FileSystemSandbox - Implementación de sandbox usando directorio local aislado
 * 
 * Crea un workspace temporal aislado para ejecutar tareas de agente
 * sin afectar el entorno principal.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import type {
  SandboxConfig,
  SandboxCapabilities,
  SandboxFile,
  SandboxCommand,
  SandboxCommandResult,
  SandboxDiff,
  SandboxSnapshot,
  SandboxStats,
  ApplySandboxChangesOptions,
  SandboxChangePreview,
} from './types';
import { createSandboxCapabilities } from './types';
import { SandboxInterface } from './SandboxInterface';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

interface FileSystemSandboxState {
  originalFiles: Map<string, string>;
  createdFiles: Set<string>;
  modifiedFiles: Set<string>;
  deletedFiles: Set<string>;
  commands: SandboxCommandResult[];
}

export class FileSystemSandbox extends SandboxInterface {
  private workspaceDir: string;
  private initialized = false;
  private state: FileSystemSandboxState = {
    originalFiles: new Map(),
    createdFiles: new Set(),
    modifiedFiles: new Set(),
    deletedFiles: new Set(),
    commands: [],
  };

  constructor(config: SandboxConfig) {
    super(config);
    this.workspaceDir = config.workspacePath || path.join(os.tmpdir(), `sandbox_${this.config.id}`);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Crear directorio de trabajo
      await fs.mkdir(this.workspaceDir, { recursive: true });
      this.initialized = true;
      logger.debug(`[FileSystemSandbox] Initialized at ${this.workspaceDir}`);
    } catch (error) {
      logger.error('[FileSystemSandbox] Initialization failed:', error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  getCapabilities(): SandboxCapabilities {
    return createSandboxCapabilities('filesystem');
  }

  getContext() {
    return {
      sandboxId: this.config.id,
      type: 'filesystem',
      workspacePath: this.workspaceDir,
      sessionId: this.config.id,
      capabilities: this.getCapabilities(),
    };
  }

  // =========================================================================
  // ARCHIVOS
  // =========================================================================

  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    try {
      return await fs.readFile(fullPath, 'utf8');
    } catch (error) {
      logger.error(`[FileSystemSandbox] Error reading ${filePath}:`, error);
      throw error;
    }
  }

  async readFiles(filePaths: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const filePath of filePaths) {
      try {
        result[filePath] = await this.readFile(filePath);
      } catch (error) {
        result[filePath] = '';
      }
    }
    return result;
  }

  async writeFile(filePath: string, content: string, encoding?: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    
    // Verificar si es archivo nuevo
    const isNew = !this.state.originalFiles.has(filePath) && !await this.fileExists(fullPath);
    
    // Guardar contenido original si es modificación
    if (!isNew && !this.state.modifiedFiles.has(filePath)) {
      try {
        this.state.originalFiles.set(filePath, await fs.readFile(fullPath, 'utf8'));
        this.state.modifiedFiles.add(filePath);
      } catch (error) {
        // Archivo no existe, se creará
      }
    }

    if (isNew) {
      this.state.createdFiles.add(filePath);
    }

    // Asegurar directorio padre
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Escribir archivo
    await fs.writeFile(fullPath, content, encoding as BufferEncoding || 'utf8');
    
    this.emit('sandbox.file.modified', { path: filePath, type: isNew ? 'create' : 'modify' });
  }

  async writeFiles(files: SandboxFile[]): Promise<void> {
    for (const file of files) {
      await this.writeFile(file.path, file.content, file.encoding);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);

    // Guardar contenido original si existe
    if (!this.state.deletedFiles.has(filePath)) {
      try {
        if (await this.fileExists(fullPath)) {
          this.state.originalFiles.set(filePath, await fs.readFile(fullPath, 'utf8'));
          this.state.deletedFiles.add(filePath);
        }
      } catch (error) {
        // Archivo no existe
      }
    }

    try {
      await fs.unlink(fullPath);
      this.emit('sandbox.file.deleted', { path: filePath });
    } catch (error) {
      logger.warn(`[FileSystemSandbox] Could not delete ${filePath}:`, error);
    }
  }

  async deleteFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      await this.deleteFile(filePath);
    }
  }

  async listFiles(dirPath: string, recursive = false): Promise<string[]> {
    const fullPath = this.resolvePath(dirPath);
    const files: string[] = [];

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry.name);
        const relativePath = path.relative(this.workspaceDir, entryPath);

        if (entry.isDirectory()) {
          if (recursive) {
            const subFiles = await this.listFiles(entryPath, true);
            files.push(...subFiles);
          }
        } else {
          files.push(relativePath);
        }
      }
    } catch (error) {
      logger.warn(`[FileSystemSandbox] Could not list ${dirPath}:`, error);
    }

    return files;
  }

  async fileExists(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // COMANDOS
  // =========================================================================

  async executeCommand(command: SandboxCommand): Promise<SandboxCommandResult> {
    const startTime = Date.now();
    const cwd = command.cwd || this.workspaceDir;
    const timeout = command.timeout || 60000;

    const result: SandboxCommandResult = {
      id: command.id,
      stdout: '',
      stderr: '',
      exitCode: 0,
      duration: 0,
      timedOut: false,
    };

    try {
      const env = { ...process.env, ...command.env };
      const fullCommand = command.args
        ? `${command.command} ${command.args.join(' ')}`
        : command.command;

      const { stdout, stderr } = await execAsync(fullCommand, {
        cwd,
        env,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      result.stdout = stdout;
      result.stderr = stderr;
      result.exitCode = 0;
    } catch (error: unknown) {
      const execError = error as { killed?: boolean; code?: number; stdout?: string; stderr?: string };
      result.stdout = execError.stdout || '';
      result.stderr = execError.stderr || (error as Error).message;
      result.exitCode = execError.code || 1;
      result.timedOut = execError.killed === true;
    }

    result.duration = Date.now() - startTime;
    this.state.commands.push(result);

    return result;
  }

  async executeCommands(commands: SandboxCommand[]): Promise<SandboxCommandResult[]> {
    const results: SandboxCommandResult[] = [];
    for (const cmd of commands) {
      results.push(await this.executeCommand(cmd));
    }
    return results;
  }

  // =========================================================================
  // CAMBIOS
  // =========================================================================

  async getChanges(): Promise<SandboxDiff[]> {
    const changes: SandboxDiff[] = [];

    // Archivos creados
    for (const filePath of this.state.createdFiles) {
      if (!this.state.deletedFiles.has(filePath)) {
        changes.push({
          path: filePath,
          type: 'create',
          newContent: await this.readFile(filePath).catch(() => ''),
          hunks: [],
        });
      }
    }

    // Archivos eliminados
    for (const filePath of this.state.deletedFiles) {
      changes.push({
        path: filePath,
        type: 'delete',
        originalContent: this.state.originalFiles.get(filePath),
        hunks: [],
      });
    }

    // Archivos modificados
    for (const filePath of this.state.modifiedFiles) {
      if (!this.state.deletedFiles.has(filePath)) {
        changes.push({
          path: filePath,
          type: 'modify',
          originalContent: this.state.originalFiles.get(filePath),
          newContent: await this.readFile(filePath).catch(() => ''),
          hunks: [],
        });
      }
    }

    return changes;
  }

  async previewChanges(): Promise<SandboxChangePreview> {
    const changes = await this.getChanges();

    const preview: SandboxChangePreview = {
      adds: 0,
      modifies: 0,
      deletes: 0,
      newFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
      estimatedSize: 0,
    };

    for (const change of changes) {
      switch (change.type) {
        case 'create':
          preview.adds++;
          preview.newFiles.push(change.path);
          preview.estimatedSize += (change.newContent?.length || 0);
          break;
        case 'modify':
          preview.modifies++;
          preview.modifiedFiles.push(change.path);
          preview.estimatedSize += Math.abs(
            (change.newContent?.length || 0) - (change.originalContent?.length || 0)
          );
          break;
        case 'delete':
          preview.deletes++;
          preview.deletedFiles.push(change.path);
          break;
      }
    }

    return preview;
  }

  async applyChanges(options?: ApplySandboxChangesOptions): Promise<void> {
    const changes = await this.getChanges();
    const excludePaths = new Set(options?.excludePaths || []);

    if (options?.dryRun) {
      logger.info(`[FileSystemSandbox] Dry run: would apply ${changes.length} changes`);
      return;
    }

    for (const change of changes) {
      if (excludePaths.has(change.path)) {
        continue;
      }

      options?.onProgress?.(
        changes.indexOf(change) / changes.length,
        `Applying: ${change.path}`
      );

      switch (change.type) {
        case 'create':
        case 'modify':
          // El archivo ya está escrito en el sandbox, solo necesitamos
          // copiarlo al destino final si es diferente del workspace
          // En este caso, el sandbox ES el entorno de trabajo
          break;
        case 'delete':
          // El archivo fue eliminado del sandbox, aplicarlo
          // En un caso real, aquí se aplicaría al entorno principal
          break;
      }
    }

    // Limpiar tracking de cambios
    this.state.createdFiles.clear();
    this.state.modifiedFiles.clear();
    this.state.deletedFiles.clear();
    this.state.originalFiles.clear();

    options?.onProgress?.(1, 'Done');
  }

  async discardChanges(): Promise<void> {
    const changes = await this.getChanges();

    // Restaurar archivos originales
    for (const [filePath, content] of this.state.originalFiles) {
      const fullPath = this.resolvePath(filePath);
      await fs.writeFile(fullPath, content, 'utf8');
    }

    // Eliminar archivos creados
    for (const filePath of this.state.createdFiles) {
      if (!this.state.originalFiles.has(filePath)) {
        const fullPath = this.resolvePath(filePath);
        try {
          await fs.unlink(fullPath);
        } catch {
          // Puede que ya no exista
        }
      }
    }

    // Limpiar estado
    this.state.createdFiles.clear();
    this.state.modifiedFiles.clear();
    this.state.deletedFiles.clear();
    this.state.originalFiles.clear();

    logger.debug(`[FileSystemSandbox] Discarded ${changes.length} changes`);
  }

  // =========================================================================
  // SNAPSHOTS
  // =========================================================================

  private snapshots = new Map<string, SandboxSnapshot>();

  async createSnapshot(metadata?: Record<string, unknown>): Promise<SandboxSnapshot> {
    const id = randomUUID();
    const files: Record<string, string> = {};

    // Escanear todos los archivos en el workspace
    const allFiles = await this.listFiles('.', true);
    for (const filePath of allFiles) {
      try {
        files[filePath] = await this.readFile(filePath);
      } catch {
        // Ignorar archivos que no se puedan leer
      }
    }

    const snapshot: SandboxSnapshot = {
      id,
      timestamp: new Date(),
      files,
      metadata,
    };

    this.snapshots.set(id, snapshot);
    return snapshot;
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Limpiar estado actual
    const currentFiles = await this.listFiles('.', true);
    for (const filePath of currentFiles) {
      const fullPath = this.resolvePath(filePath);
      await fs.unlink(fullPath).catch(() => {});
    }

    // Restaurar archivos del snapshot
    for (const [filePath, content] of Object.entries(snapshot.files)) {
      await this.writeFile(filePath, content);
    }

    logger.debug(`[FileSystemSandbox] Restored snapshot ${snapshotId}`);
  }

  // =========================================================================
  // ESTADÍSTICAS
  // =========================================================================

  getStats(): SandboxStats {
    const successfulCommands = this.state.commands.filter(c => c.exitCode === 0).length;
    const failedCommands = this.state.commands.filter(c => c.exitCode !== 0).length;

    return {
      filesCreated: this.state.createdFiles.size,
      filesModified: this.state.modifiedFiles.size,
      filesDeleted: this.state.deletedFiles.size,
      commandsExecuted: this.state.commands.length,
      commandsSucceeded: successfulCommands,
      commandsFailed: failedCommands,
      totalDuration: this.state.commands.reduce((sum, c) => sum + c.duration, 0),
    };
  }

  // =========================================================================
  // LIMPIEZA
  // =========================================================================

  async dispose(): Promise<void> {
    try {
      await fs.rm(this.workspaceDir, { recursive: true, force: true });
      this.initialized = false;
      this.snapshots.clear();
      logger.debug(`[FileSystemSandbox] Disposed workspace at ${this.workspaceDir}`);
    } catch (error) {
      logger.error('[FileSystemSandbox] Error disposing:', error);
      throw error;
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private resolvePath(relativePath: string): string {
    // Prevenir path traversal
    const normalized = path.normalize(relativePath);
    if (normalized.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Invalid path: ${relativePath}`);
    }
    return path.join(this.workspaceDir, normalized);
  }
}

// Registrar implementación
SandboxFactory.register('filesystem', FileSystemSandbox);
