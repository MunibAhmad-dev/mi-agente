/**
 * useChangeInspector - Hook para gestionar cambios de archivos
 * 
 * Provee métodos para agregar, revisar y aplicar cambios
 */

import { useCallback } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import {
  changeInspectorAtom,
  pendingChangesSelector,
  allChangesSelector,
  selectedChangeSelector,
  changeStatsSelector,
  FileChange,
  ChangeStatus,
  ChangeType,
} from '~/store/changeInspectorStore';

/**
 * Generar ID único
 */
function generateId(): string {
  return `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Calcular líneas añadidas/eliminadas
 */
function calculateDiffStats(original: string | undefined, newContent: string | undefined): { additions: number; deletions: number } {
  const originalLines = original?.split('\n') || [];
  const newLines = newContent?.split('\n') || [];
  
  // Algoritmo simple: contar diferencias
  const origSet = new Set(originalLines);
  const newSet = new Set(newLines);
  
  let additions = 0;
  let deletions = 0;
  
  for (const line of newLines) {
    if (!origSet.has(line)) additions++;
  }
  
  for (const line of originalLines) {
    if (!newSet.has(line)) deletions++;
  }
  
  return { additions, deletions };
}

export function useChangeInspector() {
  const setState = useSetRecoilState(changeInspectorAtom);
  const pendingChanges = useRecoilValue(pendingChangesSelector);
  const allChanges = useRecoilValue(allChangesSelector);
  const selectedChange = useRecoilValue(selectedChangeSelector);
  const stats = useRecoilValue(changeStatsSelector);

  // =========================================================================
  // ACCIONES
  // =========================================================================

  /**
   * Agregar un cambio
   */
  const addChange = useCallback((
    path: string,
    type: ChangeType,
    options: Partial<{
      originalContent: string;
      newContent: string;
      toolName: string;
      toolCallId: string;
    }> = {}
  ): string => {
    const id = generateId();
    const diffStats = calculateDiffStats(options.originalContent, options.newContent);

    const change: FileChange = {
      id,
      path,
      type,
      originalContent: options.originalContent,
      newContent: options.newContent,
      timestamp: new Date(),
      toolName: options.toolName,
      toolCallId: options.toolCallId,
      status: 'pending',
      additions: diffStats.additions,
      deletions: diffStats.deletions,
    };

    setState((prev) => ({
      ...prev,
      changes: [...prev.changes, change],
    }));

    return id;
  }, [setState]);

  /**
   * Agregar cambio de creación de archivo
   */
  const addFileCreated = useCallback((
    path: string,
    content: string,
    options?: { toolName?: string; toolCallId?: string }
  ) => {
    return addChange(path, 'create', {
      newContent: content,
      ...options,
    });
  }, [addChange]);

  /**
   * Agregar cambio de modificación de archivo
   */
  const addFileModified = useCallback((
    path: string,
    originalContent: string,
    newContent: string,
    options?: { toolName?: string; toolCallId?: string }
  ) => {
    return addChange(path, 'modify', {
      originalContent,
      newContent,
      ...options,
    });
  }, [addChange]);

  /**
   * Agregar cambio de eliminación de archivo
   */
  const addFileDeleted = useCallback((
    path: string,
    originalContent?: string,
    options?: { toolName?: string; toolCallId?: string }
  ) => {
    return addChange(path, 'delete', {
      originalContent,
      ...options,
    });
  }, [addChange]);

  /**
   * Seleccionar un cambio para ver detalles
   */
  const selectChange = useCallback((changeId: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedChangeId: changeId ?? undefined,
    }));
  }, [setState]);

  /**
   * Aprobar un cambio
   */
  const approveChange = useCallback((
    changeId: string,
    note?: string
  ) => {
    setState((prev) => ({
      ...prev,
      changes: prev.changes.map(c =>
        c.id === changeId
          ? {
              ...c,
              status: 'approved' as const,
              reviewedAt: new Date(),
              reviewedBy: 'user' as const,
              reviewNote: note,
            }
          : c
      ),
    }));
  }, [setState]);

  /**
   * Rechazar un cambio
   */
  const rejectChange = useCallback((
    changeId: string,
    reason?: string
  ) => {
    setState((prev) => ({
      ...prev,
      changes: prev.changes.map(c =>
        c.id === changeId
          ? {
              ...c,
              status: 'rejected' as const,
              reviewedAt: new Date(),
              reviewedBy: 'user' as const,
              reviewNote: reason,
            }
          : c
      ),
    }));
  }, [setState]);

  /**
   * Aprobar todos los cambios pendientes
   */
  const approveAll = useCallback((note?: string) => {
    setState((prev) => ({
      ...prev,
      changes: prev.changes.map(c =>
        c.status === 'pending'
          ? {
              ...c,
              status: 'approved' as const,
              reviewedAt: new Date(),
              reviewedBy: 'user' as const,
              reviewNote: note || 'Aprobado en masa',
            }
          : c
      ),
    }));
  }, [setState]);

  /**
   * Rechazar todos los cambios pendientes
   */
  const rejectAll = useCallback((reason?: string) => {
    setState((prev) => ({
      ...prev,
      changes: prev.changes.map(c =>
        c.status === 'pending'
          ? {
              ...c,
              status: 'rejected' as const,
              reviewedAt: new Date(),
              reviewedBy: 'user' as const,
              reviewNote: reason || 'Rechazado en masa',
            }
          : c
      ),
    }));
  }, [setState]);

  /**
   * Marcar cambio como aplicado
   */
  const markAsApplied = useCallback((changeId: string) => {
    setState((prev) => ({
      ...prev,
      changes: prev.changes.map(c =>
        c.id === changeId
          ? { ...c, status: 'applied' as const }
          : c
      ),
    }));
  }, [setState]);

  /**
   * Deshacer revisión (volver a pending)
   */
  const undoReview = useCallback((changeId: string) => {
    setState((prev) => ({
      ...prev,
      changes: prev.changes.map(c =>
        c.id === changeId
          ? {
              ...c,
              status: 'pending' as const,
              reviewedAt: undefined,
              reviewedBy: undefined,
              reviewNote: undefined,
            }
          : c
      ),
    }));
  }, [setState]);

  /**
   * Eliminar un cambio
   */
  const removeChange = useCallback((changeId: string) => {
    setState((prev) => ({
      ...prev,
      changes: prev.changes.filter(c => c.id !== changeId),
      selectedChangeId: prev.selectedChangeId === changeId ? undefined : prev.selectedChangeId,
    }));
  }, [setState]);

  /**
   * Limpiar todos los cambios
   */
  const clearAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      changes: [],
      selectedChangeId: undefined,
    }));
  }, [setState]);

  /**
   * Limpiar cambios aplicados
   */
  const clearApplied = useCallback(() => {
    setState((prev) => ({
      ...prev,
      changes: prev.changes.filter(c => c.status !== 'applied'),
    }));
  }, [setState]);

  /**
   * Alternar vista de diff
   */
  const toggleDiffView = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showDiffView: !prev.showDiffView,
    }));
  }, [setState]);

  /**
   * Alternar auto-aprobación
   */
  const toggleAutoApprove = useCallback(() => {
    setState((prev) => ({
      ...prev,
      autoApproveEnabled: !prev.autoApproveEnabled,
    }));
  }, [setState]);

  // =========================================================================
  // RETORNO
  // =========================================================================

  return {
    // Estado
    pendingChanges,
    allChanges,
    changes: allChanges,
    isLoading: false,
    selectedChange,
    stats,

    // Acciones
    addChange,
    addFileCreated,
    addFileModified,
    addFileDeleted,
    selectChange,
    approveChange,
    rejectChange,
    approveAll,
    rejectAll,
    markAsApplied,
    undoReview,
    removeChange,
    clearAll,
    clearApplied,
    toggleDiffView,
    toggleAutoApprove,
  };
}
