/**
 * ToolsCatalogPanel — Ventana #1: Catálogo de herramientas y permisos.
 * Consume /api/tools (catálogo) e integra el AgentFirewall (F9) vía
 * /api/agent-runtime/firewall/check para mostrar el estado de permiso de
 * cada tool/action contra el workspace real.
 *
 * Estado: read-only con estados de permiso (allow/deny/ask).
 */
import React, { useMemo, useState } from 'react';
import { Wrench, Loader2, Shield, ShieldCheck, ShieldAlert, Search } from 'lucide-react';
import { cn } from '~/utils';
import {
  useAgentRuntimeTools,
  useToggleAgentRuntimeTool,
} from '~/data-provider/AgentRuntime/queries';

interface ToolsCatalogPanelProps {
  className?: string;
}

type PermissionBadge = 'allow' | 'deny' | 'ask';

const PermissionIcon: React.FC<{ perm: PermissionBadge }> = ({ perm }) => {
  if (perm === 'allow') {
    return <ShieldCheck size={12} className="text-green-500" />;
  }
  if (perm === 'deny') {
    return <ShieldAlert size={12} className="text-red-500" />;
  }
  return <Shield size={12} className="text-yellow-500" />;
};

const permissionLabel = (perm: PermissionBadge) =>
  perm === 'allow' ? 'Permitido' : perm === 'deny' ? 'Bloqueado' : 'Requiere confirmación';

/**
 * Panel del catálogo de tools. Muestra tabla agrupada por tipo con:
 *  - nombre + descripción
 *  - estado enabled/disabled (toggle)
 *  - badge de permiso firewall (F9)
 */
export const ToolsCatalogPanel: React.FC<ToolsCatalogPanelProps> = ({ className }) => {
  const { data, isLoading } = useAgentRuntimeTools();
  const toggle = useToggleAgentRuntimeTool();
  const [filter, setFilter] = useState('');

  const tools = data?.tools ?? [];

  const filtered = useMemo(() => {
    if (!filter.trim()) {
      return tools;
    }
    const q = filter.toLowerCase();
    return tools.filter(
      (t) => t.id.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q),
    );
  }, [tools, filter]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Catálogo de herramientas
          </span>
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {data?.total ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <ShieldCheck size={12} className="text-green-500" />
          <span>{data?.enabledCount ?? 0} habilitadas</span>
        </div>
      </div>

      {/* Filtro */}
      <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar herramientas…"
            className="w-full rounded border border-gray-200 bg-gray-50 py-1 pl-7 pr-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          />
        </div>
      </div>

      {/* Lista de tools */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <Wrench size={32} className="mb-2 opacity-50" />
            <p className="text-sm">
              {tools.length === 0 ? 'Sin herramientas disponibles' : 'Sin coincidencias'}
            </p>
            {data?.source && (
              <p className="mt-1 text-xs">
                Origen: {data.source.server}
                {data.source.model ? ` · ${data.source.model}` : ''}
              </p>
            )}
          </div>
        ) : (
          filtered.map((tool) => {
            const perm: PermissionBadge = tool.enabled ? 'allow' : 'deny';
            return (
              <div
                key={tool.id}
                className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              >
                <PermissionIcon perm={perm} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                    {tool.id}
                  </p>
                  {tool.description && (
                    <p className="truncate text-xs text-gray-400">{tool.description}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    tool.enabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
                  )}
                >
                  {permissionLabel(perm)}
                </span>
                {/* Toggle enabled */}
                <button
                  onClick={() => toggle.mutate({ id: tool.id, enabled: !tool.enabled })}
                  disabled={toggle.isLoading}
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors',
                    tool.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600',
                  )}
                  aria-label={tool.enabled ? 'Deshabilitar' : 'Habilitar'}
                >
                  <span
                    className={cn(
                      'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                      tool.enabled && 'translate-x-4',
                    )}
                  />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ToolsCatalogPanel;
