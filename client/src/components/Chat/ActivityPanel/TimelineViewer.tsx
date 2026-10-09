/**
 * TimelineViewer - Historial completo de actividades del agente
 * 
 * Muestra: inicio, herramientas, cambios, errores, finalización
 */

import React, { useState, useMemo } from 'react';
import {
  Clock,
  Terminal,
  FileText,
  FilePlus,
  FileMinus,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Bot,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useTimeline } from '~/hooks/useTimeline';
import { cn } from '~/utils';
import type { TimelineEventType } from '~/store/timelineStore';

/**
 * Props del TimelineViewer
 */
interface TimelineViewerProps {
  maxItems?: number;
  showStats?: boolean;
  showFilters?: boolean;
  className?: string;
}

/**
 * Obtener icono según tipo de evento
 */
function getEventIcon(type: TimelineEventType): React.ReactNode {
  switch (type) {
    case 'session_start':
      return <Play size={14} />;
    case 'session_end':
      return <RotateCcw size={14} />;
    case 'tool_start':
    case 'tool_end':
      return <Terminal size={14} />;
    case 'tool_error':
      return <AlertCircle size={14} />;
    case 'file_read':
      return <FileText size={14} />;
    case 'file_write':
      return <FilePlus size={14} />;
    case 'file_delete':
      return <FileMinus size={14} />;
    case 'command_start':
    case 'command_end':
      return <Terminal size={14} />;
    case 'command_error':
      return <XCircle size={14} />;
    case 'agent_thinking':
      return <Bot size={14} />;
    case 'agent_response':
      return <Bot size={14} />;
    case 'error':
      return <AlertCircle size={14} />;
    case 'milestone':
      return <CheckCircle size={14} />;
    default:
      return <Clock size={14} />;
  }
}

/**
 * Obtener color según tipo de evento
 */
function getEventColor(type: TimelineEventType): string {
  switch (type) {
    case 'session_start':
    case 'session_end':
      return 'var(--accent-color, #6366f1)';
    case 'tool_start':
    case 'command_start':
      return 'var(--accent-color, #6366f1)';
    case 'tool_end':
    case 'command_end':
      return 'var(--success-color, #22c55e)';
    case 'file_read':
    case 'file_write':
    case 'file_delete':
      return '#3b82f6';
    case 'tool_error':
    case 'command_error':
    case 'error':
      return 'var(--error-color, #ef4444)';
    case 'agent_thinking':
    case 'agent_response':
      return 'var(--warning-color, #f59e0b)';
    case 'milestone':
      return '#8b5cf6';
    default:
      return 'var(--text-secondary, #6b7280)';
  }
}

/**
 * Obtener label del tipo de evento
 */
function getEventLabel(type: TimelineEventType): string {
  switch (type) {
    case 'session_start': return 'Inicio';
    case 'session_end': return 'Fin';
    case 'tool_start': return 'Tool';
    case 'tool_end': return 'Tool';
    case 'tool_error': return 'Error';
    case 'file_read': return 'Lectura';
    case 'file_write': return 'Escritura';
    case 'file_delete': return 'Eliminar';
    case 'command_start': return 'Comando';
    case 'command_end': return 'Comando';
    case 'command_error': return 'Error';
    case 'agent_thinking': return 'Pensando';
    case 'agent_response': return 'Respuesta';
    case 'error': return 'Error';
    case 'milestone': return 'Hito';
    default: return 'Evento';
  }
}

/**
 * Formatear duración
 */
function formatDuration(ms?: number): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Formatear tiempo
 */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Item de la timeline
 */
const TimelineItem: React.FC<{
  event: ReturnType<typeof useTimeline>['events'][0];
  isLast: boolean;
}> = ({ event, isLast }) => {
  const [expanded, setExpanded] = useState(false);
  const color = getEventColor(event.type);
  const hasDetails = event.description || event.error || event.duration;

  return (
    <div className="relative flex gap-3 py-2">
      {/* Línea conectora */}
      {!isLast && (
        <div 
          className="absolute left-[15px] top-10 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"
        />
      )}

      {/* Icono */}
      <div 
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center z-10"
        style={{ 
          backgroundColor: `${color}20`,
          color: color,
        }}
      >
        {getEventIcon(event.type)}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span 
            className="text-xs font-medium px-1.5 py-0.5 rounded"
            style={{ 
              backgroundColor: `${color}15`,
              color: color,
            }}
          >
            {getEventLabel(event.type)}
          </span>
          <span className="text-xs text-gray-400 tabular-nums">
            {formatTime(event.timestamp)}
          </span>
          {event.duration !== undefined && (
            <span className="text-xs text-gray-400 tabular-nums">
              {formatDuration(event.duration)}
            </span>
          )}
        </div>

        <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
          {event.title}
        </p>

        {/* Detalles expandibles */}
        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-400 mt-1"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Ocultar' : 'Ver'} detalles
          </button>
        )}

        {expanded && hasDetails && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
            {event.description && (
              <p className="text-gray-600 dark:text-gray-400 mb-1">
                {event.description}
              </p>
            )}
            {event.toolName && (
              <p className="text-gray-500">
                <span className="font-medium">Herramienta:</span> {event.toolName}
              </p>
            )}
            {event.filePath && (
              <p className="text-gray-500 font-mono truncate">
                {event.filePath}
              </p>
            )}
            {event.command && (
              <p className="text-gray-500 font-mono truncate">
                $ {event.command}
              </p>
            )}
            {event.error && (
              <p className="text-red-500 mt-1">
                <span className="font-medium">Error:</span> {event.error}
              </p>
            )}
            {event.exitCode !== undefined && (
              <p className="text-gray-500">
                <span className="font-medium">Exit code:</span> {event.exitCode}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Indicador de estado */}
      <div className="flex-shrink-0">
        {event.success ? (
          <CheckCircle size={14} className="text-green-500" />
        ) : (
          <XCircle size={14} className="text-red-500" />
        )}
      </div>
    </div>
  );
};

