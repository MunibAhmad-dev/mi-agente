import React, { useState, useCallback, useEffect } from 'react';
import {
  Database,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  FileText,
  Loader2,
  BarChart3,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '~/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Collection {
  name: string;
  count?: number;
  size?: number;
  [key: string]: unknown;
}

interface RAGStats {
  status?: string;
  collections?: number;
  totalDocuments?: number;
  vectorDimensions?: number;
  [key: string]: unknown;
}

interface SearchResult {
  id?: string;
  content?: string;
  text?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

type Tab = 'collections' | 'index' | 'search' | 'stats';

// ── Collections Tab ───────────────────────────────────────────────────────────

function CollectionsTab() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/rag/collections', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCollections(
          Array.isArray(data) ? data : data.collections ?? Object.values(data),
        );
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

  const deleteCollection = async (name: string) => {
    setBusy(name);
    try {
      await window.fetch(`/api/rag/collections/${encodeURIComponent(name)}`, {
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
      {/* Quick-create via index */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New collection name…"
          className="flex-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          disabled={!newName.trim()}
          onClick={() => {
            // Collections are created implicitly on first index; just switch to Index tab
            setNewName('');
          }}
          className="flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 dark:bg-indigo-900/30 dark:text-indigo-300"
        >
          <Plus size={10} /> Create
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      )}
      {!loading && collections.length === 0 && (
        <p className="text-center text-xs text-gray-400">No collections yet</p>
      )}
      {collections.map((c) => {
        const name = c.name ?? String(c);
        return (
          <div
            key={name}
            className="flex items-center gap-2 rounded border border-gray-100 bg-white px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900"
          >
            <Database size={12} className="shrink-0 text-indigo-400" />
            <div className="flex-1 min-w-0">
              <span className="font-mono font-medium text-gray-800 dark:text-gray-200">
                {name}
              </span>
              {c.count !== undefined && (
                <span className="ml-2 text-[10px] text-gray-400">
                  {c.count} docs
                </span>
              )}
            </div>
            <button
              onClick={() => deleteCollection(name)}
              disabled={busy === name}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20"
            >
              {busy === name ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Trash2 size={11} />
              )}
            </button>
          </div>
        );
      })}
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

// ── Index Tab ─────────────────────────────────────────────────────────────────

function IndexTab() {
  const [collection, setCollection] = useState('default');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ indexed?: number; error?: string } | null>(null);

  const doIndex = async () => {
    if (!content.trim() || !collection.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await window.fetch('/api/rag/index', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          documents: [{ content: content.trim(), metadata: { title: title || 'Manual document' } }],
        }),
      });
      const data = await res.json();
      if (!res.ok) setResult({ error: data.error ?? 'Index failed' });
      else setResult({ indexed: data.indexed ?? data.count ?? 1 });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-[10px] text-gray-500">Collection</label>
          <input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-[10px] text-gray-500">Title (optional)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] text-gray-500">Content to index</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Paste text, code, notes, or any content to add to the knowledge base…"
          className="w-full resize-none rounded border border-gray-200 bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      {result && (
        <div
          className={cn(
            'flex items-center gap-2 rounded p-2 text-xs',
            result.error
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
          )}
        >
          {result.error ? (
            <XCircle size={12} />
          ) : (
            <CheckCircle2 size={12} />
          )}
          {result.error ?? `Indexed ${result.indexed} document(s) successfully`}
        </div>
      )}

      <button
        onClick={doIndex}
        disabled={loading || !content.trim() || !collection.trim()}
        className="flex items-center justify-center gap-1.5 rounded bg-indigo-500 py-2 text-xs text-white hover:bg-indigo-600 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <FileText size={12} />
        )}
        {loading ? 'Indexing…' : 'Index Document'}
      </button>
    </div>
  );
}

// ── Search Tab ────────────────────────────────────────────────────────────────

function SearchTab() {
  const [collection, setCollection] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: '10' });
      if (collection.trim()) params.append('collection', collection.trim());
      const res = await window.fetch(`/api/rag/search?${params}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setResults(
          Array.isArray(data) ? data : data.results ?? data.documents ?? [],
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const text = (r: SearchResult) =>
    r.content ?? r.text ?? JSON.stringify(r).slice(0, 200);

  return (
    <div className="flex flex-col gap-2 p-3">
      <input
        value={collection}
        onChange={(e) => setCollection(e.target.value)}
        placeholder="Collection (leave empty for all)"
        className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
      />
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          placeholder="Semantic search query…"
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
          Semantic search across your knowledge collections
        </p>
      )}
      {searched && !loading && results.length === 0 && (
        <p className="text-center text-xs text-gray-400">No results found</p>
      )}
      {results.map((r, i) => (
        <div
          key={r.id ?? i}
          className="rounded border border-gray-100 bg-white p-3 text-xs dark:border-gray-800 dark:bg-gray-900"
        >
          {r.score !== undefined && (
            <div className="mb-1 flex items-center gap-1.5">
              <div className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-1.5 rounded-full bg-indigo-400"
                  style={{ width: `${Math.min(100, (r.score ?? 0) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-gray-400">
                {((r.score ?? 0) * 100).toFixed(0)}%
              </span>
            </div>
          )}
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            {text(r).slice(0, 300)}
            {text(r).length > 300 && '…'}
          </p>
          {r.metadata && Object.keys(r.metadata).length > 0 && (
            <p className="mt-1 text-[10px] text-gray-400">
              {Object.entries(r.metadata)
                .slice(0, 3)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab() {
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, statsRes] = await Promise.all([
        window.fetch('/api/rag/health', { credentials: 'include' }),
        window.fetch('/api/rag/stats', { credentials: 'include' }),
      ]);
      const merged: RAGStats = {};
      if (healthRes.ok) Object.assign(merged, await healthRes.json());
      if (statsRes.ok) Object.assign(merged, await statsRes.json());
      setStats(merged);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = stats
    ? Object.entries(stats).filter(([k]) => !['status', 'error'].includes(k))
    : [];

  return (
    <div className="flex flex-col gap-2 p-3">
      {stats && (
        <div
          className={cn(
            'mb-2 flex items-center gap-2 rounded p-2 text-xs font-medium',
            stats.status === 'ok' || stats.status === 'healthy'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
          )}
        >
          {stats.status === 'ok' || stats.status === 'healthy' ? (
            <CheckCircle2 size={12} />
          ) : (
            <BarChart3 size={12} />
          )}
          RAG Service: {stats.status ?? 'unknown'}
        </div>
      )}
      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      )}
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="flex items-center justify-between rounded border border-gray-100 bg-white px-3 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900"
        >
          <span className="text-gray-500 dark:text-gray-400">{k}</span>
          <span className="font-mono text-gray-800 dark:text-gray-200">
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </span>
        </div>
      ))}
      {!loading && !stats && (
        <p className="text-center text-xs text-gray-400">No stats available</p>
      )}
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

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  className?: string;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'collections', label: 'Collections', icon: <Database size={12} /> },
  { id: 'index', label: 'Index', icon: <FileText size={12} /> },
  { id: 'search', label: 'Search', icon: <Search size={12} /> },
  { id: 'stats', label: 'Stats', icon: <BarChart3 size={12} /> },
];

export function KnowledgeBasePanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('collections');

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Knowledge Base
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
        {activeTab === 'collections' && <CollectionsTab />}
        {activeTab === 'index' && <IndexTab />}
        {activeTab === 'search' && <SearchTab />}
        {activeTab === 'stats' && <StatsTab />}
      </div>
    </div>
  );
}
