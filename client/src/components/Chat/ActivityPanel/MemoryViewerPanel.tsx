/**
 * MemoryViewerPanel — Face: Memory UI (checklist p2-5)
 *
 * Lists stored memories, supports keyword search and single-item delete.
 * Calls GET /api/memories and DELETE /api/memories/:key.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Brain, Search, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '~/utils';

interface MemoryEntry {
  _id: string;
  key: string;
  value: string;
  agentId?: string;
  agentName?: string;
  importance?: number;
  tokenCount?: number;
  updated_at?: string;
}

interface MemoriesResponse {
  memories: MemoryEntry[];
  totalTokens: number;
  tokenLimit: number | null;
  charLimit: number;
  usagePercentage: number | null;
}

function importanceColor(score: number | undefined) {
  if (!score) return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  if (score >= 8) return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  if (score >= 6) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
  if (score >= 4) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function MemoryViewerPanel({ className }: { className?: string }) {
  const [data, setData] = useState<MemoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/memories', { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: MemoriesResponse = await resp.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  const handleDelete = async (entry: MemoryEntry) => {
    setDeleting(entry._id);
    try {
      const resp = await fetch(`/api/memories/${encodeURIComponent(entry.key)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setData((prev) => prev
        ? { ...prev, memories: prev.memories.filter((m) => m._id !== entry._id) }
        : prev,
      );
    } catch (e) {
      console.error('[MemoryViewer] delete failed:', e);
    } finally {
      setDeleting(null);
    }
  };

  const filtered = data?.memories.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q);
  }) ?? [];

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={fetchMemories}
          disabled={loading}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Token usage bar */}
      {data?.usagePercentage !== null && data?.usagePercentage !== undefined && (
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Token usage</span>
            <span className="font-mono">{data.totalTokens} / {data.tokenLimit}</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                data.usagePercentage > 80 ? 'bg-red-500' : data.usagePercentage > 60 ? 'bg-yellow-500' : 'bg-green-500',
              )}
              style={{ width: `${data.usagePercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="flex items-center gap-2 m-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs">
            <AlertCircle size={13} />
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Brain size={28} className="text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {search ? 'No memories match your search.' : 'No memories stored yet.'}
            </p>
          </div>
        )}

        {filtered.map((entry) => (
          <div
            key={entry._id}
            className="flex items-start gap-2.5 px-3 py-2.5 border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/30 group transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <code className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                  {entry.key}
                </code>
                {entry.agentName && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300">
                    {entry.agentName}
                  </span>
                )}
                {entry.importance !== undefined && (
                  <span className={cn('text-xs px-1.5 py-0.5 rounded font-mono', importanceColor(entry.importance))}>
                    {entry.importance}/10
                  </span>
                )}
                <span className="text-xs text-gray-400 ml-auto">{timeAgo(entry.updated_at)}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-2">
                {entry.value}
              </p>
              {entry.tokenCount ? (
                <span className="text-xs text-gray-400 font-mono">{entry.tokenCount} tok</span>
              ) : null}
            </div>

            <button
              onClick={() => handleDelete(entry)}
              disabled={deleting === entry._id}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-gray-400 hover:text-red-500 transition-all shrink-0"
              title="Delete memory"
            >
              {deleting === entry._id
                ? <RefreshCw size={12} className="animate-spin" />
                : <Trash2 size={12} />
              }
            </button>
          </div>
        ))}
      </div>

      {/* Footer count */}
      {!loading && !error && data && (
        <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
          {filtered.length} of {data.memories.length} memories
          {data.memories.length !== filtered.length ? ` (filtered)` : ''}
        </div>
      )}
    </div>
  );
}

export default MemoryViewerPanel;
