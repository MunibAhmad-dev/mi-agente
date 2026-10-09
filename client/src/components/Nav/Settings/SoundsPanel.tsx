import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import { Switch } from '@librechat/client';
import {
  Volume2,
  Play,
  Pause,
  Search,
  Star,
  X,
  Library,
  VolumeX,
  Upload,
  Trash2,
} from 'lucide-react';
import { soundPreferencesAtom } from '~/store/sound';
import { SOUND_EVENTS, soundService, type SoundPreferences } from '~/services/sound/SoundService';
import useSoundSystem, { authFetch } from '~/hooks/useSoundSystem';
import { cn } from '~/utils';

interface LibrarySound {
  id: string;
  name: string;
  category: string;
  duration: number;
  tags: string[];
  license: string;
  licenseUrl?: string;
  attributionRequired?: boolean;
  commercialUseAllowed?: boolean;
  provider: string;
  username?: string;
  previewUrl?: string | null;
  pageUrl?: string | null;
  size?: number;
  createdAt?: string | number | Date;
}

const PROVIDERS = [
  { id: 'local', name: 'Biblioteca local' },
  { id: 'custom', name: 'Mis sonidos' },
  { id: 'mixkit', name: 'Mixkit' },
  { id: 'pixabay', name: 'Pixabay' },
  { id: 'freesound', name: 'Freesound' },
  { id: 'all', name: 'Todas' },
];

const CATEGORIES = [
  'Notification',
  'Success',
  'Error',
  'Warning',
  'AI',
  'Interface',
  'System',
  'Message',
  'Task',
  'File',
  'Mis sonidos',
  'Mixkit',
  'Pixabay',
  'Freesound',
];

const ALLOWED_MIME = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_UPLOAD_SECONDS = 15;

function fileDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (v: number) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => done(0);
    audio.src = url;
    setTimeout(() => done(0), 3000);
  });
}

const FAV_KEY = 'sound-favorites';

function loadFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
  } catch {
    return [];
  }
}

