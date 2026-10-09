/**
 * CognitivePanel — Face 17: Universal Cognitive System dashboard.
 *
 * Shows which cognitive engines are loaded and allows ad-hoc
 * remember / recall operations against the running CognitiveEngine.
 */
import React, { useState, useCallback } from 'react';
import { Brain, CheckCircle2, XCircle, Loader2, Search, BookOpen, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '~/utils';

interface CognitivePanelProps {
  className?: string;
}

interface EngineStatus {
  initialized: boolean;
  userId?: string;
  engines?: string[];
  memory?: Record<string, unknown> | null;
  knowledge?: Record<string, unknown> | null;
  rag?: Record<string, unknown> | null;
  learning?: Record<string, unknown> | null;
  error?: string;
}

const ALL_ENGINES = [
  'memory', 'knowledge', 'evidence', 'rag', 'learning',
  'experience', 'skills', 'experiments', 'consolidation', 'improvement',
];

async function fetchStatus(): Promise<EngineStatus> {
  const res = await fetch('/api/cognitive/status', { credentials: 'include' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function postRemember(fact: string): Promise<{ ok: boolean; id?: string }> {
  const res = await fetch('/api/cognitive/remember', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ fact }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function postRecall(query: string): Promise<{ ok: boolean; memories?: Array<string | Record<string, unknown>> }> {
  const res = await fetch('/api/cognitive/recall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function postConsolidate(): Promise<{ ok: boolean }> {
  const res = await fetch('/api/cognitive/consolidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const CognitivePanel: React.FC<CognitivePanelProps> = ({ className }) => {
  const qc = useQueryClient();
  const [factInput, setFactInput] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [recallResult, setRecallResult] = useState<string[] | null>(null);
  const [rememberMsg, setRememberMsg] = useState('');

  const { data: status, isLoading, error } = useQuery({
    queryKey: ['cognitive-status'],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
    retry: 1,
  });

  const rememberMut = useMutation({
    mutationFn: postRemember,
    onSuccess: () => {
      setRememberMsg('Stored.');
      setFactInput('');
      setTimeout(() => setRememberMsg(''), 2000);
    },
    onError: (e: Error) => setRememberMsg(`Error: ${e.message}`),
  });

  const recallMut = useMutation({
    mutationFn: postRecall,
    onSuccess: (data) =>
      setRecallResult(
        (data.memories ?? []).map((m) => (typeof m === 'string' ? m : JSON.stringify(m).slice(0, 120))),
      ),
    onError: (e: Error) => setRecallResult([`Error: ${e.message}`]),
  });

  const consolidateMut = useMutation({
    mutationFn: postConsolidate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cognitive-status'] }),
  });

  const handleRemember = useCallback(() => {
    if (factInput.trim()) rememberMut.mutate(factInput.trim());
  }, [factInput, rememberMut]);

  const handleRecall = useCallback(() => {
    if (queryInput.trim()) recallMut.mutate(queryInput.trim());
  }, [queryInput, recallMut]);

  const activeEngines = status?.engines ?? [];

  return (
    <div className={cn('flex h-full flex-col overflow-y-auto', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-violet-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cognitive Engine</span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
            Face 17
          </span>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['cognitive-status'] })}
          className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* Status banner */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" />
            Loading cognitive status...
          </div>
        ) : null}
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {String(error)}
          </div>
        ) : null}

        {/* Engine grid */}
        {status && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Engines — {activeEngines.length}/{ALL_ENGINES.length} loaded
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_ENGINES.map((eng) => {
                const loaded = activeEngines.includes(eng);
                return (
                  <div
                    key={eng}
                    className={cn(
                      'flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs',
                      loaded
                        ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800/50',
                    )}
                  >
                    {loaded
                      ? <CheckCircle2 size={11} className="shrink-0" />
                      : <XCircle size={11} className="shrink-0 opacity-40" />
                    }
                    <span className={loaded ? '' : 'opacity-50'}>{eng}</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => consolidateMut.mutate()}
              disabled={consolidateMut.isLoading || !status.initialized}
              className="mt-3 flex items-center gap-1.5 rounded border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-400"
            >
              {consolidateMut.isLoading && <Loader2 size={11} className="animate-spin" />}
              Run Consolidation (dedup + decay)
            </button>
          </div>
        )}

        {/* Remember */}
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Remember a fact
          </p>
          <div className="flex gap-1.5">
            <input
              value={factInput}
              onChange={(e) => setFactInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRemember()}
              placeholder="Enter a fact to store…"
              className="flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-violet-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <button
              onClick={handleRemember}
              disabled={rememberMut.isLoading || !factInput.trim()}
              className="flex items-center gap-1 rounded border border-violet-300 bg-violet-100 px-2.5 py-1.5 text-xs text-violet-700 hover:bg-violet-200 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
            >
              {rememberMut.isLoading ? <Loader2 size={11} className="animate-spin" /> : <BookOpen size={11} />}
              Store
            </button>
          </div>
          {rememberMsg && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400">{rememberMsg}</p>
          )}
        </div>

        {/* Recall */}
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Recall memories
          </p>
          <div className="flex gap-1.5">
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRecall()}
              placeholder="Search memory…"
              className="flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-violet-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <button
              onClick={handleRecall}
              disabled={recallMut.isLoading || !queryInput.trim()}
              className="flex items-center gap-1 rounded border border-blue-300 bg-blue-100 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-200 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            >
              {recallMut.isLoading ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
              Search
            </button>
          </div>

          {recallResult !== null && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
              {recallResult.length === 0 ? (
                <p className="text-xs text-gray-400">No memories found.</p>
              ) : (
                <ul className="space-y-1">
                  {recallResult.map((m, i) => (
                    <li key={i} className="text-xs text-gray-700 dark:text-gray-300">
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