/**
 * Panel de estadísticas
 */
const TimelineStats: React.FC<{
  stats: ReturnType<typeof useTimeline>['stats'];
  duration: number;
}> = ({ stats, duration }) => {
  return (
    <div className="flex flex-wrap gap-4 p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs">
      <div className="flex items-center gap-1">
        <Terminal size={12} className="text-blue-500" />
        <span className="text-gray-600 dark:text-gray-400">
          Herramientas: <span className="font-medium text-gray-900 dark:text-gray-200">{stats.toolsExecuted}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <FileText size={12} className="text-blue-500" />
        <span className="text-gray-600 dark:text-gray-400">
          Archivos: <span className="font-medium text-gray-900 dark:text-gray-200">{stats.filesRead + stats.filesWritten}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <AlertCircle size={12} className="text-red-500" />
        <span className="text-gray-600 dark:text-gray-400">
          Errores: <span className="font-medium text-gray-900 dark:text-gray-200">{stats.errors}</span>
        </span>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <Clock size={12} className="text-gray-400" />
        <span className="text-gray-600 dark:text-gray-400 tabular-nums">
          Duración: <span className="font-medium text-gray-900 dark:text-gray-200">{formatDuration(duration)}</span>
        </span>
      </div>
    </div>
  );
};

/**
 * Filtros de timeline
 */
const TimelineFilters: React.FC<{
  selectedTypes: Set<TimelineEventType>;
  onToggle: (type: TimelineEventType) => void;
}> = ({ selectedTypes, onToggle }) => {
  const allTypes: TimelineEventType[] = [
    'session_start', 'session_end',
    'tool_start', 'tool_end', 'tool_error',
    'file_read', 'file_write', 'file_delete',
    'command_start', 'command_end', 'command_error',
    'agent_thinking', 'agent_response',
    'error', 'milestone',
  ];

  return (
    <div className="flex flex-wrap gap-2 p-2 border-b border-gray-200 dark:border-gray-700">
      {allTypes.map((type) => {
        const isSelected = selectedTypes.has(type);
        const color = getEventColor(type);

        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
              isSelected
                ? 'text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            )}
            style={isSelected ? { backgroundColor: color } : undefined}
          >
            {getEventIcon(type)}
            {getEventLabel(type)}
          </button>
        );
      })}
    </div>
  );
};

/**
 * TimelineViewer - Componente principal
 */
export const TimelineViewer: React.FC<TimelineViewerProps> = ({
  maxItems = 50,
  showStats = true,
  showFilters = false,
  className,
}) => {
  const { events, stats, duration, isActive } = useTimeline();
  const [selectedTypes, setSelectedTypes] = useState<Set<TimelineEventType>>(new Set());

  // Filtrar eventos
  const filteredEvents = useMemo(() => {
    let result = events;
    
    if (selectedTypes.size > 0) {
      result = result.filter(e => selectedTypes.has(e.type));
    }
    
    return result.slice(-maxItems);
  }, [events, selectedTypes, maxItems]);

  // Toggle filtro
  const toggleFilter = (type: TimelineEventType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Timeline
          </span>
          {isActive && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Activa
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {filteredEvents.length} eventos
        </span>
      </div>

      {/* Estadísticas */}
      {showStats && (
        <TimelineStats stats={stats} duration={duration} />
      )}

      {/* Filtros */}
      {showFilters && (
        <TimelineFilters
          selectedTypes={selectedTypes}
          onToggle={toggleFilter}
        />
      )}

      {/* Lista de eventos */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <Clock size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Sin eventos registrados</p>
          </div>
        ) : (
          filteredEvents.map((event, index) => (
            <TimelineItem
              key={event.id}
              event={event}
              isLast={index === filteredEvents.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default TimelineViewer;
