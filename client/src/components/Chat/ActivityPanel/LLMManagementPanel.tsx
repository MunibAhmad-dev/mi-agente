import React, { useCallback, useEffect, useState } from 'react';
import { Key, Trash2, Plus, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronRight, HeartPulse, Loader2, RotateCw } from 'lucide-react';
import { cn } from '~/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface KeyInfo {
  masked: string;
  valid: boolean;
  addedAt?: string;
  usageCount?: number;
  provider?: string;
}

interface ProviderEntry {
  provider: string;
  info: KeyInfo;
}

interface Stats {
  totalProviders?: number;
  configuredProviders?: number;
  hitRate?: number;
  providerStats?: Record<string, { calls: number }>;
}

interface PanelData {
  providers: ProviderEntry[];
  stats: Stats;
}

interface Props {
  className?: string;
}

// ─── Provider display names ───────────────────────────────────────────────────

const DISPLAY: Record<string, string> = {
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  mistral: 'Mistral',
  cohere: 'Cohere',
  openrouter: 'OpenRouter',
  perplexity: 'Perplexity',
  huggingface: 'HuggingFace',
  replicate: 'Replicate',
  cloudflare: 'Cloudflare AI',
  tavily: 'Tavily (Search)',
  serpapi: 'SerpAPI (Search)',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ valid }: { valid: boolean }) {
  return valid
    ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
    : <XCircle size={13} className="text-gray-300 dark:text-gray-600 shrink-0" />;
}

function ProviderRow({
  entry,
  onDelete,
}: {
  entry: ProviderEntry;
  onDelete: (p: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = DISPLAY[entry.provider] ?? entry.provider;
  const { info } = entry;

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-2 px-3 py-2">
        <StatusIcon valid={info.valid} />
        <button
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-1 text-left"
        >
          <span className={cn('text-xs font-medium', info.valid ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400')}>
            {label}
          </span>
          {info.valid && (
            <span className="ml-1 font-mono text-[10px] text-gray-400">{info.masked}</span>
          )}
          {open ? <ChevronDown size={11} className="ml-auto text-gray-400" /> : <ChevronRight size={11} className="ml-auto text-gray-400" />}
        </button>
        {info.valid && (
          <button
            onClick={() => onDelete(entry.provider)}
            className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            title={`Remove ${label} key`}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {open && info.valid && (
        <div className="px-9 pb-2 space-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          {info.usageCount != null && <div>Calls: <span className="font-mono text-gray-700 dark:text-gray-300">{info.usageCount}</span></div>}
          {info.addedAt && <div>Added: {new Date(info.addedAt).toLocaleDateString()}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Add Key Form ─────────────────────────────────────────────────────────────

function AddKeyForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider || !key) return;
    setSaving(true);
    setError('');
    try {
      const res = await window.fetch('/api/provider-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.toLowerCase().trim(), key: key.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to save key');
      }
      setProvider('');
      setKey('');
      setOpen(false);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-500 dark:border-gray-700 dark:hover:border-indigo-500"
      >
        <Plus size={12} /> Add API key
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/50 dark:bg-indigo-900/10">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-500">New key</p>
      <div className="space-y-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          required
        >
          <option value="">Select provider…</option>
          {Object.entries(DISPLAY).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="API key…"
          className="w-full rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          required
        />
        {error && <p className="text-[10px] text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(''); }}
            className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Health Check Tab ─────────────────────────────────────────────────────────

interface HealthEntry {
  provider: string;
  reachable: boolean;
  latencyMs?: number;
  error?: string;
}

function HealthTab() {
  const [results, setResults] = useState<HealthEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/provider-keys/health');
      if (res.ok) {
        const data = await res.json();
        setResults(data.providers ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRan(true);
    }
  };

  useEffect(() => { run(); }, []);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">Live reachability probe for all configured providers.</p>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          title="Re-run health check"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
        </div>
      )}

      {!loading && ran && results.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center">No providers configured to probe.</p>
      )}

      {!loading && results.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {results.map((entry) => (
            <div key={entry.provider} className="flex items-center gap-2 py-2 text-sm">
              {entry.reachable
                ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                : <XCircle size={13} className="text-red-400 shrink-0" />}
              <span className={cn('flex-1 font-medium', entry.reachable ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400')}>
                {entry.provider}
              </span>
              {entry.latencyMs != null && (
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{entry.latencyMs}ms</span>
              )}
              {entry.error && (
                <span className="text-xs text-red-400 truncate max-w-[120px]" title={entry.error}>{entry.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rotate button inside ProviderRow (injected via prop) ─────────────────────

function RotateButton({ provider, onDone }: { provider: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const rotate = async () => {
    setLoading(true);
    try {
      await window.fetch(`/api/provider-keys/${encodeURIComponent(provider)}/rotate`, { method: 'POST' });
      onDone();
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  return (
    <button onClick={rotate} disabled={loading} className="rounded p-1 text-gray-300 hover:bg-yellow-50 hover:text-yellow-600 dark:hover:bg-yellow-900/20" title="Rotate key">
      <RotateCw size={12} className={cn(loading && 'animate-spin')} />
    </button>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

type LLMTab = 'keys' | 'health';

export function LLMManagementPanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<LLMTab>('keys');
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/provider-keys');
      if (res.ok) {
        setData(await res.json());
        setLastFetched(new Date());
      }
    } catch {
      // network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (provider: string) => {
    try {
      await window.fetch(`/api/provider-keys/${encodeURIComponent(provider)}`, { method: 'DELETE' });
      load();
    } catch {
      // ignore
    }
  };

  const configured = data?.providers.filter((p) => p.info.valid) ?? [];
  const unconfigured = data?.providers.filter((p) => !p.info.valid) ?? [];

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Key size={14} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">LLM Providers</span>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-[10px] text-gray-400">
              {configured.length} / {data.providers.length} active
            </span>
          )}
          {activeTab === 'keys' && (
            <button
              onClick={load}
              disabled={loading}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              title="Refresh"
            >
              <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
        {([{ id: 'keys', label: 'API Keys', icon: <Key size={11} /> }, { id: 'health', label: 'Health', icon: <HeartPulse size={11} /> }] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors',
              activeTab === t.id
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'health' && <HealthTab />}

      <div className={cn('flex-1 overflow-y-auto', activeTab !== 'keys' && 'hidden')}>
        {/* Stats bar */}
        {data?.stats && configured.length > 0 && (
          <div className="flex gap-4 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <div className="text-center">
              <p className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">{configured.length}</p>
              <p className="text-[10px] text-gray-400">Active</p>
            </div>
            {data.stats.hitRate != null && (
              <div className="text-center">
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {(data.stats.hitRate * 100).toFixed(0)}%
                </p>
                <p className="text-[10px] text-gray-400">Hit rate</p>
              </div>
            )}
          </div>
        )}

        {/* Configured providers */}
        {configured.length > 0 && (
          <div>
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Configured
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {configured.map((entry) => (
                <ProviderRow key={entry.provider} entry={entry} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* Unconfigured providers */}
        {unconfigured.length > 0 && (
          <div className="mt-2">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Not configured
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {unconfigured.map((entry) => (
                <ProviderRow key={entry.provider} entry={entry} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* Add key */}
        <div className="p-3">
          <AddKeyForm onAdded={load} />
        </div>

        {!data && !loading && (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <Key size={28} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400">No data</p>
          </div>
        )}
      </div>

      {lastFetched && (
        <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400 dark:border-gray-800">
          Updated {lastFetched.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
