/**
 * ToolsPanel - Visualización de herramientas en tiempo real
 */

import React, { useState } from 'react';
import {
  Wrench,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';
import { cn } from '~/utils';
import { getToolIcon, getStatusIcon, getStatusColor, getStatusBg, formatDuration } from '~/utils/agentUtils';
import type { ToolExecution } from '~/store/taskMonitorStore';

interface ToolsPanelProps {
  className?: string;
}

/**
 * Item de herramienta
 */
const ToolItem: React.FC<{
  tool: ToolExecution;
}> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const ToolIcon = getToolIcon(tool.name);
  const statusIcon = getStatusIcon(tool.status);
  const statusColor = getStatusColor(tool.status);
  const statusBg = getStatusBg(tool.status);

  const handleCopy = async () => {
    const text = JSON.stringify({ name: tool.name, args: tool.args, result: tool.result }, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      'border-b border-gray-100 dark:border-gray-800 last:border-0',
      tool.status === 'running' && 'bg-yellow-50/50 dark:bg-yellow-900/10'
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {/* Indicador */}
        <span className={cn(
          'w-2 h-2 rounded-full',
          tool.status === 'running' ? `${statusBg} animate-pulse` : statusBg
        )} />

        {/* Icono */}
        <span className="text-gray-400">
          <ToolIcon size={14} />
        </span>

        {/* Nombre */}
        <span className="flex-1 text-left text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {tool.name}
        </span>

        {/* Duración */}
        <span className="text-xs text-gray-400 tabular-nums">
          {formatDuration(tool.duration)}
        </span>

        {/* Estado */}
        <span className={statusColor}>
          {statusIcon}
        </span>

        {/* Expand */}
        <span className="text-gray-400">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {/* Detalles expandidos */}
      {expanded && (
        <div className="px-3 pb-3 text-xs">
          {/* Timestamp */}
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Clock size={10} />
            <span>Inicio: {new Date(tool.startTime).toLocaleTimeString()}</span>
            {tool.endTime && (
              <span>Fin: {new Date(tool.endTime).toLocaleTimeString()}</span>
            )}
          </div>

          {/* Args */}
          {Object.keys(tool.args).length > 0 && (
            <div className="mb-2">
              <p className="text-gray-500 mb-1">Argumentos:</p>
              <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-xs">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {tool.result != null && (
            <div className="mb-2">
              <p className="text-gray-500 mb-1">Resultado:</p>
              <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-xs max-h-32">
                {typeof tool.result === 'string' 
                  ? tool.result 
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {tool.error && (
            <div className="mb-2">
              <p className="text-red-500 mb-1">Error:</p>
              <pre className="bg-red-50 dark:bg-red-900/20 p-2 rounded overflow-x-auto text-xs text-red-600 dark:text-red-400">
                {tool.error}
              </pre>
            </div>
          )}

          {/* Copiar */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-400"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            <span>Copiar detalles</span>
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * ToolsPanel - Muestra herramientas en tiempo real
 */
export const ToolsPanel: React.FC<ToolsPanelProps> = ({ className }) => {
  const {
    toolHistory,
    runningTools,
    stats,
  } = useTaskMonitor();

  // Invertir para mostrar más recientes primero
  const recentTools = [...toolHistory].reverse();
  const runningCount = runningTools.length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Herramientas
          </span>
          {runningCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
              <Loader2 size={10} className="animate-spin" />
              {runningCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{stats.totalTools} total</span>
          {stats.failedTools > 0 && (
            <span className="text-red-500">{stats.failedTools} fallidos</span>
          )}
        </div>
      </div>

      {/* Running tools indicator */}
      {runningCount > 0 && (
        <div className="px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
            <Loader2 size={12} className="animate-spin" />
            <span>{runningCount} herramienta{runningCount > 1 ? 's' : ''} en ejecución</span>
          </div>
        </div>
      )}

      {/* Lista de herramientas */}
      <div className="flex-1 overflow-auto">
        {recentTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Wrench size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Sin herramientas ejecutadas</p>
            <p className="text-xs mt-1">Las herramientas aparecerán aquí</p>
          </div>
        ) : (
          recentTools.map((tool) => (
            <ToolItem key={tool.id} tool={tool} />
          ))
        )}
      </div>
    </div>
  );
};

export default ToolsPanel;
