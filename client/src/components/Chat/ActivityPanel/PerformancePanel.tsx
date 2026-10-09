import React, { useState, useCallback, useEffect } from 'react';
import {
  Zap,
  BarChart3,
  Database,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Play,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '~/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PerfSummary { [key: string]: unknown }
interface SlowQuery { query?: string; duration?: number; collection?: string; [k: string]: unknown }
interface BenchmarkResult { [key: string]: unknown }
type Tab = 'summary' | 'benchmark' | 'queries' | 'cache';

// ── Summary Tab ───────────────────────────────────────────────────────────────

function SummaryTab() {
  const [data, setData] = useState<PerfSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, metRes] = await Promise.all([
        window.fetch('/api/performance/summary', { credentials: 'include' }),
        window.fetch('/api/performance/metrics', { credentials: 'include' }),
      ]);
      const merged: PerfSummary = {};
      if (sumRes.ok) Object.assign(merged, await sumRes.json());
      if (metRes.ok) {
        const m = await metRes.json();
        Object.assign(merged, Array.isArray(m) ? { metrics: m } : m);
      }
      setData(merged);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = data ? Object.entries(data).filter(([, v]) => typeof v !== 'object' || v === null) : [];
  const objRows = data ? Object.entries(data).filter(([, v]) => typeof v === 'object' && v !== null) : [];

  return (
    <div className="flex flex-col gap-2 p-3">
      {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between rounded border border-gray-100 bg-white px-3 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900">
          <span className="text-gray-500 dark:text-gray-400">{k}</span>
          <span className="font-mono text-gray-800 dark:text-gray-200">{String(v)}</span>
        </div>
      ))}
      {objRows.map(([k, v]) => (
        <div key={k} className="rounded border border-gray-100 bg-white p-2 text-xs dark:border-gray-800 dark:bg-gray-900">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{k}</p>
          {typeof v === 'object' && v !== null ? Object.entries(v as Record<string, unknown>).slice(0, 8).map(([ik, iv]) => {
            const display = typeof iv === 'object' && iv !== null ? JSON.stringify(iv).slice(0, 50) : String(iv).slice(0, 50);
            return (
              <div key={ik} className="flex justify-between py-0.5">
                <span className="text-gray-500">{ik}</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{display}</span>
              </div>
            );
          }) : null}
        </div>
      ))}
      {!loading && !data && <p className="text-center text-xs text-gray-400">No data</p>}
      <button onClick={load} disabled={loading} className="mt-1 flex items-center gap-1 self-end text-[10px] text-gray-400 hover:text-gray-600">
        <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
      </button>
    </div>
  );
}

// ── Benchmark Tab ─────────────────────────────────────────────────────────────

function BenchmarkTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [quick, setQuick] = useState<BenchmarkResult | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);

  const runFull = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await window.fetch('/api/performance/benchmark', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) setResult(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const runQuick = async () => {
    setQuickLoading(true);
    try {
      const res = await window.fetch('/api/performance/benchmark/quick', { credentials: 'include' });
      if (res.ok) setQuick(await res.json());
    } catch {
      // ignore
    } finally {
      setQuickLoading(false);
    }
  };

  useEffect(() => { runQuick(); }, []);

  const renderResult = (r: BenchmarkResult | null, label: string) => {
    if (!r) return null;
    return (
      <div className="rounded border border-gray-100 bg-white p-3 text-xs dark:border-gray-800 dark:bg-gray-900">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-500">{label}</p>
        {Object.entries(r).slice(0, 10).map(([k, v]) => (
          <div key={k} className="flex justify-between py-0.5 border-b border-gray-50 last:border-0 dark:border-gray-800">
            <span className="text-gray-500 dark:text-gray-400">{k}</span>
            <span className="font-mono text-gray-800 dark:text-gray-200">
              {typeof v === 'number' ? `${v.toFixed(2)}ms` : String(v).slice(0, 30)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex gap-2">
        <button onClick={runQuick} disabled={quickLoading}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-gray-100 py-2 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300">
          {quickLoading ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
          Quick Check
        </button>
        <button onClick={runFull} disabled={loading}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-indigo-500 py-2 text-xs text-white hover:bg-indigo-600 disabled:opacity-50">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          {loading ? 'Running…' : 'Full Benchmark'}
        </button>
      </div>
      {quickLoading && <p className="text-center text-xs text-gray-400">Running quick check…</p>}
      {renderResult(quick, 'Quick Result')}
      {loading && <p className="text-center text-xs text-gray-400">Running full benchmark… (may take a moment)</p>}
      {renderResult(result, 'Full Benchmark Result')}
    </div>
  );
}

// ── Slow Queries Tab ──────────────────────────────────────────────────────────

function QueriesTab() {
  const [slow, setSlow] = useState<SlowQuery[]>([]);
  const [opts, setOpts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, oRes] = await Promise.all([
        window.fetch('/api/performance/queries/slow', { credentials: 'include' }),
        window.fetch('/api/performance/queries/optimizations', { credentials: 'include' }),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        setSlow(Array.isArray(d) ? d : d.queries ?? d.slow ?? []);
      }
      if (oRes.ok) {
        const d = await oRes.json();
        setOpts(Array.isArray(d) ? d.map(String) : d.optimizations ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-2 p-3">
      {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}

      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Slow Queries</p>
      {!loading && slow.length === 0 && <p className="text-center text-xs text-emerald-600">No slow queries detected</p>}
      {slow.map((q, i) => (
        <div key={i} className="rounded border border-gray-100 bg-white px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">{q.collection ?? 'unknown'}</span>
            {q.duration !== undefined && (
              <span className={cn('font-mono font-medium', q.duration > 500 ? 'text-red-500' : 'text-amber-500')}>
                {q.duration}ms
              </span>
            )}
          </div>
          {q.query && <p className="mt-0.5 font-mono text-[10px] text-gray-400 truncate">{JSON.stringify(q.query).slice(0, 80)}</p>}
        </div>
      ))}

      {opts.length > 0 && (
        <>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-amber-500">Optimization Suggestions</p>
          {opts.map((o, i) => (
            <div key={i} className="flex items-start gap-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              {o}
            </div>
          ))}
        </>
      )}

      <button onClick={load} disabled={loading} className="mt-1 flex items-center gap-1 self-end text-[10px] text-gray-400 hover:text-gray-600">
        <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
      </button>
    </div>
  );
}

// ── Cache Tab ─────────────────────────────────────────────────────────────────

function CacheTab() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/performance/cache/stats', { credentials: 'include' });
      if (res.ok) setStats(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clearCache = async () => {
    setClearing(true);
    try {
      await window.fetch('/api/performance/cache/clear', { method: 'POST', credentials: 'include' });
      setCleared(true);
      setTimeout(() => { setCleared(false); load(); }, 2000);
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
      {stats && Object.entries(stats).map(([k, v]) => (
        <div key={k} className="flex items-center justify-between rounded border border-gray-100 bg-white px-3 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900">
          <span className="text-gray-500 dark:text-gray-400">{k}</span>
          <span className="font-mono text-gray-800 dark:text-gray-200">{String(v)}</span>
        </div>
      ))}
      {!loading && !stats && <p className="text-center text-xs text-gray-400">No cache stats</p>}
      {cleared && (
        <div className="flex items-center gap-2 rounded bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
          <CheckCircle2 size={12} /> Cache cleared
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button onClick={load} disabled={loading} className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-700">
          <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
        </button>
        <button onClick={clearCache} disabled={clearing || cleared}
          className="flex items-center gap-1 rounded bg-red-50 px-3 py-1.5 text-xs text-red-500 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20">
          {clearing ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
          Clear Cache
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { className?: string }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'summary', label: 'Summary', icon: <BarChart3 size={12} /> },
  { id: 'benchmark', label: 'Benchmark', icon: <Zap size={12} /> },
  { id: 'queries', label: 'Slow Queries', icon: <AlertTriangle size={12} /> },
  { id: 'cache', label: 'Cache', icon: <Database size={12} /> },
];

export function PerformancePanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Performance & Benchmarks</span>
      </div>
      <div className="flex border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
              activeTab === t.id ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-400')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'summary' && <SummaryTab />}
        {activeTab === 'benchmark' && <BenchmarkTab />}
        {activeTab === 'queries' && <QueriesTab />}
        {activeTab === 'cache' && <CacheTab />}
      </div>
    </div>
  );
}
