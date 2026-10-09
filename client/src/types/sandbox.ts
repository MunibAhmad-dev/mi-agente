/**
 * Sandbox type definitions for the client-side sandbox management hooks.
 * Used by useSandbox.ts and related components.
 */

export interface SandboxFile {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
  size?: number;
  mimeType?: string;
}

export interface SandboxCommandResult {
  id?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration?: number;
  timedOut?: boolean;
}

export interface SandboxDiff {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  oldContent?: string;
  newContent?: string;
  hunks?: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
}

export interface SandboxChangePreview {
  adds: number;
  modifies: number;
  deletes: number;
  newFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  estimatedSize: number;
  changes?: SandboxDiff[];
  summary?: string;
}

export interface SandboxSnapshot {
  id: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
  files?: SandboxFile[];
}
