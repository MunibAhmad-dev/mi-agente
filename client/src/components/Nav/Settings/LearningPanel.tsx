import React, { useState, useEffect, useCallback } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Brain,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  TrendingUp,
  AlertCircle,
  BookOpen,
  Zap,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * LearningPanel — Face 9 + 16: Agent Self-Learning & Experience Replay.
 * Shows the learning cycle: experiences captured → lessons extracted → memory.
 * Settings → AI → Learning & Experience.
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

interface Experience {
  _id: string;
  task: string;
  taskType: string;
  outcome: 'success' | 'failure' | 'partial';
  score: number;
  duration: number;
  createdAt: string;
}

interface DBStat { _id: string; count: number; avgScore: number }
interface Stats {
  dbStats: DBStat[];
  engineStats: { reflected: number; learned: number; gapsDetected: number };
}

interface Reflection {
  id: string;
  outcome: string;
  whatWorked: string[];
  whatFailed: string[];
  improvements: string[];
}

const OUTCOME_META = {
  success: { icon: <CheckCircle className="h-3.5 w-3.5" />, cls: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  failure: { icon: <XCircle className="h-3.5 w-3.5" />, cls: 'text-red-500', bg: 'bg-red-500/10' },
  partial: { icon: <AlertCircle className="h-3.5 w-3.5" />, cls: 'text-amber-500', bg: 'bg-amber-500/10' },
};

export default function LearningPanel() {
  const [tab, setTab] = useState<'experiences' | 'stats' | 'reflect'>('experiences');
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExp, setSelectedExp] = useState<Experience | null>(null);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [reflectLoading, setReflectLoading] = useState(false);
  const [filterOutcome, setFilterOutcome] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (filterOutcome) params.set('outcome', filterOutcome);
      if (tab === 'experiences') {
        const data = await apiFetch<{ experiences: Experience[] }>(`/api/learning/experiences?${params}`);
        setExperiences(data.experiences || []);
      } else if (tab === 'stats') {
        const data = await apiFetch<Stats>('/api/learning/stats');
        setStats(data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [tab, filterOutcome]);

  useEffect(() => { void load(); }, [load]);

  async function triggerReflection(exp: Experience) {
    setSelectedExp(exp);
    setReflectLoading(true);
    setReflection(null);
    setTab('reflect');
    try {
      const data = await apiFetch<{ reflection: Reflection }>('/api/learning/reflect', {
        method: 'POST',
        body: JSON.stringify(exp),
      });
      setReflection(data.reflection);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReflectLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-blue-500" />
        <h3 className="text-base font-semibold text-token-text-primary">Learning & Experience</h3>
        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-500">
          Face 9 · 16
        </span>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-sm text-token-text-secondary">
        The agent captures execution outcomes, extracts lessons, and builds memory to improve future decisions. Each interaction is an opportunity to learn.
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-token-border-medium p-1 bg-token-surface-secondary">
        {(['experiences', 'stats', 'reflect'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors capitalize',
              tab === t ? 'bg-blue-500 text-white' : 'text-token-text-secondary hover:bg-token-surface-tertiary',
            )}
          >
            {t === 'experiences' && <BookOpen className="h-3.5 w-3.5" />}
            {t === 'stats' && <TrendingUp className="h-3.5 w-3.5" />}
            {t === 'reflect' && <Zap className="h-3.5 w-3.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Experiences tab */}
      {tab === 'experiences' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {['', 'success', 'failure', 'partial'].map(o => (
                <button key={o} onClick={() => setFilterOutcome(o)}
                  className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                    filterOutcome === o ? 'border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'border-token-border-medium text-token-text-secondary hover:border-blue-500/40')}>
                  {o || 'All'}
                </button>
              ))}
            </div>
            <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1 text-xs text-token-text-tertiary hover:text-token-text-secondary">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          </div>

          {loading && !experiences.length && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-token-text-tertiary" /></div>
          )}

          {!loading && !experiences.length && (
            <div className="rounded-lg border border-dashed border-token-border-medium py-8 text-center text-sm text-token-text-tertiary">
              No experiences yet. Interact with agents to generate learning data.
            </div>
          )}

          <div className="space-y-2">
            {experiences.map(exp => {
              const meta = OUTCOME_META[exp.outcome] || OUTCOME_META.partial;
              return (
                <div key={exp._id} className="rounded-lg border border-token-border-medium bg-token-surface-secondary p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-token-text-primary">{exp.task || '(unknown task)'}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-token-text-tertiary">
                        <span className={cn('flex items-center gap-0.5 font-medium', meta.cls)}>
                          {meta.icon} {exp.outcome}
                        </span>
                        <span>score: {(exp.score ?? 0).toFixed(2)}</span>
                        {exp.taskType && <span className="rounded bg-token-surface-tertiary px-1">{exp.taskType}</span>}
                        {exp.duration > 0 && <span>{(exp.duration / 1000).toFixed(1)}s</span>}
                      </div>
                    </div>
                    <button onClick={() => void triggerReflection(exp)}
                      className="shrink-0 flex items-center gap-1 rounded border border-blue-500/40 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors">
                      <Zap className="h-3 w-3" /> Reflect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats tab */}
      {tab === 'stats' && (
        <div className="space-y-4">
          {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-token-text-tertiary" /></div>}
          {stats && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Reflected', value: stats.engineStats.reflected, color: 'text-blue-500' },
                  { label: 'Learned', value: stats.engineStats.learned, color: 'text-emerald-500' },
                  { label: 'Gaps', value: stats.engineStats.gapsDetected, color: 'text-amber-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border border-token-border-medium bg-token-surface-secondary p-3 text-center">
                    <div className={cn('text-2xl font-bold', color)}>{value}</div>
                    <div className="text-xs text-token-text-tertiary">{label}</div>
                  </div>
                ))}
              </div>

              {stats.dbStats.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-token-text-primary">By Task Type</h4>
                  {stats.dbStats.map(s => (
                    <div key={s._id} className="flex items-center gap-3 rounded border border-token-border-medium px-3 py-2 text-sm">
                      <span className="flex-1 font-medium text-token-text-primary">{s._id || 'unknown'}</span>
                      <span className="text-token-text-secondary">{s.count} runs</span>
                      <span className={cn('font-mono text-xs', s.avgScore >= 0.7 ? 'text-emerald-500' : s.avgScore >= 0.4 ? 'text-amber-500' : 'text-red-500')}>
                        avg {s.avgScore.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {stats.dbStats.length === 0 && (
                <div className="rounded-lg border border-dashed border-token-border-medium py-8 text-center text-sm text-token-text-tertiary">
                  No learning stats yet.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Reflect tab */}
      {tab === 'reflect' && (
        <div className="space-y-3">
          {!selectedExp && !reflectLoading && (
            <div className="rounded-lg border border-dashed border-token-border-medium py-8 text-center text-sm text-token-text-tertiary">
              Select an experience from the Experiences tab and click Reflect.
            </div>
          )}

          {reflectLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="text-sm text-token-text-secondary">Analyzing experience and extracting lessons...</span>
            </div>
          )}

          {reflection && selectedExp && (
            <div className="space-y-3">
              <div className="rounded-lg border border-token-border-medium bg-token-surface-secondary p-3">
                <p className="text-sm font-medium text-token-text-primary">{selectedExp.task}</p>
                <p className="mt-1 text-xs text-token-text-tertiary">Outcome: {selectedExp.outcome} · Score: {(selectedExp.score ?? 0).toFixed(2)}</p>
              </div>

              {reflection.whatWorked.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="h-4 w-4" /> What Worked
                  </h4>
                  <ul className="space-y-1">
                    {reflection.whatWorked.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-token-text-secondary">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reflection.whatFailed.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
                    <XCircle className="h-4 w-4" /> What Failed
                  </h4>
                  <ul className="space-y-1">
                    {reflection.whatFailed.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-token-text-secondary">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reflection.improvements.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400">
                    <TrendingUp className="h-4 w-4" /> Improvements
                  </h4>
                  <ul className="space-y-1">
                    {reflection.improvements.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-token-text-secondary">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
