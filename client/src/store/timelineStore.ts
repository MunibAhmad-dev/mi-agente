/**
 * TimelineStore - Almacena el historial completo de actividades del agente
 * 
 * Registra: inicio, herramientas, cambios, errores, finalización
 */

import { atom, selector } from 'recoil';

/**
 * Tipo de evento en la timeline
 */
export type TimelineEventType =
  | 'session_start'
  | 'session_end'
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'command_start'
  | 'command_end'
  | 'command_error'
  | 'agent_thinking'
  | 'agent_response'
  | 'error'
  | 'milestone';

/**
 * Evento de la timeline
 */
export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: Date;
  title: string;
  description?: string;
  
  // Datos específicos por tipo
  toolName?: string;
  filePath?: string;
  command?: string;
  duration?: number;
  exitCode?: number;
  
  // Resultado
  success: boolean;
  error?: string;
  
  // Metadatos
  metadata?: Record<string, unknown>;
}

/**
 * Estado de la timeline
 */
export interface TimelineState {
  events: TimelineEvent[];
  sessionId?: string;
  startedAt?: Date;
  endedAt?: Date;
}

/**
 * Átomo principal de la timeline
 */
export const timelineAtom = atom<TimelineState>({
  key: 'timeline/state',
  default: {
    events: [],
  },
});

/**
 * Selector: obtener todos los eventos
 */
export const timelineEventsSelector = selector({
  key: 'timeline/events',
  get: ({ get }) => {
    const state = get(timelineAtom);
    return state.events;
  },
});

/**
 * Selector: obtener eventos por tipo
 */
export const timelineEventsByTypeSelector = selector({
  key: 'timeline/eventsByType',
  get: ({ get }) => {
    const state = get(timelineAtom);
    const byType = new Map<TimelineEventType, TimelineEvent[]>();
    
    for (const event of state.events) {
      const list = byType.get(event.type) || [];
      list.push(event);
      byType.set(event.type, list);
    }
    
    return byType;
  },
});

/**
 * Selector: duración total de la sesión
 */
export const timelineDurationSelector = selector({
  key: 'timeline/duration',
  get: ({ get }) => {
    const state = get(timelineAtom);
    
    if (!state.startedAt) return 0;
    
    const end = state.endedAt ? new Date(state.endedAt).getTime() : Date.now();
    const start = new Date(state.startedAt).getTime();
    
    return end - start;
  },
});

/**
 * Selector: estadísticas de la timeline
 */
export const timelineStatsSelector = selector({
  key: 'timeline/stats',
  get: ({ get }) => {
    const state = get(timelineAtom);
    
    const stats = {
      totalEvents: state.events.length,
      toolsExecuted: 0,
      toolsSucceeded: 0,
      toolsFailed: 0,
      commandsExecuted: 0,
      commandsSucceeded: 0,
      commandsFailed: 0,
      filesRead: 0,
      filesWritten: 0,
      filesDeleted: 0,
      errors: 0,
      duration: 0,
    };
    
    for (const event of state.events) {
      switch (event.type) {
        case 'tool_start':
        case 'tool_end':
          stats.toolsExecuted++;
          if (event.success) stats.toolsSucceeded++;
          else stats.toolsFailed++;
          break;
        case 'command_start':
        case 'command_end':
          stats.commandsExecuted++;
          if (event.success) stats.commandsSucceeded++;
          else stats.commandsFailed++;
          break;
        case 'file_read':
          stats.filesRead++;
          break;
        case 'file_write':
          stats.filesWritten++;
          break;
        case 'file_delete':
          stats.filesDeleted++;
          break;
        case 'error':
        case 'tool_error':
        case 'command_error':
          stats.errors++;
          break;
      }
    }
    
    if (state.startedAt) {
      const end = state.endedAt ? new Date(state.endedAt).getTime() : Date.now();
      stats.duration = end - new Date(state.startedAt).getTime();
    }
    
    return stats;
  },
});

/**
 * Selector: verificar si la sesión está activa
 */
export const timelineActiveSelector = selector({
  key: 'timeline/isActive',
  get: ({ get }) => {
    const state = get(timelineAtom);
    return !state.endedAt && state.startedAt !== undefined;
  },
});

/**
 * Selector: últimos N eventos
 */
export const timelineRecentEventsSelector = selector({
  key: 'timeline/recentEvents',
  get: ({ get }) => {
    const state = get(timelineAtom);
    return state.events.slice(-20);
  },
});
