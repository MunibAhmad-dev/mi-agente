import React, { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  size?: string;
  context?: number;
  status: 'available' | 'downloading' | 'unavailable';
  tags?: string[];
  description?: string;
  ramRequired?: number;
  vramRequired?: number;
  latencyMs?: number;
  successRate?: number;
}

interface RouterStatus {
  enabled: boolean;
  activeModel?: string;
  fallbackChain?: string[];
  metrics?: Record<string, { latency: number; success: number; cost: number }>;
}

interface HardwareInfo {
  ram: number;
  vram: number;
  cpu: string;
  recommendedModels: string[];
}

type TabId = 'dashboard' | 'explorer' | 'hardware' | 'compare' | 'recommender' | 'router';

// ── Hooks ────────────────────────────────────────────────────────────────────

function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/model-catalog');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setModels(Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);
  return { models, loading, error, refetch: fetch_ };
}

function useRouterStatus() {
  const [status, setStatus] = useState<RouterStatus | null>(null);

  useEffect(() => {
    fetch('/api/model-router/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return status;
}

function useHardware() {
  const [info, setInfo] = useState<HardwareInfo | null>(null);

  useEffect(() => {
    fetch('/api/hardware/specs/current')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  return info;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ModelInfo['status'] }) {
  const colors: Record<string, string> = {
    available: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    downloading: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    unavailable: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? colors.unavailable}`}>
      {status}
    </span>
  );
}

function ModelCard({ model, selected, onSelect }: { model: ModelInfo; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{model.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{model.provider}</p>
        </div>
        <StatusBadge status={model.status} />
      </div>
      {model.context && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{model.context.toLocaleString()} ctx</p>
      )}
      {model.tags && model.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {model.tags.slice(0, 3).map((t) => (
            <span key={t} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({ models, router }: { models: ModelInfo[]; router: RouterStatus | null }) {
  const available = models.filter((m) => m.status === 'available').length;
  const total = models.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Models', value: total },
          { label: 'Available', value: available },
          { label: 'Active Router', value: router?.activeModel ?? '—' },
          { label: 'Fallback Chain', value: router?.fallbackChain?.length ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">{value}</p>
          </div>
        ))}
      </div>

      {router?.metrics && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Router Metrics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left pb-1 pr-3">Model</th>
                  <th className="text-right pb-1 pr-3">Latency</th>
                  <th className="text-right pb-1 pr-3">Success</th>
                  <th className="text-right pb-1">Cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(router.metrics).map(([model, m]) => (
                  <tr key={model} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1 pr-3 font-mono text-xs truncate max-w-[120px]">{model}</td>
                    <td className="py-1 pr-3 text-right text-xs">{m.latency}ms</td>
                    <td className="py-1 pr-3 text-right text-xs">{(m.success * 100).toFixed(0)}%</td>
                    <td className="py-1 text-right text-xs">${m.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Explorer Tab ──────────────────────────────────────────────────────────────

function ExplorerTab({ models }: { models: ModelInfo[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ModelInfo | null>(null);

  const filtered = models.filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || (m.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="sm:w-64 flex-shrink-0 space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models…"
          className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No models found</p>
          ) : (
            filtered.map((m) => (
              <ModelCard key={m.id} model={m} selected={selected?.id === m.id} onSelect={() => setSelected(m)} />
            ))
          )}
        </div>
      </div>

      <div className="flex-1">
        {selected ? (
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{selected.name}</h3>
              <StatusBadge status={selected.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Provider', selected.provider],
                ['Size', selected.size ?? '—'],
                ['Context', selected.context ? `${selected.context.toLocaleString()} tokens` : '—'],
                ['RAM Required', selected.ramRequired ? `${selected.ramRequired} GB` : '—'],
                ['VRAM Required', selected.vramRequired ? `${selected.vramRequired} GB` : '—'],
                ['Latency', selected.latencyMs ? `${selected.latencyMs} ms` : '—'],
                ['Success Rate', selected.successRate ? `${(selected.successRate * 100).toFixed(1)}%` : '—'],
              ].map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            {selected.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{selected.description}</p>
            )}
            {selected.tags && selected.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">{t}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Select a model to see details
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hardware Calculator Tab ───────────────────────────────────────────────────

function HardwareTab({ hardware, models }: { hardware: HardwareInfo | null; models: ModelInfo[] }) {
  const [ram, setRam] = useState(hardware?.ram ?? 16);
  const [vram, setVram] = useState(hardware?.vram ?? 8);

  const compatible = models.filter((m) => {
    const rReq = m.ramRequired ?? 0;
    const vReq = m.vramRequired ?? 0;
    return rReq <= ram && vReq <= vram;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            RAM: {ram} GB
          </label>
          <input
            type="range"
            min={4}
            max={256}
            step={4}
            value={ram}
            onChange={(e) => setRam(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            VRAM: {vram} GB
          </label>
          <input
            type="range"
            min={0}
            max={80}
            step={2}
            value={vram}
            onChange={(e) => setVram(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Compatible models ({compatible.length})
        </h3>
        {compatible.length === 0 ? (
          <p className="text-sm text-gray-500">No models fit these constraints. Increase RAM or VRAM.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {compatible.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-2 rounded border border-gray-200 dark:border-gray-700 text-sm">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.provider}</p>
                </div>
                <div className="text-xs text-gray-500 text-right">
                  {m.ramRequired && <p>{m.ramRequired}GB RAM</p>}
                  {m.vramRequired && <p>{m.vramRequired}GB VRAM</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Compare Tab ───────────────────────────────────────────────────────────────

function CompareTab({ models }: { models: ModelInfo[] }) {
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');

  const modelA = models.find((m) => m.id === a);
  const modelB = models.find((m) => m.id === b);

  const rows: Array<{ label: string; key: keyof ModelInfo; fmt?: (v: any) => string }> = [
    { label: 'Provider', key: 'provider' },
    { label: 'Size', key: 'size' },
    { label: 'Context', key: 'context', fmt: (v) => (v ? `${v.toLocaleString()} tokens` : '—') },
    { label: 'RAM Required', key: 'ramRequired', fmt: (v) => (v ? `${v} GB` : '—') },
    { label: 'VRAM Required', key: 'vramRequired', fmt: (v) => (v ? `${v} GB` : '—') },
    { label: 'Latency', key: 'latencyMs', fmt: (v) => (v ? `${v} ms` : '—') },
    { label: 'Success Rate', key: 'successRate', fmt: (v) => (v ? `${(v * 100).toFixed(1)}%` : '—') },
    { label: 'Status', key: 'status' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Model A', value: a, set: setA },
          { label: 'Model B', value: b, set: setB },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
            <select
              value={value}
              onChange={(e) => set(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a model…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {modelA && modelB ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left pb-1 pr-3">Attribute</th>
                <th className="text-left pb-1 pr-3">{modelA.name}</th>
                <th className="text-left pb-1">{modelB.name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, key, fmt }) => {
                const va = fmt ? fmt(modelA[key]) : String(modelA[key] ?? '—');
                const vb = fmt ? fmt(modelB[key]) : String(modelB[key] ?? '—');
                return (
                  <tr key={label} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400">{label}</td>
                    <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-gray-100">{va}</td>
                    <td className="py-1.5 font-medium text-gray-900 dark:text-gray-100">{vb}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-6">Select two models to compare them side by side</p>
      )}
    </div>
  );
}

// ── Recommender Tab ───────────────────────────────────────────────────────────

function RecommenderTab({ models }: { models: ModelInfo[] }) {
  const [task, setTask] = useState('');
  const [recs, setRecs] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const recommend = async () => {
    if (!task.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/model-router/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecs(data.recommendations ?? []);
      } else {
        // Local heuristic fallback
        const lower = task.toLowerCase();
        const scored = models
          .filter((m) => m.status === 'available')
          .map((m) => {
            let score = 0;
            if (/code|program|script/.test(lower) && m.tags?.includes('code')) score += 2;
            if (/fast|quick|latency/.test(lower) && m.latencyMs && m.latencyMs < 200) score += 2;
            if (/large|complex|deep/.test(lower) && m.context && m.context > 50000) score += 2;
            return { ...m, _score: score };
          })
          .sort((a: any, b: any) => b._score - a._score)
          .slice(0, 5);
        setRecs(scored);
      }
    } catch {
      setRecs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && recommend()}
          placeholder="Describe your task (e.g. write Python code, summarize a document)…"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={recommend}
          disabled={!task.trim() || loading}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading…' : 'Recommend'}
        </button>
      </div>

      {recs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Recommended models</h3>
          {recs.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{m.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{m.provider}{m.context ? ` · ${m.context.toLocaleString()} ctx` : ''}</p>
              </div>
              <StatusBadge status={m.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Router Tab ────────────────────────────────────────────────────────────────

function RouterTab({ router }: { router: RouterStatus | null }) {
  if (!router) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
        No router status available. Ensure the model router is configured.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Router Enabled', value: router.enabled ? 'Yes' : 'No' },
          { label: 'Active Model', value: router.activeModel ?? '—' },
          { label: 'Fallback Models', value: router.fallbackChain?.length ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{value}</p>
          </div>
        ))}
      </div>

      {router.fallbackChain && router.fallbackChain.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fallback Chain</h3>
          <ol className="space-y-1">
            {router.fallbackChain.map((model, i) => (
              <li key={model} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-gray-900 dark:text-gray-100">{model}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {router.metrics && Object.keys(router.metrics).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Routing Metrics by Model</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left pb-1 pr-3">Model</th>
                  <th className="text-right pb-1 pr-3">Avg Latency</th>
                  <th className="text-right pb-1 pr-3">Success Rate</th>
                  <th className="text-right pb-1">Cost/req</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(router.metrics).map(([model, m]) => (
                  <tr key={model} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 pr-3 font-mono text-xs truncate max-w-[140px]">{model}</td>
                    <td className="py-1.5 pr-3 text-right text-xs">{m.latency}ms</td>
                    <td className="py-1.5 pr-3 text-right text-xs">{(m.success * 100).toFixed(0)}%</td>
                    <td className="py-1.5 text-right text-xs">${m.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'compare', label: 'Compare' },
  { id: 'recommender', label: 'Recommender' },
  { id: 'router', label: 'Router' },
];

export function ModelManagementPanel() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const { models, loading, error, refetch } = useModels();
  const router = useRouterStatus();
  const hardware = useHardware();

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">IA y Modelos</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Model management, routing, and intelligence</p>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error} — Using demo data
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {tab === 'dashboard' && <DashboardTab models={models} router={router} />}
        {tab === 'explorer' && <ExplorerTab models={models} />}
        {tab === 'hardware' && <HardwareTab hardware={hardware} models={models} />}
        {tab === 'compare' && <CompareTab models={models} />}
        {tab === 'recommender' && <RecommenderTab models={models} />}
        {tab === 'router' && <RouterTab router={router} />}
      </div>
    </div>
  );
}

export default ModelManagementPanel;
