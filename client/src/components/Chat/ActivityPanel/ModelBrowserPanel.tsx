import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Cpu, Zap, HardDrive, MemoryStick, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '~/utils';

/**
 * ModelBrowserPanel — Face 13.
 * Embedded React panel showing hardware viability for all Ollama models.
 * Fetches from /api/hardware/models and /api/hardware/viability, displays
 * VRAM/RAM/CPU requirements and whether the current system can run each model.
 */

interface ModelSpec {
  model_id: string;
  vram_gb: number;
  ram_gb: number;
  disk_gb: number;
  cpu_cores: number;
  tier: 'minimal' | 'light' | 'standard' | 'heavy';
  gpu_required: boolean;
}

interface ViabilityResult extends ModelSpec {
  viable: boolean | null;
  issues: string[];
  score: number;
}

type Tier = 'all' | 'minimal' | 'light' | 'standard' | 'heavy';
const TIER_COLORS: Record<string, string> = {
  minimal: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  light: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  standard: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  heavy: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

interface Props {
  className?: string;
}

export function ModelBrowserPanel({ className }: Props) {
  const [models, setModels] = useState<ViabilityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<Tier>('all');
  const [filterViable, setFilterViable] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'vram'>('score');

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hardware/ranked', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setModels(data.models || data || []);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const filtered = models
    .filter((m) => {
      if (filterTier !== 'all' && m.tier !== filterTier) return false;
      if (filterViable === true && !m.viable) return false;
      if (filterViable === false && m.viable !== false) return false;
      if (search && !m.model_id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.score ?? 0) - (a.score ?? 0);
      if (sortBy === 'vram') return a.vram_gb - b.vram_gb;
      return a.model_id.localeCompare(b.model_id);
    });

  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Model Browser</span>
        <button
          onClick={fetchModels}
          disabled={loading}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          title="Refresh"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <input
          type="text"
          placeholder="Search model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[120px] text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-700 dark:text-gray-300"
        />
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value as Tier)}
          className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-700 dark:text-gray-300"
        >
          <option value="all">All tiers</option>
          <option value="minimal">Minimal</option>
          <option value="light">Light</option>
          <option value="standard">Standard</option>
          <option value="heavy">Heavy</option>
        </select>
        <select
          value={filterViable === null ? 'all' : filterViable ? 'viable' : 'not_viable'}
          onChange={(e) => {
            const v = e.target.value;
            setFilterViable(v === 'all' ? null : v === 'viable');
          }}
          className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-700 dark:text-gray-300"
        >
          <option value="all">All</option>
          <option value="viable">✓ Viable</option>
          <option value="not_viable">✗ Not viable</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'score' | 'name' | 'vram')}
          className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-700 dark:text-gray-300"
        >
          <option value="score">Sort: Viability</option>
          <option value="vram">Sort: VRAM</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </div>
        )}
        {loading && !models.length && (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400">Loading models…</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400">No models match filters</div>
        )}
        {filtered.map((m) => (
          <ModelRow key={m.model_id} model={m} />
        ))}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-1.5 text-[10px] text-gray-400">
        {filtered.length} / {models.length} models
      </div>
    </div>
  );
}

function ModelRow({ model }: { model: ViabilityResult }) {
  const [expanded, setExpanded] = useState(false);

  const viabilityIcon = model.viable === null
    ? <AlertCircle size={13} className="text-gray-400" />
    : model.viable
      ? <CheckCircle2 size={13} className="text-emerald-500" />
      : <XCircle size={13} className="text-red-500" />;

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {viabilityIcon}
        <span className="flex-1 text-xs font-mono text-gray-800 dark:text-gray-200 truncate">{model.model_id}</span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', TIER_COLORS[model.tier] || '')}>
          {model.tier}
        </span>
        {model.viable !== null && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">{model.score}%</span>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1"><Zap size={10} /> VRAM: {model.vram_gb}GB</span>
            <span className="flex items-center gap-1"><MemoryStick size={10} /> RAM: {model.ram_gb}GB</span>
            <span className="flex items-center gap-1"><Cpu size={10} /> CPU: {model.cpu_cores} cores</span>
            <span className="flex items-center gap-1"><HardDrive size={10} /> Disk: {model.disk_gb}GB</span>
          </div>
          {model.gpu_required && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400">Requires GPU</div>
          )}
          {model.issues && model.issues.length > 0 && (
            <ul className="space-y-0.5 mt-1">
              {model.issues.map((issue, i) => (
                <li key={i} className="text-[10px] text-red-500 flex items-start gap-1">
                  <XCircle size={9} className="mt-0.5 shrink-0" /> {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default ModelBrowserPanel;
