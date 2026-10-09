import React, { useState, useCallback, useEffect } from 'react';
import {
  Shield,
  Plus,
  Scan,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Gavel,
} from 'lucide-react';
import { cn } from '~/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Target {
  id?: string;
  _id?: string;
  name?: string;
  type?: string;
  url?: string;
  status?: string;
  [key: string]: unknown;
}

interface ScanRecord {
  id?: string;
  timestamp?: string;
  createdAt?: string;
  findings?: number;
  sentiment?: string;
  sources?: number;
  [key: string]: unknown;
}

type Tab = 'cases' | 'new-case' | 'evidence';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusDot(s?: string) {
  if (s === 'clean' || s === 'ok') return <CheckCircle2 size={12} className="text-emerald-500" />;
  if (s === 'risk' || s === 'negative') return <AlertCircle size={12} className="text-red-500" />;
  return <Clock size={12} className="text-gray-400" />;
}

function targetId(t: Target) { return t.id ?? t._id ?? ''; }

// ── Cases Tab ─────────────────────────────────────────────────────────────────

function CasesTab() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scans, setScans] = useState<Record<string, ScanRecord[]>>({});
  const [scanning, setScanning] = useState<string | null>(null);
  const [claimText, setClaimText] = useState('');
  const [actionText, setActionText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/reputation/targets', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setTargets(Array.isArray(d) ? d : d.targets ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const expand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    try {
      const res = await window.fetch(`/api/reputation/targets/${id}/scans`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setScans((m) => ({ ...m, [id]: Array.isArray(d) ? d : d.scans ?? [] }));
      }
    } catch {
      // ignore
    }
  };

  const scan = async (id: string) => {
    setScanning(id);
    try {
      await window.fetch(`/api/reputation/targets/${id}/scan`, { method: 'POST', credentials: 'include' });
      // refresh scans
      const res = await window.fetch(`/api/reputation/targets/${id}/scans`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setScans((m) => ({ ...m, [id]: Array.isArray(d) ? d : d.scans ?? [] }));
      }
    } catch {
      // ignore
    } finally {
      setScanning(null);
    }
  };

  const addClaim = async (id: string) => {
    if (!claimText.trim()) return;
    try {
      await window.fetch(`/api/reputation/targets/${id}/claims`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: claimText.trim(), severity: 'medium' }),
      });
      setClaimText('');
    } catch {
      // ignore
    }
  };

  const addAction = async (id: string) => {
    if (!actionText.trim()) return;
    try {
      await window.fetch(`/api/reputation/targets/${id}/actions`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: actionText.trim(), type: 'response' }),
      });
      setActionText('');
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
      {!loading && targets.length === 0 && (
        <p className="text-center text-xs text-gray-400">No cases — add a subject to monitor</p>
      )}
      {targets.map((t) => {
        const id = targetId(t);
        const isOpen = expanded === id;
        return (
          <div key={id} className="rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <button onClick={() => expand(id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {statusDot(t.status)}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">{t.name ?? id}</p>
                {t.type && <p className="text-[10px] text-gray-400 capitalize">{t.type}</p>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); scan(id); }}
                disabled={scanning === id}
                className="flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-500 hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-900/30"
              >
                {scanning === id ? <Loader2 size={9} className="animate-spin" /> : <Scan size={9} />}
                Scan
              </button>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 p-3 dark:border-gray-800 flex flex-col gap-3">
                {/* Scan history */}
                {(scans[id] ?? []).length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Scan History ({scans[id].length})
                    </p>
                    {scans[id].slice(0, 5).map((s, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                        <Clock size={10} className="text-gray-400 shrink-0" />
                        <span className="text-gray-500">
                          {s.timestamp ? new Date(s.timestamp).toLocaleDateString() : s.createdAt ? new Date(s.createdAt).toLocaleDateString() : `Scan ${i + 1}`}
                        </span>
                        {s.findings !== undefined && (
                          <span className={cn('font-mono', s.findings > 0 ? 'text-amber-500' : 'text-emerald-500')}>
                            {s.findings} findings
                          </span>
                        )}
                        {s.sentiment && <span className="text-gray-400 capitalize">{s.sentiment}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add claim */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">Add Claim / Allegation</p>
                  <div className="flex gap-1.5">
                    <input value={claimText} onChange={(e) => setClaimText(e.target.value)}
                      placeholder="Describe the claim…"
                      className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900" />
                    <button onClick={() => addClaim(id)} disabled={!claimText.trim()}
                      className="rounded bg-red-50 px-2 py-1 text-[10px] text-red-500 hover:bg-red-100 disabled:opacity-50">
                      Add
                    </button>
                  </div>
                </div>

                {/* Add action */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Record Response Action</p>
                  <div className="flex gap-1.5">
                    <input value={actionText} onChange={(e) => setActionText(e.target.value)}
                      placeholder="Describe the action taken…"
                      className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900" />
                    <button onClick={() => addAction(id)} disabled={!actionText.trim()}
                      className="rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-600 hover:bg-emerald-100 disabled:opacity-50">
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button onClick={load} disabled={loading} className="mt-1 flex items-center gap-1 self-end text-[10px] text-gray-400 hover:text-gray-600">
        <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
      </button>
    </div>
  );
}

// ── New Case Tab ──────────────────────────────────────────────────────────────

function NewCaseTab() {
  const [name, setName] = useState('');
  const [type, setType] = useState<'person' | 'company' | 'brand' | 'product'>('person');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id?: string; error?: string } | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await window.fetch('/api/reputation/targets', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, url: url.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) setResult({ error: d.error ?? 'Failed' });
      else setResult({ id: d.id ?? d._id ?? d.targetId });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-gray-500">Create a new subject to monitor for reputation intelligence.</p>
      <div>
        <label className="mb-1 block text-[10px] text-gray-500">Subject Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name or company name"
          className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900" />
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-gray-500">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}
          className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900">
          <option value="person">Person</option>
          <option value="company">Company</option>
          <option value="brand">Brand</option>
          <option value="product">Product</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-gray-500">Website / URL (optional)</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com"
          className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900" />
      </div>
      {result && (
        <div className={cn('rounded p-2 text-xs', result.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700')}>
          {result.error ?? `Case created: ${result.id}`}
        </div>
      )}
      <button onClick={create} disabled={loading || !name.trim()}
        className="flex items-center justify-center gap-1.5 rounded bg-indigo-500 py-2 text-xs text-white hover:bg-indigo-600 disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        {loading ? 'Creating…' : 'Open Case'}
      </button>
    </div>
  );
}

// ── Evidence Tab ──────────────────────────────────────────────────────────────

function EvidenceTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/reputation/scans/latest', { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-[10px] text-gray-500">Latest scan evidence across all monitored subjects.</p>
      {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
      {!loading && !data && <p className="text-center text-xs text-gray-400">No scan data</p>}
      {data && Object.entries(data).slice(0, 20).map(([k, v]) => (
        <div key={k} className="rounded border border-gray-100 bg-white px-3 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">{k}</span>
            <span className="font-mono text-gray-800 dark:text-gray-200">
              {typeof v === 'object' ? JSON.stringify(v).slice(0, 50) : String(v).slice(0, 50)}
            </span>
          </div>
        </div>
      ))}
      <button onClick={load} disabled={loading} className="mt-1 flex items-center gap-1 self-end text-[10px] text-gray-400 hover:text-gray-600">
        <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { className?: string }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'cases', label: 'Cases', icon: <Shield size={12} /> },
  { id: 'new-case', label: 'New Case', icon: <Plus size={12} /> },
  { id: 'evidence', label: 'Evidence', icon: <Gavel size={12} /> },
];

export function CaseIntelligencePanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('cases');

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Case Intelligence</span>
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
        {activeTab === 'cases' && <CasesTab />}
        {activeTab === 'new-case' && <NewCaseTab />}
        {activeTab === 'evidence' && <EvidenceTab />}
      </div>
    </div>
  );
}
