/**
 * OverviewPanel - Dashboard unificado con métricas rápidas
 */

import React from 'react';
import {
  Users,
  Wrench,
  Terminal,
  FileEdit,
  Radio,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';
import { useAgentOrchestrator } from '~/hooks/useAgentOrchestrator';
import { useChangeInspector } from '~/hooks/useChangeInspector';
import { useTimeline } from '~/hooks/useTimeline';
import { cn } from '~/utils';

/**
 * Formatear duración
 */
function formatDuration(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * OverviewPanel - Panel de vista general
 */
export const OverviewPanel: React.FC = () => {
  const { stats: taskStats, terminalEntries, serverStats } = useTaskMonitor();
  const { stats: agentStats, agents, isOrchestrating } = useAgentOrchestrator();
  const { stats: changeStats } = useChangeInspector();
  const { events } = useTimeline();

  // Agentes en ejecución
  const runningAgents = agents.filter(a => 
    !['idle', 'completed', 'failed', 'cancelled'].includes(a.state)
  );

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Header de estado global */}
      <div className={cn(
        'rounded-lg p-4 text-white',
        isOrchestrating ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-gray-500 to-gray-600'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isOrchestrating ? (
              <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
            ) : (
              <TrendingUp size={20} />
            )}
            <div>
              <p className="font-semibold">
                {isOrchestrating ? 'Orquestación Activa' : 'Sistema en Espera'}
              </p>
              <p className="text-sm opacity-75">
                {runningAgents.length} agente(s) ejecutando
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">
              {serverStats?.system
                ? formatDuration((serverStats.system as { uptime: number }).uptime * 1000)
                : '—'}
            </p>
            <p className="text-xs opacity-75">Uptime</p>
          </div>
        </div>

        {/* Progreso global */}
        {isOrchestrating && (
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1">
              <span>Progreso</span>
              <span>{(agentStats.globalProgress * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all"
                style={{ width: `${agentStats.globalProgress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Grid de métricas rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Agentes */}
        <MetricCard
          icon={Users}
          iconColor="text-indigo-500"
          label="Agentes"
          value={agentStats.totalAgents}
          subValue={agentStats.activeAgents > 0 ? `+${agentStats.activeAgents}` : undefined}
          subValueColor="text-green-500"
        />

        {/* Herramientas */}
        <MetricCard
          icon={Wrench}
          iconColor="text-yellow-500"
          label="Herramientas"
          value={taskStats.totalTools}
          subValue={taskStats.runningTools > 0 ? `${taskStats.runningTools} active` : undefined}
          subValueColor="text-yellow-500"
        />

        {/* Terminal */}
        <MetricCard
          icon={Terminal}
          iconColor="text-gray-500"
          label="Terminal"
          value={taskStats.terminalEntries}
          suffix="líneas"
        />

        {/* Cambios */}
        <MetricCard
          icon={FileEdit}
          iconColor="text-blue-500"
          label="Cambios"
          value={changeStats.pending}
          subValue="pendientes"
          subValueColor="text-yellow-500"
        />
      </div>

      {/* Sección de Agentes Activos */}
      {runningAgents.length > 0 && (
        <ActiveAgentsCard agents={runningAgents} />
      )}

      {/* Sección de Últimos Eventos */}
      <RecentEventsCard events={events} />

      {/* Barra de recursos simplificada */}
      <StateSummaryCard
        completedTasks={agentStats.completedTasks}
        failedTasks={agentStats.failedTasks}
        approvedChanges={changeStats.approved}
        pendingChanges={changeStats.pending}
        rejectedChanges={changeStats.rejected}
      />
    </div>
  );
};

/**
 * MetricCard - Tarjeta de métrica
 */
const MetricCard: React.FC<{
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: number;
  subValue?: string | number;
  subValueColor?: string;
  suffix?: string;
}> = ({ icon: Icon, iconColor, label, value, subValue, subValueColor, suffix }) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={16} className={iconColor} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
      {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      {subValue !== undefined && (
        <span className={cn('text-sm', subValueColor || 'text-gray-500')}>
          ({subValue})
        </span>
      )}
    </div>
  </div>
);

/**
 * ActiveAgentsCard - Tarjeta de agentes activos
 */
const ActiveAgentsCard: React.FC<{ agents: any[] }> = ({ agents }) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
      <Radio size={16} className="text-green-500 animate-pulse" />
      Agentes Activos
    </h3>
    <div className="space-y-2">
      {agents.slice(0, 5).map((agent) => (
        <div key={agent.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
          <div className="flex items-center gap-2">
            <span className={cn(
              'w-2 h-2 rounded-full',
              agent.state === 'executing' && 'bg-blue-500 animate-pulse',
              agent.state === 'thinking' && 'bg-yellow-500 animate-pulse',
              agent.state === 'waiting' && 'bg-purple-500 animate-pulse',
            )} />
            <span className="text-sm font-medium">{agent.name}</span>
            <span className="text-xs text-gray-500">{agent.state}</span>
          </div>
          {agent.currentTask && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500"
                  style={{ width: `${agent.currentTask.progress * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {(agent.currentTask.progress * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      ))}
      {agents.length > 5 && (
        <p className="text-xs text-gray-500 text-center">
          +{agents.length - 5} más...
        </p>
      )}
    </div>
  </div>
);

/**
 * RecentEventsCard - Tarjeta de últimos eventos
 */
const RecentEventsCard: React.FC<{ events: any[] }> = ({ events }) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
      <Clock size={16} className="text-gray-500" />
      Últimos Eventos
    </h3>
    <div className="space-y-1 max-h-48 overflow-auto">
      {events.slice(-10).reverse().map((event, i) => (
        <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
          <span className="text-gray-400 w-20">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
          <span className={cn(
            'px-1.5 py-0.5 rounded text-xs',
            event.type === 'tool' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
            event.type === 'file' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
            event.type === 'milestone' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
            event.type === 'command' && 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400',
          )}>
            {event.type}
          </span>
          <span className="flex-1 truncate text-gray-600 dark:text-gray-400">
            {event.message}
          </span>
        </div>
      ))}
      {events.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">Sin eventos aún</p>
      )}
    </div>
  </div>
);

/**
 * StateSummaryCard - Tarjeta de resumen de estado
 */
const StateSummaryCard: React.FC<{
  completedTasks: number;
  failedTasks: number;
  approvedChanges: number;
  pendingChanges: number;
  rejectedChanges: number;
}> = ({
  completedTasks,
  failedTasks,
  approvedChanges,
  pendingChanges,
  rejectedChanges,
}) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
      <TrendingUp size={16} className="text-gray-500" />
      Resumen de Estado
    </h3>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-gray-500 mb-1">Tareas</p>
        <div className="flex gap-4 text-sm">
          <span className="text-green-500">✓ {completedTasks}</span>
          <span className="text-red-500">✗ {failedTasks}</span>
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1">Cambios</p>
        <div className="flex gap-4 text-sm">
          <span className="text-green-500">✓ {approvedChanges}</span>
          <span className="text-yellow-500">⏳ {pendingChanges}</span>
          <span className="text-red-500">✗ {rejectedChanges}</span>
        </div>
      </div>
    </div>
  </div>
);

export default OverviewPanel;
