/**
 * Sandbox Types - Definiciones de tipos para el sistema de sandbox
 * 
 * Proporciona abstracciones para ejecutar tareas en entornos aislados.
 */

export type SandboxType = 'filesystem' | 'container' | 'vm' | 'mock';
export type SandboxStatus = 'inactive' | 'initializing' | 'active' | 'executing' | 'error' | 'disposed';

export interface SandboxConfig {
  type: SandboxType;
  id: string;
  name?: string;
  workspacePath?: string;
  timeout?: number;
  maxMemory?: string;
  networkIsolation?: boolean;
  env?: Record<string, string>;
  userId?: string;
  conversationId?: string;
}

export interface SandboxCapabilities {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canExecuteCommands: boolean;
  canUseNetwork: boolean;
  canUseBrowser: boolean;
  maxFileSize?: number;
  maxExecutionTime?: number;
}

export interface SandboxFile {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64' | 'binary';
  permissions?: string;
}

export interface SandboxCommand {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface SandboxCommandResult {
  id: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  timedOut: boolean;
}

export interface SandboxExecutionResult {
  success: boolean;
  files?: SandboxFile[];
  commands?: SandboxCommandResult[];
  error?: string;
  duration: number;
  sandboxState?: Record<string, unknown>;
}

export interface SandboxDiff {
  path: string;
  type: 'create' | 'modify' | 'delete';
  originalContent?: string;
  newContent?: string;
  hunks: SandboxDiffHunk[];
}

export interface SandboxDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: SandboxDiffLine[];
}

export interface SandboxDiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface SandboxSnapshot {
  id: string;
  timestamp: Date;
  files: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface SandboxContext {
  sandboxId: string;
  type: SandboxType;
  workspacePath: string;
  sessionId: string;
  capabilities: SandboxCapabilities;
}

export type SandboxEventType =
  | 'sandbox.created'
  | 'sandbox.initialized'
  | 'sandbox.executing'
  | 'sandbox.executed'
  | 'sandbox.error'
  | 'sandbox.disposed'
  | 'sandbox.file.created'
  | 'sandbox.file.modified'
  | 'sandbox.file.deleted'
  | 'sandbox.command.started'
  | 'sandbox.command.completed'
  | 'sandbox.command.error';

export interface SandboxEvent {
  type: SandboxEventType;
  sandboxId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface SandboxStats {
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  commandsExecuted: number;
  commandsSucceeded: number;
  commandsFailed: number;
  totalDuration: number;
  memoryUsed?: number;
}

export interface ApplySandboxChangesOptions {
  force?: boolean;
  dryRun?: boolean;
  excludePaths?: string[];
  onProgress?: (progress: number, message: string) => void;
}

export interface SandboxChangePreview {
  adds: number;
  modifies: number;
  deletes: number;
  newFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  estimatedSize: number;
}

export function createSandboxCapabilities(type: SandboxType): SandboxCapabilities {
  switch (type) {
    case 'filesystem':
      return {
        canReadFiles: true,
        canWriteFiles: true,
        canExecuteCommands: true,
        canUseNetwork: false,
        canUseBrowser: false,
      };
    case 'container':
      return {
        canReadFiles: true,
        canWriteFiles: true,
        canExecuteCommands: true,
        canUseNetwork: true,
        canUseBrowser: true,
        maxExecutionTime: 3600000,
      };
    case 'vm':
      return {
        canReadFiles: true,
        canWriteFiles: true,
        canExecuteCommands: true,
        canUseNetwork: true,
        canUseBrowser: true,
        maxMemory: '4g',
        maxExecutionTime: 7200000,
      };
    case 'mock':
      return {
        canReadFiles: true,
        canWriteFiles: true,
        canExecuteCommands: false,
        canUseNetwork: false,
        canUseBrowser: false,
      };
    default:
      return {
        canReadFiles: false,
        canWriteFiles: false,
        canExecuteCommands: false,
        canUseNetwork: false,
        canUseBrowser: false,
      };
  }
}
