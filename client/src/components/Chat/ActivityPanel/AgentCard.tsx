/**
 * AgentCard - Componente para mostrar un agente individual con su estado
 */

import React from 'react';
import {
  Play,
  Pause,
  X,
  ChevronDown,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { cn } from '~/utils';
import {
  getAgentRoleIcon,
  getStatusColor,
  getStatusBg,
  getStatusIcon,
  formatDuration,
  getStatusLabel,
} from '~/utils/agentUtils';
import type { AgentInfo, AgentState, AgentRole } from '~/store/agentOrchestratorStore';

interface AgentCardProps {
  agent: AgentInfo;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onSelect?: () => void;
  isSelected?: boolean;
  level?: number;
  className?: string;
}

/**
 * AgentCard - Componente
 */
export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isExpanded = false,
  onToggleExpand,
  onPause,
  onResume,
  onCancel,
  onSelect,
  isSelected = false,
  level = 0,
  className,
}) => {
  const stateColor = getStatusColor(agent.state);
  const stateBg = getStatusBg(agent.state);
  const isActive = !['idle', 'completed', 'failed', 'cancelled'].includes(agent.state);
  const hasChildren = agent.childIds.length > 0;
  const hasMessages = agent.messages.length > 0;
  const RoleIcon = getAgentRoleIcon(agent.role);

  return (
    <div
      className={cn(
        'rounded-lg border transition-all cursor-pointer',
        isSelected
          ? 'border-indigo-500 shadow-md'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        className
      )}
      style={{ marginLeft: level * 16 }}
      onClick={onSelect}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 px-3 py-2', stateBg)}>
        {/* Expand/Collapse */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-gray-400" />
            )}
          </button>
        )}

        {/* Indicador de actividad */}
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            isActive && 'animate-pulse',
            agent.state === 'idle' && 'bg-gray-400',
            agent.state === 'thinking' && 'bg-yellow-500',
            agent.state === 'executing' && 'bg-blue-500',
            agent.state === 'waiting' && 'bg-purple-500',
            agent.state === 'completed' && 'bg-green-500',
            agent.state === 'failed' && 'bg-red-500',
            agent.state === 'paused' && 'bg-orange-500',
            agent.state === 'cancelled' && 'bg-gray-400',
          )}
        />

        {/* Icono de rol */}
        <span className="text-gray-500" style={{ color: agent.color }}>
          <RoleIcon size={16} />
        </span>

        {/* Nombre */}
        <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {agent.name}
        </span>

        {/* Estado */}
        <span className={cn('flex items-center gap-1 text-xs', stateColor)}>
          {getStatusIcon(agent.state)}
          {getStatusLabel(agent.state)}
        </span>

        {/* Acciones */}
        {(isActive || agent.state === 'paused') && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {agent.state === 'paused' ? (
              <button
                onClick={onResume}
                className="p-1 hover:bg-green-200 dark:hover:bg-green-900/30 rounded text-green-500"
                title="Reanudar"
              >
                <Play size={12} />
              </button>
            ) : (
              <button
                onClick={onPause}
                className="p-1 hover:bg-yellow-200 dark:hover:bg-yellow-900/30 rounded text-yellow-500"
                title="Pausar"
              >
                <Pause size={12} />
              </button>
            )}
            <button
              onClick={onCancel}
              className="p-1 hover:bg-red-200 dark:hover:bg-red-900/30 rounded text-red-500"
              title="Cancelar"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Badge de mensajes */}
        {hasMessages && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs text-gray-500">
            <MessageSquare size={10} />
            {agent.messages.length}
          </span>
        )}
      </div>

      {/* Detalles expandidos */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          {/* Descripción */}
          {agent.description && (
            <p className="text-xs text-gray-500 mb-2">{agent.description}</p>
          )}

          {/* Tarea actual */}
          {agent.currentTask && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 mb-1">Tarea actual:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${agent.currentTask.progress * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {(agent.currentTask.progress * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                {agent.currentTask.title}
              </p>
            </div>
          )}

          {/* Estadísticas */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>
              Tareas: <span className="text-gray-700 dark:text-gray-300">{agent.tasksCompleted}</span>
              {agent.tasksFailed > 0 && (
                <span className="text-red-500">/{agent.tasksFailed}</span>
              )}
            </span>
            <span>
              Duración: <span className="text-gray-700 dark:text-gray-300">{formatDuration(agent.totalDuration)}</span>
            </span>
          </div>

          {/* Mensaje de estado */}
          {agent.stateMessage && (
            <p className="text-xs text-gray-400 mt-2 truncate">
              {agent.stateMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentCard;
