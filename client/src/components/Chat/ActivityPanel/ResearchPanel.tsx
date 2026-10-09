/**
 * ResearchPanel — Face 10: Autonomous Research Engine
 *
 * Lets the user submit a research question and shows:
 *   1. Decomposed sub-queries (fast, sync)
 *   2. Full deep-research result: answer, sources, verification, stats
 *
 * Calls:
 *   POST /api/research/decompose   → { subQueries, keywords }
 *   POST /api/research/deep        → { answer, subQueries, sources, verification, stats }
 */

import React, { useState } from 'react';
import { Globe, Search, Loader2, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, BookOpen, BarChart3, Tag } from 'lucide-react';
import { cn } from '~/utils';

interface DecomposeResult {
  subQueries: string[];
  keywords: string[];
}

interface SourceItem {
  url?: string;
  title?: string;
  snippet?: string;
  relevance?: number;
}

interface VerificationResult {
  passed?: boolean;
  score?: number;
  details?: string;
}

interface DeepResearchResult {
  success: boolean;
  question: string;
  subQueries: string[];
  sources: SourceItem[];
  verification: VerificationResult;
  answer: string;
  stats: {
    subQueryCount?: number;
    sourceCount?: number;
    durationMs?: number;
  };
}

interface ResearchPanelProps {
  className?: string;
}

// ── Keyword chip ──────────────────────────────────────────────────────────────

function KeywordChip({ word }: { word: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
      <Tag size={10} />
      {word}
    </span>
  );
}

// ── Sub-query row ─────────────────────────────────────────────────────────────

function SubQueryRow({ query, index }: { query: string; index: number }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-sm">
      <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs flex items-center justify-center font-mono font-semibold">
        {index + 1}
      </span>
      <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{query}</span>
    </div>
  );
}

// ── Source row ────────────────────────────────────────────────────────────────

function SourceRow({ source, index }: { source: SourceItem; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="shrink-0 text-gray-400 dark:text-gray-500">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="font-mono text-xs text-gray-400 dark:text-gray-500 shrink-0">#{index + 1}</span>
        <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
          {source.title || source.url || 'Source'}
        </span>
        {source.relevance !== undefined && (
          <span className={cn(
            'shrink-0 text-xs font-mono px-1.5 py-0.5 rounded',
            source.relevance >= 0.7
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
          )}>
            {Math.round(source.relevance * 100)}%
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {source.url && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 break-all mb-1.5">{source.url}</p>
          )}
          {source.snippet && (
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{source.snippet}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-center">
      <p className="text-xl font-bold text-gray-800 dark:text-gray-100 font-mono tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ResearchPanel({ className }: ResearchPanelProps) {
  const [question, setQuestion] = useState('');
  const [decomposed, setDecomposed] = useState<DecomposeResult | null>(null);
  const [result, setResult] = useState<DeepResearchResult | null>(null);
  const [loading, setLoading] = useState<'decompose' | 'deep' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const post = async (path: string, body: object) => {
    const res = await fetch(`/api/research/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  };

  const handleDecompose = async () => {
    if (!question.trim()) return;
    setLoading('decompose');
    setError(null);
    setDecomposed(null);
    setResult(null);
    try {
      const data = await post('decompose', { question: question.trim() });
      setDecomposed(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  const handleDeepResearch = async () => {
    if (!question.trim()) return;
    setLoading('deep');
    setError(null);
    setResult(null);
    try {
      const data = await post('deep', { question: question.trim() });
      setResult(data);
      if (data.subQueries) {
        setDecomposed((d) => ({ ...d, subQueries: data.subQueries, keywords: d?.keywords ?? [] }));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  const busy = loading !== null;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <Globe size={16} className="text-indigo-500" />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Autonomous Research</span>
        <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 font-mono">Face 10</span>
      </div>

      {/* Input area */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What do you want to research? e.g. &quot;What are the best open-source LLM orchestration frameworks in 2025?&quot;"
          rows={3}
          className="w-full resize-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleDeepResearch();
          }}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleDecompose}
            disabled={busy || !question.trim()}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading === 'decompose' ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Decompose
          </button>
          <button
            onClick={handleDeepResearch}
            disabled={busy || !question.trim()}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-medium text-white transition-colors"
          >
            {loading === 'deep' ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
            {loading === 'deep' ? 'Researching…' : 'Deep Research'}
          </button>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">⌘↵ to research</span>
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading state */}
        {loading === 'deep' && (
          <div className="flex flex-col items-center gap-3 py-8 text-gray-400 dark:text-gray-500">
            <Loader2 size={28} className="animate-spin text-indigo-500" />
            <span className="text-sm">Running deep research pipeline…</span>
            <p className="text-xs text-center max-w-xs">
              Decomposing question → Searching sources → Verifying evidence → Synthesizing answer
            </p>
          </div>
        )}

        {/* Decomposed sub-queries */}
        {decomposed && decomposed.subQueries.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Sub-queries ({decomposed.subQueries.length})
            </h3>
            <div className="space-y-1.5">
              {decomposed.subQueries.map((q, i) => (
                <SubQueryRow key={i} query={q} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Keywords */}
        {decomposed && decomposed.keywords.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Keywords
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {decomposed.keywords.map((kw) => (
                <KeywordChip key={kw} word={kw} />
              ))}
            </div>
          </section>
        )}

        {/* Deep research result */}
        {result && (
          <>
            {/* Stats row */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                <BarChart3 size={12} />
                Research Stats
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <StatTile label="Sub-queries" value={result.stats?.subQueryCount ?? result.subQueries.length} />
                <StatTile label="Sources" value={result.stats?.sourceCount ?? result.sources?.length ?? 0} />
                <StatTile
                  label="Duration"
                  value={result.stats?.durationMs != null ? `${(result.stats.durationMs / 1000).toFixed(1)}s` : '—'}
                />
              </div>
            </section>

            {/* Verification */}
            {result.verification && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Verification
                </h3>
                <div className={cn(
                  'flex items-start gap-2.5 rounded-md px-3 py-2.5 text-sm',
                  result.verification.passed
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300',
                )}>
                  {result.verification.passed
                    ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                    : <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  }
                  <div>
                    <span className="font-medium">
                      {result.verification.passed ? 'Verified' : 'Uncertain'}
                      {result.verification.score != null && ` — ${Math.round(result.verification.score * 100)}% confidence`}
                    </span>
                    {result.verification.details && (
                      <p className="mt-0.5 text-xs opacity-80">{result.verification.details}</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Sources */}
            {result.sources && result.sources.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Sources ({result.sources.length})
                </h3>
                <div className="space-y-1.5">
                  {result.sources.map((s, i) => (
                    <SourceRow key={i} source={s} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Answer */}
            {result.answer && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                  <BookOpen size={12} />
                  Synthesized Answer
                </h3>
                <div className="rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {result.answer}
                </div>
              </section>
            )}
          </>
        )}

        {/* Empty state */}
        {!loading && !error && !decomposed && !result && (
          <div className="flex flex-col items-center gap-3 py-12 text-gray-400 dark:text-gray-500">
            <Globe size={36} className="opacity-40" />
            <p className="text-sm text-center">
              Enter a research question above.<br />
              Use <strong>Decompose</strong> for a quick sub-query breakdown<br />
              or <strong>Deep Research</strong> for a full sourced answer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
