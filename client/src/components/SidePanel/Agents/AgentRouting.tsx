/**
 * AgentRouting — Model Routing del agente (FASE 23 + FASE 25).
 *
 * Control visible en la parte superior del panel de Agentes:
 *   - MANUAL (por defecto): el agente usa SIEMPRE el modelo que el usuario elige
 *     en "Modelo" (conexión directa con el LLM seleccionado).
 *   - AUTOMÁTICO: el servidor elige el modelo según la complejidad de cada tarea
 *     entre tres niveles (pequeño / mediano / grande), con presupuesto de
 *     contexto (FASE 25). Si un nivel está vacío, se usa el modelo del agente.
 *
 * FASE 25:
 *   - "Rellenar niveles por defecto": botón que asigna automáticamente el modelo
 *     más pequeño / mediano / grande del proveedor (heurística por parámetros del
 *     nombre, honesta: modelos sin tamaño detectable se ordenan al final).
 *   - Métricas: contadores de uso del routing (total, por tier, fallbacks, último
 *     modelo y fecha) con acción para reiniciarlas.
 *
 * La preferencia se persiste por agente en el backend (PUT /api/agents/routing/:id).
 */

import { useEffect, useState } from 'react';
import { useWatch, useFormContext } from 'react-hook-form';
import { Cpu, Wand2, RotateCcw } from 'lucide-react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';
import { authFetch } from '~/hooks/useSoundSystem';
import type { AgentForm } from '~/common';

interface RoutingState {
  mode: 'manual' | 'auto';
  tiers: { small: string; medium: string; large: string };
}

interface RoutingMetrics {
  total: number;
  byTier: Record<string, number>;
  fallbacks: number;
  lastRoutedModel: string | null;
  lastTier: string | null;
  lastAt: string | null;
}

const DEFAULT_STATE: RoutingState = {
  mode: 'manual',
  tiers: { small: '', medium: '', large: '' },
};

const EMPTY_METRICS: RoutingMetrics = {
  total: 0,
  byTier: {},
  fallbacks: 0,
  lastRoutedModel: null,
  lastTier: null,
  lastAt: null,
};

const TIERS = [
  { key: 'small', label: '⚡ Pequeño — tareas simples', hint: 'consultas cortas' },
  { key: 'medium', label: '🔶 Mediano — tareas técnicas', hint: 'código, sql, workflows' },
  { key: 'large', label: '🧠 Grande — razonamiento profundo', hint: 'refactor, auditoría, análisis' },
] as const;

type TierKey = (typeof TIERS)[number]['key'];

/** Extrae el tamaño aproximado en parámetros (B) del nombre del modelo, si es detectable. */
function modelSize(model: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*[bB]\b/.exec(model);
  if (!m) {
    return null;
  }
  return Number(m[1]);
}

/** Autollenado honesto: modelos sin tamaño detectable van al final (se estiman grandes). */
function suggestTiers(models: string[]): { small: string; medium: string; large: string } {
  const withSize: { name: string; size: number }[] = [];
  const withoutSize: string[] = [];
  for (const name of models) {
    const size = modelSize(name);
    if (size != null) {
      withSize.push({ name, size });
    } else {
      withoutSize.push(name);
    }
  }
  withSize.sort((a, b) => a.size - b.size);
  const ordered = [...withSize.map((m) => m.name), ...withoutSize];
  if (ordered.length === 0) {
    return { small: '', medium: '', large: '' };
  }
  const small = ordered[0];
  const medium = ordered[Math.floor((ordered.length - 1) / 2)] ?? ordered[0];
  const large = ordered[ordered.length - 1];
  return { small, medium, large };
}

