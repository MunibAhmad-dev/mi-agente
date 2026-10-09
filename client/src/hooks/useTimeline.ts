/**
 * useTimeline - Hook para gestionar la timeline del agente
 * 
 * Provee métodos para agregar eventos y obtener el estado
 */

import { useCallback } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import {
  timelineAtom,
  timelineEventsSelector,
  timelineStatsSelector,
  timelineDurationSelector,
  timelineActiveSelector,
  TimelineEvent,
  TimelineEventType,
} from '~/store/timelineStore';

/**
 * Generar ID único
 */
function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useTimeline() {
  const setTimeline = useSetRecoilState(timelineAtom);
  const events = useRecoilValue(timelineEventsSelector);
  const stats = useRecoilValue(timelineStatsSelector);
  const duration = useRecoilValue(timelineDurationSelector);
  const isActive = useRecoilValue(timelineActiveSelector);

  // =========================================================================
  // ACCIONES
  // =========================================================================

  /**
   * Iniciar una nueva sesión de timeline
   */
  const startSession = useCallback((sessionId?: string) => {
    setTimeline({
      events: [],
      sessionId: sessionId || generateId(),
      startedAt: new Date(),
      endedAt: undefined,
    });
  }, [setTimeline]);

  /**
   * Finalizar la sesión actual
   */
  const endSession = useCallback(() => {
    setTimeline((prev) => ({
      ...prev,
      endedAt: new Date(),
    }));
  }, [setTimeline]);

  /**
   * Agregar un evento a la timeline
   */
  const addEvent = useCallback((
    type: TimelineEventType,
    title: string,
    options: Partial<{
      description: string;
      toolName: string;
      filePath: string;
      command: string;
      duration: number;
      exitCode: number;
      success: boolean;
      error: string;
      metadata: Record<string, unknown>;
    }> = {}
  ): string => {
    const id = generateId();
    
    const event: TimelineEvent = {
      id,
      type,
      timestamp: new Date(),
      title,
      description: options.description,
      toolName: options.toolName,
      filePath: options.filePath,
      command: options.command,
      duration: options.duration,
      exitCode: options.exitCode,
      success: options.success ?? true,
      error: options.error,
      metadata: options.metadata,
    };

    setTimeline((prev) => ({
      ...prev,
      events: [...prev.events, event],
    }));

    return id;
  }, [setTimeline]);

  /**
   * Limpiar la timeline
   */
  const clearTimeline = useCallback(() => {
    setTimeline({
      events: [],
    });
  }, [setTimeline]);

  /**
   * Actualizar un evento existente
   */
  const updateEvent = useCallback((
    eventId: string,
    updates: Partial<TimelineEvent>
  ) => {
    setTimeline((prev) => ({
      ...prev,
      events: prev.events.map((evt) =>
        evt.id === eventId ? { ...evt, ...updates } : evt
      ),
    }));
  }, [setTimeline]);

  // =========================================================================
  // HELPERS PARA EVENTOS COMUNES
  // =========================================================================

  /**
   * Registrar inicio de sesión
   */
  const recordSessionStart = useCallback((metadata?: Record<string, unknown>) => {
    return addEvent('session_start', 'Sesión iniciada', {
      metadata,
    });
  }, [addEvent]);

  /**
   * Registrar fin de sesión
   */
  const recordSessionEnd = useCallback((metadata?: Record<string, unknown>) => {
    endSession();
    return addEvent('session_end', 'Sesión finalizada', {
      metadata,
    });
  }, [addEvent, endSession]);

  /**
   * Registrar inicio de herramienta
   */
  const recordToolStart = useCallback((
    toolName: string,
    description?: string
  ) => {
    return addEvent('tool_start', `Inicio: ${toolName}`, {
      toolName,
      description,
      success: true,
    });
  }, [addEvent]);

  /**
   * Registrar fin de herramienta
   */
  const recordToolEnd = useCallback((
    toolName: string,
    options: Partial<{
      duration: number;
      success: boolean;
      error: string;
    }> = {}
  ) => {
    return addEvent('tool_end', `${toolName} completado`, {
      toolName,
      duration: options.duration,
      success: options.success ?? true,
      error: options.error,
    });
  }, [addEvent]);

  /**
   * Registrar error de herramienta
   */
  const recordToolError = useCallback((
    toolName: string,
    error: string
  ) => {
    return addEvent('tool_error', `${toolName} falló`, {
      toolName,
      success: false,
      error,
    });
  }, [addEvent]);

  /**
   * Registrar lectura de archivo
   */
  const recordFileRead = useCallback((
    filePath: string,
    duration?: number
  ) => {
    return addEvent('file_read', `Leyó: ${filePath.split('/').pop()}`, {
      filePath,
      duration,
    });
  }, [addEvent]);

  /**
   * Registrar escritura de archivo
   */
  const recordFileWrite = useCallback((
    filePath: string,
    duration?: number
  ) => {
    return addEvent('file_write', `Escribió: ${filePath.split('/').pop()}`, {
      filePath,
      duration,
    });
  }, [addEvent]);

  /**
   * Registrar eliminación de archivo
   */
  const recordFileDelete = useCallback((
    filePath: string
  ) => {
    return addEvent('file_delete', `Eliminó: ${filePath.split('/').pop()}`, {
      filePath,
    });
  }, [addEvent]);

  /**
   * Registrar inicio de comando
   */
  const recordCommandStart = useCallback((
    command: string,
    description?: string
  ) => {
    return addEvent('command_start', `Ejecutando: ${command}`, {
      command,
      description,
    });
  }, [addEvent]);

  /**
   * Registrar fin de comando
   */
  const recordCommandEnd = useCallback((
    command: string,
    options: Partial<{
      duration: number;
      exitCode: number;
      success: boolean;
    }> = {}
  ) => {
    const displayCmd = command.length > 30 ? command.slice(0, 30) + '...' : command;
    return addEvent('command_end', `Comando completado`, {
      command,
      duration: options.duration,
      exitCode: options.exitCode,
      success: options.success ?? (options.exitCode === 0),
    });
  }, [addEvent]);

  /**
   * Registrar error de comando
   */
  const recordCommandError = useCallback((
    command: string,
    error: string
  ) => {
    return addEvent('command_error', `Comando falló`, {
      command,
      success: false,
      error,
    });
  }, [addEvent]);

  /**
   * Registrar pensamiento del agente
   */
  const recordAgentThinking = useCallback((
    description?: string
  ) => {
    return addEvent('agent_thinking', 'Pensando...', {
      description,
    });
  }, [addEvent]);

  /**
   * Registrar respuesta del agente
   */
  const recordAgentResponse = useCallback((
    description?: string
  ) => {
    return addEvent('agent_response', 'Respuesta generada', {
      description,
    });
  }, [addEvent]);

  /**
   * Registrar error genérico
   */
  const recordError = useCallback((
    error: string,
    context?: string
  ) => {
    return addEvent('error', context || 'Error', {
      success: false,
      error,
    });
  }, [addEvent]);

  /**
   * Registrar hito
   */
  const recordMilestone = useCallback((
    title: string,
    description?: string
  ) => {
    return addEvent('milestone', title, {
      description,
      success: true,
    });
  }, [addEvent]);

  // =========================================================================
  // RETORNO
  // =========================================================================

  return {
    // Estado
    events,
    stats,
    duration,
    isActive,

    // Acciones
    startSession,
    endSession,
    clearTimeline,
    addEvent,
    updateEvent,

    // Helpers
    recordSessionStart,
    recordSessionEnd,
    recordToolStart,
    recordToolEnd,
    recordToolError,
    recordFileRead,
    recordFileWrite,
    recordFileDelete,
    recordCommandStart,
    recordCommandEnd,
    recordCommandError,
    recordAgentThinking,
    recordAgentResponse,
    recordError,
    recordMilestone,
  };
}
