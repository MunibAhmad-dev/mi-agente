/**
 * AgentSettingsPanel — Ventana #5: Settings (Permisos / Límites / Memorias).
 * Panel con 3 secciones que consumen /api/agent-runtime:
 *  - Permisos: política del AgentFirewall (F9)
 *  - Límites: configuración de límites del runtime
 *  - Memorias: entradas de memoria del agente (F10) con stats y CRUD
 */
import React, { useState } from 'react';
import { Settings, Shield, Sliders, Database, Loader2, Trash2, Plus } from 'lucide-react';
import { cn } from '~/utils';
import {
  useAgentRuntimeMemory,
  useAgentRuntimeMemoryStats,
  useCreateAgentRuntimeMemory,
  useDeleteAgentRuntimeMemory,
} from '~/data-provider/AgentRuntime/queries';

type Section = 'permissions' | 'limits' | 'memories';

interface AgentSettingsPanelProps {
  className?: string;
}

const SectionHeader: React.FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon: Icon, title, description, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left transition-colors dark:border-gray-800',
      active
        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800',
    )}
  >
    <Icon size={16} />
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium">{title}</p>
      <p className="truncate text-xs text-gray-400">{description}</p>
    </div>
  </button>
);

const MemoriesSection: React.FC = () => {
  const { data, isLoading } = useAgentRuntimeMemory();
  const { data: statsData } = useAgentRuntimeMemoryStats();
  const createMut = useCreateAgentRuntimeMemory();
  const deleteMut = useDeleteAgentRuntimeMemory();
  const [newEntry, setNewEntry] = useState('');

  const entries = data?.entries ?? [];
  const stats = (statsData?.stats ?? {}) as Record<string, unknown>;

  const handleCreate = () => {
    if (!newEntry.trim()) {
      return;
    }
    createMut.mutate({ content: newEntry, type: 'note' });
    setNewEntry('');
  };

  return (
    <div className="space-y-3 p-3">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-gray-50 p-2 dark:bg-gray-800">
          <p className="text-gray-400">Total</p>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {String(stats.total ?? entries.length)}
          </p>
        </div>
        <div className="rounded bg-gray-50 p-2 dark:bg-gray-800">
          <p className="text-gray-400">Tipos</p>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {String(stats.types ?? '—')}
          </p>
        </div>
        <div className="rounded bg-gray-50 p-2 dark:bg-gray-800">
          <p className="text-gray-400">Tamaño</p>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {String(stats.size ?? '—')}
          </p>
        </div>
      </div>

      {/* Crear */}
      <div className="flex gap-2">
        <input
          value={newEntry}
          onChange={(e) => setNewEntry(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Nueva entrada de memoria…"
          className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
        <button
          onClick={handleCreate}
          disabled={createMut.isLoading || !newEntry.trim()}
          className="rounded bg-indigo-500 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Lista */}
      {(() => {
        if (isLoading) {
          return (
            <div className="flex justify-center py-4">
              <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
          );
        }
        if (entries.length === 0) {
          return <p className="py-4 text-center text-xs text-gray-400">Sin entradas de memoria</p>;
        }
        return (
          <div className="max-h-64 space-y-1 overflow-auto">
            {entries.map((entry, i) => {
              const e = entry as Record<string, unknown>;
              const id = (e._id ?? e.id ?? i) as string;
              return (
                <div
                  key={String(id)}
                  className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1.5 text-xs dark:bg-gray-800"
                >
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                    {String(e.content ?? e.text ?? JSON.stringify(e))}
                  </span>
                  {e.type != null && (
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-gray-500 dark:bg-gray-700">
                      {String(e.type)}
                    </span>
                  )}
                  <button
                    onClick={() => deleteMut.mutate(String(id))}
                    disabled={deleteMut.isLoading}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};

const PermissionsSection: React.FC = () => (
  <div className="space-y-2 p-3 text-xs text-gray-600 dark:text-gray-400">
    <p>
      La política de permisos se gestiona desde el AgentFirewall (F9). Cada herramienta se evalúa
      contra el workspace real antes de ejecutarse.
    </p>
    <div className="space-y-1">
      <div className="flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 dark:bg-gray-800">
        <span className="flex items-center gap-1">
          <Shield size={12} className="text-green-500" />
          allow
        </span>
        <span className="text-gray-400">Ejecuta sin confirmación</span>
      </div>
      <div className="flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 dark:bg-gray-800">
        <span className="flex items-center gap-1">
          <Shield size={12} className="text-yellow-500" />
          ask
        </span>
        <span className="text-gray-400">Requiere confirmación del usuario</span>
      </div>
      <div className="flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 dark:bg-gray-800">
        <span className="flex items-center gap-1">
          <Shield size={12} className="text-red-500" />
          deny
        </span>
        <span className="text-gray-400">Bloqueado</span>
      </div>
    </div>
    <p className="mt-2 text-gray-400">
      Consulta el catálogo de herramientas para ver el estado de cada permiso.
    </p>
  </div>
);

const LimitsSection: React.FC = () => (
  <div className="space-y-2 p-3 text-xs text-gray-600 dark:text-gray-400">
    <p>
      Los límites del runtime (tokens, coste, tiempo, tool calls) se configuran en el backend. Estos
      son los valores actuales por defecto:
    </p>
    <div className="space-y-1">
      {[
        { label: 'Máx. tokens por traza', value: '128K' },
        { label: 'Máx. coste por sesión', value: '$5.00' },
        { label: 'Timeout de tool', value: '120s' },
        { label: 'Máx. tool calls por turno', value: '50' },
      ].map((l) => (
        <div
          key={l.label}
          className="flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 dark:bg-gray-800"
        >
          <span>{l.label}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{l.value}</span>
        </div>
      ))}
    </div>
    <p className="mt-2 text-gray-400">Edita estos valores en la configuración del servidor.</p>
  </div>
);

export const AgentSettingsPanel: React.FC<AgentSettingsPanelProps> = ({ className }) => {
  const [activeSection, setActiveSection] = useState<Section>('memories');

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <Settings size={16} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Configuración del agente
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar de secciones */}
        <div className="w-48 overflow-auto border-r border-gray-100 dark:border-gray-800">
          <SectionHeader
            icon={Shield}
            title="Permisos"
            description="Política del firewall (F9)"
            active={activeSection === 'permissions'}
            onClick={() => setActiveSection('permissions')}
          />
          <SectionHeader
            icon={Sliders}
            title="Límites"
            description="Tokens, coste, tiempo"
            active={activeSection === 'limits'}
            onClick={() => setActiveSection('limits')}
          />
          <SectionHeader
            icon={Database}
            title="Memorias"
            description="Entradas del agente (F10)"
            active={activeSection === 'memories'}
            onClick={() => setActiveSection('memories')}
          />
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-auto">
          {activeSection === 'permissions' && <PermissionsSection />}
          {activeSection === 'limits' && <LimitsSection />}
          {activeSection === 'memories' && <MemoriesSection />}
        </div>
      </div>
    </div>
  );
};

export default AgentSettingsPanel;
