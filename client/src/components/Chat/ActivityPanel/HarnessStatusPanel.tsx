import React, { useEffect, useState, useCallback } from 'react';
import { HarnessEventFeed } from '~/components/Harness/HarnessEventFeed';
import {
  RefreshCw,
  Database,
  Target,
  GitMerge,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Check,
  X,
  Play,
} from 'lucide-react';
import { cn } from '~/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface HarnessStatus {
  available: boolean;
  message?: string;
  harness?: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalToolCalls: number;
    activeSessions: number;
  };
  memory?: { layers?: Record<string, number>; count?: number } | null;
  deepSearch?: { enabled?: boolean } | null;
  orchestrator?: { enabled?: boolean } | null;
  tools?: { count?: number; registered?: number } | null;
  providers?: string[];
  security?: { enabled?: boolean; violations?: number } | null;
  scheduler?: { jobCount?: number } | null;
  vectorStore?: { enabled?: boolean } | null;
  cognitive?: {
    initialized?: boolean;
    memory?: {
      working?: number;
      task?: number;
      session?: number;
      project?: number;
      longterm?: number;
      [key: string]: number | undefined;
    };
    skills?: { count?: number };
    learning?: { enabled?: boolean };
  } | null;
  executiveBrain?: { enabled?: boolean } | null;
  streaming?: { active?: number } | null;
  backgroundTasks?: { running?: number } | null;
}

interface Goal {
  id: string;
  description: string;
  priority?: number;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface PendingDiff {
  id: string;
  path?: string;
  file?: string;
  description?: string;
  status?: string;
  createdAt?: string;
  before?: string;
  after?: string;
  [key: string]: unknown;
}

type HarnessTab = 'status' | 'goals' | 'diffs' | 'events';
type StatusLevel = 'ok' | 'warn' | 'off';

// ── Shared sub-components ────────────────────────────────────────────────────

function dot(level: StatusLevel) {
  if (level === 'ok') return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
  if (level === 'warn') return <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-600" />;
}

function Row({ label, value, level }: { label: string; value: string; level: StatusLevel }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs">
      <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
        {dot(level)}
        {label}
      </span>
      <span className="font-mono text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {title}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">{children}</div>
    </div>
  );
}

// ── Status Tab ───────────────────────────────────────────────────────────────

