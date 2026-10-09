/**
 * HealthDashboardPanel — Face: Runtime Health (checklist p2-7)
 *
 * Polls GET /health every 30 seconds and shows DB / Redis / uptime.
 * Green dot = connected, red = disconnected, pulsing = checking.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Database, Zap, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '~/utils';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: string;
  redis: string;
  uptime: number;
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={cn(
      'inline-block w-2 h-2 rounded-full shrink-0',
      ok ? 'bg-green-500' : 'bg-red-500',
    )} />
  );
}

interface ServiceRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
}

function ServiceRow({ icon, label, value, ok }: ServiceRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <span className="text-gray-400 dark:text-gray-500 shrink-0">{icon}</span>
      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn(
          'text-xs font-mono',
          ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
        )}>
          {value}
        </span>
        <StatusDot ok={ok} />
      </div>
    </div>
  );
}

export function HealthDashboardPanel({ className }: { className?: string }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/health', { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: HealthResponse = await resp.json();
      setHealth(json);
      setLastChecked(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Health check failed');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [check]);

  const dbOk = health?.db === 'connected';
  const redisOk = health?.redis === 'connected';
  const allOk = health?.status === 'ok';

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header status */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800',
        allOk ? 'bg-green-50 dark:bg-green-950/20' : error ? 'bg-red-50 dark:bg-red-950/20' : 'bg-yellow-50 dark:bg-yellow-950/20',
      )}>
        {loading ? (
          <RefreshCw size={15} className="text-blue-500 animate-spin shrink-0" />
        ) : error ? (
          <AlertCircle size={15} className="text-red-500 shrink-0" />
        ) : allOk ? (
          <CheckCircle2 size={15} className="text-green-500 shrink-0" />
        ) : (
          <AlertCircle size={15} className="text-yellow-500 shrink-0" />
        )}

        <span className={cn(
          'text-sm font-semibold',
          error ? 'text-red-600 dark:text-red-400'
          : allOk ? 'text-green-700 dark:text-green-400'
          : 'text-yellow-700 dark:text-yellow-400',
        )}>
          {loading ? 'Checking…'
           : error ? 'Unreachable'
           : allOk ? 'All Systems Operational'
           : 'Degraded'}
        </span>

        <button
          onClick={check}
          disabled={loading}
          className="ml-auto p-1.5 rounded hover:bg-white/60 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          title="Refresh now"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Services */}
      {health && (
        <>
          <ServiceRow
            icon={<Database size={14} />}
            label="MongoDB"
            value={health.db}
            ok={dbOk}
          />
          <ServiceRow
            icon={<Zap size={14} />}
            label="Redis"
            value={health.redis}
            ok={redisOk}
          />
          <ServiceRow
            icon={<Clock size={14} />}
            label="Uptime"
            value={formatUptime(health.uptime)}
            ok={true}
          />
        </>
      )}

      {error && !loading && (
        <div className="m-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {lastChecked && (
        <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 font-mono">
          Last checked: {lastChecked.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

export default HealthDashboardPanel;