export default function AgentRouting() {
  const localize = useLocalize();
  const { control } = useFormContext<AgentForm>();
  const agentId = useWatch({ control, name: 'id' });
  const provider = useWatch({ control, name: 'provider' });
  const model = useWatch({ control, name: 'model' });
  const { data: modelsData = {} } = useGetModelsQuery();

  const [state, setState] = useState<RoutingState>(DEFAULT_STATE);
  const [metrics, setMetrics] = useState<RoutingMetrics>(EMPTY_METRICS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const providerKey =
    typeof provider === 'string' ? provider : ((provider as { value?: string } | null)?.value ?? '');
  const providerModels = (modelsData as Record<string, string[]>)[providerKey] ?? [];

  useEffect(() => {
    if (!agentId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const res = await authFetch(`/api/agents/routing/${encodeURIComponent(agentId)}`, {
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const d = await res.json();
          if (!cancelled && d?.routing) {
            setState({
              mode: d.routing.mode === 'auto' ? 'auto' : 'manual',
              tiers: {
                small: d.routing.tiers?.small ?? '',
                medium: d.routing.tiers?.medium ?? '',
                large: d.routing.tiers?.large ?? '',
              },
            });
            if (d.routing.metrics) {
              setMetrics(d.routing.metrics);
            }
          }
        }
      } catch {
        /* sin conexión — se mantiene el estado local */
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const save = async (next: RoutingState, resetMetrics = false) => {
    setState(next);
    if (!agentId) {
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...next };
      if (resetMetrics) {
        body.resetMetrics = true;
        setMetrics(EMPTY_METRICS);
      }
      const res = await authFetch(`/api/agents/routing/${encodeURIComponent(agentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.routing?.metrics) {
          setMetrics(d.routing.metrics);
        }
      }
    } catch {
      /* se reintenta en el siguiente cambio */
    } finally {
      setSaving(false);
    }
  };

  const setMode = (mode: 'manual' | 'auto') => save({ ...state, mode });
  const setTier = (tier: TierKey, value: string) =>
    save({ ...state, tiers: { ...state.tiers, [tier]: value } });
  const autofill = () => {
    const tiers = suggestTiers(providerModels);
    save({ ...state, tiers });
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) {
      return '—';
    }
    try {
      return new Date(iso).toLocaleString([], {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="rounded-lg border border-border-light bg-surface-secondary p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <Cpu className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
          {localize('com_agents_routing_label')}
          {saving && <span className="text-[10px] text-text-tertiary">…</span>}
        </div>
        <div
          className="flex items-center rounded-full bg-surface-tertiary p-0.5 text-[11px]"
          role="radiogroup"
          aria-label={localize('com_agents_routing_label')}
        >
          <button
            type="button"
            role="radio"
            aria-checked={state.mode === 'manual'}
            onClick={() => setMode('manual')}
            className={cn(
              'rounded-full px-2.5 py-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
              state.mode === 'manual'
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            Manual
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={state.mode === 'auto'}
            onClick={() => setMode('auto')}
            className={cn(
              'rounded-full px-2.5 py-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
              state.mode === 'auto'
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            Automático
          </button>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-text-secondary">
        {state.mode === 'auto'
          ? 'El servidor elige el modelo según la complejidad y el presupuesto de contexto. Niveles vacíos usan el modelo del agente.'
          : 'El agente usa siempre el modelo que eliges en «Modelo» (conexión directa con tu LLM).'}
      </p>
      {state.mode === 'auto' && !agentId && (
        <p className="mt-1.5 rounded-md bg-surface-tertiary/60 px-2 py-1.5 text-[10px] text-text-secondary">
          Selecciona un agente para configurar los modelos por nivel (Pequeño / Mediano / Grande).
        </p>
      )}
      {state.mode === 'auto' && agentId && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-border-light pt-2">
          {TIERS.map((tier) => (
            <label
              key={tier.key}
              className="flex items-center justify-between gap-2 text-[11px] text-text-secondary"
            >
              <span className="min-w-0">
                <span className="block truncate">{tier.label}</span>
                <span className="block text-[10px] text-text-tertiary">{tier.hint}</span>
              </span>
              <select
                value={state.tiers[tier.key]}
                onChange={(e) => setTier(tier.key, e.target.value)}
                className="h-6 max-w-40 rounded-md border border-border-light bg-surface-secondary px-1 text-[11px] text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Modelo ${tier.label}`}
              >
                <option value="">Modelo del agente</option>
                {providerModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={autofill}
              disabled={providerModels.length === 0}
              className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-[10px] text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
              aria-label="Rellenar niveles por defecto con los modelos del proveedor"
            >
              <Wand2 className="size-3" aria-hidden="true" />
              Rellenar niveles por defecto
            </button>
            <span className="text-[10px] text-text-tertiary">
              Modelo actual del agente: {model || '—'}
            </span>
          </div>

          {/* Métricas de uso del routing (FASE 25) */}
          <div className="mt-1 rounded-md border border-border-light bg-surface-tertiary/40 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                Métricas de routing
              </p>
              <button
                type="button"
                onClick={() => save(state, true)}
                disabled={metrics.total === 0}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-40"
                aria-label="Reiniciar métricas de routing"
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                Reiniciar
              </button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-text-secondary">
              <span>Total: <strong className="text-text-primary">{metrics.total}</strong></span>
              <span>
                Pequeño: <strong className="text-text-primary">{metrics.byTier?.small ?? 0}</strong>
              </span>
              <span>
                Mediano: <strong className="text-text-primary">{metrics.byTier?.medium ?? 0}</strong>
              </span>
              <span>
                Grande: <strong className="text-text-primary">{metrics.byTier?.large ?? 0}</strong>
              </span>
              <span>
                Fallbacks: <strong className="text-text-primary">{metrics.fallbacks ?? 0}</strong>
              </span>
              <span>
                Último modelo: <strong className="max-w-28 truncate align-bottom font-normal text-text-primary">{metrics.lastRoutedModel || '—'}</strong>
              </span>
              <span className="col-span-2">
                Última resolución: <strong className="font-normal text-text-primary">{fmtDate(metrics.lastAt)}</strong>{' '}
                {metrics.lastTier ? `(tier ${metrics.lastTier})` : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
