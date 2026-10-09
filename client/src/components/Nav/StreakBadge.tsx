import { useCallback, useEffect, useState } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import { Flame, Gift } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * StreakBadge — FASE 27 + FASE 28.
 * Muestra la racha de días de uso del usuario (como en la captura):
 *   🔥 N day streak  ●●●●○○○
 *   🎁 N más días para desbloquear +1 sesión extra al día
 * FASE 28: expone `giftReady`/`giftClaimed` para que el menú de usuario
 * muestre el modal de celebración cuando se alcanza un hito sin reclamar.
 */

export interface StreakData {
  streak: number;
  bestStreak: number;
  totalActiveDays: number;
  lastActiveDate?: string | null;
  milestone: number;
  daysToUnlock: number;
  weekProgress: number;
  unlocked: boolean;
  giftClaimed?: boolean;
  giftReady?: boolean;
  // FASE 29 — sesiones extra reales.
  extraSessionsPerDay?: number;
  dailySessionLimit?: number;
  sessionsUsedToday?: number;
  remainingToday?: number;
}

function authToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length);
    }
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

const EMPTY: StreakData = {
  streak: 0,
  bestStreak: 0,
  totalActiveDays: 0,
  milestone: 7,
  daysToUnlock: 7,
  weekProgress: 0,
  unlocked: false,
  giftClaimed: false,
  giftReady: false,
};

export function useUserStreak() {
  const [data, setData] = useState<StreakData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/streak', {
        headers: { Authorization: `Bearer ${authToken() ?? ''}` },
      });
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      if (json && typeof json.streak === 'number') {
        setData(json);
      }
    } catch {
      /* sin racha → se omite */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, reload: load };
}

function StreakBadge() {
  const localize = useLocalize();
  const { data, loading, reload } = useUserStreak();
  const [limitDraft, setLimitDraft] = useState<string>(
    data.dailySessionLimit != null && data.dailySessionLimit >= 0
      ? String(data.dailySessionLimit)
      : '',
  );
  const [savingLimit, setSavingLimit] = useState(false);

  const saveLimit = async () => {
    const val = limitDraft.trim();
    if (val === '' || Number.isNaN(Number(val))) {
      return;
    }
    setSavingLimit(true);
    try {
      const res = await fetch('/api/streak/limit', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken() ?? ''}`,
        },
        body: JSON.stringify({ dailySessionLimit: Number(val) }),
      });
      if (res.ok) {
        await reload();
      }
    } catch {
      /* silencioso */
    } finally {
      setSavingLimit(false);
    }
  };

  if (loading || data.streak <= 0) {
    return null;
  }

  const totalDots = Math.max(data.milestone, 1);
  const filled = Math.min(data.weekProgress || data.streak, totalDots);
  const giftLabel = data.unlocked
    ? localize('com_nav_streak_unlocked') ||
      '¡Hito alcanzado! +1 sesión extra al día desbloqueada.'
    : localize('com_nav_streak_gift', { count: data.daysToUnlock }) ||
      `${data.daysToUnlock} más días para desbloquear +1 sesión extra cada día`;

  // FASE 29 — sesiones extra reales: límite + bonus + uso de hoy.
  const extra = data.extraSessionsPerDay || 0;
  const used = data.sessionsUsedToday ?? 0;
  const hasLimit = (data.dailySessionLimit ?? -1) >= 0;
  const remaining = data.remainingToday ?? -1;
  const sessionLabel = hasLimit
    ? `${used} usadas hoy · ${remaining} restantes (límite ${data.dailySessionLimit} + ${extra} extra)`
    : extra > 0
      ? `+${extra} sesión(es) extra al día · ${used} usadas hoy`
      : null;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="flex items-center gap-1.5 text-sm text-text-primary">
        <Flame className="size-3.5 shrink-0 text-orange-500" aria-hidden="true" />
        <span>
          {localize('com_nav_streak_days', { count: data.streak }) ||
            `${data.streak} ${data.streak === 1 ? 'day' : 'days'} streak`}
        </span>
        <span className="ml-auto flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: totalDots }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'size-1.5 rounded-full',
                i < filled ? 'bg-text-primary' : 'border border-text-secondary',
              )}
            />
          ))}
        </span>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-text-secondary">
        <Gift className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{giftLabel}</span>
      </p>
      {sessionLabel && (
        <p className="flex items-start gap-1.5 text-xs text-text-secondary">
          <Gift className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span>{sessionLabel}</span>
        </p>
      )}
      {extra > 0 && (
        <div className="flex items-center gap-1.5 pt-1 text-xs text-text-secondary">
          <span className="shrink-0">Límite diario:</span>
          <input
            type="number"
            min={-1}
            value={limitDraft}
            onChange={(e) => setLimitDraft(e.target.value)}
            placeholder="-1 = sin límite"
            className="w-16 rounded border border-border-light bg-surface-secondary px-1.5 py-0.5 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            aria-label="Límite de sesiones diarias"
          />
          <button
            type="button"
            onClick={() => void saveLimit()}
            disabled={savingLimit}
            className="rounded border border-border-light bg-surface-tertiary px-2 py-0.5 text-xs text-text-primary transition-colors hover:bg-surface-active disabled:opacity-50"
          >
            {savingLimit ? '…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

export default StreakBadge;
