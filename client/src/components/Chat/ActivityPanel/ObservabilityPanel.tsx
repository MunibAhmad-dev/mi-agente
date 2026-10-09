import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useAgentRuntimeTraces } from '~/data-provider/AgentRuntime/queries';
import { cn } from '~/utils';
import type { AgentRuntimeTrace } from 'librechat-data-provider';

interface Props {
  className?: string;
}

function timeAgo(ts: string | number | undefined): string {
  if (!ts) return '—';
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function statusColor(status: string | undefined): string {
  if (status === 'completed' || status === 'success') return 'text-emerald-500';
  if (status === 'failed' || status === 'error') return 'text-red-500';
  if (status === 'running' || status === 'active') return 'text-amber-400';
  return 'text-gray-400';
}

function statusDot(status: string | undefined): string {
  if (status === 'completed' || status === 'success') return 'bg-emerald-500';
  if (status === 'failed' || status === 'error') return 'bg-red-500';
  if (status === 'running' || status === 'active') return 'bg-amber-400 animate-pulse';
  return 'bg-gray-400';
}

const TraceRow: React.FC<{ trace: AgentRuntimeTrace }> = ({ trace }) => {
  const [open, setOpen] = useState(false);
  const t = trace as unknown as Record<string, unknown>;
  const steps = (t['steps'] as unknown[]) ?? [];
  const status = t['status'] as string | undefined;
  const startTime = t['startTime'] ?? t['timestamp'] ?? t['createdAt'];
  const duration = t['duration'] as number | undefined;
  const model = t['model'] as string | undefined;
  const task = (t['task'] ?? t['message'] ?? t['prompt'] ?? '') as string;

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', statusDot(status))} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {task || (t['id'] as string) || 'Trace'}
          </p>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-400">
            {model && <span className="font-mono">{model}</span>}
            {steps.length > 0 && <span>{steps.length} steps</span>}
            {duration != null && <span>{duration}ms</span>}
            <span className="flex items-center gap-1">
              <Clock size={9} />
              {timeAgo(startTime as string | number | undefined)}
            </span>
          </div>
        </div>
        <span className={cn('text-[10px] font-medium shrink-0', statusColor(status))}>
          {status ?? '—'}
        </span>
        {steps.length > 0 &&
          (open ? <ChevronDown size={12} className="text-gray-400 shrink-0 mt-0.5" /> : <ChevronRight size={12} className="text-gray-400 shrink-0 mt-0.5" />)}
      </button>

      {open && steps.length > 0 && (
        <div className="pl-7 pr-3 pb-2 space-y-1">
          {(steps as Record<string, unknown>[]).map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusDot(step['status'] as string))} />
              <span className="font-mono truncate">{(step['tool'] ?? step['name'] ?? step['type'] ?? `step ${i + 1}`) as string}</span>
              {step['duration'] != null && <span className="text-gray-400">{step['duration'] as number}ms</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export function ObservabilityPanel({ className }: Props) {
  const { data, isLoading, error } = useAgentRuntimeTraces();
  const traces = (data?.traces ?? []) as AgentRuntimeTrace[];

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-indigo-500" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Observability</span>
        </div>
        <span className="text-[10px] text-gray-400">
          {isLoading ? 'refreshing…' : `${traces.length} trace${traces.length !== 1 ? 's' : ''} · live 5s`}
        </span>
      </div>

      {error != null && (
        <div className="m-3 rounded bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {(error as Error).message ?? 'Failed to load traces'}
        </div>
      )}

      {!isLoading && traces.length === 0 && !error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <Activity size={28} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400">No traces yet</p>
          <p className="text-xs text-gray-300 dark:text-gray-600">Traces appear here as the agent runs tasks</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
        {traces.map((trace, i) => (
          <TraceRow key={(trace as unknown as Record<string, unknown>)['id'] as string ?? i} trace={trace} />
        ))}
      </div>
    </div>
  );
}
