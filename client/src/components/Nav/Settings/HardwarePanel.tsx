import React, { useEffect, useState, useCallback } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import { Cpu, HardDrive, Zap, CheckCircle, XCircle, AlertTriangle, RefreshCw, Server } from 'lucide-react';
import { cn } from '~/utils';

/**
 * HardwarePanel — Face 13: Hardware Requirements Center.
 * Shows local model hardware requirements and viability for the current system.
 * Settings → AI → Hardware Requirements.
 */

function getToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
  } catch { /* ignore */ }
  try { return localStorage.getItem('token'); } catch { return null; }
}

async function apiFetch(path: string) {
  const token = getToken();
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

interface ModelSpec {
  model_id: string;
  vram_gb: number;
  ram_gb: number;
  disk_gb: number;
  cpu_cores: number;
  tier: string;
  gpu_required: boolean;
  viability?: 'green' | 'yellow' | 'red';
  reason?: string;
}

interface SystemSpec {
  vram_gb: number;
  ram_gb: number;
  cpu_cores: number;
  has_gpu: boolean;
  disk_free_gb: number;
}

const TIER_ORDER = ['minimal', 'light', 'standard', 'heavy'];
const TIER_COLOR: Record<string, string> = {
  minimal: 'text-green-500',
  light: 'text-teal-500',
  standard: 'text-yellow-500',
  heavy: 'text-red-500',
};

export default function HardwarePanel() {
  const [models, setModels] = useState<ModelSpec[]>([]);
  const [system, setSystem] = useState<SystemSpec>({ vram_gb: 8, ram_gb: 16, cpu_cores: 8, has_gpu: false, disk_free_gb: 100 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [showOnlyCompatible, setShowOnlyCompatible] = useState(false);
  const [systemSaved, setSystemSaved] = useState(false);

  const loadRanked = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        vram_gb: String(system.vram_gb),
        ram_gb: String(system.ram_gb),
        cpu_cores: String(system.cpu_cores),
        has_gpu: String(system.has_gpu),
        disk_free_gb: String(system.disk_free_gb),
      });
      const data = await apiFetch(`/api/hardware/ranked?${qs}`);
      setModels(data.models || []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [system]);

  useEffect(() => { loadRanked(); }, []);

  async function saveSystem() {
    try {
      await apiFetch('/api/hardware/system');
      setSystemSaved(true);
      setTimeout(() => setSystemSaved(false), 2000);
      await loadRanked();
    } catch { /* non-fatal */ }
  }

  const filtered = models.filter((m) => {
    if (filterTier !== 'all' && m.tier !== filterTier) return false;
    if (showOnlyCompatible && m.viability === 'red') return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-semibold">Hardware Requirements Center</h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          See which local models your system can run. Set your specs to get ranked results.
        </p>
      </div>

      {/* System Specs Form */}
      <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="mb-2 flex items-center gap-2">
          <Server className="h-4 w-4 text-gray-400" />
          <span className="text-xs font-semibold">Your System</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { label: 'VRAM (GB)', key: 'vram_gb', min: 0, max: 128, step: 1 },
            { label: 'RAM (GB)', key: 'ram_gb', min: 4, max: 512, step: 4 },
            { label: 'CPU Cores', key: 'cpu_cores', min: 1, max: 64, step: 1 },
            { label: 'Free Disk (GB)', key: 'disk_free_gb', min: 10, max: 2000, step: 10 },
          ].map(({ label, key, min, max, step }) => (
            <label key={key} className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={(system as Record<string, number | boolean>)[key] as number}
                onChange={(e) => setSystem((s) => ({ ...s, [key]: parseFloat(e.target.value) || 0 }))}
                className="rounded border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
              />
            </label>
          ))}
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">Has GPU</span>
            <select
              value={system.has_gpu ? 'yes' : 'no'}
              onChange={(e) => setSystem((s) => ({ ...s, has_gpu: e.target.value === 'yes' }))}
              className="rounded border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
        </div>
        <button
          onClick={loadRanked}
          className="mt-2 flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          {systemSaved ? 'Saved!' : 'Check Compatibility'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="rounded border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
        >
          <option value="all">All tiers</option>
          {TIER_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={showOnlyCompatible}
            onChange={(e) => setShowOnlyCompatible(e.target.checked)}
            className="accent-blue-600"
          />
          Compatible only
        </label>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} models</span>
      </div>

      {/* Error */}
      {error && <p className="rounded bg-red-500/10 p-2 text-xs text-red-500">{error}</p>}

      {/* Model List */}
      {loading ? (
        <div className="flex justify-center py-6 text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((m) => (
            <div
              key={m.model_id}
              className={cn(
                'rounded-lg border p-3',
                m.viability === 'green' ? 'border-green-500/30 bg-green-500/5' :
                m.viability === 'yellow' ? 'border-yellow-500/30 bg-yellow-500/5' :
                'border-black/10 dark:border-white/10',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.model_id}</span>
                    <span className={cn('text-xs font-medium', TIER_COLOR[m.tier] || '')}>{m.tier}</span>
                  </div>
                  {m.reason && <p className="mt-0.5 text-xs text-gray-500">{m.reason}</p>}
                </div>
                <div className="shrink-0">
                  {m.viability === 'green' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {m.viability === 'yellow' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                  {m.viability === 'red' && <XCircle className="h-4 w-4 text-red-400" />}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{m.vram_gb} GB VRAM</span>
                <span className="flex items-center gap-1"><Server className="h-3 w-3" />{m.ram_gb} GB RAM</span>
                <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{m.cpu_cores} cores</span>
                <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{m.disk_gb} GB disk</span>
                {m.gpu_required && <span className="text-orange-400">GPU required</span>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <p className="py-4 text-center text-xs text-gray-400">No models match the current filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