function EventRow({
  eventId,
  label,
  icon,
  onPick,
}: {
  eventId: string;
  label: string;
  icon: string;
  onPick: (eventId: string) => void;
}) {
  const [prefs, setPrefs] = useRecoilState(soundPreferencesAtom);
  const ev = prefs.events[eventId] ?? { enabled: true, soundId: null, volume: null };
  const soundId = ev.soundId || 'none';

  const update = (patch: Partial<{ enabled: boolean; soundId: string | null; volume: number | null }>) => {
    const next: SoundPreferences = {
      ...prefs,
      events: { ...prefs.events, [eventId]: { ...ev, ...patch } },
    };
    setPrefs(next);
    soundService.setPreferences(next);
    void persist(next);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-light bg-surface-secondary p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true">{icon}</span>
          <span className="truncate text-sm font-medium text-text-primary">{label}</span>
        </div>
        <Switch
          checked={ev.enabled !== false}
          onCheckedChange={(v) => update({ enabled: v })}
          aria-label={`Activado: ${label}`}
        />
      </div>
      {ev.enabled !== false && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="max-w-40 truncate rounded-md bg-surface-tertiary px-2 py-1 font-mono text-[11px] text-text-secondary">
            {soundId === 'none' ? 'Ninguno' : soundId}
          </span>
          <button
            type="button"
            onClick={() => soundService.preview(soundId)}
            disabled={soundId === 'none'}
            className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
          >
            <Play className="size-3" aria-hidden="true" />
            Reproducir
          </button>
          <button
            type="button"
            onClick={() => onPick(eventId)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={() => update({ soundId: 'none' })}
            disabled={soundId === 'none'}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
          >
            <VolumeX className="size-3" aria-hidden="true" />
            Ninguno
          </button>
          <label className="flex items-center gap-1 text-[10px] text-text-secondary">
            Vol.
            <input
              type="range"
              min={0}
              max={100}
              value={ev.volume ?? prefs.masterVolume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              className="h-1 w-20"
              aria-label={`Volumen de ${label}`}
            />
          </label>
        </div>
      )}
    </div>
  );
}

async function persist(prefs: SoundPreferences) {
  try {
    await authFetch('/api/user/sound-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
  } catch {
    /* se reintenta en el próximo cambio */
  }
}

function SoundLibrary({
  targetEventId,
  onClose,
}: {
  targetEventId: string | null;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useRecoilState(soundPreferencesAtom);
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('local');
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState(0);
  const [sounds, setSounds] = useState<LibrarySound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState<string | null>(null);
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [playing, setPlaying] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<
    Record<string, { available: boolean; requiresKey: boolean }>
  >({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch('/api/sounds/providers', { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, { available: boolean; requiresKey: boolean }> = {};
          for (const p of data.providers ?? []) {
            map[p.id] = { available: p.available, requiresKey: p.requiresKey };
          }
          setProviderStatus(map);
        }
      } catch {
        /* sin estado de proveedores — se ignora */
      }
    })();
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setNeedsKey(null);
      try {
        const params = new URLSearchParams({ provider, q });
        if (category) params.set('category', category);
        if (duration > 0) params.set('maxDuration', String(duration));
        const res = await authFetch(`/api/sounds/search?${params.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setSounds(data.sounds ?? []);
        if (data.needsKey && data.keyEnv) {
          setNeedsKey(data.keyEnv);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'error de conexión');
        setSounds([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, provider, category, duration]);

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const pick = (sound: LibrarySound) => {
    if (!targetEventId) {
      return;
    }
    const next: SoundPreferences = {
      ...prefs,
      events: {
        ...prefs.events,
        [targetEventId]: { ...(prefs.events[targetEventId] ?? { enabled: true, soundId: null, volume: null }), soundId: sound.id },
      },
    };
    setPrefs(next);
    soundService.setPreferences(next);
    void persist(next);
    onClose();
  };

  const playPreview = (id: string, previewUrl?: string | null, pageUrl?: string | null) => {
    if (playing === id) {
      soundService.stop();
      setPlaying(null);
      return;
    }
    if (!previewUrl && pageUrl) {
      // Sin preview (p. ej. Mixkit, que no permite hotlinking): se abre la página
      // oficial del sonido para escucharlo/descargarlo allí.
      window.open(pageUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    soundService.preview(id);
    setPlaying(id);
    setTimeout(() => setPlaying((cur) => (cur === id ? null : cur)), 2500);
  };

  const sorted = useMemo(() => {
    const list = [...sounds];
    const favSet = new Set(favs);
    list.sort((a, b) => Number(favSet.has(b.id)) - Number(favSet.has(a.id)));
    return list;
  }, [sounds, favs]);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Biblioteca de sonidos">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-light bg-surface-dialog shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-border-light p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Library className="size-4 text-text-secondary" aria-hidden="true" />
            {targetEventId
              ? `Elegir sonido para: ${SOUND_EVENTS.find((e) => e.id === targetEventId)?.label ?? targetEventId}`
              : 'Biblioteca de sonidos'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary"
            aria-label="Cerrar"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-2 border-b border-border-light p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar: notification, ai, success, error, chime, pop…"
              className="h-8 w-full rounded-lg border border-border-light bg-surface-secondary pl-7 pr-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Buscar sonidos"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PROVIDERS.map((p) => {
              const st = providerStatus[p.id];
              const needsKey = st?.requiresKey && st.available === false;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  title={
                    needsKey
                      ? 'Requiere configurar la clave de API en el servidor'
                      : undefined
                  }
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] transition-colors',
                    provider === p.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-tertiary text-text-secondary hover:text-text-primary',
                  )}
                >
                  {p.name}
                  {needsKey && (
                    <span className="ml-1" aria-label="requiere clave">
                      🔑
                    </span>
                  )}
                </button>
              );
            })}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-6 rounded-md border border-border-light bg-surface-secondary px-1 text-[11px] text-text-primary"
              aria-label="Categoría"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="h-6 rounded-md border border-border-light bg-surface-secondary px-1 text-[11px] text-text-primary"
              aria-label="Duración máxima"
            >
              <option value={0}>Cualquier duración</option>
              <option value={1}>&lt; 1 s</option>
              <option value={2}>1–2 s</option>
              <option value={5}>2–5 s</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="p-3 text-center text-xs text-text-secondary">Buscando…</p>
          ) : needsKey ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-text-secondary">
              🔑 Este proveedor requiere una clave de API configurada en el servidor
              (<code className="font-mono text-text-primary">{needsKey}</code>). El resto de
              proveedores y tus sonidos siguen funcionando normalmente.
            </p>
          ) : error ? (
            <p className="rounded-md border border-border-light bg-surface-tertiary/60 p-2.5 text-xs text-text-secondary">
              No se pudo consultar la biblioteca ({error}).
            </p>
          ) : sorted.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-light p-2.5 text-xs text-text-secondary">
              Sin resultados para «{q || '…'}». Prueba con menos términos o cambia de proveedor.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sorted.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-secondary p-2"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-xs font-medium text-text-primary">
                      {favs.includes(s.id) && <Star className="size-3 text-amber-500" aria-hidden="true" />}
                      {s.name}
                    </p>
                    <p className="truncate text-[10px] text-text-secondary">
                      {s.category} · {s.duration ? `${s.duration.toFixed(1)} s` : 'duración desconocida'} ·{' '}
                      {s.provider === 'local'
                        ? 'Local'
                        : s.provider === 'custom'
                          ? 'Mis sonidos'
                          : s.provider === 'mixkit'
                            ? 'Mixkit'
                            : s.provider === 'pixabay'
                              ? `Pixabay${s.username ? ` · ${s.username}` : ''}`
                              : `Freesound${s.username ? ` · ${s.username}` : ''}`}
                    </p>
                    <p className="truncate text-[10px] text-text-secondary" title={s.license}>
                      {s.license}
                      {s.attributionRequired ? ' · requiere atribución' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => playPreview(s.id, s.previewUrl, s.pageUrl)}
                      className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary"
                      aria-label={`Reproducir ${s.name}`}
                    >
                      {playing === s.id ? (
                        <Pause className="size-3" aria-hidden="true" />
                      ) : (
                        <Play className="size-3" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFav(s.id)}
                      className="rounded-md p-1 text-text-secondary transition-colors hover:text-amber-500"
                      aria-label={favs.includes(s.id) ? 'Quitar favorito' : 'Marcar favorito'}
                    >
                      <Star
                        className={cn('size-3', favs.includes(s.id) && 'fill-amber-500 text-amber-500')}
                        aria-hidden="true"
                      />
                    </button>
                    {targetEventId && (
                      <button
                        type="button"
                        onClick={() => pick(s)}
                        className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:opacity-90"
                      >
                        Usar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-text-secondary">
            Local se genera en tu navegador · Mixkit es un catálogo curado (no tiene API pública;
            se abre su página para descargar) · Pixabay y Freesound usan su API pública (requieren
            clave en el servidor). Respeta la licencia de cada sonido. Las claves de proveedores
            viven en el servidor, nunca en tu navegador.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Gestor de sonidos personalizados del usuario: subir (con validación de
 *  MIME/tamaño/duración), listar, reproducir y borrar. */
function CustomSoundsManager() {
  const [sounds, setSounds] = useState<LibrarySound[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    try {
      const res = await authFetch('/api/sounds/custom', { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setSounds(data.sounds ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error de conexión');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) {
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      setError('Formato no permitido. Usa MP3, WAV, OGG, M4A o WebM.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('El archivo supera 5 MB.');
      return;
    }
    const dur = await fileDuration(file);
    if (dur > MAX_UPLOAD_SECONDS) {
      setError(`La duración supera ${MAX_UPLOAD_SECONDS} s (es de ${dur.toFixed(1)} s).`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/sounds/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'no se pudo subir el sonido');
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const onDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/sounds/custom/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'no se pudo borrar');
    }
  };

  const play = (id: string) => {
    if (playing === id) {
      soundService.stop();
      setPlaying(null);
      return;
    }
    soundService.preview(id);
    setPlaying(id);
    setTimeout(() => setPlaying((cur) => (cur === id ? null : cur)), 3000);
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-light p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-primary">🎵 Mis sonidos (subidos por ti)</p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,.mp3,.wav,.ogg,.m4a,.webm"
          className="hidden"
          id="sound-upload-input"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          <Upload className="size-3.5" aria-hidden="true" />
          {uploading ? 'Subiendo…' : 'Subir sonido'}
        </button>
      </div>
      <p className="text-[10px] text-text-secondary">
        MP3 · WAV · OGG · M4A · WebM — máx 5 MB y 15 s. El sonido queda solo en tu cuenta y en
        este servidor; tú eres responsable de su licencia de uso.
      </p>
      {error && (
        <p className="rounded-md border border-border-light bg-surface-tertiary/60 p-2 text-xs text-text-secondary">
          {error}
        </p>
      )}
      {sounds.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sounds.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-secondary px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-text-primary">{s.name}</p>
                <p className="text-[10px] text-text-secondary">
                  {s.size ? `${(s.size / 1024).toFixed(0)} KB` : ''}
                  {s.createdAt
                    ? ` · ${new Date(s.createdAt).toLocaleDateString()} ${new Date(
                        s.createdAt,
                      ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => play(s.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary"
                  aria-label={`Reproducir ${s.name}`}
                >
                  {playing === s.id ? (
                    <Pause className="size-3" aria-hidden="true" />
                  ) : (
                    <Play className="size-3" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(s.id)}
                  className="rounded-md p-1 text-text-secondary transition-colors hover:text-red-500"
                  aria-label={`Borrar ${s.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {sounds.length === 0 && !error && (
        <p className="text-[11px] text-text-secondary">
          Aún no has subido sonidos. Se mostrarán aquí y en la biblioteca bajo «Mis sonidos».
        </p>
      )}
    </div>
  );
}

export default function SoundsPanel() {
  const [prefs, setPrefs] = useRecoilState(soundPreferencesAtom);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [targetEventId, setTargetEventId] = useState<string | null>(null);
  const { save } = useSoundSystem();

  const update = (patch: Partial<SoundPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    save(next);
  };

  const openLibrary = (eventId: string | null) => {
    setTargetEventId(eventId);
    setLibraryOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-sm text-text-secondary">
        Personaliza cómo el sistema te avisa por sonido. Cada evento usa el sonido que elijas;
        los cambios se guardan por usuario y se aplican a los eventos reales del sistema.
      </p>

      <div className="flex flex-col gap-2 rounded-xl border border-border-light p-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="sounds-enabled" className="text-sm text-text-primary">
            🔊 Sonidos activados
          </label>
          <Switch
            id="sounds-enabled"
            checked={prefs.soundsEnabled}
            onCheckedChange={(v) => update({ soundsEnabled: v })}
            aria-label="Sonidos activados"
          />
        </div>
        <div className="flex items-center gap-2">
          <Volume2 className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={100}
            value={prefs.masterVolume}
            onChange={(e) => update({ masterVolume: Number(e.target.value) })}
            className="h-1 flex-1"
            aria-label="Volumen general"
          />
          <span className="w-10 text-right font-mono text-xs text-text-secondary">
            {prefs.masterVolume}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="sounds-background" className="text-sm text-text-primary">
            Reproducir en segundo plano
          </label>
          <Switch
            id="sounds-background"
            checked={prefs.backgroundSoundsEnabled}
            onCheckedChange={(v) => update({ backgroundSoundsEnabled: v })}
            aria-label="Reproducir sonidos en segundo plano"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="sounds-reduce" className="text-sm text-text-primary">
            Reducir durante actividad intensa
          </label>
          <Switch
            id="sounds-reduce"
            checked={prefs.reduceDuringIntenseActivity}
            onCheckedChange={(v) => update({ reduceDuringIntenseActivity: v })}
            aria-label="Reducir sonidos durante actividad intensa"
          />
        </div>
      </div>

      <CustomSoundsManager />

      <div className="flex flex-col gap-1.5">
        <p className="px-1 text-xs font-medium uppercase tracking-wide text-text-secondary">Eventos</p>
        {SOUND_EVENTS.map((e) => (
          <EventRow key={e.id} eventId={e.id} label={e.label} icon={e.icon} onPick={openLibrary} />
        ))}
      </div>

      <div className="px-1">
        <button
          type="button"
          onClick={() => openLibrary(null)}
          className="flex items-center gap-2 rounded-lg border border-border-light px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <Library className="h-4 w-4" aria-hidden="true" />
          Explorar biblioteca de sonidos
        </button>
      </div>

      {libraryOpen && (
        <SoundLibrary targetEventId={targetEventId} onClose={() => setLibraryOpen(false)} />
      )}
    </div>
  );
}
