/**
 * TreeNode - Componente para nodo del árbol de agentes
 */

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { AgentCard } from './AgentCard';
import { cn } from '~/utils';
import type { AgentTreeNode } from '~/store/agentOrchestratorStore';

interface TreeNodeProps {
  node: AgentTreeNode;
  level: number;
  isLast: boolean;
  expandedAgents: Set<string>;
  onToggleExpand: (id: string) => void;
  selectedAgentId?: string;
  onSelectAgent: (id: string) => void;
}

/**
 * TreeNode - Nodo del árbol con conexiones visuales
 */
export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  isLast,
  expandedAgents,
  onToggleExpand,
  selectedAgentId,
  onSelectAgent,
}) => {
  const { agent, children } = node;
  const isExpanded = expandedAgents.has(agent.id);
  const hasChildren = children.length > 0;

  return (
    <div className="relative">
      {/* Línea vertical */}
      {level > 0 && (
        <div
          className="absolute"
          style={{
            left: level * 16 - 8,
            top: 0,
            bottom: isLast ? '50%' : 0,
            width: 1,
            height: '100%',
          }}
        >
          <div className="w-px h-full bg-gray-300 dark:bg-gray-600" />
        </div>
      )}

      {/* Línea horizontal al nodo */}
      {level > 0 && (
        <div
          className="absolute w-4"
          style={{
            left: level * 16 - 8,
            top: '50%',
            height: 1,
          }}
        >
          <div className="h-px bg-gray-300 dark:bg-gray-600" />
        </div>
      )}

      {/* Card del agente */}
      <div className="relative z-10 mb-1">
        <AgentCard
          agent={agent}
          isExpanded={isExpanded}
          onToggleExpand={() => hasChildren && onToggleExpand(agent.id)}
          isSelected={selectedAgentId === agent.id}
          onSelect={() => onSelectAgent(agent.id)}
          level={0}
        />

        {/* Icono de expandir */}
        {hasChildren && (
          <div
            className="absolute left-1 top-1/2 -translate-y-1/2 -ml-6"
            style={{ left: level * 16 - 16 }}
          >
            <ArrowRight
              size={12}
              className={cn(
                'text-gray-400 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          </div>
        )}
      </div>

      {/* Hijos */}
      {isExpanded && children.map((child, index) => (
        <TreeNode
          key={child.agent.id}
          node={child}
          level={level + 1}
          isLast={index === children.length - 1}
          expandedAgents={expandedAgents}
          onToggleExpand={onToggleExpand}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
        />
      ))}

      {/* Línea vertical continua */}
      {hasChildren && !isLast && (
        <div
          className="absolute w-px bg-gray-300 dark:bg-gray-600"
          style={{
            left: level * 16 + 8,
            top: '24px',
            bottom: 0,
          }}
        />
      )}
    </div>
  );
};

export default TreeNode;
