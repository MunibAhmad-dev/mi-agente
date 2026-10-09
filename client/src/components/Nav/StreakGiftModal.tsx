import { useState } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import { Gift, Sparkles } from 'lucide-react';
import { useLocalize } from '~/hooks';
import type { StreakData } from './StreakBadge';

/**
 * StreakGiftModal — FASE 28.
 * Celebra el hito de racha alcanzado (cada MILESTONE_DAYS días): muestra el
 * regalo "+1 sesión extra al día" y un botón para reclamarlo. Tras reclamar,
 * el backend marca `lastGiftClaimedStreak` para que el modal no reaparezca
 * en este ciclo.
 */
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

function StreakGiftModal({
  streak,
  onClose,
  onClaimed,
}: {
  streak: StreakData;
  onClose: () => void;
  onClaimed: (claimed: StreakData) => void;
}) {
  const localize = useLocalize();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/streak/claim-gift', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken() ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setClaimed(true);
      onClaimed(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error de conexión');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={localize('com_nav_streak_gift_title') || '¡Hito alcanzado!'}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border-light bg-surface-secondary p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/15">
            {claimed ? (
              <Gift className="size-7 text-amber-500" aria-hidden="true" />
            ) : (
              <Sparkles className="size-7 text-amber-500" aria-hidden="true" />
            )}
          </div>
          <h2 className="text-base font-semibold text-text-primary">
            {localize('com_nav_streak_gift_title') || '¡Hito alcanzado!'}
          </h2>
          <p className="text-sm text-text-secondary">
            {localize('com_nav_streak_gift_body', { count: streak.streak }) ||
              `Llevas ${streak.streak} días usando el sistema.`}
          </p>
          <p className="rounded-md bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            🎁 {localize('com_nav_streak_unlocked') || '+1 sesión extra cada día desbloqueada.'}
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-1 flex w-full gap-2">
            {!claimed && (
              <button
                type="button"
                onClick={handleClaim}
                disabled={claiming}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              >
                {claiming ? 'Reclamando…' : localize('com_nav_streak_claim') || 'Reclamar regalo'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-surface-tertiary px-3 py-2 text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {claimed ? localize('com_ui_close') || 'Cerrar' : localize('com_ui_cancel') || 'Ahora no'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StreakGiftModal;
