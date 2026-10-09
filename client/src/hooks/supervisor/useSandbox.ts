/**
 * useSandbox Hooks
 *
 * Hooks de React para el sistema de Sandbox
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/sandbox';

/**
 * Obtener diff de un archivo
 */
export function useGetFileDiff(sandboxId: string, filePath: string) {
  return useQuery({
    queryKey: ['sandbox', sandboxId, 'diff', filePath],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/${sandboxId}/diff/${filePath}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch diff');
      }
      return response.json();
    },
    enabled: !!sandboxId && !!filePath,
  });
}

/**
 * Obtener diff de todos los archivos modificados
 */
export function useGetAllDiffs(sandboxId: string) {
  return useQuery({
    queryKey: ['sandbox', sandboxId, 'diff-all'],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/${sandboxId}/diff-all`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch all diffs');
      }
      return response.json();
    },
    enabled: !!sandboxId,
  });
}

/**
 * Obtener estado de salud del sandbox
 */
export function useSandboxHealth() {
  return useQuery({
    queryKey: ['sandbox', 'health'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/health`);
      if (!response.ok) {
        throw new Error('Failed to fetch sandbox health');
      }
      return response.json();
    },
    refetchInterval: 30000,
  });
}

/**
 * Listar sandboxes del usuario
 */
export function useListSandboxes() {
  return useQuery({
    queryKey: ['sandbox', 'list'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/list`);
      if (!response.ok) {
        throw new Error('Failed to fetch sandboxes');
      }
      return response.json();
    },
  });
}

/**
 * Obtener detalles de un sandbox
 */
export function useGetSandbox(sandboxId: string) {
  return useQuery({
    queryKey: ['sandbox', sandboxId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/${sandboxId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sandbox');
      }
      return response.json();
    },
    enabled: !!sandboxId,
    refetchInterval: 5000,
  });
}

/**
 * Obtener archivos modificados de un sandbox
 */
export function useGetModifiedFiles(sandboxId: string, options?: { type?: string; staged?: boolean }) {
  return useQuery({
    queryKey: ['sandbox', sandboxId, 'files', options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.type) params.set('type', options.type);
      if (options?.staged !== undefined) params.set('staged', String(options.staged));

      const response = await fetch(
        `${API_BASE}/${sandboxId}/files?${params}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      return response.json();
    },
    enabled: !!sandboxId,
  });
}

/**
 * Obtener historial de terminal
 */
export function useGetTerminalHistory(sandboxId: string) {
  return useQuery({
    queryKey: ['sandbox', sandboxId, 'terminal'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/${sandboxId}/terminal`);
      if (!response.ok) {
        throw new Error('Failed to fetch terminal history');
      }
      return response.json();
    },
    enabled: !!sandboxId,
    refetchInterval: 2000,
  });
}

/**
 * Crear un nuevo sandbox
 */
export function useCreateSandbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      workspacePath,
      resources,
    }: {
      sessionId: string;
      workspacePath?: string;
      resources?: { cpu?: string; memory?: string };
    }) => {
      const response = await fetch(`${API_BASE}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, workspacePath, resources }),
      });
      if (!response.ok) {
        throw new Error('Failed to create sandbox');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox', 'list'] });
    },
  });
}

/**
 * Ejecutar comando en sandbox
 */
export function useExecuteInSandbox() {
  return useMutation({
    mutationFn: async ({
      sandboxId,
      command,
      options,
    }: {
      sandboxId: string;
      command: string;
      options?: { timeout?: number };
    }) => {
      const response = await fetch(`${API_BASE}/${sandboxId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, options }),
      });
      if (!response.ok) {
        throw new Error('Failed to execute command');
      }
      return response.json();
    },
  });
}

/**
 * Leer archivo del sandbox
 */
export function useReadFile(sandboxId: string, filePath: string) {
  return useQuery({
    queryKey: ['sandbox', sandboxId, 'file', filePath],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/${sandboxId}/files/${filePath}`);
      if (!response.ok) {
        throw new Error('Failed to read file');
      }
      return response.json();
    },
    enabled: !!sandboxId && !!filePath,
  });
}

/**
 * Escribir archivo en sandbox
 */
export function useWriteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sandboxId,
      filePath,
      content,
    }: {
      sandboxId: string;
      filePath: string;
      content: string;
    }) => {
      const response = await fetch(`${API_BASE}/${sandboxId}/files/${filePath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error('Failed to write file');
      }
      return response.json();
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: ['sandbox', sandboxId, 'files'] });
    },
  });
}

/**
 * Preparar archivos para promoción
 */
export function useStageFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sandboxId,
      filePaths,
    }: {
      sandboxId: string;
      filePaths: string[];
    }) => {
      const response = await fetch(`${API_BASE}/${sandboxId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePaths }),
      });
      if (!response.ok) {
        throw new Error('Failed to stage files');
      }
      return response.json();
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: ['sandbox', sandboxId, 'files'] });
    },
  });
}

/**
 * Promover cambios al workspace real
 */
export function usePromoteChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sandboxId,
      filePaths,
      targetPath,
    }: {
      sandboxId: string;
      filePaths: string[];
      targetPath?: string;
    }) => {
      const response = await fetch(`${API_BASE}/${sandboxId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePaths, targetPath }),
      });
      if (!response.ok) {
        throw new Error('Failed to promote changes');
      }
      return response.json();
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: ['sandbox', sandboxId, 'files'] });
    },
  });
}

/**
 * Descartar cambios
 */
export function useDiscardChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sandboxId,
      filePaths,
    }: {
      sandboxId: string;
      filePaths?: string[];
    }) => {
      const response = await fetch(`${API_BASE}/${sandboxId}/discard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePaths }),
      });
      if (!response.ok) {
        throw new Error('Failed to discard changes');
      }
      return response.json();
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: ['sandbox', sandboxId, 'files'] });
    },
  });
}

/**
 * Destruir sandbox
 */
export function useDestroySandbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sandboxId: string) => {
      const response = await fetch(`${API_BASE}/${sandboxId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to destroy sandbox');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox'] });
    },
  });
}
