import { useState } from 'react';
import { Button, Spinner, TextareaAutosize } from '@librechat/client';
import type { ArchitectPlan, ArchitectPlanResponse } from 'librechat-data-provider';
import { usePlanAgentTaskMutation, useApplyAgentPlanMutation } from '~/data-provider/Agents';
import { groupHeadingClass, ToggleSetting } from './ui';

interface ArchitectPanelProps {
  /** Called once the plan's agents have been created, with the root agent id
   * so the caller can navigate to it / open it for editing. */
  onApplied: (rootAgentId: string) => void;
}

const TOPOLOGY_LABELS: Record<ArchitectPlan['topology'], string> = {
  single: 'Un solo agente',
  chain: 'Cadena secuencial',
  handoff: 'Transferencia entre especialistas',
  subagents: 'Coordinador con subagentes',
};

/**
 * Autonomous multi-agent builder: given a task description, either applies
 * the generated plan directly (automatic) or shows it for review before the
 * user confirms (manual). Skill/plugin installs always require an explicit
 * confirmation click regardless of mode — see DESIGN.md section 5.
 */
export default function ArchitectPanel({ onApplied }: ArchitectPanelProps) {
  const [task, setTask] = useState('');
  const [autoMode, setAutoMode] = useState(true);
  const [planResponse, setPlanResponse] = useState<ArchitectPlanResponse | null>(null);
  const [confirmedInstalls, setConfirmedInstalls] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const planMutation = usePlanAgentTaskMutation({
    onSuccess: (data) => {
      setPlanResponse(data);
      setError(null);
      // In automatic mode, apply right away UNLESS an install still needs
      // confirmation — installing third-party code is never silent.
      const needsConfirmation = data.resolution.some((r) => r.status === 'installable');
      if (autoMode && !needsConfirmation) {
        applyMutation.mutate({ plan: data.plan });
      }
    },
    onError: (err) => setError(err.message),
  });

  const applyMutation = useApplyAgentPlanMutation({
    onSuccess: (data) => onApplied(data.root_agent_id),
    onError: (err) => setError(err.message),
  });

  const handleGenerate = () => {
    if (!task.trim()) return;
    setPlanResponse(null);
    setError(null);
    planMutation.mutate({ task: task.trim() });
  };

  const handleApply = () => {
    if (!planResponse) return;
    applyMutation.mutate({
      plan: planResponse.plan,
      confirmed_installs: Array.from(confirmedInstalls),
    });
  };

  const installable = planResponse?.resolution.filter((r) => r.status === 'installable') ?? [];
  const allInstallsConfirmed = installable.every((r) => confirmedInstalls.has(r.capability));
  const isBusy = planMutation.isLoading || applyMutation.isLoading;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border-light p-3">
      <div className="flex items-center justify-between gap-3">
        <span className={groupHeadingClass}>Constructor autónomo de agentes</span>
        <ToggleSetting
          id="architect-auto-mode"
          label={autoMode ? 'Automático' : 'Manual'}
          checked={autoMode}
          onCheckedChange={setAutoMode}
          info="Automático: el sistema decide cuántos agentes crear, sus tareas y herramientas, y los crea directamente (salvo instalar algo nuevo, que siempre pide confirmación). Manual: revisas y editas el plan antes de aplicarlo."
        />
      </div>

      <TextareaAutosize
        aria-label="Task description"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="Describe la tarea, ej: 'Investiga competidores de mi producto, arma un resumen y genera un reporte en PDF'"
        className="w-full resize-none rounded-md border border-border-light bg-surface-secondary p-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        rows={2}
      />

      <div className="flex justify-end">
        <Button size="sm" disabled={!task.trim() || isBusy} onClick={handleGenerate}>
          {planMutation.isLoading ? <Spinner className="size-4" /> : 'Generar plan'}
        </Button>
      </div>

      {error != null && <p className="text-xs text-red-500">{error}</p>}

      {planResponse != null && (
        <div className="flex flex-col gap-3 border-t border-border-light pt-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {TOPOLOGY_LABELS[planResponse.plan.topology]}
            </p>
            <p className="text-sm text-text-primary">{planResponse.plan.summary}</p>
          </div>

          <ul className="flex flex-col gap-2">
            {planResponse.plan.agents.map((agent) => (
              <li
                key={agent.key}
                className="rounded-md border border-border-light bg-surface-secondary p-2 text-sm"
              >
                <p className="font-medium text-text-primary">
                  {agent.name}
                  {agent.is_root && (
                    <span className="ml-1.5 text-[10px] uppercase text-text-secondary">
                      (entrada)
                    </span>
                  )}
                </p>
                <p className="text-xs text-text-secondary">{agent.role_description}</p>
                {agent.tools.length > 0 && (
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    Herramientas: {agent.tools.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {installable.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Este plan necesita instalar skills nuevas — confírmalas antes de continuar:
              </p>
              {installable.map((r) => (
                <label key={r.capability} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={confirmedInstalls.has(r.capability)}
                    onChange={(e) => {
                      setConfirmedInstalls((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.capability);
                        else next.delete(r.capability);
                        return next;
                      });
                    }}
                  />
                  {r.capability}
                  {r.source && <span className="text-text-tertiary">({r.source})</span>}
                </label>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={isBusy || (installable.length > 0 && !allInstallsConfirmed)}
              onClick={handleApply}
            >
              {applyMutation.isLoading ? (
                <Spinner className="size-4" />
              ) : autoMode ? (
                'Confirmar e instalar'
              ) : (
                'Crear agentes'
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
