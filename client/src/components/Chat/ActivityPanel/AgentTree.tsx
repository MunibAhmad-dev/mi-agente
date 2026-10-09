/**
 * AgentTree - Vista jerárquica de agentes con flujo
 */

import React, { useState } from 'react';
import {
  Users,
  Play,
  Square,
  RefreshCw,
} from 'lucide-react';
import { AgentCard } from './AgentCard';
import { TreeNode } from './TreeNode';
import { useAgentOrchestrator } from '~/hooks/useAgentOrchestrator';
import { cn } from '~/utils';
import type { AgentRole } from '~/store/agentOrchestratorStore';

interface AgentTreeProps {
  className?: string;
};

/**
 * AgentTree - Componente principal
 */
export const AgentTree: React.FC<AgentTreeProps> = ({ className }) => {
  const {
    agentTree,
    agents,
    stats,
    activeAgents,
    isOrchestrating,
    addAgentByRole,
    startOrchestration,
    stopOrchestration,
    clearAll,
    selectAgent,
    pauseAgent,
    resumeAgent,
    cancelAgent,
    updateAgentState,
  } = useAgentOrchestrator();

  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Quick add para roles comunes
  const quickAddAgent = (role: AgentRole) => {
    addAgentByRole(role);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Agentes
          </span>
          
          {/* Stats */}
          <span className="text-xs text-gray-400">
            {stats.activeAgents}/{stats.totalAgents} activos
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Control de orquestación */}
          {isOrchestrating ? (
            <button
              onClick={stopOrchestration}
              className="flex items-center gap-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs"
            >
              <Square size={12} />
              Detener
            </button>
          ) : agents.length > 0 ? (
            <button
              onClick={startOrchestration}
              className="flex items-center gap-1 px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs"
            >
              <Play size={12} />
              Iniciar
            </button>
          ) : null}

          <button
            onClick={clearAll}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Limpiar"
          >
            <RefreshCw size={14} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Indicador de orquestación */}
      {isOrchestrating && (
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800">
          <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
          <span className="text-xs text-indigo-700 dark:text-indigo-400">
            Orquestación en progreso
          </span>
          <div className="ml-auto flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
            <span>Progreso:</span>
            <div className="w-20 h-1.5 bg-indigo-200 dark:bg-indigo-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${stats.globalProgress * 100}%` }}
              />
            </div>
            <span>{(stats.globalProgress * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Quick add */}
      <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-400 mr-1">Agregar:</span>
        {(['researcher', 'worker', 'qa', 'security'] as AgentRole[]).map(role => (
          <button
            key={role}
            onClick={() => quickAddAgent(role)}
            className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400 capitalize"
          >
            + {role}
          </button>
        ))}
      </div>

      {/* Árbol de agentes */}
      <div className="flex-1 overflow-auto px-4 py-2">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Users size={32} className="mb-2 opacity-50" />
            <p className="text-sm mb-4">Sin agentes</p>
            <p className="text-xs text-center">
              Agrega agentes para comenzar la orquestación
            </p>
          </div>
        ) : agentTree ? (
          <TreeNode
            node={agentTree}
            level={0}
            isLast={true}
            expandedAgents={expandedAgents}
            onToggleExpand={toggleExpand}
            selectedAgentId={undefined}
            onSelectAgent={selectAgent}
          />
        ) : (
          // Si no hay árbol (sin orquestador), mostrar lista plana
          <div className="space-y-1">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isExpanded={expandedAgents.has(agent.id)}
                onToggleExpand={() => toggleExpand(agent.id)}
                isSelected={false}
                onSelect={() => selectAgent(agent.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400" /> Idle
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" /> Pensando
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Ejecutando
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" /> Esperando
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Completado
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Falló
          </span>
        </div>
      </div>
    </div>
  );
};

export default AgentTree;
