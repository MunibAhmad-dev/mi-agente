/**
 * useSoundSystem — inicializa el sistema de sonidos (FASE 20).
 *
 * 1. Carga las preferencias del usuario desde el backend (por usuario).
 * 2. Conecta el servicio a los EVENTOS REALES del sistema:
 *    - Fin de respuesta del chat / errores del SSE: se llaman desde useSSE.ts
 *      (soundService.playEvent('aiResponse' | 'error')).
 *    - Tareas/agentes/tools del EventBus (SSE de ejecución) → taskCompleted,
 *      error, warning.
 * 3. Expone `savePreferences` para que la UI persista cambios (PUT + aplicar
 *    en vivo) y `refresh` para recargar tras login.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSetRecoilState } from 'recoil';
import { getTokenHeader, request } from 'librechat-data-provider';
import { eventBus } from '~/services/EventBus';
import {
  soundService,
  defaultPreferences,
  type SoundPreferences,
} from '~/services/sound/SoundService';
import { soundPreferencesAtom } from '~/store/sound';

/** Mismo patrón de auth que el panel de modelos locales: el token real vive en
 *  el header de axios; ante 401 se refresca el JWT y se reintenta. */
export async function authFetch(
  input: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  let token: string | null = null;
  try {
    const auth = getTokenHeader() || '';
    token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  } catch {
    token = null;
  }
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && !retried) {
    try {
      const refreshed = await request.refreshToken();
      if (refreshed?.token) {
        request.dispatchTokenUpdatedEvent(refreshed.token);
      }
    } catch {
      /* el 401 se devuelve tal cual */
    }
    return authFetch(input, init, true);
  }
  return res;
}

async function fetchPreferences(): Promise<SoundPreferences> {
  try {
    const res = await authFetch('/api/user/sound-preferences', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return defaultPreferences();
    }
    const data = await res.json();
    if (!data?.preferences) {
      return defaultPreferences();
    }
    const p = data.preferences;
    const events: Record<string, { enabled: boolean; soundId: string | null; volume: number | null }> = {};
    for (const [id, ev] of Object.entries(p.events ?? {})) {
      const e = ev as { enabled?: boolean; soundId?: string | null; volume?: number | null };
      events[id] = {
        enabled: e.enabled !== false,
        soundId: typeof e.soundId === 'string' ? e.soundId : null,
        volume: typeof e.volume === 'number' ? e.volume : null,
      };
    }
    return {
      soundsEnabled: p.soundsEnabled !== false,
      masterVolume: typeof p.masterVolume === 'number' ? p.masterVolume : 75,
      backgroundSoundsEnabled: p.backgroundSoundsEnabled !== false,
      reduceDuringIntenseActivity: p.reduceDuringIntenseActivity === true,
      events,
    };
  } catch {
    return defaultPreferences();
  }
}

async function persistPreferences(prefs: SoundPreferences): Promise<void> {
  try {
    await authFetch('/api/user/sound-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
  } catch {
    /* la UI sigue funcionando en memoria; se reintenta en el próximo guardado */
  }
}

/** Mapeo de eventos del EventBus → eventos de sonido del usuario. */
const EVENT_MAP: Record<string, string> = {
  'execution:completed': 'taskCompleted',
  'execution:failed': 'error',
  'tool:error': 'warning',
  'llm:request_failed': 'error',
  'agent:failed': 'error',
  'command:error': 'warning',
  warning: 'warning',
  error: 'error',
  'sandbox:apply_failed': 'warning',
};

export default function useSoundSystem() {
  const setPrefs = useSetRecoilState(soundPreferencesAtom);
  const mountedRef = useRef(false);

  const apply = useCallback(
    (prefs: SoundPreferences) => {
      soundService.setPreferences(prefs);
      setPrefs(prefs);
    },
    [setPrefs],
  );

  const refresh = useCallback(async () => {
    const prefs = await fetchPreferences();
    apply(prefs);
  }, [apply]);

  const save = useCallback(
    (prefs: SoundPreferences) => {
      apply(prefs);
      void persistPreferences(prefs);
    },
    [apply],
  );

  useEffect(() => {
    if (mountedRef.current) {
      return;
    }
    mountedRef.current = true;

    void refresh();

    const unsubs: Array<() => void> = [];
    for (const [busEvent, soundEvent] of Object.entries(EVENT_MAP)) {
      unsubs.push(
        eventBus.subscribe(busEvent as never, () => {
          soundService.playEvent(soundEvent);
        }),
      );
    }
    // Actividad intensa (muchas ejecuciones) → permite "reducir durante
    // actividad intensa".
    const intense = () => soundService.markIntense();
    unsubs.push(eventBus.subscribe('execution:started', intense as never));

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [refresh]);

  return { refresh, save };
}
