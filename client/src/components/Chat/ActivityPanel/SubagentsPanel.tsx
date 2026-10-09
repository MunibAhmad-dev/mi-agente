/**
 * SubagentsPanel — Ventana #6: Subagents + Adaptive Router.
 * Consume /api/agent-runtime/subagents (roles, dispatch) y
 * /api/agent-runtime/optimization/recommend (router adaptativo F15).
 *
 * Vista en dos secciones:
 *  - Roles: catálogo de roles de subagentes disponibles con dispatch real.
 *  - Router adaptativo: recomendaciones del optimizationService con botón
 *    "aplicar" para mutar la configuración del runtime.
 */
import React, { useState } from 'react';
import { Users, Network, Loader2, Send, Check, ArrowRight, Zap } from 'lucide-react';
import { cn } from '~/utils';
import {
  useAgentRuntimeSubagentRoles,
  useDispatchAgentRuntimeSubagent,
  useAgentRuntimeOptimization,
  useApplyAgentRuntimeOptimization,
} from '~/data-provider/AgentRuntime/queries';

interface SubagentsPanelProps {
  className?: string;
}

type Tab = 'roles' | 'router';

const RolesTab: React.FC = () => {
  const { data, isLoading } = useAgentRuntimeSubagentRoles();
  const dispatchMut = useDispatchAgentRuntimeSubagent();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [task, setTask] = useState('');

  const roles = (data?.roles ?? []) as Array<Record<string, unknown>>;

  const handleDispatch = () => {
    if (!selectedRole || !task.trim()) {
      return;
    }
    dispatchMut.mutate({ role: selectedRole, task });
    setTask('');
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Lista de roles */}
      <div className="flex-1 overflow-auto">
        {roles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <Users size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Sin roles de subagentes disponibles</p>
          </div>
        ) : (
          roles.map((role, i) => {
            const name = String(role.name ?? role.id ?? `role-${i}`);
            const desc = String(role.description ?? '');
            const active = selectedRole === name;
            return (
              <button
                key={name}
                onClick={() => setSelectedRole(name)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left transition-colors dark:border-gray-800',
                  active
                    ? 'border-l-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-l-2 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800',
                )}
              >
                <Network size={14} className="text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                    {name}
                  </p>
                  {desc && <p className="truncate text-xs text-gray-400">{desc}</p>}
                </div>
                {active && <Check size={14} className="text-indigo-500" />}
              </button>
            );
          })
        )}
      </div>

      {/* Dispatch */}
      {selectedRole && (
        <div className="space-y-2 border-t border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-400">
            Despachar subagente <span className="font-medium text-indigo-500">{selectedRole}</span>
          </p>
          <div className="flex gap-2">
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDispatch()}
              placeholder="Describe la tarea…"
              className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <button
              onClick={handleDispatch}
              disabled={dispatchMut.isLoading || !task.trim()}
              className="flex items-center gap-1 rounded bg-indigo-500 px-2 py-1 text-xs text-white disabled:opacity-50"
            >
              <Send size={12} />
              Despachar
            </button>
          </div>
          {dispatchMut.isError && (
            <p className="text-xs text-red-500">Error al despachar el subagente</p>
          )}
          {dispatchMut.isSuccess && (
            <p className="text-xs text-green-500">Subagente despachado correctamente</p>
          )}
        </div>
      )}
    </div>
  );
};

const RouterTab: React.FC = () => {
  const { data, isLoading } = useAgentRuntimeOptimization();
  const applyMut = useApplyAgentRuntimeOptimization();

  const recommendation = data?.recommendation;
  const recommendations = recommendation?.recommendations ?? {};
  const entries = Object.entries(recommendations) as Array<
    [string, { current: unknown; recommended: unknown; reason: string }]
  >;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
        <Zap size={14} className="text-yellow-500" />
        <span className="text-xs text-gray-500">Router adaptativo (F15)</span>
      </div>

      {/* Métricas */}
      {recommendation?.metrics && (
        <div className="grid grid-cols-3 gap-2 border-b border-gray-100 p-3 text-xs dark:border-gray-800">
          {Object.entries(recommendation.metrics)
            .slice(0, 6)
            .map(([k, v]) => (
              <div key={k} className="rounded bg-gray-50 p-1.5 dark:bg-gray-800">
                <p className="truncate text-gray-400">{k}</p>
                <p className="font-semibold text-gray-700 dark:text-gray-300">{String(v)}</p>
              </div>
            ))}
        </div>
      )}

      {/* Recomendaciones */}
      <div className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <Zap size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Sin recomendaciones</p>
            <p className="mt-1 text-xs">El router analiza las trazas y propone optimizaciones</p>
          </div>
        ) : (
          entries.map(([key, rec]) => (
            <div key={key} className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{key}</span>
                <ArrowRight size={10} className="text-gray-400" />
                <span className="text-xs text-gray-400">{String(rec.current)}</span>
                <ArrowRight size={10} className="text-indigo-400" />
                <span className="text-xs font-medium text-indigo-500">
                  {String(rec.recommended)}
                </span>
              </div>
              {rec.reason && <p className="text-xs text-gray-400">{rec.reason}</p>}
              <button
                onClick={() => applyMut.mutate({ [key]: rec.recommended })}
                disabled={applyMut.isLoading}
                className="mt-1 rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-600 disabled:opacity-50 dark:bg-indigo-900/30 dark:text-indigo-400"
              >
                Aplicar
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const SubagentsPanel: React.FC<SubagentsPanelProps> = ({ className }) => {
  const [tab, setTab] = useState<Tab>('roles');

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <Users size={16} className="text-indigo-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Subagents y Router
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab('roles')}
          className={cn(
            'flex-1 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'roles'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-400 hover:text-gray-600',
          )}
        >
          Roles
        </button>
        <button
          onClick={() => setTab('router')}
          className={cn(
            'flex-1 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'router'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-400 hover:text-gray-600',
          )}
        >
          Router adaptativo
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'roles' && <RolesTab />}
        {tab === 'router' && <RouterTab />}
      </div>
    </div>
  );
};

export default SubagentsPanel;
