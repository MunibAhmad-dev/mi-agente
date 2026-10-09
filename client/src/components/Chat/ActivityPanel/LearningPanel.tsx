/**
 * LearningPanel — Face 9: Agent Training & Learning from Experience
 *                  Face 16: Self-Improvement Loop
 *
 * Tabs:
 *   Stats      — aggregated learning stats (db + engine)
 *   Experiences— recent experience replay records
 *   Patterns   — failure/success pattern heat map
 *   Improve    — run /improve to surface actionable rules
 *
 * API:
 *   GET  /api/learning/stats
 *   GET  /api/learning/experiences
 *   GET  /api/learning/patterns
 *   POST /api/learning/improve
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Brain, RefreshCw, Loader2, TrendingUp, AlertCircle, CheckCircle2, BookOpen, BarChart3, Sparkles } from 'lucide-react';
import { cn } from '~/utils';

type Tab = 'stats' | 'experiences' | 'patterns' | 'improve';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Experience {
  _id?: string;
  taskType?: string;
  outcome?: string;
  reward?: number;
  createdAt?: string;
  summary?: string;
}

interface Pattern {
  taskType: string;
  outcome: string;
  count: number;
}

interface ImprovementRule {
  rule: string;
  pattern: string;
  frequency: number;
  affectedExperiences: number;
}

interface LearningStats {
  dbStats: Record<string, unknown>;
  engineStats: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const OUTCOME_COLORS: Record<string, string> = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  failure: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  partial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
};

function OutcomeBadge({ outcome }: { outcome?: string }) {
  const label = outcome ?? 'unknown';
  return (
    <span className={cn(
      'rounded-full px-2 py-0.5 text-xs font-medium',
      OUTCOME_COLORS[label] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    )}>
      {label}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: unknown }) {
  const display = value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800 text-sm">
      <span className="flex-1 text-gray-600 dark:text-gray-400">{label}</span>
      <span className="font-mono text-gray-800 dark:text-gray-200 tabular-nums">{display}</span>
    </div>
  );
}

// ── Tab: Stats ────────────────────────────────────────────────────────────────

function StatsTab({ stats, loading }: { stats: LearningStats | null; loading: boolean }) {
  if (loading) return <Spinner />;
  if (!stats) return <Empty icon={<BarChart3 size={32} />} text="No stats available yet." />;

  const flatDb = stats.dbStats as Record<string, unknown>;
  const flatEng = stats.engineStats as Record<string, unknown>;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Database Stats
        </h3>
        {Object.entries(flatDb).length === 0
          ? <p className="text-xs text-gray-400 dark:text-gray-500">No records yet.</p>
          : Object.entries(flatDb).map(([k, v]) => <StatRow key={k} label={k} value={v} />)
        }
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Engine Stats
        </h3>
        {Object.entries(flatEng).length === 0
          ? <p className="text-xs text-gray-400 dark:text-gray-500">Engine not started.</p>
          : Object.entries(flatEng).map(([k, v]) => <StatRow key={k} label={k} value={v} />)
        }
      </section>
    </div>
  );
}

// ── Tab: Experiences ──────────────────────────────────────────────────────────

function ExperiencesTab({ experiences, loading }: { experiences: Experience[]; loading: boolean }) {
  if (loading) return <Spinner />;
  if (experiences.length === 0) return <Empty icon={<BookOpen size={32} />} text="No experience records stored yet." />;

  return (
    <div className="space-y-2">
      {experiences.map((exp, i) => (
        <div key={exp._id ?? i} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">#{i + 1}</span>
            <span className="text-gray-700 dark:text-gray-300 font-medium">{exp.taskType ?? 'unknown'}</span>
            <OutcomeBadge outcome={exp.outcome} />
            {exp.reward != null && (
              <span className="ml-auto text-xs font-mono text-gray-400 dark:text-gray-500">
                reward: {exp.reward.toFixed(2)}
              </span>
            )}
          </div>
          {exp.summary && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{exp.summary}</p>
          )}
          {exp.createdAt && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {new Date(exp.createdAt).toLocaleString()}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab: Patterns ─────────────────────────────────────────────────────────────

function PatternsTab({ patterns, loading }: { patterns: Pattern[]; loading: boolean }) {
  if (loading) return <Spinner />;
  if (patterns.length === 0) return <Empty icon={<BarChart3 size={32} />} text="No patterns detected yet." />;

  const max = Math.max(...patterns.map((p) => p.count), 1);

  return (
    <div className="space-y-2">
      {patterns.map((p, i) => (
        <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1.5 text-sm">
            <span className="text-gray-700 dark:text-gray-300 flex-1 font-mono text-xs">{p.taskType}</span>
            <OutcomeBadge outcome={p.outcome} />
            <span className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">{p.count}×</span>
          </div>
          {/* Bar */}
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                p.outcome === 'success' ? 'bg-green-500' : p.outcome === 'failure' ? 'bg-red-500' : 'bg-yellow-500',
              )}
              style={{ width: `${(p.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Improve ──────────────────────────────────────────────────────────────

function ImproveTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ improvements: ImprovementRule[]; totalFailures: number; analyzedTypes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/learning/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
        <p className="font-medium mb-1">Self-Improvement Loop — Face 16</p>
        <p className="text-xs opacity-80">
          Analyzes recent failed experiences, runs reflection on each, and surfaces the most frequent improvement rules.
        </p>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {loading ? 'Analyzing failures…' : 'Run Improvement Analysis'}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-4">
            <span>Failures analyzed: <strong className="text-gray-700 dark:text-gray-300">{result.totalFailures}</strong></span>
            <span>Task types: <strong className="text-gray-700 dark:text-gray-300">{result.analyzedTypes.join(', ') || '—'}</strong></span>
          </div>

          {result.improvements.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 size={14} />
              No recurring failure patterns found. Keep going!
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Top Improvement Rules ({result.improvements.length})
              </h3>
              {result.improvements.map((imp, i) => (
                <div key={i} className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-3 py-2.5 text-sm">
                  <div className="flex items-start gap-2">
                    <TrendingUp size={14} className="shrink-0 mt-0.5 text-orange-600 dark:text-orange-400" />
                    <div className="flex-1">
                      <p className="text-gray-800 dark:text-gray-200 leading-relaxed">{imp.rule}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>Pattern: <strong className="font-mono">{imp.pattern}</strong></span>
                        <span>Seen {imp.frequency}×</span>
                        <span>Affected: {imp.affectedExperiences} exp.</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 size={22} className="animate-spin text-indigo-500" />
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-gray-400 dark:text-gray-500">
      <span className="opacity-40">{icon}</span>
      <p className="text-sm text-center">{text}</p>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface LearningPanelProps {
  className?: string;
}

export function LearningPanel({ className }: LearningPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingExp, setLoadingExp] = useState(false);
  const [loadingPat, setLoadingPat] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/learning/stats');
      if (res.ok) setStats(await res.json());
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchExperiences = useCallback(async () => {
    setLoadingExp(true);
    try {
      const res = await fetch('/api/learning/experiences?limit=20');
      if (res.ok) {
        const data = await res.json();
        setExperiences(data.experiences ?? []);
      }
    } finally {
      setLoadingExp(false);
    }
  }, []);

  const fetchPatterns = useCallback(async () => {
    setLoadingPat(true);
    try {
      const res = await fetch('/api/learning/patterns');
      if (res.ok) {
        const data = await res.json();
        setPatterns(data.patterns ?? []);
      }
    } finally {
      setLoadingPat(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    if (activeTab === 'experiences') fetchExperiences();
    if (activeTab === 'patterns') fetchPatterns();
  }, [activeTab, fetchExperiences, fetchPatterns]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'stats', label: 'Stats' },
    { id: 'experiences', label: 'Experiences' },
    { id: 'patterns', label: 'Patterns' },
    { id: 'improve', label: 'Improve' },
  ];

  const refreshCurrent = () => {
    if (activeTab === 'stats') fetchStats();
    if (activeTab === 'experiences') fetchExperiences();
    if (activeTab === 'patterns') fetchPatterns();
  };

  const currentlyLoading = activeTab === 'stats' ? loadingStats
    : activeTab === 'experiences' ? loadingExp
    : activeTab === 'patterns' ? loadingPat
    : false;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <Brain size={16} className="text-indigo-500" />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Training & Learning</span>
        <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 font-mono">Face 9 / 16</span>
        <button
          onClick={refreshCurrent}
          disabled={currentlyLoading}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={13} className={currentlyLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors',
              activeTab === t.id
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'stats' && <StatsTab stats={stats} loading={loadingStats} />}
        {activeTab === 'experiences' && <ExperiencesTab experiences={experiences} loading={loadingExp} />}
        {activeTab === 'patterns' && <PatternsTab patterns={patterns} loading={loadingPat} />}
        {activeTab === 'improve' && <ImproveTab />}
      </div>
    </div>
  );
}
