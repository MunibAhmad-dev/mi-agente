import React, { useState, useCallback, useEffect } from 'react';
import {
  Search,
  Download,
  Trash2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Package,
  Zap,
  Loader2,
} from 'lucide-react';
import { cn } from '~/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SkillEntry {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  type?: string;
  platform?: string;
  source?: string;
  stars?: number;
  installed?: boolean;
  [key: string]: unknown;
}

interface Registry {
  whitelist?: SkillEntry[];
  installed?: SkillEntry[];
  blacklist?: SkillEntry[];
  total?: number;
  [key: string]: unknown;
}

type Tab = 'registry' | 'search' | 'installed' | 'auto';

// ── Shared helpers ─────────────────────────────────────────────────────────────

function CategoryBadge({ cat }: { cat?: string }) {
  if (!cat) return null;
  return (
    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
      {cat}
    </span>
  );
}

function SkillCard({
  skill,
  onInstall,
  onUninstall,
  busy,
}: {
  skill: SkillEntry;
  onInstall?: (name: string) => void;
  onUninstall?: (name: string) => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rounded border border-gray-100 bg-white px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900">
      <Package size={14} className="mt-0.5 shrink-0 text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-800 dark:text-gray-200">
            {skill.name}
          </span>
          {skill.installed && (
            <CheckCircle2 size={11} className="text-emerald-500" />
          )}
          <CategoryBadge cat={skill.category} />
        </div>
        {skill.description && (
          <p className="mt-0.5 text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">
            {skill.description}
          </p>
        )}
        {(skill.type || skill.platform) && (
          <p className="mt-0.5 text-[10px] text-gray-400">
            {[skill.type, skill.platform].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {skill.installed && onUninstall ? (
          <button
            onClick={() => onUninstall(skill.name)}
            disabled={busy}
            className="flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-[10px] text-red-500 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:hover:bg-red-900/40"
          >
            {busy ? <Loader2 size={9} className="animate-spin" /> : <Trash2 size={9} />}
            Remove
          </button>
        ) : onInstall ? (
          <button
            onClick={() => onInstall(skill.name)}
            disabled={busy || skill.installed}
            className="flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-[10px] text-indigo-500 hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40"
          >
            {busy ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />}
            {skill.installed ? 'Installed' : 'Install'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Registry Tab ──────────────────────────────────────────────────────────────

function RegistryTab() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/config/skills-registry', {
        credentials: 'include',
      });
      if (res.ok) setRegistry(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const install = async (name: string) => {
    setBusy(name);
    try {
      await window.fetch('/api/config/skills-registry/install', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      load();
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  };

  const skills = registry?.whitelist ?? [];
  const filtered = filter.trim()
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(filter.toLowerCase()) ||
          (s.description ?? '').toLowerCase().includes(filter.toLowerCase()) ||
          (s.category ?? '').toLowerCase().includes(filter.toLowerCase()),
      )
    : skills;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative">
        <Search
          size={12}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter registry…"
          className="w-full rounded border border-gray-200 bg-white py-1.5 pl-7 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
        />
      </div>
      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <p className="text-center text-xs text-gray-400">
          {skills.length === 0 ? 'Registry empty' : 'No matches'}
        </p>
      )}
      {filtered.map((s) => (
        <SkillCard
          key={s.name}
          skill={s}
          onInstall={install}
          busy={busy === s.name}
        />
      ))}
      <button
        onClick={load}
        disabled={loading}
        className="mt-1 flex items-center gap-1 self-end text-[10px] text-gray-400 hover:text-gray-600"
      >
        <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
      </button>
    </div>
  );
}

// ── Search Tab ────────────────────────────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await window.fetch('/api/config/skills-registry/search', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), limit: 20 }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : data.results ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const install = async (name: string) => {
    setBusy(name);
    try {
      await window.fetch('/api/config/skills-registry/install', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setResults((prev) =>
        prev.map((s) => (s.name === name ? { ...s, installed: true } : s)),
      );
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          placeholder="Search GitHub, HuggingFace, MCP…"
          className="flex-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          onClick={doSearch}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1 rounded bg-indigo-500 px-3 py-1.5 text-xs text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
          Search
        </button>
      </div>
      {!searched && (
        <p className="text-center text-xs text-gray-400">
          Search across GitHub, HuggingFace, MCP Registry &amp; ARD
        </p>
      )}
      {searched && !loading && results.length === 0 && (
        <p className="text-center text-xs text-gray-400">No results</p>
      )}
      {results.map((s) => (
        <SkillCard
          key={s.name}
          skill={s}
          onInstall={install}
          busy={busy === s.name}
        />
      ))}
    </div>
  );
}

// ── Installed Tab ─────────────────────────────────────────────────────────────

function InstalledTab() {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/config/skills-registry/installed', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setSkills(Array.isArray(data) ? data : data.installed ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uninstall = async (name: string) => {
    setBusy(name);
    try {
      await window.fetch(`/api/config/skills-registry/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      load();
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      )}
      {!loading && skills.length === 0 && (
        <p className="text-center text-xs text-gray-400">No skills installed</p>
      )}
      {skills.map((s) => (
        <SkillCard
          key={s.name}
          skill={{ ...s, installed: true }}
          onUninstall={uninstall}
          busy={busy === s.name}
        />
      ))}
      <button
        onClick={load}
        disabled={loading}
        className="mt-1 flex items-center gap-1 self-end text-[10px] text-gray-400 hover:text-gray-600"
      >
        <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
      </button>
    </div>
  );
}

// ── Auto-Match Tab ────────────────────────────────────────────────────────────

interface AutoMatchResult {
  recommended?: SkillEntry[];
  installed?: SkillEntry[];
  message?: string;
  [key: string]: unknown;
}

function AutoMatchTab() {
  const [task, setTask] = useState('');
  const [result, setResult] = useState<AutoMatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!task.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await window.fetch('/api/config/skills-registry/auto-match', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auto-match failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Describe your task — the AI will find and install the best matching skills.
      </p>
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="e.g. I need to process images and run code in a sandbox…"
        rows={3}
        className="w-full resize-none rounded border border-gray-200 bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
      />
      {error && <p className="text-[10px] text-red-500">{error}</p>}
      <button
        onClick={run}
        disabled={loading || !task.trim()}
        className="flex items-center justify-center gap-1.5 rounded bg-indigo-500 py-2 text-xs text-white hover:bg-indigo-600 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Zap size={12} />
        )}
        {loading ? 'Analyzing & matching…' : 'Auto-Match Skills'}
      </button>

      {result && (
        <div className="flex flex-col gap-2">
          {result.message && (
            <p className="text-xs text-gray-600 dark:text-gray-300">{result.message}</p>
          )}
          {(result.installed ?? []).length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                Installed
              </p>
              {(result.installed ?? []).map((s) => (
                <SkillCard key={s.name} skill={{ ...s, installed: true }} />
              ))}
            </div>
          )}
          {(result.recommended ?? []).length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-500">
                Recommended
              </p>
              {(result.recommended ?? []).map((s) => (
                <SkillCard key={s.name} skill={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  className?: string;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'registry', label: 'Registry', icon: <Package size={12} /> },
  { id: 'search', label: 'Search', icon: <Search size={12} /> },
  { id: 'installed', label: 'Installed', icon: <CheckCircle2 size={12} /> },
  { id: 'auto', label: 'Auto-Match', icon: <Sparkles size={12} /> },
];

export function SkillsDiscoveryPanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('registry');

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Skills Discovery
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
              activeTab === t.id
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-400',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'registry' && <RegistryTab />}
        {activeTab === 'search' && <SearchTab />}
        {activeTab === 'installed' && <InstalledTab />}
        {activeTab === 'auto' && <AutoMatchTab />}
      </div>
    </div>
  );
}