function StatusTab({ status }: { status: HarnessStatus | null }) {
  if (!status) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-400">
        No data
      </div>
    );
  }
  if (!status.available) {
    return (
      <div className="m-3 rounded bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
        {status.message ?? 'HarnessManager not running'}
      </div>
    );
  }

  const h = status.harness;
  const cog = status.cognitive;
  const memLayers = cog?.memory;
  const providers = status.providers ?? [];

  return (
    <div className="flex-1 overflow-y-auto py-1">
      <Section title="Core">
        <Row
          label="Active sessions"
          value={String(h?.activeSessions ?? 0)}
          level={h?.activeSessions ? 'ok' : 'off'}
        />
        <Row label="Total runs" value={String(h?.totalRuns ?? 0)} level="ok" />
        <Row
          label="Success / Failed"
          value={`${h?.successfulRuns ?? 0} / ${h?.failedRuns ?? 0}`}
          level={h?.failedRuns ? 'warn' : 'ok'}
        />
        <Row label="Tool calls" value={String(h?.totalToolCalls ?? 0)} level="ok" />
      </Section>

      <Section title="Providers">
        {providers.length === 0 ? (
          <Row label="No providers registered" value="" level="off" />
        ) : (
          providers.map((p) => <Row key={p} label={p} value="active" level="ok" />)
        )}
      </Section>

      {status.tools !== null && (
        <Section title="Tools">
          <Row
            label="Registered tools"
            value={String(status.tools?.count ?? status.tools?.registered ?? '—')}
            level={status.tools ? 'ok' : 'off'}
          />
        </Section>
      )}

      <Section title="Subsystems">
        <Row
          label="DeepSearch"
          value={status.deepSearch ? 'enabled' : 'off'}
          level={status.deepSearch ? 'ok' : 'off'}
        />
        <Row
          label="Orchestrator"
          value={status.orchestrator ? 'enabled' : 'off'}
          level={status.orchestrator ? 'ok' : 'off'}
        />
        <Row
          label="Security"
          value={
            status.security
              ? `on (${status.security.violations ?? 0} violations)`
              : 'off'
          }
          level={
            status.security ? (status.security.violations ? 'warn' : 'ok') : 'off'
          }
        />
        <Row
          label="VectorStore"
          value={status.vectorStore ? 'enabled' : 'off'}
          level={status.vectorStore ? 'ok' : 'off'}
        />
        <Row
          label="Scheduler"
          value={status.scheduler ? `${status.scheduler.jobCount ?? 0} jobs` : 'off'}
          level={status.scheduler ? 'ok' : 'off'}
        />
        <Row
          label="Streaming"
          value={status.streaming ? `${status.streaming.active ?? 0} active` : 'off'}
          level={status.streaming ? 'ok' : 'off'}
        />
        <Row
          label="Background tasks"
          value={
            status.backgroundTasks
              ? `${status.backgroundTasks.running ?? 0} running`
              : 'off'
          }
          level={status.backgroundTasks ? 'ok' : 'off'}
        />
        <Row
          label="Executive Brain"
          value={status.executiveBrain ? 'enabled' : 'off'}
          level={status.executiveBrain ? 'ok' : 'off'}
        />
      </Section>

      {cog && (
        <Section title="Cognitive Engine">
          <Row
            label="Initialized"
            value={cog.initialized ? 'yes' : 'no'}
            level={cog.initialized ? 'ok' : 'warn'}
          />
          {cog.skills && (
            <Row label="Skills" value={String(cog.skills.count ?? '—')} level="ok" />
          )}
          {cog.learning && (
            <Row
              label="Learning"
              value={cog.learning.enabled ? 'enabled' : 'off'}
              level={cog.learning.enabled ? 'ok' : 'off'}
            />
          )}
          {memLayers && (
            <>
              <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-2 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                <Database size={10} /> Memory layers
              </div>
              {(['working', 'task', 'session', 'project', 'longterm'] as const).map(
                (layer) => {
                  const count = memLayers[layer];
                  return count !== undefined ? (
                    <Row
                      key={layer}
                      label={layer}
                      value={String(count)}
                      level={count > 0 ? 'ok' : 'off'}
                    />
                  ) : null;
                },
              )}
            </>
          )}
        </Section>
      )}

      {status.memory?.layers && (
        <Section title="Memory Manager">
          {Object.entries(status.memory.layers).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} level={v > 0 ? 'ok' : 'off'} />
          ))}
        </Section>
      )}
    </div>
  );
}

// ── Goals Tab ────────────────────────────────────────────────────────────────

function statusIcon(s: string | undefined) {
  if (s === 'completed' || s === 'done') return <CheckCircle2 size={12} className="text-emerald-500" />;
  if (s === 'failed') return <XCircle size={12} className="text-red-500" />;
  return <Clock size={12} className="text-amber-400" />;
}

