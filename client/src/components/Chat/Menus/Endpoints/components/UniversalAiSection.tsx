import React, { useCallback, useEffect, useState } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import { CustomMenu as Menu, CustomMenuSeparator } from '../CustomMenu';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { cn } from '~/utils';

/**
 * UniversalAiSection — FASE 29.
 * Convierte el selector en un selector UNIVERSAL de IA: el usuario elige el
 * TIPO de IA (Texto, Imagen, Video, TTS, STT, Audio, Multimodal) y el runtime
 * adecuado, en lugar de un selector exclusivo de LLMs.
 *
 * - Chips de modalidad (filtran lo que se muestra).
 * - Runtimes de generación con estado en vivo (health check ligero):
 *     · ComfyUI  → imagen/video (muestra la imagen de prueba generada)
 *     · Kokoro   → TTS (botón "Probar": genera y reproduce el audio)
 *     · Whisper  → STT (estado; transcripción en futura iteración)
 * - Los LLM (externos + locales) siguen en sus secciones, etiquetados como
 *   "Modelos de texto (LLM)".
 */

/** FASE 34 — Tipos de IA extensibles. Para añadir una modalidad nueva solo
 *  hay que: 1) añadir su id aquí, 2) mapearla en MODALITIES, 3) (opcional)
 *  mapearla en RUNTIME_MODALITIES y CATEGORY_FOR_MODALITY. Nada más cambia
 *  en el selector. */
export type Modality =
  | 'todo'
  | 'texto'
  | 'imagen'
  | 'video'
  | 'animacion'
  | 'tts'
  | 'stt'
  | 'audio'
  | 'audio_multimodal'
  | 'musica'
  | '3d'
  | 'vision'
  | 'embeddings'
  | 'reranking'
  | 'ocr'
  | 'speech'
  | 'traduccion'
  | 'codigo'
  | 'agentes'
  | 'robotica'
  /** Back-compat: la modalidad genérica "multimodal" sigue siendo válida
   *  internamente (persistencia antigua) pero ya no tiene chip propio — se
   *  cubre con Visión/OCR/Audio multimodal. */
  | 'multimodal';

/** Lista extensible de modalidades — el orden define el orden en la UI. */
export const MODALITIES: { id: Modality; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'texto', label: 'Texto / LLM' },
  { id: 'imagen', label: 'Imagen' },
  { id: 'video', label: 'Video' },
  { id: 'animacion', label: 'Animación' },
  { id: 'tts', label: 'TTS' },
  { id: 'stt', label: 'STT' },
  { id: 'audio', label: 'Audio' },
  { id: 'audio_multimodal', label: 'Audio multimodal' },
  { id: 'musica', label: 'Música' },
  { id: '3d', label: '3D' },
  { id: 'vision', label: 'Visión' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'reranking', label: 'Reranking' },
  { id: 'ocr', label: 'OCR' },
  { id: 'speech', label: 'Speech' },
  { id: 'traduccion', label: 'Traducción' },
  { id: 'codigo', label: 'Código' },
  { id: 'agentes', label: 'Agentes' },
  { id: 'robotica', label: 'Robótica' },
];

/** Modalidades válidas para persistir (evita guardar valores obsoletos).
 *  Incluye la antigua 'multimodal' para no descartar preferencias guardadas. */
export const MODALITY_VALUES: ReadonlySet<string> = new Set([
  ...MODALITIES.map((m) => m.id),
  'multimodal',
]);

/** Qué runtimes muestran en cada modalidad. */
const RUNTIME_MODALITIES: Record<
  'comfyui' | 'kokoro' | 'whisper' | 'ollama_vision',
  Modality[]
> = {
  comfyui: ['imagen', 'video', 'animacion', '3d'],
  kokoro: ['tts', 'speech', 'audio_multimodal', 'musica'],
  whisper: ['stt', 'speech', 'audio', 'audio_multimodal'],
  ollama_vision: ['vision', 'ocr', 'multimodal'],
};

/** Categoría del panel Explorar para cada modalidad (null → sin filtro). */
export const CATEGORY_FOR_MODALITY: Record<Modality, string | null> = {
  todo: null,
  texto: 'llm',
  imagen: 'imagen',
  video: 'video',
  animacion: 'animacion',
  tts: 'voz',
  stt: 'stt',
  audio: 'audio',
  audio_multimodal: 'audio',
  musica: 'musica',
  '3d': '3d',
  vision: 'vision',
  embeddings: 'embeddings',
  reranking: 'reranking',
  ocr: 'ocr',
  speech: 'voz',
  traduccion: 'traduccion',
  codigo: 'codigo',
  agentes: 'agentes',
  robotica: 'robotica',
  multimodal: 'multimodal',
};

