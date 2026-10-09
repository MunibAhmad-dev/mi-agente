/**
 * SecurityPanel — Face 11: Autonomous Security, Reality Testing & Self-Repair
 *
 * Tabs:
 *   Scanners   — available scanner status + firewall
 *   Scan Code  — paste/type code content and scan it
 *   Scan Dir   — scan a directory path
 *   Repair     — classify failures and get repair recommendations
 *
 * API:
 *   GET  /api/security/status      — scanner availability
 *   GET  /api/security/scanners    — scanner list
 *   GET  /api/security/firewall    — firewall status
 *   POST /api/security/scan        — scan code content
 *   POST /api/security/scan-dir    — scan directory
 *   POST /api/security/repair      — classify failures
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw, FolderSearch, Code, Wrench, Zap } from 'lucide-react';
import { cn } from '~/utils';

type Tab = 'scanners' | 'scan-code' | 'scan-dir' | 'repair';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScannerInfo {
  name: string;
  description: string;
  enabled: boolean;
}

interface ScannerStatus {
  available: boolean;
  scanners: Record<string, boolean>;
  summary: { allReady: boolean; readyCount: number; total: number };
}

interface FirewallStatus {
  firewall: { enabled?: boolean; rules?: unknown[] };
}

interface ScanFinding {
  type?: string;
  severity?: string;
  message?: string;
  line?: number;
  column?: number;
  rule?: string;
}

interface ScanResult {
  findings?: ScanFinding[];
  summary?: { total?: number; critical?: number; high?: number; medium?: number; low?: number };
  clean?: boolean;
  error?: string;
}

interface ClassifiedFailure {
  index: number;
  category: string | null;
  recommendedAction: string | null;
}

interface RepairResult {
  classified: ClassifiedFailure[];
  needsRepair: number;
  canAutoRepair: boolean;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Spinner() {
  return <div className="flex items-center justify-center py-10"><Loader2 size={22} className="animate-spin text-indigo-500" /></div>;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      {message}
    </div>
  );
}

function SeverityBadge({ severity }: { severity?: string }) {
  const s = (severity ?? 'unknown').toLowerCase();
  const cls = s === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : s === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
    : s === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cls)}>{severity ?? 'info'}</span>;
}

// ── Tab: Scanners ──────────────────────────────────────────────────────────────

function ScannersTab() {
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const [scanners, setScanners] = useState<ScannerInfo[]>([]);
  const [firewall, setFirewall] = useState<FirewallStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, scRes, fRes] = await Promise.all([
        fetch('/api/security/status'),
        fetch('/api/security/scanners'),
        fetch('/api/security/firewall'),
      ]);
      if (sRes.ok) setStatus(await sRes.json());
      if (scRes.ok) setScanners((await scRes.json()).scanners ?? []);
      if (fRes.ok) setFirewall(await fRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-5">
      {/* Summary */}
      {status && (
        <div className={cn(
          'flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium',
          status.summary.allReady
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800',
        )}>
          {status.summary.allReady
            ? <CheckCircle2 size={15} />
            : <AlertCircle size={15} />}
          {status.summary.readyCount}/{status.summary.total} scanners ready
        </div>
      )}

      {/* Scanner list */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Available Scanners</h3>
        <div className="space-y-1.5">
          {scanners.map((sc) => {
            const binaryReady = status?.scanners ? (status.scanners[sc.name] ?? true) : true;
            return (
              <div key={sc.name} className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                {binaryReady
                  ? <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                  : <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />}
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{sc.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{sc.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Firewall */}
      {firewall && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Agent Firewall</h3>
          <div className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2.5 flex items-center gap-2 text-sm">
            <Zap size={14} className={firewall.firewall.enabled ? 'text-green-500' : 'text-gray-400'} />
            <span className="text-gray-700 dark:text-gray-300">
              Status: <strong>{firewall.firewall.enabled ? 'Active' : 'Off'}</strong>
            </span>
            {firewall.firewall.rules != null && (
              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 font-mono">
                {(firewall.firewall.rules as unknown[]).length} rules
              </span>
            )}
          </div>
        </section>
      )}

      <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  );
}

// ── Tab: Scan Code ─────────────────────────────────────────────────────────────

function ScanCodeTab() {
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/security/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, fileName: fileName || undefined }),
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
      <div>
        <input
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder="filename.js (optional, helps scanner)"
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste code to scan for secrets, injection vulnerabilities, and dependency issues…"
          rows={8}
          className="w-full resize-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-mono text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <button
        onClick={run}
        disabled={loading || !content.trim()}
        className="flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white transition-colors"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
        {loading ? 'Scanning…' : 'Scan Code'}
      </button>

      {error && <ErrorBox message={error} />}

      {result && (
        <div className="space-y-3">
          {result.clean ? (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 size={14} />
              No issues found — code looks clean.
            </div>
          ) : (
            <>
              {result.summary && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                    <div key={sev} className="rounded-md bg-gray-50 dark:bg-gray-800/50 px-2 py-2">
                      <p className="text-base font-bold font-mono text-gray-800 dark:text-gray-100 tabular-nums">{result.summary?.[sev] ?? 0}</p>
                      <p className="text-[10px] text-gray-500 capitalize">{sev}</p>
                    </div>
                  ))}
                </div>
              )}
              {result.findings && result.findings.length > 0 && (
                <div className="space-y-1.5">
                  {result.findings.map((f, i) => (
                    <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 mb-0.5">
                        <SeverityBadge severity={f.severity} />
                        {f.rule && <span className="text-xs font-mono text-gray-400">{f.rule}</span>}
                        {f.line != null && <span className="ml-auto text-xs text-gray-400 font-mono">L{f.line}</span>}
                      </div>
                      <p className="text-xs text-gray-700 dark:text-gray-300">{f.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab: Scan Directory ────────────────────────────────────────────────────────

function ScanDirTab() {
  const [dirPath, setDirPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!dirPath.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/security/scan-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath: dirPath.trim() }),
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
      <div className="flex gap-2">
        <input
          value={dirPath}
          onChange={(e) => setDirPath(e.target.value)}
          placeholder="/path/to/directory"
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <button
          onClick={run}
          disabled={loading || !dirPath.trim()}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-white transition-colors whitespace-nowrap"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <FolderSearch size={13} />}
          {loading ? 'Scanning…' : 'Scan'}
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">Recursively scans for secrets, SAST issues, and vulnerable dependencies.</p>

      {error && <ErrorBox message={error} />}
      {result && (
        result.clean ? (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 size={14} />
            Directory is clean — no issues found.
          </div>
        ) : (
          <div className="space-y-3">
            {result.summary && (
              <div className="grid grid-cols-4 gap-2 text-center">
                {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                  <div key={sev} className="rounded-md bg-gray-50 dark:bg-gray-800/50 px-2 py-2">
                    <p className="text-base font-bold font-mono text-gray-800 dark:text-gray-100">{result.summary?.[sev] ?? 0}</p>
                    <p className="text-[10px] text-gray-500 capitalize">{sev}</p>
                  </div>
                ))}
              </div>
            )}
            {result.findings && result.findings.slice(0, 20).map((f, i) => (
              <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <SeverityBadge severity={f.severity} />
                  {f.rule && <span className="text-xs font-mono text-gray-400">{f.rule}</span>}
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300">{f.message}</p>
              </div>
            ))}
            {result.findings && result.findings.length > 20 && (
              <p className="text-xs text-gray-400 text-center">…and {result.findings.length - 20} more findings</p>
            )}
          </div>
        )
      )}
    </div>
  );
}

// ── Tab: Repair ────────────────────────────────────────────────────────────────

function RepairTab() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RepairResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    let parsed: unknown[];
    try {
      parsed = JSON.parse(input);
      if (!Array.isArray(parsed)) throw new Error('Must be an array');
    } catch {
      setError('Input must be a JSON array of verification result objects');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/security/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: parsed }),
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
        <p className="font-medium mb-1">Failure Classifier & Repair Advisor</p>
        <p className="text-xs opacity-80">Paste an array of verification failure results. The system classifies each failure and recommends the appropriate repair action.</p>
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={`[\n  { "type": "sast", "rule": "eval-injection", "severity": "high" }\n]`}
        rows={6}
        className="w-full resize-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-mono text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        onClick={run}
        disabled={loading || !input.trim()}
        className="flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white transition-colors"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
        {loading ? 'Analyzing…' : 'Classify & Repair'}
      </button>

      {error && <ErrorBox message={error} />}

      {result && (
        <div className="space-y-3">
          <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>Need repair: <strong className="text-gray-700 dark:text-gray-300">{result.needsRepair}</strong></span>
            <span>Can auto-repair: <strong className={result.canAutoRepair ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>{result.canAutoRepair ? 'Yes' : 'No'}</strong></span>
          </div>
          {result.classified.map((c, i) => (
            <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400">#{c.index}</span>
                <span className="text-gray-700 dark:text-gray-300">Category: <strong>{c.category ?? 'OK'}</strong></span>
                {c.recommendedAction && (
                  <span className="ml-auto text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full px-2 py-0.5">{c.recommendedAction}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SecurityPanel({ className }: { className?: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('scanners');

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'scanners', label: 'Scanners', icon: <ShieldCheck size={12} /> },
    { id: 'scan-code', label: 'Scan Code', icon: <Code size={12} /> },
    { id: 'scan-dir', label: 'Scan Dir', icon: <FolderSearch size={12} /> },
    { id: 'repair', label: 'Repair', icon: <Wrench size={12} /> },
  ];

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <ShieldCheck size={16} className="text-indigo-500" />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Security & Self-Repair</span>
        <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 font-mono">Face 11</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
              activeTab === t.id
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'scanners' && <ScannersTab />}
        {activeTab === 'scan-code' && <ScanCodeTab />}
        {activeTab === 'scan-dir' && <ScanDirTab />}
        {activeTab === 'repair' && <RepairTab />}
      </div>
    </div>
  );
}