function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState(5);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/harness/goals', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setGoals(Array.isArray(data) ? data : data.goals ?? []);
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

  const addGoal = async () => {
    if (!desc.trim()) return;
    setError('');
    try {
      const res = await window.fetch('/api/harness/goal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc.trim(), priority }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDesc('');
      setPriority(5);
      setAdding(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add goal');
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Add goal button */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-500 dark:border-gray-700 dark:hover:border-indigo-500"
        >
          <Plus size={12} /> Add goal
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-900/10">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Goal description…"
            rows={2}
            className="w-full resize-none rounded border border-gray-200 bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
          />
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-500">Priority</label>
            <input
              type="number"
              min={1}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-14 rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          {error && <p className="text-[10px] text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={addGoal}
              className="flex items-center gap-1 rounded bg-indigo-500 px-3 py-1 text-xs text-white hover:bg-indigo-600"
            >
              <Check size={10} /> Save
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError('');
              }}
              className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Goal list */}
      {loading && (
        <p className="text-center text-xs text-gray-400">Loading…</p>
      )}
      {!loading && goals.length === 0 && (
        <p className="text-center text-xs text-gray-400">No goals registered</p>
      )}
      {goals.map((g) => (
        <div
          key={g.id}
          className="flex items-start gap-2 rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900"
        >
          {statusIcon(g.status)}
          <div className="flex-1 min-w-0">
            <p className="text-gray-800 dark:text-gray-200 leading-snug">{g.description}</p>
            <div className="mt-0.5 flex gap-2 text-[10px] text-gray-400">
              {g.priority !== undefined && <span>Priority {g.priority}</span>}
              {g.status && <span className="capitalize">{g.status}</span>}
            </div>
          </div>
        </div>
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

// ── Diffs Tab ────────────────────────────────────────────────────────────────

function DiffsTab() {
  const [diffs, setDiffs] = useState<PendingDiff[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/harness/diff/pending', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDiffs(Array.isArray(data) ? data : data.diffs ?? []);
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

  const action = async (id: string, act: 'approve' | 'reject' | 'apply') => {
    setBusy(id + act);
    try {
      await window.fetch(`/api/harness/diff/${id}/${act}`, {
        method: 'POST',
        credentials: 'include',
      });
      load();
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  };

  const diffFile = (d: PendingDiff) => d.path ?? d.file ?? d.id;

  return (
    <div className="flex flex-col gap-2 p-3">
      {loading && <p className="text-center text-xs text-gray-400">Loading…</p>}
      {!loading && diffs.length === 0 && (
        <p className="text-center text-xs text-gray-400">No pending diffs</p>
      )}
      {diffs.map((d) => (
        <div
          key={d.id}
          className="rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
        >
          <button
            onClick={() => setExpanded(expanded === d.id ? null : d.id)}
            className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs"
          >
            <GitMerge size={12} className="mt-0.5 shrink-0 text-indigo-400" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-gray-800 dark:text-gray-200 truncate">{diffFile(d)}</p>
              {d.description && (
                <p className="text-[10px] text-gray-400 truncate">{d.description}</p>
              )}
            </div>
          </button>

          {expanded === d.id && (d.before || d.after) && (
            <div className="border-t border-gray-100 p-3 dark:border-gray-800">
              {d.before && (
                <div className="mb-2">
                  <p className="mb-1 text-[10px] font-semibold text-red-400">Before</p>
                  <pre className="overflow-x-auto rounded bg-red-50 p-2 text-[10px] text-red-700 dark:bg-red-900/10 dark:text-red-300">
                    {String(d.before).slice(0, 500)}
                  </pre>
                </div>
              )}
              {d.after && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold text-emerald-500">After</p>
                  <pre className="overflow-x-auto rounded bg-emerald-50 p-2 text-[10px] text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-300">
                    {String(d.after).slice(0, 500)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-1.5 border-t border-gray-100 px-3 py-2 dark:border-gray-800">
            <button
              onClick={() => action(d.id, 'approve')}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded bg-emerald-500 px-2 py-1 text-[10px] text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <Check size={9} />
              {busy === d.id + 'approve' ? '…' : 'Approve'}
            </button>
            <button
              onClick={() => action(d.id, 'apply')}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded bg-indigo-500 px-2 py-1 text-[10px] text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              <Play size={9} />
              {busy === d.id + 'apply' ? '…' : 'Apply'}
            </button>
            <button
              onClick={() => action(d.id, 'reject')}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded bg-red-500 px-2 py-1 text-[10px] text-white hover:bg-red-600 disabled:opacity-50"
            >
              <X size={9} />
              {busy === d.id + 'reject' ? '…' : 'Reject'}
            </button>
          </div>
        </div>
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

// ── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  className?: string;
}

export function HarnessStatusPanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<HarnessTab>('status');
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/harness/manager-status', { credentials: 'include' });
      if (res.ok) {
        setStatus(await res.json());
        setLastFetched(new Date());
      }
    } catch {
      // network error — leave stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const tabs: { id: HarnessTab; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: 'Status', icon: <Database size={12} /> },
    { id: 'goals', label: 'Goals', icon: <Target size={12} /> },
    { id: 'diffs', label: 'Diffs', icon: <GitMerge size={12} /> },
    { id: 'events', label: 'Events', icon: <span className="text-[10px]">⚡</span> },
  ];

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Harness Manager
        </span>
        {activeTab === 'status' && (
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title="Refresh"
          >
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors',
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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'status' && <StatusTab status={status} />}
        {activeTab === 'goals' && <GoalsTab />}
        {activeTab === 'diffs' && <DiffsTab />}
        {activeTab === 'events' && (
          <div className="p-2">
            <HarnessEventFeed autoScroll maxEvents={200} />
          </div>
        )}
      </div>

      {activeTab === 'status' && lastFetched && (
        <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400 dark:border-gray-800">
          Updated {lastFetched.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
