/**
 * AgentStatusBar - Panel inferior simple
 * 
 * Muestra: estado, acción, herramienta, progreso, duración
 */

import React, { useState, useEffect } from 'react';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Bot,
  Terminal,
  FileText,
  Search,
  Code,
  FolderOpen,
  Globe,
} from 'lucide-react';

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'completed' | 'error';

export interface AgentActivity {
  status: AgentStatus;
  action: string;
  tool?: string;
  progress?: number;
  duration?: number;
  timestamp: Date;
}

interface AgentStatusBarProps {
  activity?: AgentActivity | null;
  compact?: boolean;
}

/**
 * Obtener icono según herramienta
 */
function getToolIcon(tool?: string): React.ReactNode {
  if (!tool) return null;
  
  const lowerTool = tool.toLowerCase();
  
  if (lowerTool.includes('bash') || lowerTool.includes('terminal') || lowerTool.includes('command')) {
    return <Terminal size={14} />;
  }
  if (lowerTool.includes('read') || lowerTool.includes('file')) {
    return <FileText size={14} />;
  }
  if (lowerTool.includes('search')) {
    return <Search size={14} />;
  }
  if (lowerTool.includes('code') || lowerTool.includes('edit') || lowerTool.includes('write')) {
    return <Code size={14} />;
  }
  if (lowerTool.includes('folder') || lowerTool.includes('list')) {
    return <FolderOpen size={14} />;
  }
  if (lowerTool.includes('browser') || lowerTool.includes('navigate')) {
    return <Globe size={14} />;
  }
  
  return <Bot size={14} />;
}

/**
 * Obtener color según estado
 */
function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case 'idle':
      return 'var(--text-secondary, #6b7280)';
    case 'thinking':
      return 'var(--warning-color, #f59e0b)';
    case 'executing':
      return 'var(--accent-color, #6366f1)';
    case 'completed':
      return 'var(--success-color, #22c55e)';
    case 'error':
      return 'var(--error-color, #ef4444)';
    default:
      return 'var(--text-secondary, #6b7280)';
  }
}

/**
 * Obtener icono según estado
 */
function getStatusIcon(status: AgentStatus): React.ReactNode {
  switch (status) {
    case 'idle':
      return <Clock size={14} />;
    case 'thinking':
    case 'executing':
      return <Loader2 size={14} className="animate-spin" />;
    case 'completed':
      return <CheckCircle size={14} />;
    case 'error':
      return <XCircle size={14} />;
    default:
      return <Bot size={14} />;
  }
}

/**
 * Formatear duración
 */
function formatDuration(ms?: number): string {
  if (ms === undefined) return '--';
  
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Formatear label de estado
 */
function getStatusLabel(status: AgentStatus): string {
  switch (status) {
    case 'idle': return 'Esperando';
    case 'thinking': return 'Pensando';
    case 'executing': return 'Ejecutando';
    case 'completed': return 'Completado';
    case 'error': return 'Error';
    default: return 'Desconocido';
  }
}

/**
 * Barra de progreso simple
 */
function ProgressBar({ progress }: { progress?: number }) {
  if (progress === undefined) return null;
  
  const percentage = Math.min(100, Math.max(0, progress * 100));
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">
        {percentage.toFixed(0)}%
      </span>
    </div>
  );
}

/**
 * AgentStatusBar - Panel inferior
 */
export const AgentStatusBar: React.FC<AgentStatusBarProps> = ({
  activity,
  compact = false,
}) => {
  const [elapsed, setElapsed] = useState(0);

  // Actualizar duración cada segundo
  useEffect(() => {
    if (!activity || activity.status === 'completed' || activity.status === 'error') {
      setElapsed(activity?.duration || 0);
      return;
    }

    const interval = setInterval(() => {
      const start = activity?.timestamp ? new Date(activity.timestamp).getTime() : Date.now();
      setElapsed(Date.now() - start);
    }, 1000);

    return () => clearInterval(interval);
  }, [activity]);

  // Estado por defecto
  const defaultActivity: AgentActivity = {
    status: 'idle',
    action: 'Esperando mensaje...',
    tool: undefined,
    progress: undefined,
    duration: undefined,
    timestamp: new Date(),
  };

  const current = activity || defaultActivity;
  const statusColor = getStatusColor(current.status);

  if (compact) {
    return (
      <div 
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
        style={{ fontSize: '12px' }}
      >
        <span style={{ color: statusColor }}>
          {getStatusIcon(current.status)}
        </span>
        <span className="text-gray-600 dark:text-gray-400">
          {getStatusLabel(current.status)}
        </span>
        {current.action && (
          <span className="text-gray-500 dark:text-gray-500 truncate max-w-32">
            {current.action}
          </span>
        )}
        <span className="ml-auto text-gray-400 tabular-nums">
          {formatDuration(current.duration || elapsed)}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      {/* Información principal */}
      <div className="flex items-center gap-4 px-4 py-2">
        {/* Estado */}
        <div className="flex items-center gap-2 min-w-24">
          <span style={{ color: statusColor }}>
            {getStatusIcon(current.status)}
          </span>
          <span 
            className="text-sm font-medium"
            style={{ color: statusColor }}
          >
            {getStatusLabel(current.status)}
          </span>
        </div>

        {/* Separador */}
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

        {/* Acción */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {current.tool && (
            <span className="text-gray-400">
              {getToolIcon(current.tool)}
            </span>
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {current.action || 'Sin actividad'}
          </span>
        </div>

        {/* Herramienta */}
        {current.tool && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
            {getToolIcon(current.tool)}
            <span>{current.tool}</span>
          </div>
        )}

        {/* Separador */}
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

        {/* Progreso */}
        <div className="w-28">
          <ProgressBar progress={current.progress} />
        </div>

        {/* Separador */}
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

        {/* Duración */}
        <div className="flex items-center gap-1 min-w-20 text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          <Clock size={14} />
          <span>{formatDuration(current.duration || elapsed)}</span>
        </div>
      </div>
    </div>
  );
};

export default AgentStatusBar;
