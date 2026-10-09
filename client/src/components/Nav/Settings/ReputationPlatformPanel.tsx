import React, { useState, useEffect, useCallback } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  Clock,
  Tag,
  FileText,
  Zap,
  Copy,
  Check,
  Search,
  Eye,
  ArrowLeft,
  Info,
  Megaphone,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * ReputationPlatformPanel — Face 19-20: Digital Reputation, Case Intelligence,
 * Evidence & Dispute Investigation Platform.
 *
 * Settings → AI → Reputation Intelligence.
 *
 * EVIDENCE FIRST: claims are classified as FACT / OPINION / RUMOR / ALLEGATION /
 * SPECULATION / SATIRE / OUTDATED — never assumes "many sources = truth".
 */

// ─── API ──────────────────────────────────────────────────────────────────────

function getToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
  } catch { /* ignore */ }
  try { return localStorage.getItem('token'); } catch { return null; }
}

async function api(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SentimentOverall = 'positive' | 'negative' | 'neutral' | 'mixed';
type ClaimType = 'FACT' | 'OPINION' | 'RUMOR' | 'ALLEGATION' | 'SPECULATION' | 'SATIRE' | 'OUTDATED';

interface Target {
  _id: string;
  name: string;
  keywords: string[];
  language: string;
  sources: string[];
  scanIntervalHours: number;
  lastScannedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ScanResult {
  title: string;
  url: string;
  snippet: string;
}

interface Scan {
  _id: string;
  targetId: string;
  targetName: string;
  query: string;
  mentions: number;
  sentiment: { positive: number; negative: number; neutral: number; overall: SentimentOverall };
  alerts: string[];
  summary: string;
  results: ScanResult[];
  error: string | null;
  createdAt: string;
}

interface Claim {
  text: string;
  type: ClaimType;
  source: string;
  url: string;
  confidence: number;
}

interface Actions {
  correctionRequest: string;
  platformReport: string;
  takedownRequest: string;
  publicResponse: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLAIM_STYLES: Record<ClaimType, { bg: string; text: string }> = {
  FACT:        { bg: 'bg-green-500/15',  text: 'text-green-700 dark:text-green-400' },
  OPINION:     { bg: 'bg-blue-500/15',   text: 'text-blue-700 dark:text-blue-400' },
  RUMOR:       { bg: 'bg-yellow-500/15', text: 'text-yellow-700 dark:text-yellow-400' },
  ALLEGATION:  { bg: 'bg-red-500/15',    text: 'text-red-700 dark:text-red-400' },
  SPECULATION: { bg: 'bg-purple-500/15', text: 'text-purple-700 dark:text-purple-400' },
  SATIRE:      { bg: 'bg-orange-500/15', text: 'text-orange-700 dark:text-orange-400' },
  OUTDATED:    { bg: 'bg-gray-500/15',   text: 'text-gray-600 dark:text-gray-400' },
};

function ClaimBadge({ type }: { type: ClaimType }) {
  const s = CLAIM_STYLES[type] ?? CLAIM_STYLES.SPECULATION;
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', s.bg, s.text)}>
      {type}
    </span>
  );
}

function SentimentBadge({ overall }: { overall: SentimentOverall }) {
  const map = {
    positive: { icon: <TrendingUp className="h-3.5 w-3.5" />, cls: 'text-green-600 dark:text-green-400 bg-green-500/15' },
    negative: { icon: <TrendingDown className="h-3.5 w-3.5" />, cls: 'text-red-600 dark:text-red-400 bg-red-500/15' },
    neutral:  { icon: <Minus className="h-3.5 w-3.5" />,       cls: 'text-token-text-secondary bg-token-surface-tertiary' },
    mixed:    { icon: <Minus className="h-3.5 w-3.5" />,       cls: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/15' },
  };
  const { icon, cls } = map[overall] ?? map.neutral;
  return (
    <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize', cls)}>
      {icon}{overall}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="rounded p-1 hover:bg-token-surface-tertiary transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-token-text-tertiary" />}
    </button>
  );
}

function Collapsible({ label, children, defaultOpen = false }: { label: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-token-border-light overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-token-surface-secondary transition-colors">
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        {label}
      </button>
      {open && <div className="border-t border-token-border-light p-3">{children}</div>}
    </div>
  );
}

function fmtDate(d: string | null) {
  if (!d) return 'never';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

// ─── Add Target Form ──────────────────────────────────────────────────────────

function AddTargetForm({ onAdd, onCancel }: { onAdd: (t: Target) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [interval, setInterval] = useState(24);
  const [sources, setSources] = useState(['web', 'news']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSource = (s: string) =>
    setSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true); setError(null);
    try {
      const { target } = await api('/api/reputation/targets', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          sources,
          scanIntervalHours: interval,
          language: 'en',
        }),
      });
      onAdd(target);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-token-border-light bg-token-surface-secondary p-4">
      <p className="text-sm font-semibold">New Monitoring Target</p>

      <input
        value={name} onChange={e => setName(e.target.value)}
        placeholder="Entity name (person, brand, company)"
        className="rounded-lg border border-token-border-light bg-token-surface px-3 py-2 text-sm placeholder-token-text-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      />
      <input
        value={keywords} onChange={e => setKeywords(e.target.value)}
        placeholder="Extra keywords, comma-separated (optional)"
        className="rounded-lg border border-token-border-light bg-token-surface px-3 py-2 text-sm placeholder-token-text-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      />

      <div>
        <p className="mb-1.5 text-xs text-token-text-secondary font-medium">Sources</p>
        <div className="flex flex-wrap gap-1.5">
          {['web', 'news', 'reddit', 'youtube'].map(s => (
            <button key={s} onClick={() => toggleSource(s)}
              className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors', sources.includes(s) ? 'bg-indigo-600 text-white' : 'bg-token-surface-tertiary text-token-text-secondary hover:bg-token-surface-secondary')}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-token-text-secondary">Scan every</label>
        <select value={interval} onChange={e => setInterval(Number(e.target.value))}
          className="rounded border border-token-border-light bg-token-surface px-2 py-1 text-xs">
          {[1, 6, 12, 24, 48, 168].map(h => <option key={h} value={h}>{h === 168 ? '1 week' : `${h}h`}</option>)}
        </select>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={loading || !name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Target
        </button>
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-token-text-secondary hover:bg-token-surface-tertiary transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ─── Target Detail View ───────────────────────────────────────────────────────

function TargetDetail({ target, onBack }: { target: Target; onBack: () => void }) {
  const [tab, setTab] = useState<'results' | 'claims' | 'actions' | 'history'>('results');
  const [latestScan, setLatestScan] = useState<Scan | null>(null);
  const [history, setHistory] = useState<Scan[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [actions, setActions] = useState<Actions | null>(null);
  const [activeAction, setActiveAction] = useState<keyof Actions>('correctionRequest');
  const [scanning, setScanning] = useState(false);
  const [extracting, setExtractingClaims] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    try {
      const { scans } = await api(`/api/reputation/targets/${target._id}/scans`);
      if (scans?.length) {
        setLatestScan(scans[0]);
        setHistory(scans);
      }
    } catch { /* ignore */ }
  }, [target._id]);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  const runScan = async () => {
    setScanning(true); setError(null);
    try {
      const { scan } = await api(`/api/reputation/targets/${target._id}/scan`, { method: 'POST' });
      setLatestScan(scan);
      setHistory(prev => [scan, ...prev]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setScanning(false); }
  };

  const doExtractClaims = async () => {
    setExtractingClaims(true); setError(null);
    try {
      const { claims: c } = await api(`/api/reputation/targets/${target._id}/claims`, { method: 'POST' });
      setClaims(c || []);
      setTab('claims');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setExtractingClaims(false); }
  };

  const doGenerateActions = async () => {
    setLoadingActions(true); setError(null);
    try {
      const { actions: a } = await api(`/api/reputation/targets/${target._id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ claims }),
      });
      setActions(a);
      setTab('actions');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoadingActions(false); }
  };

  const tabs = [
    { key: 'results' as const, label: 'Scan Results', icon: <Search className="h-3.5 w-3.5" /> },
    { key: 'claims' as const, label: `Claims${claims.length ? ` (${claims.length})` : ''}`, icon: <Tag className="h-3.5 w-3.5" /> },
    { key: 'actions' as const, label: 'Action Templates', icon: <Megaphone className="h-3.5 w-3.5" /> },
    { key: 'history' as const, label: 'History', icon: <Clock className="h-3.5 w-3.5" /> },
  ];

  const actionLabels: Record<keyof Actions, string> = {
    correctionRequest: 'Correction Request',
    platformReport: 'Platform Report',
    takedownRequest: 'Takedown Notice',
    publicResponse: 'Public Response',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded p-1 hover:bg-token-surface-secondary transition-colors">
          <ArrowLeft className="h-4 w-4 text-token-text-secondary" />
        </button>
        <Shield className="h-5 w-5 text-indigo-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{target.name}</p>
          <p className="text-xs text-token-text-tertiary">Last scanned: {fmtDate(target.lastScannedAt)}</p>
        </div>
        <button onClick={runScan} disabled={scanning}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {scanning ? 'Scanning…' : 'Scan Now'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {/* Latest scan summary */}
      {latestScan && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-token-surface-secondary px-3 py-2">
          <span className="text-xs text-token-text-secondary">{latestScan.mentions} mentions</span>
          <SentimentBadge overall={latestScan.sentiment.overall} />
          {latestScan.alerts.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" /> {latestScan.alerts.length} alert{latestScan.alerts.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="ml-auto text-xs text-token-text-tertiary">{fmtDate(latestScan.createdAt)}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={doExtractClaims} disabled={extracting || !latestScan}
          className="flex items-center gap-1.5 rounded-lg border border-token-border-light px-3 py-1.5 text-xs font-medium hover:bg-token-surface-secondary disabled:opacity-50 transition-colors">
          {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5 text-indigo-500" />}
          Extract Claims via AI
        </button>
        <button onClick={doGenerateActions} disabled={loadingActions || !latestScan}
          className="flex items-center gap-1.5 rounded-lg border border-token-border-light px-3 py-1.5 text-xs font-medium hover:bg-token-surface-secondary disabled:opacity-50 transition-colors">
          {loadingActions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-green-500" />}
          Generate Action Templates
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-token-border-light">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.key ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-token-text-secondary hover:text-token-text-primary')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab: Scan Results */}
      {tab === 'results' && (
        <div className="flex flex-col gap-3">
          {!latestScan && (
            <div className="rounded-lg bg-token-surface-secondary px-4 py-8 text-center text-sm text-token-text-secondary">
              No scans yet. Click <strong>Scan Now</strong> to discover mentions.
            </div>
          )}
          {latestScan?.alerts && latestScan.alerts.length > 0 && (
            <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3">
              <p className="mb-1.5 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Alerts
              </p>
              <ul className="flex flex-col gap-1">
                {latestScan.alerts.map((a, i) => <li key={i} className="text-xs text-red-600 dark:text-red-400">{a}</li>)}
              </ul>
            </div>
          )}
          {latestScan?.summary && (
            <p className="text-xs text-token-text-secondary italic">{latestScan.summary}</p>
          )}
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {(latestScan?.results || []).map((r, i) => (
              <div key={i} className="rounded-lg border border-token-border-light bg-token-surface-secondary p-3">
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate block">{r.title || r.url}</a>
                {r.url && <p className="text-xs text-token-text-tertiary truncate">{r.url}</p>}
                {r.snippet && <p className="mt-1 text-xs text-token-text-secondary line-clamp-2">{r.snippet}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Claims */}
      {tab === 'claims' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><strong>Evidence First</strong> — claims are classified, never assumed true. Many sources repeating a claim does not make it a FACT.</span>
          </div>
          {claims.length === 0 ? (
            <div className="rounded-lg bg-token-surface-secondary px-4 py-8 text-center text-sm text-token-text-secondary">
              No claims extracted yet. Click <strong>Extract Claims via AI</strong> above.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {claims.map((c, i) => (
                <div key={i} className="rounded-lg border border-token-border-light bg-token-surface-secondary p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-token-text-primary flex-1">{c.text}</p>
                    <ClaimBadge type={c.type} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-token-text-tertiary">
                    {c.source && <span>Source: {c.source}</span>}
                    <span>Confidence: {Math.round(c.confidence * 100)}%</span>
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[200px]">{c.url}</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Action Templates */}
      {tab === 'actions' && (
        <div className="flex flex-col gap-3">
          {!actions ? (
            <div className="rounded-lg bg-token-surface-secondary px-4 py-8 text-center text-sm text-token-text-secondary">
              No action templates yet. Click <strong>Generate Action Templates</strong> above.
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(actionLabels) as (keyof Actions)[]).map(k => (
                  <button key={k} onClick={() => setActiveAction(k)}
                    className={cn('rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      activeAction === k ? 'bg-indigo-600 text-white' : 'bg-token-surface-secondary text-token-text-secondary hover:bg-token-surface-tertiary')}>
                    {actionLabels[k]}
                  </button>
                ))}
              </div>
              <div className="relative">
                <div className="absolute right-2 top-2 z-10">
                  <CopyButton text={actions[activeAction]} />
                </div>
                <pre className="max-h-80 overflow-auto rounded-lg bg-token-surface-secondary p-3 pr-8 text-xs text-token-text-primary font-mono whitespace-pre-wrap">
                  {actions[activeAction]}
                </pre>
              </div>
              <p className="text-xs text-token-text-tertiary flex items-start gap-1">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                These are templates. Fill in bracketed placeholders before sending. Legal review is recommended before any formal action.
              </p>
            </>
          )}
        </div>
      )}

      {/* Tab: History */}
      {tab === 'history' && (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-center text-sm text-token-text-secondary py-8">No scan history yet.</p>
          ) : history.map((s, i) => (
            <div key={s._id} className="flex items-center justify-between rounded-lg border border-token-border-light bg-token-surface-secondary px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <SentimentBadge overall={s.sentiment.overall} />
                  <span className="text-xs text-token-text-secondary">{s.mentions} mentions</span>
                  {s.alerts.length > 0 && (
                    <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" />{s.alerts.length}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-token-text-tertiary">{fmtDate(s.createdAt)}</p>
              </div>
              {s.error && <span title={s.error}><XCircle className="h-4 w-4 text-red-500" /></span>}
              {!s.error && <CheckCircle className="h-4 w-4 text-green-500" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function ReputationPlatformPanel() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [latestScans, setLatestScans] = useState<Record<string, Scan>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ targets: t }, { scans }] = await Promise.all([
        api('/api/reputation/targets'),
        api('/api/reputation/scans/latest'),
      ]);
      setTargets(t || []);
      const scanMap: Record<string, Scan> = {};
      for (const s of (scans || [])) scanMap[String(s.targetId)] = s;
      setLatestScans(scanMap);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = (t: Target) => {
    setTargets(prev => [t, ...prev]);
    setShowAdd(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await api(`/api/reputation/targets/${id}`, { method: 'DELETE' });
      setTargets(prev => prev.filter(t => t._id !== id));
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  };

  if (selectedTarget) {
    return <TargetDetail target={selectedTarget} onBack={() => { setSelectedTarget(null); load(); }} />;
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5 text-indigo-500" />
          <div>
            <p className="text-sm font-semibold">Reputation Intelligence</p>
            <p className="text-xs text-token-text-secondary">Monitor entities, classify claims, generate evidence-based actions.</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Target
        </button>
      </div>

      {/* Evidence-First notice */}
      <div className="flex items-start gap-2 rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span><strong>Evidence First</strong> — the system separates FACT / OPINION / RUMOR / ALLEGATION / SPECULATION. Negative content is never automatically classified as defamation.</span>
      </div>

      {showAdd && <AddTargetForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

      {/* Targets list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-token-text-tertiary" />
        </div>
      ) : targets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-token-border-light py-12 text-center">
          <Shield className="mx-auto h-8 w-8 text-token-text-tertiary" />
          <p className="mt-2 text-sm text-token-text-secondary">No targets yet.</p>
          <p className="text-xs text-token-text-tertiary">Add a person, brand, or organization to start monitoring.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {targets.map(t => {
            const scan = latestScans[t._id];
            return (
              <div
                key={t._id}
                onClick={() => setSelectedTarget(t)}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-token-border-light bg-token-surface-secondary p-3 hover:bg-token-surface-tertiary transition-colors"
              >
                <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', t.isActive ? 'bg-green-500' : 'bg-gray-400')} title={t.isActive ? 'Active' : 'Paused'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-token-text-tertiary truncate">
                    {t.keywords.length > 0 ? t.keywords.join(', ') : 'No extra keywords'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {scan ? (
                    <>
                      <SentimentBadge overall={scan.sentiment.overall} />
                      <span className="text-xs text-token-text-tertiary">{scan.mentions} mentions</span>
                    </>
                  ) : (
                    <span className="text-xs text-token-text-tertiary">Not scanned</span>
                  )}
                </div>
                <button
                  onClick={e => handleDelete(t._id, e)}
                  disabled={deletingId === t._id}
                  className="ml-1 rounded p-1 hover:bg-red-500/20 text-token-text-tertiary hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  {deletingId === t._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
