import React, { useState } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Globe,
  Loader2,
  XCircle,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  BookOpen,
  FlaskConical,
  Microscope,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronRight,
  BarChart2,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * ResearchOSPanel — Face 21: Universal Research OS.
 * Multi-mode deep research across web, academic, social, and community sources.
 * Evidence classification: FACT / EVIDENCE / INFERENCE / HYPOTHESIS / CONTRADICTED.
 * Settings → AI → Research OS.
 */

function getToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
  } catch { /* ignore */ }
  try { return localStorage.getItem('token'); } catch { return null; }
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

interface Source {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  type: string;
  authority: number;
  reliability: number;
}

interface SubResult {
  query: string;
  verdict: string;
  sources: Source[];
}

interface ResearchResult {
  query: string;
  answer: string;
  sources: Source[];
  subResults: SubResult[];
  elapsed?: number;
}

interface VerifyResult {
  claim: string;
  verdict: string;
  evidence: Source[];
  summary?: string;
}

type ResearchMode = 'deep' | 'verify' | 'autonomous';

const VERDICT_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  CORROBORATED: { label: 'Corroborated', icon: <CheckCircle className="h-3.5 w-3.5" />, cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  SINGLE_SOURCE: { label: 'Single Source', icon: <AlertCircle className="h-3.5 w-3.5" />, cls: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  CONTRADICTED: { label: 'Contradicted', icon: <XCircle className="h-3.5 w-3.5" />, cls: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400' },
  NO_EVIDENCE: { label: 'No Evidence', icon: <XCircle className="h-3.5 w-3.5" />, cls: 'border-gray-500/40 bg-gray-500/10 text-gray-500' },
};

const MODE_CONFIG = {
  deep: { label: 'Deep Research', icon: <Microscope className="h-4 w-4" />, color: 'bg-violet-600 hover:bg-violet-700', ring: 'ring-violet-500' },
  verify: { label: 'Fact Verify', icon: <ShieldCheck className="h-4 w-4" />, color: 'bg-emerald-600 hover:bg-emerald-700', ring: 'ring-emerald-500' },
  autonomous: { label: 'Autonomous Loop', icon: <Zap className="h-4 w-4" />, color: 'bg-teal-600 hover:bg-teal-700', ring: 'ring-teal-500' },
};

export default function ResearchOSPanel() {
  const [mode, setMode] = useState<ResearchMode>('deep');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deepResult, setDeepResult] = useState<ResearchResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [autonomousResult, setAutonomousResult] = useState<Record<string, unknown> | null>(null);
  const [expandedSub, setExpandedSub] = useState<number | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [maxSubQueries, setMaxSubQueries] = useState(4);

  async function run() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setDeepResult(null);
    setVerifyResult(null);
    setAutonomousResult(null);
    setShowSources(false);
    setExpandedSub(null);
    try {
      if (mode === 'deep') {
        const data = await apiFetch<ResearchResult>('/api/agents/architect/research', {
          method: 'POST',
          body: JSON.stringify({ query, maxSubQueries }),
        });
        setDeepResult(data);
      } else if (mode === 'verify') {
        const data = await apiFetch<VerifyResult>('/api/universal-search/verify', {
          method: 'POST',
          body: JSON.stringify({ claim: query }),
        });
        setVerifyResult(data);
      } else {
        const data = await apiFetch<Record<string, unknown>>('/api/agents/architect/autonomous', {
          method: 'POST',
          body: JSON.stringify({ question: query, createSkill: true, maxSubQuestions: maxSubQueries }),
        });
        setAutonomousResult(data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const mc = MODE_CONFIG[mode];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-violet-500" />
        <h3 className="text-base font-semibold text-token-text-primary">Research OS</h3>
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-500">
          Face 21
        </span>
      </div>

      <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2.5 text-sm text-token-text-secondary">
        Universal research across web, academic, social and community sources. Distinguishes FACT from EVIDENCE, INFERENCE, HYPOTHESIS, and CONTRADICTED claims.
      </div>

      {/* Mode selector */}
      <div className="flex gap-1.5">
        {(Object.entries(MODE_CONFIG) as [ResearchMode, typeof MODE_CONFIG.deep][]).map(([m, cfg]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-colors',
              mode === m ? `${cfg.color} border-transparent text-white` : 'border-token-border-medium text-token-text-secondary hover:bg-token-surface-secondary',
            )}
          >
            {cfg.icon} {cfg.label}
          </button>
        ))}
      </div>

      {/* Query input */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-token-text-primary">
          {mode === 'verify' ? 'Claim to verify' : 'Research question'}
        </label>
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={
            mode === 'deep' ? 'What are the latest advances in quantum computing error correction?'
            : mode === 'verify' ? 'Large language models can reason like humans.'
            : 'Explain how transformer attention mechanisms work and their limitations.'
          }
          rows={3}
          className={cn(
            'w-full rounded-lg border bg-token-surface-primary px-3 py-2 text-sm text-token-text-primary placeholder-token-text-tertiary focus:outline-none focus:ring-1',
            `border-token-border-medium ${mc.ring}`,
          )}
        />
      </div>

      {mode !== 'verify' && (
        <div className="flex items-center gap-2 text-xs text-token-text-tertiary">
          <span>Sub-queries:</span>
          {[2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setMaxSubQueries(n)}
              className={cn('rounded border px-2 py-0.5 font-mono transition-colors',
                maxSubQueries === n ? 'border-violet-500 text-violet-500' : 'border-token-border-medium hover:border-violet-500/50')}>
              {n}
            </button>
          ))}
        </div>
      )}

      {/* Run button */}
      <button
        onClick={() => void run()}
        disabled={loading || !query.trim()}
        className={cn('flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors', mc.color)}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mc.icon}
        {loading ? 'Researching...' : mc.label}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Deep research result */}
      {deepResult && !loading && (
        <div className="space-y-4">
          {/* Answer */}
          {deepResult.answer && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400">
                <BookOpen className="h-4 w-4" /> Research Answer
              </div>
              <p className="text-sm text-token-text-primary leading-relaxed whitespace-pre-wrap">{deepResult.answer}</p>
              {deepResult.elapsed && (
                <p className="text-xs text-token-text-tertiary">Completed in {(deepResult.elapsed / 1000).toFixed(1)}s</p>
              )}
            </div>
          )}

          {/* Sub-results breakdown */}
          {deepResult.subResults?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-token-text-primary">
                Sub-query Results ({deepResult.subResults.length})
              </h4>
              {deepResult.subResults.map((sr, i) => {
                const vm = VERDICT_META[sr.verdict] || VERDICT_META.NO_EVIDENCE;
                return (
                  <div key={i} className="rounded-lg border border-token-border-medium bg-token-surface-secondary">
                    <button
                      onClick={() => setExpandedSub(expandedSub === i ? null : i)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-sm"
                    >
                      <span className="flex-1 text-left font-medium text-token-text-primary truncate pr-2">{sr.query}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', vm.cls)}>
                          {vm.icon} {vm.label}
                        </span>
                        {expandedSub === i ? <ChevronDown className="h-3.5 w-3.5 text-token-text-tertiary" /> : <ChevronRight className="h-3.5 w-3.5 text-token-text-tertiary" />}
                      </div>
                    </button>
                    {expandedSub === i && sr.sources.length > 0 && (
                      <div className="border-t border-token-border-medium px-3 pb-3 pt-2 space-y-1.5">
                        {sr.sources.slice(0, 4).map((s, j) => (
                          <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-start gap-2 text-xs hover:underline">
                            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-token-text-tertiary" />
                            <div>
                              <span className="text-violet-600 dark:text-violet-400 font-medium">{s.title || s.domain}</span>
                              {s.snippet && <p className="text-token-text-tertiary line-clamp-2">{s.snippet}</p>}
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Sources toggle */}
          {deepResult.sources?.length > 0 && (
            <div>
              <button onClick={() => setShowSources(v => !v)}
                className="flex items-center gap-1.5 text-xs text-token-text-tertiary hover:text-token-text-secondary">
                {showSources ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                All sources ({deepResult.sources.length})
              </button>
              {showSources && (
                <div className="mt-2 space-y-1.5">
                  {deepResult.sources.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded border border-token-border-medium bg-token-surface-secondary px-2.5 py-2 text-xs hover:border-violet-500/40">
                      <span className="font-mono text-token-text-tertiary">[{i + 1}]</span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium text-violet-600 dark:text-violet-400 truncate block">{s.title || s.url}</span>
                        <span className="text-token-text-tertiary">{s.domain}</span>
                      </span>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1">
                          <BarChart2 className="h-3 w-3 text-token-text-tertiary" />
                          <span className="text-token-text-tertiary">{(s.reliability * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Verify result */}
      {verifyResult && !loading && (
        <div className="space-y-3">
          {(() => {
            const vm = VERDICT_META[verifyResult.verdict] || VERDICT_META.NO_EVIDENCE;
            return (
              <div className={cn('rounded-lg border px-4 py-3', vm.cls)}>
                <div className="flex items-center gap-2 font-medium">
                  {vm.icon} {vm.label}
                </div>
                <p className="mt-1.5 text-sm">Claim: <em>"{verifyResult.claim}"</em></p>
                {verifyResult.summary && <p className="mt-2 text-sm">{verifyResult.summary}</p>}
              </div>
            );
          })()}

          {verifyResult.evidence?.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-medium text-token-text-primary">Evidence ({verifyResult.evidence.length})</h4>
              {verifyResult.evidence.map((e, i) => (
                <a key={i} href={e.url} target="_blank" rel="noopener noreferrer"
                  className="block rounded-lg border border-token-border-medium bg-token-surface-secondary p-2.5 hover:border-violet-500/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-violet-600 dark:text-violet-400 truncate">{e.title || e.domain}</span>
                    <span className="shrink-0 text-xs text-token-text-tertiary">{e.domain}</span>
                  </div>
                  {e.snippet && <p className="mt-1 line-clamp-2 text-xs text-token-text-secondary">{e.snippet}</p>}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Autonomous result */}
      {autonomousResult && !loading && (
        <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-teal-600 dark:text-teal-400">
            <FlaskConical className="h-4 w-4" /> Autonomous Research Complete
          </div>
          <div className="text-sm text-token-text-secondary font-mono whitespace-pre-wrap text-xs bg-black/40 rounded p-2 max-h-64 overflow-y-auto">
            {JSON.stringify(autonomousResult, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}
