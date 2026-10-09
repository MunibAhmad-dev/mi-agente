import React, { useState, useEffect, useCallback } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Cpu,
  CheckCircle,
  XCircle,
  Terminal,
  Save,
  RotateCcw,
  Loader2,
  Target,
  FileCode,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * HarnessPanel — Face 14: DeepSeek Harness Full Integration.
 * Shows harness status, components, checkpoints, goals, and allows
 * running sandboxed commands. Settings → AI → Agent Harness.
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

interface HarnessStatus {
  enabled: boolean;
  sandbox: string;
  components: string[];
}

interface Checkpoint { id: string; agentId: string; createdAt: string }
interface Goal { id: string; description: string; status: string; createdAt: string }

type Tab = 'status' | 'terminal' | 'checkpoints' | 'goals';

export default function HarnessPanel() {
  const [tab, setTab] = useState<Tab>('status');
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [cmdOutput, setCmdOutput] = useState<string | null>(null);
  const [cmdLoading, setCmdLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await apiFetch<HarnessStatus>('/api/harness/status');
      setStatus(s);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCheckpoints = useCallback(async () => {
    try {
      const data = await apiFetch<{ checkpoints: Checkpoint[] }>('/api/harness/checkpoints');
      setCheckpoints(data.checkpoints || []);
    } catch { /* ignore */ }
  }, []);

  const loadGoals = useCallback(async () => {
    try {
      const data = await apiFetch<{ goals: Goal[] }>('/api/harness/goals');
      setGoals(data.goals || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (tab === 'checkpoints') void loadCheckpoints();
    if (tab === 'goals') void loadGoals();
  }, [tab, loadCheckpoints, loadGoals]);

  async function runCommand() {
    if (!command.trim()) return;
    setCmdLoading(true);
    setCmdOutput(null);
    try {
      const data = await apiFetch<{ stdout: string; stderr: string; exitCode: number }>(
        '/api/harness/run-command',
        { method: 'POST', body: JSON.stringify({ command, timeout: 10000 }) },
      );
      const out = [
        data.stdout && `STDOUT:\n${data.stdout}`,
        data.stderr && `STDERR:\n${data.stderr}`,
        `Exit code: ${data.exitCode ?? 0}`,
      ].filter(Boolean).join('\n\n');
      setCmdOutput(out);
    } catch (err: unknown) {
      setCmdOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCmdLoading(false);
    }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: 'Status', icon: <Cpu className="h-3.5 w-3.5" /> },
    { id: 'terminal', label: 'Terminal', icon: <Terminal className="h-3.5 w-3.5" /> },
    { id: 'checkpoints', label: 'Checkpoints', icon: <Save className="h-3.5 w-3.5" /> },
    { id: 'goals', label: 'Goals', icon: <Target className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Cpu className="h-5 w-5 text-indigo-500" />
        <h3 className="text-base font-semibold text-token-text-primary">Agent Harness</h3>
        <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-500">
          Face 14
        </span>
      </div>

      {/* Enabled badge */}
      {status && (
        <div className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
          status.enabled
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
        )}>
          {status.enabled ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          Harness {status.enabled ? 'enabled' : 'disabled'}
          {status.sandbox && <span className="ml-auto text-xs opacity-70">Sandbox: {status.sandbox}</span>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-token-border-medium p-1 bg-token-surface-secondary">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-indigo-500 text-white' : 'text-token-text-secondary hover:bg-token-surface-tertiary',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Status tab */}
      {tab === 'status' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-token-text-primary">Active Components</h4>
            <button onClick={() => void loadStatus()} disabled={loading}
              className="flex items-center gap-1 text-xs text-token-text-tertiary hover:text-token-text-secondary">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          </div>

          {loading && !status && (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-token-text-tertiary" /></div>
          )}

          {status && (
            <div className="grid grid-cols-2 gap-1.5">
              {status.components.map(c => (
                <div key={c} className="flex items-center gap-1.5 rounded border border-token-border-medium bg-token-surface-secondary px-2.5 py-1.5 text-xs text-token-text-secondary">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  {c}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Terminal tab */}
      {tab === 'terminal' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            Commands run in the server sandbox. Timeout: 10s. Use for inspection only.
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-token-border-medium bg-token-surface-secondary px-3 py-2 font-mono text-sm">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-token-text-tertiary" />
              <input
                value={command}
                onChange={e => setCommand(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void runCommand(); } }}
                placeholder="pwd / ls / node --version / date"
                className="flex-1 bg-transparent text-token-text-primary placeholder-token-text-tertiary focus:outline-none font-mono"
              />
            </div>
            <button
              onClick={() => void runCommand()}
              disabled={cmdLoading || !command.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {cmdLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
              Run
            </button>
          </div>

          {cmdOutput && (
            <div className="rounded-lg border border-token-border-medium bg-black/80 p-3 font-mono text-xs text-green-400 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
              {cmdOutput}
            </div>
          )}
        </div>
      )}

      {/* Checkpoints tab */}
      {tab === 'checkpoints' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-token-text-primary">Saved Sessions</h4>
            <button onClick={() => void loadCheckpoints()}
              className="flex items-center gap-1 text-xs text-token-text-tertiary hover:text-token-text-secondary">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          {!checkpoints.length && (
            <div className="rounded-lg border border-dashed border-token-border-medium py-8 text-center text-sm text-token-text-tertiary">
              No checkpoints yet. Use POST /api/harness/checkpoint to save agent sessions.
            </div>
          )}
          {checkpoints.map(c => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border border-token-border-medium bg-token-surface-secondary px-3 py-2.5">
              <FileCode className="h-4 w-4 shrink-0 text-indigo-500" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-token-text-primary">{c.id}</p>
                {c.agentId && <p className="text-xs text-token-text-tertiary">Agent: {c.agentId}</p>}
              </div>
              <button className="shrink-0 flex items-center gap-1 rounded border border-indigo-500/40 px-2 py-1 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10">
                <RotateCcw className="h-3 w-3" /> Resume
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Goals tab */}
      {tab === 'goals' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-token-text-primary">Active Goals</h4>
            <button onClick={() => void loadGoals()}
              className="flex items-center gap-1 text-xs text-token-text-tertiary hover:text-token-text-secondary">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          {!goals.length && (
            <div className="rounded-lg border border-dashed border-token-border-medium py-8 text-center text-sm text-token-text-tertiary">
              No goals registered. Use POST /api/harness/goal to register long-running goals.
            </div>
          )}
          {goals.map(g => (
            <div key={g.id} className="rounded-lg border border-token-border-medium bg-token-surface-secondary p-3">
              <div className="flex items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <div className="flex-1">
                  <p className="text-sm text-token-text-primary">{g.description}</p>
                  <p className="mt-1 text-xs text-token-text-tertiary">
                    Status: <span className={cn('font-medium', g.status === 'completed' ? 'text-emerald-500' : g.status === 'failed' ? 'text-red-500' : 'text-amber-500')}>{g.status}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
