import React, { useState } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Globe,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  Users,
  Megaphone,
  BarChart2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * SocialMarketingPanel — Social Marketing Intelligence dashboard.
 * Multi-source social signal monitoring, audience analysis, AI-CMO campaign planning.
 * Settings → AI → Social Marketing.
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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

type Status = 'idle' | 'loading' | 'ok' | 'error';

interface SignalResult {
  topic?: string;
  signals?: unknown[];
  sources?: string[];
  error?: string;
}

interface StrategyResult {
  strategy?: unknown;
  error?: string;
}

export default function SocialMarketingPanel() {
  const [healthStatus, setHealthStatus] = useState<Status>('idle');
  const [signalQuery, setSignalQuery] = useState('');
  const [signalStatus, setSignalStatus] = useState<Status>('idle');
  const [signalResult, setSignalResult] = useState<SignalResult | null>(null);
  const [strategyObj, setStrategyObj] = useState('');
  const [strategyStatus, setStrategyStatus] = useState<Status>('idle');
  const [strategyResult, setStrategyResult] = useState<StrategyResult | null>(null);
  const [signalOpen, setSignalOpen] = useState(true);
  const [strategyOpen, setStrategyOpen] = useState(false);

  async function checkHealth() {
    setHealthStatus('loading');
    try {
      await apiFetch('/api/social-intelligence/health');
      setHealthStatus('ok');
    } catch {
      setHealthStatus('error');
    }
  }

  async function searchSignals() {
    if (!signalQuery.trim()) return;
    setSignalStatus('loading');
    setSignalResult(null);
    try {
      const result = await apiFetch<SignalResult>('/api/social-intelligence/social/search', {
        method: 'POST',
        body: JSON.stringify({ query: signalQuery, options: { limit: 20 } }),
      });
      setSignalResult(result);
      setSignalStatus('ok');
    } catch (err: unknown) {
      setSignalResult({ error: err instanceof Error ? err.message : 'Request failed' });
      setSignalStatus('error');
    }
  }

  async function generateStrategy() {
    if (!strategyObj.trim()) return;
    setStrategyStatus('loading');
    setStrategyResult(null);
    try {
      const result = await apiFetch<StrategyResult>('/api/social-intelligence/marketing/strategy', {
        method: 'POST',
        body: JSON.stringify({ objective: strategyObj }),
      });
      setStrategyResult(result);
      setStrategyStatus('ok');
    } catch (err: unknown) {
      setStrategyResult({ error: err instanceof Error ? err.message : 'Request failed' });
      setStrategyStatus('error');
    }
  }

  function StatusIcon({ s }: { s: Status }) {
    if (s === 'loading') return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (s === 'ok') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (s === 'error') return <XCircle className="h-4 w-4 text-red-500" />;
    return <AlertCircle className="h-4 w-4 text-token-text-tertiary" />;
  }

  return (
    <div className="flex flex-col gap-5 text-sm text-token-text-primary">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
          <TrendingUp className="h-5 w-5 text-indigo-500" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-token-text-primary">Social Marketing Intelligence</span>
          <span className="text-xs text-token-text-tertiary">
            Multi-platform social signals, audience analysis, and AI-CMO campaign planning.
          </span>
        </div>
      </div>

      {/* Health check */}
      <div className="flex items-center justify-between rounded-lg border border-token-border-light bg-token-surface-secondary px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-token-text-tertiary" />
          <span className="text-xs font-medium">Engine status</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon s={healthStatus} />
          <button
            onClick={checkHealth}
            disabled={healthStatus === 'loading'}
            className="rounded px-2 py-1 text-xs font-medium text-indigo-500 hover:bg-indigo-500/10 disabled:opacity-50"
          >
            Check
          </button>
        </div>
      </div>

      {/* Signal search */}
      <div className="rounded-lg border border-token-border-light overflow-hidden">
        <button
          onClick={() => setSignalOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold hover:bg-token-surface-secondary"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            Social Signal Search
          </div>
          {signalOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {signalOpen && (
          <div className="flex flex-col gap-3 border-t border-token-border-light p-3">
            <div className="flex gap-2">
              <input
                value={signalQuery}
                onChange={(e) => setSignalQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchSignals()}
                placeholder="Topic, brand, or keyword…"
                className="flex-1 rounded border border-token-border-light bg-token-surface-secondary px-2.5 py-1.5 text-xs outline-none placeholder:text-token-text-tertiary focus:border-indigo-500"
              />
              <button
                onClick={searchSignals}
                disabled={!signalQuery.trim() || signalStatus === 'loading'}
                className="flex items-center gap-1.5 rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:bg-indigo-600"
              >
                {signalStatus === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart2 className="h-3 w-3" />}
                Search
              </button>
            </div>

            {signalResult && (
              <div className={cn(
                'rounded border p-3 text-xs',
                signalStatus === 'error'
                  ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                  : 'border-token-border-light bg-token-surface-secondary',
              )}>
                {signalResult.error ? (
                  <span>{signalResult.error}</span>
                ) : (
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-token-text-secondary">
                    {JSON.stringify(signalResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI-CMO Strategy */}
      <div className="rounded-lg border border-token-border-light overflow-hidden">
        <button
          onClick={() => setStrategyOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold hover:bg-token-surface-secondary"
        >
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-indigo-400" />
            AI-CMO Strategy Generator
          </div>
          {strategyOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {strategyOpen && (
          <div className="flex flex-col gap-3 border-t border-token-border-light p-3">
            <div className="flex gap-2">
              <input
                value={strategyObj}
                onChange={(e) => setStrategyObj(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && generateStrategy()}
                placeholder="Campaign objective…"
                className="flex-1 rounded border border-token-border-light bg-token-surface-secondary px-2.5 py-1.5 text-xs outline-none placeholder:text-token-text-tertiary focus:border-indigo-500"
              />
              <button
                onClick={generateStrategy}
                disabled={!strategyObj.trim() || strategyStatus === 'loading'}
                className="flex items-center gap-1.5 rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:bg-indigo-600"
              >
                {strategyStatus === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
                Generate
              </button>
            </div>

            {strategyResult && (
              <div className={cn(
                'rounded border p-3 text-xs',
                strategyStatus === 'error'
                  ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                  : 'border-token-border-light bg-token-surface-secondary',
              )}>
                {strategyResult.error ? (
                  <span>{strategyResult.error}</span>
                ) : (
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-token-text-secondary">
                    {JSON.stringify(strategyResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info footer */}
      <p className="text-[11px] leading-relaxed text-token-text-tertiary">
        Connectors: Bluesky, Reddit, HackerNews, Mastodon, YouTube, GitHub, RSS.
        Campaign engine: Strategy · Content · Campaign planning (AI-CMO).
      </p>
    </div>
  );
}
