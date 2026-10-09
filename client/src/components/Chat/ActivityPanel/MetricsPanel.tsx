/**
 * MetricsPanel - Panel de métricas detalladas
 */

import React, { useMemo } from 'react';
import {
  Users,
  Wrench,
  Terminal,
  Cpu,
  FileEdit,
  Activity,
  Server,
} from 'lucide-react';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';
import { useAgentOrchestrator } from '~/hooks/useAgentOrchestrator';
import { useChangeInspector } from '~/hooks/useChangeInspector';
import { useTimeline } from '~/hooks/useTimeline';

/**
 * Formatear duración
 */
function formatDuration(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Fila de métrica
 */
const MetricRow: React.FC<{ 
  label: string; 
  value: number; 
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'purple';
}> = ({ label, value, color }) => (
  <div className="flex justify-between text-sm">
    <span className="text-gray-500">{label}</span>
    <span className={`font-medium ${
      color === 'green' ? 'text-green-500' :
      color === 'yellow' ? 'text-yellow-500' :
      color === 'red' ? 'text-red-500' :
      color === 'blue' ? 'text-blue-500' :
      color === 'purple' ? 'text-purple-500' :
      ''
    }`}>
      {value}
    </span>
  </div>
);

/**
 * Card de métricas
 */
const MetricCard: React.FC<{
  icon: React.ElementType;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}> = ({ icon: Icon, iconColor, title, children }) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
      <Icon size={16} className={iconColor} />
      {title}
    </h4>
    <div className="space-y-2">
      {children}
    </div>
  </div>
);

/**
 * MetricsPanel - Panel de métricas detalladas
 */
export const MetricsPanel: React.FC = () => {
  const { stats: taskStats, terminalEntries, serverStats } = useTaskMonitor();
  const { stats: agentStats } = useAgentOrchestrator();
  const { stats: changeStats } = useChangeInspector();
  const { duration, events } = useTimeline();

  // Calcular eventos por tipo usando useMemo
  const eventsByType = useMemo(() => {
    const counts = { tool: 0, file: 0, command: 0, milestone: 0, agent: 0, other: 0 };
    events.forEach(e => {
      if (e.type in counts) {
        counts[e.type as keyof typeof counts]++;
      } else {
        counts.other++;
      }
    });
    return counts;
  }, [events]);

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Header con métricas principales */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-4 text-white">
        <h3 className="text-lg font-semibold mb-3">Métricas de Sesión</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold">{formatDuration(duration)}</p>
            <p className="text-xs opacity-75">Duración Total</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold">{events.length}</p>
            <p className="text-xs opacity-75">Eventos Totales</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold">{agentStats.totalAgents}</p>
            <p className="text-xs opacity-75">Agentes Creados</p>
          </div>
        </div>
      </div>

      {/* Grid de métricas detalladas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Agentes */}
        <MetricCard icon={Users} iconColor="text-indigo-500" title="Agentes">
          <MetricRow label="Total" value={agentStats.totalAgents} />
          <MetricRow label="Activos" value={agentStats.activeAgents} color="green" />
          <MetricRow label="Completados" value={agentStats.completedAgents} color="blue" />
          <MetricRow label="Fallidos" value={agentStats.failedAgents} color="red" />
          <MetricRow label="Tareas completadas" value={agentStats.completedTasks} color="green" />
          <MetricRow label="Tareas fallidas" value={agentStats.failedTasks} color="red" />
        </MetricCard>

        {/* Herramientas y Terminal */}
        <MetricCard icon={Wrench} iconColor="text-yellow-500" title="Herramientas">
          <MetricRow label="Total" value={taskStats.totalTools} />
          <MetricRow label="En ejecución" value={taskStats.runningTools} color="yellow" />
          <MetricRow label="Fallidas" value={taskStats.failedTools} color="red" />
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
            <MetricRow label="Líneas terminal" value={terminalEntries.length} />
            <MetricRow label="Procesos activos" value={taskStats.activeProcesses} color="blue" />
            <MetricRow label="Procesos completados" value={taskStats.completedProcesses} />
          </div>
        </MetricCard>

        {/* Cambios */}
        <MetricCard icon={FileEdit} iconColor="text-blue-500" title="Cambios de Archivos">
          <MetricRow label="Pendientes" value={changeStats.pending} color="yellow" />
          <MetricRow label="Aprobados" value={changeStats.approved} color="green" />
          <MetricRow label="Rechazados" value={changeStats.rejected} color="red" />
          <MetricRow label="Archivos nuevos" value={changeStats.creates} color="green" />
          <MetricRow label="Archivos modificados" value={changeStats.modifies} color="blue" />
        </MetricCard>

        {/* Eventos */}
        <MetricCard icon={Activity} iconColor="text-gray-500" title="Eventos por Tipo">
          <MetricRow label="Herramientas" value={eventsByType.tool} color="yellow" />
          <MetricRow label="Archivos" value={eventsByType.file} color="blue" />
          <MetricRow label="Comandos" value={eventsByType.command} />
          <MetricRow label="Hitos" value={eventsByType.milestone} color="green" />
          <MetricRow label="Agentes" value={eventsByType.agent} color="purple" />
          <MetricRow label="Otros" value={eventsByType.other} />
        </MetricCard>

        {/* Live server metrics from /api/metrics/summary */}
        {serverStats && (
          <MetricCard icon={Server} iconColor="text-emerald-500" title="Servidor (Live)">
            <MetricRow
              label="Uptime"
              value={(() => {
                const s = (serverStats.system as { uptime?: number })?.uptime ?? 0;
                if (s < 60) return `${s}s` as unknown as number;
                if (s < 3600) return `${Math.floor(s / 60)}m` as unknown as number;
                return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` as unknown as number;
              })()}
              color="green"
            />
            <MetricRow
              label="RAM usada"
              value={Math.round(
                ((serverStats.system as { memory?: { heapUsed?: number } })?.memory?.heapUsed ?? 0) / 1024 / 1024,
              )}
              color="blue"
            />
            <MetricRow
              label="Métricas totales"
              value={(serverStats.total as number) ?? 0}
            />
            <MetricRow
              label="Errores (total)"
              value={
                (serverStats.errors as { total?: number })?.total ?? 0
              }
              color={(serverStats.errors as { total?: number })?.total ? 'red' : undefined}
            />
          </MetricCard>
        )}
      </div>
    </div>
  );
};

export default MetricsPanel;
