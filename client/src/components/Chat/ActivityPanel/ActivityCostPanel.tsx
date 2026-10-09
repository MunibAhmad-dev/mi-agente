/**
 * ActivityCostPanel — Ventana #2: Activity feed en tiempo real con coste.
 * Consume las trazas de observability (F13) vía /api/agent-runtime/observability
 * y muestra cada traza con sus totales (tokens, duración, errores) y un coste
 * estimado por agente/tool.
 *
 * El coste se calcula con una tarifa configurable por modelo (USD por 1K tokens).
 */
import React, { useMemo } from 'react';
import { Activity, DollarSign, Clock, Cpu, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '~/utils';
import { useAgentRuntimeTraces } from '~/data-provider/AgentRuntime/queries';
import type { AgentRuntimeTrace } from 'librechat-data-provider';

// Tarifa estimada USD por 1K tokens (input+output combinado).
const MODEL_RATES: Record<string, number> = {
  deepseek: 0.0014,
  claude: 0.015,
  gpt: 0.01,
  default: 0.005,
};

function estimateCost(trace: AgentRuntimeTrace): number {
  const tokens = (trace.totals?.tokensIn ?? 0) + (trace.totals?.tokensOut ?? 0);
  const rate = MODEL_RATES[trace.modelId?.toLowerCase()] ?? MODEL_RATES.default;
  return (tokens / 1000) * rate;
}

function formatDuration(ms?: number): string {
  if (!ms) {
    return '—';
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  let color = 'bg-gray-400';
  if (status === 'completed') {
    color = 'bg-green-500';
  } else if (status === 'running') {
    color = 'bg-yellow-500 animate-pulse';
  } else if (status === 'failed') {
    color = 'bg-red-500';
  }
  return <span className={cn('inline-block h-2 w-2 rounded-full', color)} />;
};

interface ActivityCostPanelProps {
  className?: string;
}

export const ActivityCostPanel: React.FC<ActivityCostPanelProps> = ({ className }) => {
  const { data, isLoading } = useAgentRuntimeTraces();
  const traces = data?.traces ?? [];

  const totals = useMemo(() => {
    const cost = traces.reduce((sum, t) => sum + estimateCost(t), 0);
    const tokens = traces.reduce(
      (sum, t) => sum + (t.totals?.tokensIn ?? 0) + (t.totals?.tokensOut ?? 0),
      0,
    );
    const errors = traces.reduce((sum, t) => sum + (t.totals?.errors ?? 0), 0);
    const toolCalls = traces.reduce((sum, t) => sum + (t.totals?.toolCalls ?? 0), 0);
    return { cost, tokens, errors, toolCalls, count: traces.length };
  }, [traces]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header con totales */}
      <div className="border-b border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-2 flex items-center gap-2">
          <Activity size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Actividad y coste
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-gray-400">
              <DollarSign size={10} /> Coste
            </span>
            <span className="font-medium text-green-600 dark:text-green-400">
              ${totals.cost.toFixed(4)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-gray-400">
              <Cpu size={10} /> Tokens
            </span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {totals.tokens.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-gray-400">
              <Clock size={10} /> Trazas
            </span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{totals.count}</span>
          </div>
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-gray-400">
              <AlertTriangle size={10} /> Errores
            </span>
            <span
              className={cn(
                'font-medium',
                totals.errors > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300',
              )}
            >
              {totals.errors}
            </span>
          </div>
        </div>
      </div>

      {/* Feed de actividad */}
      <div className="flex-1 overflow-auto">
        {traces.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <Activity size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Sin actividad registrada</p>
            <p className="mt-1 text-xs">
              Las trazas de ejecución aparecerán aquí (F13 observability)
            </p>
          </div>
        ) : (
          traces.map((trace) => {
            const cost = estimateCost(trace);
            const tokens = (trace.totals?.tokensIn ?? 0) + (trace.totals?.tokensOut ?? 0);
            return (
              <div
                key={trace.traceId}
                className="border-b border-gray-100 px-3 py-2 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              >
                <div className="flex items-center gap-2">
                  <StatusDot status={trace.status} />
                  <span className="flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                    {trace.task || '(sin tarea)'}
                  </span>
                  <span className="text-xs tabular-nums text-green-600 dark:text-green-400">
                    ${cost.toFixed(4)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
                    {trace.modelId}
                  </span>
                  <span>{tokens.toLocaleString()} tokens</span>
                  <span>{formatDuration(trace.durationMs)}</span>
                  {(trace.totals?.toolCalls ?? 0) > 0 && (
                    <span>{trace.totals.toolCalls} tools</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ActivityCostPanel;
