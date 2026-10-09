/**
 * SoundService — servicio singleton de sonidos y notificaciones (FASE 20).
 *
 * - `playEvent(eventId)` reproduce el sonido configurado para un evento del
 *   sistema, respetando las preferencias del usuario (global, por evento,
 *   volumen, pestaña en segundo plano). Se invoca desde los eventos REALES
 *   (fin de respuesta SSE, EventBus de tareas/agentes, errores).
 * - `preview(soundId)` reproduce un sonido para escucharlo (biblioteca), sin
 *   depender de la preferencia "activado" pero sí del volumen maestro.
 * - Los sonidos locales se sintetizan en el navegador; los remotos (Freesound)
 *   usan su previewUrl resuelta por el backend (nunca se expone una API key).
 * - Un solo sonido a la vez: al reproducir otro se detiene el anterior.
 */

import { playPreset, isLocalPreset } from './synthesis';

export interface SoundEventPref {
  enabled: boolean;
  soundId: string | null;
  volume: number | null;
}

export interface SoundPreferences {
  soundsEnabled: boolean;
  masterVolume: number;
  backgroundSoundsEnabled: boolean;
  reduceDuringIntenseActivity: boolean;
  events: Record<string, SoundEventPref>;
}

export const SOUND_EVENTS = [
  { id: 'aiResponse', label: 'Respuesta de IA', icon: '🤖' },
  { id: 'taskCompleted', label: 'Tarea completada', icon: '✅' },
  { id: 'aiMessage', label: 'Mensaje de IA', icon: '💬' },
  { id: 'notification', label: 'Notificación del sistema', icon: '🔔' },
  { id: 'warning', label: 'Requiere atención', icon: '⚠️' },
  { id: 'error', label: 'Error', icon: '❌' },
  { id: 'taskStarted', label: 'Proceso comenzó', icon: '🔄' },
  { id: 'fileCompleted', label: 'Operación de archivos', icon: '📁' },
  { id: 'connectionSuccess', label: 'Conexión establecida', icon: '🔗' },
] as const;

const DEFAULT_SOUNDS: Record<string, string> = {
  aiResponse: 'chime-soft-digital',
  taskCompleted: 'success-chime',
  aiMessage: 'message-digital',
  notification: 'notification-soft',
  warning: 'alert-soft',
  error: 'error-notification',
  taskStarted: 'process-start',
  fileCompleted: 'file-done',
  connectionSuccess: 'connection-ok',
};

export function defaultPreferences(): SoundPreferences {
  return {
    soundsEnabled: true,
    masterVolume: 75,
    backgroundSoundsEnabled: true,
    reduceDuringIntenseActivity: false,
    events: Object.fromEntries(
      SOUND_EVENTS.map((e) => [e.id, { enabled: true, soundId: DEFAULT_SOUNDS[e.id], volume: null }]),
    ),
  };
}

class SoundService {
  private prefs: SoundPreferences = defaultPreferences();
  private ctx: AudioContext | null = null;
  private current: { stop: () => void } | null = null;
  private previewCache = new Map<string, { previewUrl: string | null; name: string }>();
  private lastIntenseAt = 0;

  getPreferences(): SoundPreferences {
    return this.prefs;
  }

  setPreferences(prefs: SoundPreferences): void {
    this.prefs = prefs;
  }

  private ensureCtx(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) {
          return null;
        }
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private stopCurrent(): void {
    if (this.current) {
      try {
        this.current.stop();
      } catch {
        /* ignore */
      }
      this.current = null;
    }
  }

  private volumeFor(eventId: string): number {
    const ev = this.prefs.events[eventId];
    const raw = ev?.volume ?? this.prefs.masterVolume;
    return Math.max(0, Math.min(1, (raw ?? 75) / 100));
  }

  /** Marca actividad intensa para "reducir durante actividad intensa". */
  markIntense(): void {
    this.lastIntenseAt = Date.now();
  }

  /**
   * Reproduce el sonido de un evento del sistema si las preferencias lo
   * permiten. Eventos reales: fin de respuesta SSE, EventBus, errores.
   */
  playEvent(eventId: string): void {
    if (!this.prefs.soundsEnabled) {
      return;
    }
    const ev = this.prefs.events[eventId];
    if (!ev || !ev.enabled) {
      return;
    }
    const soundId = ev.soundId;
    if (!soundId || soundId === 'none') {
      return;
    }
    if (document.hidden && !this.prefs.backgroundSoundsEnabled) {
      return;
    }
    if (
      this.prefs.reduceDuringIntenseActivity &&
      Date.now() - this.lastIntenseAt < 3000 &&
      eventId !== 'error' &&
      eventId !== 'warning'
    ) {
      return;
    }
    void this.playSoundId(soundId, this.volumeFor(eventId));
  }

  /** Reproduce un sonido de la biblioteca (preview), con el volumen maestro. */
  preview(soundId: string): void {
    void this.playSoundId(soundId, Math.max(0, Math.min(1, this.prefs.masterVolume / 100)));
  }

  stop(): void {
    this.stopCurrent();
  }

  private async playSoundId(soundId: string, volume: number): Promise<void> {
    this.stopCurrent();
    if (
      soundId.startsWith('freesound:') ||
      soundId.startsWith('pixabay:') ||
      soundId.startsWith('custom:') ||
      soundId.includes('/')
    ) {
      const info = await this.resolveRemote(soundId);
      if (!info?.previewUrl) {
        return;
      }
      // Los archivos subidos se sirven SOLO con JWT (header). El <audio> no
      // puede mandar cabeceras → se descarga con fetch (Authorization) y se
      // reproduce desde un blob URL. Sin token en la URL ni en logs.
      let url = info.previewUrl;
      if (url.startsWith('/api/sounds/file/')) {
        const token =
          (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null) || '';
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          return;
        }
        url = URL.createObjectURL(await res.blob());
      }
      const audio = new Audio(url);
      audio.volume = volume;
      const stop = () => {
        audio.pause();
        audio.src = '';
      };
      this.current = { stop };
      try {
        await audio.play();
      } catch {
        stop();
        this.current = null;
      }
      return;
    }
    // La biblioteca devuelve ids con prefijo `local:` — se normaliza para la síntesis.
    const presetId = soundId.startsWith('local:') ? soundId.slice('local:'.length) : soundId;
    const ctx = this.ensureCtx();
    if (!ctx) {
      return;
    }
    if (!isLocalPreset(presetId)) {
      return;
    }
    let stopped = false;
    this.current = {
      stop: () => {
        stopped = true;
      },
    };
    playPreset(ctx, presetId, volume);
    const dur = 1.4;
    window.setTimeout(() => {
      if (this.current?.stop === undefined) {
        return;
      }
      stopped = true;
      this.stopCurrent();
    }, dur * 1000);
    void stopped;
  }

  private async resolveRemote(soundId: string): Promise<{ previewUrl: string | null } | null> {
    const cached = this.previewCache.get(soundId);
    if (cached) {
      return cached;
    }
    try {
      const token =
        (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null) || '';
      const res = await fetch(`/api/sounds/${encodeURIComponent(soundId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      const info = { previewUrl: data?.sound?.previewUrl ?? null, name: data?.sound?.name ?? '' };
      this.previewCache.set(soundId, info);
      return info;
    } catch {
      return null;
    }
  }
}

export const soundService = new SoundService();
