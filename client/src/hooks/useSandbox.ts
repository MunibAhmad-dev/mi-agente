/**
 * useSandbox - Hook para gestionar el workspace aislado desde el frontend
 * 
 * Conecta con el backend para crear y gestionar sandboxes.
 */

import { useState, useCallback } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { v4 as uuidv4 } from 'uuid';
import type {
  SandboxFile,
  SandboxCommandResult,
  SandboxDiff,
  SandboxChangePreview,
  SandboxSnapshot,
} from '~/types/sandbox';
import { useChangeInspector } from '~/hooks/useChangeInspector';
import { useTimeline } from '~/hooks/useTimeline';
import { getEventBus } from '~/services/EventBus';

export interface SandboxState {
  id: string | null;
  isActive: boolean;
  isLoading: boolean;
  error: string | null;
  workspacePath: string | null;
}

export interface UseSandboxReturn {
  state: SandboxState;
  createSandbox: (options?: {
    type?: 'filesystem' | 'container' | 'vm';
    userId?: string;
    conversationId?: string;
  }) => Promise<string>;
  destroySandbox: () => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  executeCommand: (
    command: string,
    options?: { cwd?: string; timeout?: number }
  ) => Promise<SandboxCommandResult>;
  getChanges: () => Promise<SandboxDiff[]>;
  previewChanges: () => Promise<SandboxChangePreview>;
  applyChanges: () => Promise<void>;
  discardChanges: () => Promise<void>;
  createSnapshot: (metadata?: Record<string, unknown>) => Promise<SandboxSnapshot>;
}

/**
 * Hook useSandbox
 */
export function useSandbox(): UseSandboxReturn {
  const [state, setState] = useState<SandboxState>({
    id: null,
    isActive: false,
    isLoading: false,
    error: null,
    workspacePath: null,
  });

  const { addFileCreated, addFileModified, addFileDeleted } = useChangeInspector();
  const { recordFileRead, recordFileWrite, recordFileDelete, recordMilestone } = useTimeline();
  const eventBus = getEventBus();

  /**
   * Crear un nuevo sandbox
   */
  const createSandbox = useCallback(async (options?: {
    type?: 'filesystem' | 'container' | 'vm';
    userId?: string;
    conversationId?: string;
  }) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // En una implementación real, esto haría una llamada al backend
      // Por ahora simulamos la creación
      const sandboxId = `sandbox_${uuidv4()}`;
      const workspacePath = `/tmp/sandbox/${sandboxId}`;

      setState({
        id: sandboxId,
        isActive: true,
        isLoading: false,
        error: null,
        workspacePath,
      });

      // Registrar en timeline
      recordMilestone('Sandbox creado', `Workspace: ${workspacePath}`);

      // Emitir evento
      eventBus.emit('sandbox.created', '', {
        sandboxId,
        workspacePath,
        type: options?.type || 'filesystem',
      });

      return sandboxId;
    } catch (error) {
      const errorMessage = (error as Error).message;
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, [eventBus, recordMilestone]);

  /**
   * Destruir sandbox
   */
  const destroySandbox = useCallback(async () => {
    if (!state.id) {
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Llamada al backend para destruir
      setState({
        id: null,
        isActive: false,
        isLoading: false,
        error: null,
        workspacePath: null,
      });

      eventBus.emit('sandbox.destroyed', '', { sandboxId: state.id ?? undefined });
      recordMilestone('Sandbox destruido');
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: (error as Error).message,
      }));
      throw error;
    }
  }, [state.id, eventBus, recordMilestone]);

  /**
   * Leer archivo del sandbox
   */
  const readFile = useCallback(async (path: string) => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    try {
      // Llamada al backend
      const content = ''; // Simulamos
      recordFileRead(path);
      return content;
    } catch (error) {
      setState(prev => ({ ...prev, error: (error as Error).message }));
      throw error;
    }
  }, [state.id, recordFileRead]);

  /**
   * Escribir archivo en sandbox
   */
  const writeFile = useCallback(async (path: string, content: string) => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    try {
      // Llamada al backend
      addFileCreated(path, content);
      recordFileWrite(path);
    } catch (error) {
      setState(prev => ({ ...prev, error: (error as Error).message }));
      throw error;
    }
  }, [state.id, addFileCreated, recordFileWrite]);

  /**
   * Eliminar archivo del sandbox
   */
  const deleteFile = useCallback(async (path: string) => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    try {
      // Llamada al backend
      addFileDeleted(path);
      recordFileDelete(path);
    } catch (error) {
      setState(prev => ({ ...prev, error: (error as Error).message }));
      throw error;
    }
  }, [state.id, addFileDeleted, recordFileDelete]);

  /**
   * Ejecutar comando
   */
  const executeCommand = useCallback(async (
    command: string,
    options?: { cwd?: string; timeout?: number }
  ) => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    const result: SandboxCommandResult = {
      id: `cmd_${uuidv4()}`,
      stdout: '',
      stderr: '',
      exitCode: 0,
      duration: 0,
      timedOut: false,
    };

    eventBus.emit('sandbox.command.started', '', {
      sandboxId: state.id ?? undefined,
      command,
    });

    try {
      // Llamada al backend
      // Simulamos respuesta
      return result;
    } catch (error) {
      result.exitCode = 1;
      result.stderr = (error as Error).message;
      eventBus.emit('sandbox.command.error', '', {
        sandboxId: state.id ?? undefined,
        command,
        error: result.stderr,
      });
      throw error;
    }
  }, [state.id, eventBus]);

  /**
   * Obtener cambios
   */
  const getChanges = useCallback(async () => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    // Simulamos respuesta
    return [] as SandboxDiff[];
  }, [state.id]);

  /**
   * Vista previa de cambios
   */
  const previewChanges = useCallback(async () => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    return {
      adds: 0,
      modifies: 0,
      deletes: 0,
      newFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
      estimatedSize: 0,
    } as SandboxChangePreview;
  }, [state.id]);

  /**
   * Aplicar cambios al entorno principal
   */
  const applyChanges = useCallback(async () => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    eventBus.emit('sandbox.changes.applying', '', { sandboxId: state.id ?? undefined });

    try {
      // Llamada al backend
      recordMilestone('Cambios aplicados al entorno principal');
      eventBus.emit('sandbox.changes.applied', '', { sandboxId: state.id ?? undefined });
    } catch (error) {
      eventBus.emit('sandbox.changes.error', '', {
        sandboxId: state.id ?? undefined,
        error: (error as Error).message,
      });
      throw error;
    }
  }, [state.id, eventBus, recordMilestone]);

  /**
   * Descartar cambios
   */
  const discardChanges = useCallback(async () => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    try {
      // Llamada al backend
      recordMilestone('Cambios descartados');
      eventBus.emit('sandbox.changes.discarded', '', { sandboxId: state.id ?? undefined });
    } catch (error) {
      setState(prev => ({ ...prev, error: (error as Error).message }));
      throw error;
    }
  }, [state.id, eventBus, recordMilestone]);

  /**
   * Crear snapshot
   */
  const createSnapshot = useCallback(async (metadata?: Record<string, unknown>) => {
    if (!state.id) {
      throw new Error('No active sandbox');
    }

    return {
      id: `snap_${uuidv4()}`,
      createdAt: new Date().toISOString(),
      metadata,
    } satisfies SandboxSnapshot;
  }, [state.id]);

  return {
    state,
    createSandbox,
    destroySandbox,
    readFile,
    writeFile,
    deleteFile,
    executeCommand,
    getChanges,
    previewChanges,
    applyChanges,
    discardChanges,
    createSnapshot,
  };
}