export const runtimeShows = (runtime: keyof typeof RUNTIME_MODALITIES, modality: Modality) =>
  modality === 'todo' || RUNTIME_MODALITIES[runtime].includes(modality);

interface RuntimeStatus {
  ok: boolean;
  version?: string;
  detail?: string;
}

function authToken(): string | null {
  // El dashboard autentica con cookies/JWT; getTokenHeader resuelve el token
  // como el resto de la app (mismo patrón que StreakBadge).
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length);
    }
    if (auth) {
      return auth;
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

/** Health check ligero contra la API del dashboard (nunca bloquea la UI). */
function useRuntimeHealth(url: string) {
  const [status, setStatus] = useState<RuntimeStatus>({ ok: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken() ?? ''}` },
      });
      const json = await res.json();
      if (res.ok && (json?.ok || json?.system)) {
        setStatus({
          ok: true,
          version: json?.system?.comfyui_version || json?.version || json?.tts_model,
          detail: json?.service || undefined,
        });
      } else {
        setStatus({ ok: false, detail: json?.error || `HTTP ${res.status}` });
      }
    } catch (e) {
      setStatus({ ok: false, detail: String((e as Error)?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}

function StatusDot({ ok, loading }: { ok: boolean; loading: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex size-2 shrink-0 rounded-full',
        loading ? 'bg-text-secondary' : ok ? 'bg-green-500' : 'bg-red-500',
      )}
      aria-hidden="true"
    />
  );
}

function ModalityChips({ chips }: { chips: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded-full border border-border-light bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

/** Installed model list item (from GET /api/local-models). */
interface InstalledModelInfo {
  id?: string;
  name?: string;
  size?: number;
}

/** Cuenta los modelos instalados en todos los runtimes (Ollama/llama.cpp…). */
function useInstalledCount() {
  const [count, setCount] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/local-models', {
        headers: { Authorization: `Bearer ${authToken() ?? ''}` },
      });
      const json = await res.json().catch(() => ({}));
      const providers = Array.isArray(json.providers) ? json.providers : [];
      const total = providers.reduce((acc: number, p: { id?: string; models?: InstalledModelInfo[] }) => {
        const n = Array.isArray(p.models) ? p.models.length : 0;
        if (p.id === 'ollama') {
          // Ollama incluye 'latest' como modelo extra? No — /api/tags devuelve
          // solo modelos reales; el conteo directo es correcto.
        }
        return acc + n;
      }, 0);
      setCount(total || 0);
    } catch {
      setCount(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { count, refresh };
}

export default function UniversalAiSection({
  modality,
  onModalityChange,
}: {
  modality: Modality;
  onModalityChange: (m: Modality) => void;
}) {
  const { mappedEndpoints, handleSelectModel } = useModelSelectorContext();
  const [playing, setPlaying] = useState(false);
  /** FASE 35/45 — la sección INSTALADO puede contraerse; por defecto queda
   *  MINIMIZADA hasta que el usuario le da clic (selector más limpio). */
  const [installedOpen, setInstalledOpen] = useState(false);
  /** FASE 35 — "Ver todos" expande la mini-lista de modelos instalados. */
  const [showAllModels, setShowAllModels] = useState(false);
  const { count } = useInstalledCount();

  const comfy = useRuntimeHealth('/api/comfyui/health');
  const tts = useRuntimeHealth('/api/ai-runtimes/health');
  const stt = useRuntimeHealth('/api/ai-runtimes/health');

  const ollamaEndpoint = mappedEndpoints?.find((e) =>
    (e.value || '').toLowerCase().includes('ollama'),
  );

  const useOllama = useCallback(() => {
    if (ollamaEndpoint) {
      handleSelectModel(ollamaEndpoint, '');
    }
  }, [ollamaEndpoint, handleSelectModel]);

  /** FASE 34 — cada runtime se muestra según su mapa de modalidades. */
  const show = (runtime: 'comfyui' | 'kokoro' | 'whisper' | 'ollama_vision') =>
    runtimeShows(runtime, modality);

  const playTts = async () => {
    setPlaying(true);
    try {
      const res = await fetch('/api/ai-runtimes/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken() ?? ''}`,
        },
        body: JSON.stringify({
          text: 'Hola, este es el motor de voz local del dashboard, usando Kokoro.',
          voice: 'af_heart',
          speed: 1.0,
        }),
      });
      if (!res.ok) {
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPlaying(false);
      };
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  return (
    <>
      <CustomMenuSeparator />
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-text-primary">✦ IA Universal</span>
          <span className="text-[10px] uppercase tracking-wide text-text-secondary">
            elige el tipo de IA
          </span>
        </div>
        {/* Filtros por modalidad */}
        <div className="mt-2 flex flex-wrap gap-1">
          {MODALITIES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onModalityChange(m.id)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                modality === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border-light bg-surface-tertiary text-text-secondary hover:bg-surface-active',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* FASE 35 — sección separada INSTALADO: lo que ya está en tu equipo.
            Colapsable (hacerla pequeña), con contador de modelos instalados
            y acceso directo a la lista completa. */}
        <div className="mt-3 flex items-center gap-1.5 border-t border-border-light pt-2">
          <button
            type="button"
            onClick={() => setInstalledOpen((v) => !v)}
            aria-expanded={installedOpen}
            aria-label={installedOpen ? 'Contraer sección Instalado' : 'Expandir sección Instalado'}
            className="inline-flex items-center gap-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              aria-hidden="true"
              className={cn('transition-transform', installedOpen ? 'rotate-90' : '')}
            >
              ▶
            </span>
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-green-500/15 text-[9px] text-green-600 dark:text-green-400">
              ✓
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
              Instalado
            </span>
          </button>
          {count != null && (
            <span
              className="rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary"
              title="Modelos instalados en todos los runtimes locales"
            >
              {count} modelo{count === 1 ? '' : 's'} instalado{count === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowAllModels((v) => !v)}
            aria-expanded={showAllModels}
            className="ml-auto text-[10px] text-text-secondary underline-offset-2 hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {showAllModels ? 'Ocultar lista' : 'Ver todos →'}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-text-secondary">
          motores y modelos que ya tienes en tu equipo
        </p>
        {/* Mini-lista de modelos instalados (acceso directo): se muestra al
            expandir «Instalado» (para que nunca parezca vacío) o con
            «Ver todos →» sin expandir. La sección está MINIMIZADA por
            defecto hasta que el usuario hace clic (FASE 35). */}
        {(installedOpen || showAllModels) && <InstalledModelsMiniList />}
        {/* Runtimes de generación (visibles según la modalidad) */}
        {installedOpen && (
        <div className="mt-2 flex flex-col gap-1.5">
          {show('comfyui') && (
            <RuntimeRow
              name="ComfyUI"
              desc="Generación y edición de imágenes, video y 3D"
              chips={['Imagen', 'Video', 'Animación', '3D']}
              ok={comfy.status.ok}
              loading={comfy.loading}
              detail={comfy.status.version || comfy.status.detail}
              extra={
                comfy.status.ok && (
                  <button
                    type="button"
                    onClick={() =>
                      window.open('/api/comfyui/view/tiny_sd_test_00001_.png', '_blank')
                    }
                    className="mt-1 text-[11px] text-blue-500 underline-offset-2 hover:underline"
                  >
                    Ver imagen de prueba generada
                  </button>
                )
              }
            />
          )}
          {show('kokoro') && (
            <RuntimeRow
              name="Kokoro"
              desc="Texto a voz local (82M, Apache-2.0)"
              chips={['TTS', 'Speech', 'Audio']}
              ok={tts.status.ok}
              loading={tts.loading}
              detail={tts.status.ok ? 'disponible' : tts.status.detail}
              extra={
                tts.status.ok && (
                  <button
                    type="button"
                    onClick={() => void playTts()}
                    disabled={playing}
                    className="mt-1 rounded border border-border-light bg-surface-tertiary px-2 py-0.5 text-[11px] text-text-primary transition-colors hover:bg-surface-active disabled:opacity-50"
                  >
                    {playing ? 'Generando…' : '▶ Probar voz'}
                  </button>
                )
              }
            />
          )}
          {show('whisper') && (
            <RuntimeRow
              name="faster-whisper"
              desc="Transcripción de audio local (tiny, MIT)"
              chips={['STT', 'Speech', 'Audio']}
              ok={stt.status.ok}
              loading={stt.loading}
              detail={stt.status.ok ? 'disponible' : stt.status.detail}
            />
          )}
          {show('ollama_vision') && (
            <RuntimeRow
              name="Ollama multimodal"
              desc="Modelos de visión, OCR y texto (cuando el modelo lo soporta)"
              chips={['Visión', 'OCR', 'Multimodal', 'Texto']}
              ok={Boolean(ollamaEndpoint)}
              loading={false}
              detail={ollamaEndpoint ? 'endpoint de chat configurado' : undefined}
              extra={
                ollamaEndpoint && (
                  <button
                    type="button"
                    onClick={useOllama}
                    className="mt-1 rounded border border-border-light bg-surface-tertiary px-2 py-0.5 text-[11px] text-text-primary transition-colors hover:bg-surface-active"
                  >
                    Seleccionar modelo local
                  </button>
                )
              }
            />
          )}
        </div>
        )}
      </div>
    </>
  );
}

/**
 * Mini-lista de modelos instalados (FASE 35) — acceso directo desde la
 * sección INSTALADO: nombre + tamaño + botón Usar. Consulta la misma API
 * que el panel de Modelos locales (GET /api/local-models).
 */
function InstalledModelsMiniList() {
  const { mappedEndpoints, handleSelectModel } = useModelSelectorContext();
  const [models, setModels] = useState<{
    provider: string;
    name: string;
    sizeHuman?: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/local-models', {
          headers: { Authorization: `Bearer ${authToken() ?? ''}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        const providers = Array.isArray(json.providers) ? json.providers : [];
        const flat: { provider: string; name: string; sizeHuman?: string }[] = [];
        for (const p of providers) {
          for (const m of Array.isArray(p.models) ? p.models : []) {
            flat.push({
              provider: p.id,
              name: m.name,
              sizeHuman: m.sizeHuman || (m.size ? humanSize(m.size) : undefined),
            });
          }
        }
        setModels(flat);
      } catch {
        /* ignore */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const ollamaEndpoint = mappedEndpoints?.find((e) =>
    (e.value || '').toLowerCase().includes('ollama'),
  );

  if (loading) {
    return <p className="mt-1 text-[11px] text-text-secondary">Cargando modelos…</p>;
  }
  if (models.length === 0) {
    return (
      <p className="mt-1 rounded-md border border-dashed border-border-light p-2 text-[11px] text-text-secondary">
        No hay modelos instalados. Explora y descarga desde «Modelos locales».
      </p>
    );
  }
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {models.slice(0, 8).map((m) => (
        <div
          key={`${m.provider}:${m.name}`}
          className="flex items-center gap-2 rounded-md border border-border-light bg-surface-secondary px-2 py-1"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-green-500" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-primary">
            {m.name}
          </span>
          {m.sizeHuman && (
            <span className="shrink-0 text-[10px] text-text-secondary">{m.sizeHuman}</span>
          )}
          {m.provider === 'ollama' && ollamaEndpoint && (
            <button
              type="button"
              onClick={() => handleSelectModel(ollamaEndpoint, m.name)}
              className="shrink-0 rounded border border-border-light bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-text-primary transition-colors hover:bg-surface-active"
            >
              Usar
            </button>
          )}
        </div>
      ))}
      {models.length > 8 && (
        <p className="text-[10px] text-text-secondary">…y {models.length - 8} más (Modelos locales).</p>
      )}
    </div>
  );
}

function humanSize(bytes?: number): string | undefined {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes as number;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function RuntimeRow({
  name,
  desc,
  chips,
  ok,
  loading,
  detail,
  extra,
}: {
  name: string;
  desc: string;
  chips: string[];
  ok: boolean;
  loading: boolean;
  detail?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-light bg-surface-secondary p-2">
      <div className="flex items-center gap-2">
        <StatusDot ok={ok} loading={loading} />
        <span className="text-sm font-medium text-text-primary">{name}</span>
        <span
          className={cn(
            'ml-auto text-[11px]',
            loading ? 'text-text-secondary' : ok ? 'text-green-600' : 'text-red-500',
          )}
        >
          {loading ? 'comprobando…' : ok ? 'Conectado' : 'No disponible'}
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">{desc}</p>
      <div className="mt-1 flex items-center gap-2">
        <ModalityChips chips={chips} />
        {detail && <span className="text-[10px] text-text-secondary">{detail}</span>}
      </div>
      {extra}
    </div>
  );
}
