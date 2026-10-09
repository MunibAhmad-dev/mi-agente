/**
 * ChangeInspectorStore - Gestiona los cambios de archivos pendientes de revisión
 * 
 * Permite ver diferencias, aprobar o rechazar cambios
 */

import { atom, selector } from 'recoil';

/**
 * Estado de un cambio
 */
export type ChangeStatus = 'pending' | 'approved' | 'rejected' | 'applied';

/**
 * Tipo de cambio
 */
export type ChangeType = 'create' | 'modify' | 'delete' | 'rename';

/**
 * Un cambio de archivo individual
 */
export interface FileChange {
  id: string;
  path: string;
  type: ChangeType;
  
  // Contenido (para created/modified)
  originalContent?: string;
  newContent?: string;
  
  // Metadatos
  timestamp: Date;
  toolName?: string;
  toolCallId?: string;
  
  // Estado de revisión
  status: ChangeStatus;
  reviewedAt?: Date;
  reviewedBy?: 'user' | 'auto';
  reviewNote?: string;
  
  // Líneas cambiadas (para mostrar en diff)
  additions?: number;
  deletions?: number;
}

/**
 * Estado del inspector de cambios
 */
export interface ChangeInspectorState {
  changes: FileChange[];
  sessionId?: string;
  autoApproveEnabled: boolean;
  showDiffView: boolean;
  selectedChangeId?: string;
}

/**
 * Átomo principal
 */
export const changeInspectorAtom = atom<ChangeInspectorState>({
  key: 'changeInspector/state',
  default: {
    changes: [],
    autoApproveEnabled: false,
    showDiffView: true,
  },
});

/**
 * Selector: obtener todos los cambios pendientes
 */
export const pendingChangesSelector = selector({
  key: 'changeInspector/pending',
  get: ({ get }) => {
    const state = get(changeInspectorAtom);
    return state.changes.filter(c => c.status === 'pending');
  },
});

/**
 * Selector: obtener todos los cambios
 */
export const allChangesSelector = selector({
  key: 'changeInspector/all',
  get: ({ get }) => {
    const state = get(changeInspectorAtom);
    return state.changes;
  },
});

/**
 * Selector: obtener cambios por estado
 */
export const changesByStatusSelector = selector({
  key: 'changeInspector/byStatus',
  get: ({ get }) => {
    const state = get(changeInspectorAtom);
    const byStatus = {
      pending: [] as FileChange[],
      approved: [] as FileChange[],
      rejected: [] as FileChange[],
      applied: [] as FileChange[],
    };
    
    for (const change of state.changes) {
      byStatus[change.status].push(change);
    }
    
    return byStatus;
  },
});

/**
 * Selector: cambio seleccionado
 */
export const selectedChangeSelector = selector({
  key: 'changeInspector/selected',
  get: ({ get }) => {
    const state = get(changeInspectorAtom);
    if (!state.selectedChangeId) return null;
    return state.changes.find(c => c.id === state.selectedChangeId) || null;
  },
});

/**
 * Selector: estadísticas
 */
export const changeStatsSelector = selector({
  key: 'changeInspector/stats',
  get: ({ get }) => {
    const state = get(changeInspectorAtom);
    
    const stats = {
      total: state.changes.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      applied: 0,
      creates: 0,
      modifies: 0,
      deletes: 0,
      totalAdditions: 0,
      totalDeletions: 0,
    };
    
    for (const change of state.changes) {
      switch (change.status) {
        case 'pending': stats.pending++; break;
        case 'approved': stats.approved++; break;
        case 'rejected': stats.rejected++; break;
        case 'applied': stats.applied++; break;
      }
      
      switch (change.type) {
        case 'create': stats.creates++; break;
        case 'modify': stats.modifies++; break;
        case 'delete': stats.deletes++; break;
      }
      
      stats.totalAdditions += change.additions || 0;
      stats.totalDeletions += change.deletions || 0;
    }
    
    return stats;
  },
});

/**
 * Selector: verificar si hay cambios pendientes
 */
export const hasPendingChangesSelector = selector({
  key: 'changeInspector/hasPending',
  get: ({ get }) => {
    const state = get(changeInspectorAtom);
    return state.changes.some(c => c.status === 'pending');
  },
});
