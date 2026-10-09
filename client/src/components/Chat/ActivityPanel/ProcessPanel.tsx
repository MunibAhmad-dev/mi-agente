/**
 * ProcessPanel - Visualización de procesos en tiempo real
 */

import React from 'react';
import {
  Activity,
  Play,
  CheckCircle,
  XCircle,
  Square,
  Clock,
  Trash2,
  Cpu,
  HardDrive,
} from 'lucide-react';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';
import { cn } from '~/utils';
import type { ProcessInfo } from '~/store/taskMonitorStore';

interface ProcessPanelProps {
  className?: string;
}

/**
 * Formatear duración
 */
function formatDuration(start: Date, end?: Date): string {
  const ms = end ? new Date(end).getTime() - new Date(start).getTime() : Date.now() - new Date(start).getTime();
  
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Obtener icono de estado
 */
function getStatusIcon(status: ProcessInfo['status']) {
  switch (status) {
    case 'running': return <Play size={12} />;
    case 'completed': return <CheckCircle size={12} />;
    case 'failed': return <XCircle size={12} />;
    case 'stopped': return <Square size={12} />;
    default: return <Clock size={12} />;
  }
}

/**
 * Obtener color de estado
 */
function getStatusColor(status: ProcessInfo['status']) {
  switch (status) {
    case 'running': return 'text-green-500';
    case 'completed': return 'text-blue-500';
    case 'failed': return 'text-red-500';
    case 'stopped': return 'text-yellow-500';
    default: return 'text-gray-500';
  }
}

/**
 * Obtener fondo de estado
 */
function getStatusBg(status: ProcessInfo['status']) {
  switch (status) {
    case 'running': return 'bg-green-500';
    case 'completed': return 'bg-blue-500';
    case 'failed': return 'bg-red-500';
    case 'stopped': return 'bg-yellow-500';
    default: return 'bg-gray-500';
  }
}

/**
 * Item de proceso
 */
const ProcessItem: React.FC<{
  process: ProcessInfo;
  onKill?: (id: string) => void;
}> = ({ process, onKill }) => {
  const statusColor = getStatusColor(process.status);
  const statusBg = getStatusBg(process.status);

  return (
    <div className={cn(
      'flex items-start gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0',
      process.status === 'running' && 'bg-green-50/50 dark:bg-green-900/10'
    )}>
      {/* Indicador de estado */}
      <div className={cn('mt-0.5', statusColor)}>
        {getStatusIcon(process.status)}
      </div>

      {/* Info del proceso */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'w-2 h-2 rounded-full',
            process.status === 'running' ? `${statusBg} animate-pulse` : statusBg
          )} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {process.name}
          </span>
        </div>
        
        <p className="text-xs text-gray-500 font-mono truncate mt-0.5">
          {process.command}
        </p>

        {/* Metadatos */}
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
          {process.pid && (
            <span className="flex items-center gap-1">
              <Activity size={10} />
              PID: {process.pid}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {formatDuration(process.startTime, process.endTime)}
          </span>
          {process.cpu !== undefined && (
            <span className="flex items-center gap-1">
              <Cpu size={10} />
              {process.cpu.toFixed(1)}%
            </span>
          )}
          {process.memory !== undefined && (
            <span className="flex items-center gap-1">
              <HardDrive size={10} />
              {process.memory}MB
            </span>
          )}
        </div>
      </div>

      {/* Exit code */}
      {process.exitCode !== undefined && (
        <div className={cn(
          'text-xs font-mono px-2 py-0.5 rounded',
          process.exitCode === 0
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        )}>
          {process.exitCode}
        </div>
      )}

      {/* Botón kill */}
      {process.status === 'running' && onKill && (
        <button
          onClick={() => onKill(process.id)}
          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Terminar proceso"
        >
          <Square size={14} />
        </button>
      )}
    </div>
  );
};

/**
 * ProcessPanel - Muestra procesos en tiempo real
 */
export const ProcessPanel: React.FC<ProcessPanelProps> = ({ className }) => {
  const {
    activeProcesses,
    processKill,
    processClearCompleted,
    stats,
  } = useTaskMonitor();

  // Obtener todos los procesos (activos primero)
  const allProcesses = [
    ...activeProcesses,
  ];

  const completedProcesses = stats.completedProcesses;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Procesos
          </span>
          {stats.activeProcesses > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              {stats.activeProcesses}
            </span>
          )}
        </div>

        {completedProcesses > 0 && (
          <button
            onClick={processClearCompleted}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <Trash2 size={12} />
            Limpiar ({completedProcesses})
          </button>
        )}
      </div>

      {/* Lista de procesos */}
      <div className="flex-1 overflow-auto">
        {allProcesses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Activity size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Sin procesos activos</p>
            <p className="text-xs mt-1">Los procesos aparecerán aquí</p>
          </div>
        ) : (
          allProcesses.map((process) => (
            <ProcessItem
              key={process.id}
              process={process}
              onKill={processKill}
            />
          ))
        )}
      </div>

      {/* Resumen */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Activos: {stats.activeProcesses}</span>
          <span>Completados: {stats.completedProcesses}</span>
          <span>Total: {stats.activeProcesses + stats.completedProcesses}</span>
        </div>
      </div>
    </div>
  );
};

export default ProcessPanel;
