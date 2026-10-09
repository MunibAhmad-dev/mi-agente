/**
 * SkillsCatalogPanel — Ventana #3: Skills disponibles y activas.
 * Consume /api/skills (listado) + /api/skills/states (activas) y permite
 * activar/desactivar skills con un toggle.
 */
import React, { useMemo, useState } from 'react';
import { Sparkles, Loader2, Search, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '~/utils';
import { useListSkillsQuery, useUpdateSkillStatesMutation } from '~/data-provider/Skills/queries';
import { useGetSkillStatesQuery } from '~/data-provider/Skills/queries';

interface SkillsCatalogPanelProps {
  className?: string;
}

export const SkillsCatalogPanel: React.FC<SkillsCatalogPanelProps> = ({ className }) => {
  const { data, isLoading } = useListSkillsQuery({ limit: 100 });
  const { data: states } = useGetSkillStatesQuery();
  const updateStates = useUpdateSkillStatesMutation();
  const [filter, setFilter] = useState('');

  const skills = data?.skills ?? [];

  const filtered = useMemo(() => {
    if (!filter.trim()) {
      return skills;
    }
    const q = filter.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.displayTitle ?? '').toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q),
    );
  }, [skills, filter]);

  const activeCount = useMemo(
    () => skills.filter((s) => states?.[s._id] === true).length,
    [skills, states],
  );

  const toggle = (id: string, current: boolean) => {
    updateStates.mutate({ ...states, [id]: !current });
  };

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
          <Sparkles size={16} className="text-purple-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Skills</span>
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {skills.length}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <CheckCircle2 size={12} className="text-green-500" />
          <span>{activeCount} activas</span>
        </div>
      </div>

      {/* Filtro */}
      <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar skills…"
            className="w-full rounded border border-gray-200 bg-gray-50 py-1 pl-7 pr-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <Sparkles size={32} className="mb-2 opacity-50" />
            <p className="text-sm">
              {skills.length === 0 ? 'Sin skills disponibles' : 'Sin coincidencias'}
            </p>
          </div>
        ) : (
          filtered.map((skill) => {
            const active = states?.[skill._id] === true;
            return (
              <div
                key={skill._id}
                className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              >
                {active ? (
                  <CheckCircle2 size={14} className="flex-shrink-0 text-green-500" />
                ) : (
                  <Circle size={14} className="flex-shrink-0 text-gray-300" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                    {skill.displayTitle || skill.name}
                  </p>
                  {skill.description && (
                    <p className="truncate text-xs text-gray-400">{skill.description}</p>
                  )}
                </div>
                {skill.category && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    {skill.category}
                  </span>
                )}
                <button
                  onClick={() => toggle(skill._id, active)}
                  disabled={updateStates.isLoading}
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors',
                    active ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600',
                  )}
                  aria-label={active ? 'Desactivar' : 'Activar'}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                      active ? 'translate-x-4' : 'translate-x-0.5',
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

export default SkillsCatalogPanel;
