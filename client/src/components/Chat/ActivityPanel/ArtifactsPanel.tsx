/**
 * ArtifactsPanel — Ventana #4: Artefactos generados.
 * Vista de resumen ejecutivo de todos los artefactos (archivos) producidos
 * por el agente: totales por tipo (creados/modificados/eliminados), líneas
 * añadidas/eliminadas, y un mini-feed de los artefactos más recientes.
 *
 * Reutiliza el store changeInspectorStore (fuente única de verdad para los
 * cambios de archivos) — no duplica estado.
 */
import React, { useMemo } from 'react';
import { Package, FilePlus, FileEdit, FileMinus, TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '~/utils';
import { useChangeInspector } from '~/hooks/useChangeInspector';
import type { FileChange } from '~/store/changeInspectorStore';

interface ArtifactsPanelProps {
  className?: string;
}

const TypeBadge: React.FC<{ type: FileChange['type'] }> = ({ type }) => {
  const config = {
    create: {
      icon: FilePlus,
      color: 'text-green-500',
      bg: 'bg-green-100 dark:bg-green-900/30',
      label: 'Creado',
    },
    modify: {
      icon: FileEdit,
      color: 'text-blue-500',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      label: 'Modificado',
    },
    delete: {
      icon: FileMinus,
      color: 'text-red-500',
      bg: 'bg-red-100 dark:bg-red-900/30',
      label: 'Eliminado',
    },
    rename: {
      icon: FileEdit,
      color: 'text-yellow-500',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      label: 'Renombrado',
    },
  };
  const c = config[type] ?? config.modify;
  const Icon = c.icon;
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs', c.bg, c.color)}
    >
      <Icon size={10} />
      {c.label}
    </span>
  );
};

const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}> = ({ icon: Icon, label, value, color }) => (
  <div className="rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
    <div className="mb-0.5 flex items-center gap-1 text-xs text-gray-400">
      <Icon size={12} className={color} />
      <span>{label}</span>
    </div>
    <p className="text-lg font-semibold tabular-nums text-gray-700 dark:text-gray-300">{value}</p>
  </div>
);

export const ArtifactsPanel: React.FC<ArtifactsPanelProps> = ({ className }) => {
  const { stats, changes, isLoading } = useChangeInspector();

  const summary = useMemo(() => {
    const additions = changes.reduce((s, c) => s + (c.additions || 0), 0);
    const deletions = changes.reduce((s, c) => s + (c.deletions || 0), 0);
    return {
      total: changes.length,
      additions,
      deletions,
      net: additions - deletions,
    };
  }, [changes]);

  const recent = useMemo(() => [...changes].slice(-10).reverse(), [changes]);

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
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <Package size={16} className="text-indigo-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Artefactos generados
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 border-b border-gray-100 p-3 dark:border-gray-800">
        <StatCard icon={Package} label="Total" value={summary.total} color="text-indigo-500" />
        <StatCard icon={FilePlus} label="Creados" value={stats.creates} color="text-green-500" />
        <StatCard
          icon={FileEdit}
          label="Modificados"
          value={stats.modifies}
          color="text-blue-500"
        />
        <StatCard icon={FileMinus} label="Eliminados" value={stats.deletes} color="text-red-500" />
      </div>

      {/* Líneas */}
      <div className="flex items-center gap-4 border-b border-gray-100 px-3 py-2 text-xs dark:border-gray-800">
        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <TrendingUp size={12} />+{summary.additions}
        </span>
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <FileMinus size={12} />-{summary.deletions}
        </span>
        <span className="text-gray-400">
          Neto:{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {summary.net > 0 ? '+' : ''}
            {summary.net}
          </span>
        </span>
      </div>

      {/* Feed de artefactos recientes */}
      <div className="flex-1 overflow-auto">
        {recent.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <Package size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Sin artefactos generados</p>
            <p className="mt-1 text-xs">Los archivos creados por el agente aparecerán aquí</p>
          </div>
        ) : (
          recent.map((change) => {
            const filename = change.path.split('/').pop() ?? change.path;
            const dir = change.path.includes('/')
              ? change.path.slice(0, change.path.lastIndexOf('/'))
              : '';
            return (
              <div
                key={change.id ?? change.path}
                className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              >
                <TypeBadge type={change.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                    {filename}
                  </p>
                  {dir && <p className="truncate text-xs text-gray-400">{dir}</p>}
                </div>
                {change.type === 'modify' && (
                  <div className="flex items-center gap-1 text-xs tabular-nums">
                    <span className="text-green-500">+{change.additions || 0}</span>
                    <span className="text-red-500">-{change.deletions || 0}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ArtifactsPanel;
