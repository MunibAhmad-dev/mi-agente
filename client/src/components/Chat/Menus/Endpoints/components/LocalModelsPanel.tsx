import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '@librechat/client';
import { getTokenHeader, request } from 'librechat-data-provider';
import {
  CircleAlert,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  HardDrive,
  Laptop,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Star,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import OllamaIcon from './OllamaIcon';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

interface LocalModel {
  id: string;
  name: string;
  provider: string;
  sizeHuman?: string | null;
  sizeBytes?: number | null;
  parameters?: string | null;
  quantization?: string | null;
  architecture?: string | null;
  contextLength?: number | null;
  capabilities?: string[];
  modifiedAt?: string | null;
  /** FASE 28: licencia real reportada por el runtime (Ollama /api/show). */
  license?: string | null;
}

interface ProviderStatus {
  connected: boolean;
  version?: string | null;
  modelCount?: number;
  error?: string | null;
}

interface ProviderInfo {
  id: string;
  name: string;
  enabled: boolean;
  endpoint: string;
  status: ProviderStatus;
  models: LocalModel[];
}

interface CatalogEntry {
  id: string;
  name: string;
  family?: string;
  source?: 'catalog' | 'huggingface' | 'github' | 'civitai';
  ollamaTag?: string | null;
  hfRepo?: string | null;
  params?: string | null;
  quant?: string | null;
  contextMax?: number | null;
  sizeApprox?: string | null;
  sizeHuman?: string | null;
  sizeBytes?: number | null;
  sizeReal?: boolean;
  license?: string | null;
  architecture?: string | null;
  modality?: string | null;
  capabilities?: string[];
  description?: string | null;
  downloads?: number;
  likes?: number;
  trendingScore?: number;
  stars?: number;
  htmlUrl?: string | null;
  pipelineTag?: string | null;
}

interface PullState {
  status: string;
  completed?: number;
  total?: number;
  percent?: number;
  paused?: boolean;
}

interface HfQuant {
  quant: string;
  file: string;
  size: number | null;
}

interface HardwareConfig {
  gpu: string;
  vram: number;
  ram: number;
  detected: boolean;
}

type CompatLevel = 'excellent' | 'good' | 'slow' | 'no';

interface Filters {
  sizes: string[];
  architectures: string[];
  modalities: string[];
  caps: string[];
  contexts: string[];
  compatibleOnly: boolean;
}

const CAPABILITY_LABELS: Record<string, string> = {
  completion: 'Texto',
  tools: 'Tools',
  reasoning: 'Reasoning',
  vision: 'Visión',
  embed: 'Embeddings',
  edit: 'Edición',
  insert: 'Inserción',
};

const HW_KEY = 'local-models-hardware';

/* ------------------------------------------------------------------ */
/* Auth (FASE 18 — arreglo del HTTP 401)                              */
/* ------------------------------------------------------------------ */
/* El token real de la app vive en el header de axios (getTokenHeader); */
/* el panel leía localStorage['token'], que nadie escribe → 401 en uso  */
/* normal. Ahora lee el header y, ante un 401, refresca el JWT vía      */
/* request.refreshToken() (misma recuperación que el SSE) y reintenta.  */
function getToken(): string | null {
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

async function authFetch(input: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = getToken();
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
      /* refresh falló → se devuelve el 401 para mostrar un error claro */
    }
    return authFetch(input, init, true);
  }
  return res;
}

async function fetchJson(url: string): Promise<any> {
  const res = await authFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Hardware + compatibilidad (estimaciones honestas, nunca inventadas) */
/* ------------------------------------------------------------------ */

function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/** Extrae un identificador corto de la licencia (Apache-2.0, MIT, Gemma…)
 *  para no inundar las tarjetas con el texto legal completo. */
function shortLicense(license?: string | null): string {
  if (!license) return 'Desconocida';
  const lower = license.toLowerCase();
  if (lower.includes('apache')) return 'Apache-2.0';
  if (lower.includes('mit')) return 'MIT';
  if (lower.includes('gemma')) return 'Gemma ToU';
  if (lower.includes('cc-by')) return lower.includes('cc-by-nc') ? 'CC-BY-NC' : 'CC-BY';
  if (lower.includes('llama')) return 'Llama';
  if (lower.includes('openrail')) return 'OpenRAIL';
  if (lower.includes('falcon')) return 'Falcon';
  if (lower.includes('mozilla') || lower.includes('mpl')) return 'MPL-2.0';
  if (lower.includes('bsd')) return 'BSD';
  if (lower.includes('gpl')) return lower.includes('agpl') ? 'AGPL' : 'GPL';
  if (lower.includes('proprietary') || lower.includes('other')) return 'Otro';
  return license.slice(0, 24);
}

function parseParamsB(params?: string | null): number | null {
  if (!params) return null;
  const m = params.match(/([\d.]+)\s*(B|M)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2].toUpperCase() === 'B' ? n : n / 1000;
}

function quantBits(quant?: string | null): number {
  if (!quant) return 4.5;
  const s = quant.toLowerCase();
  if (s.includes('fp16') || s.includes('f16') || s.includes('bf16')) return 16;
  if (s.includes('q8') || s.includes('int8')) return 8.5;
  if (s.includes('q6')) return 6.5;
  if (s.includes('q5')) return 5.5;
  if (s.includes('q4')) return 4.5;
  return 4.5;
}

/** Estimación del peso en memoria (weights + overhead). Etiquetada siempre como estimación. */
function estimateGB(paramsB: number, bits: number): number {
  return ((paramsB * bits) / 8) * 1.05;
}

function classifyCompat(
  modelGB: number,
  vram: number,
  ram: number,
): { level: CompatLevel; label: string; vramEst: string; detail: string } {
  const low = (modelGB * 0.9).toFixed(1);
  const high = (modelGB * 1.1).toFixed(1);
  const vramEst = `${low}–${high} GB`;
  if (modelGB <= vram * 0.85) {
    return {
      level: 'excellent',
      label: 'Excelente para tu hardware',
      vramEst,
      detail: `Cabe en tu VRAM (${vram} GB) con holgura.`,
    };
  }
  if (modelGB <= vram * 1.5) {
    return {
      level: 'good',
      label: 'Compatible',
      vramEst,
      detail: `Entra con offload parcial a RAM (VRAM de ${vram} GB).`,
    };
  }
  if (modelGB <= ram * 0.7) {
    return {
      level: 'slow',
      label: 'Puede ser lento',
      vramEst,
      detail: `No cabe en VRAM (${vram} GB): iría por CPU/RAM (${ram} GB), funcionará pero lento.`,
    };
  }
  return {
    level: 'no',
    label: 'No recomendado',
    vramEst,
    detail: `Requiere ≈${vramEst} de VRAM; tu equipo tiene ${vram} GB.`,
  };
}

/** Score 0..1 para ranking: calidad + eficiencia + compatibilidad + datos reales de popularidad. */
function computeScore(
  entry: CatalogEntry,
  compat: CompatLevel,
): { score: number; efficiency: number } {
  const compatW = { excellent: 1.0, good: 0.75, slow: 0.45, no: 0.05 }[compat];
  const paramsB = parseParamsB(entry.params) ?? 8;
  const paramsF = Math.log2(paramsB + 1) / Math.log2(71);
  const ctxF = Math.min(1, (entry.contextMax ?? 0) / 131072);
  const capsF = Math.min(1, (entry.capabilities ?? []).filter((c) => c !== 'Texto').length / 3);
  const permissive = ['apache', 'mit', 'bsd'].some((l) =>
    (entry.license || '').toLowerCase().includes(l),
  );
  const licF = permissive ? 1 : 0.85;
  const base = 0.35 * compatW + 0.25 * paramsF + 0.15 * ctxF + 0.15 * capsF + 0.1 * licF;
  const pop =
    entry.source === 'huggingface'
      ? Math.min(1, Math.log10((entry.downloads ?? 0) + 1) / 7)
      : entry.source === 'github'
        ? Math.min(1, (entry.stars ?? 0) / 20000)
        : entry.source === 'civitai'
          ? Math.min(1, Math.log10((entry.downloads ?? 0) + 1) / 8)
          : 0;
  const score = entry.source === 'catalog' ? base : 0.7 * base + 0.3 * pop;
  const modelGB = Math.max(estimateGB(paramsB, quantBits(entry.quant)), 0.2);
  return { score, efficiency: score / modelGB };
}

function loadHardware(): HardwareConfig {
  try {
    const raw = localStorage.getItem(HW_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        gpu: typeof p.gpu === 'string' ? p.gpu : '',
        vram: Number(p.vram) || 8,
        ram: Number(p.ram) || 16,
        detected: Boolean(p.detected),
      };
    }
  } catch {
    /* ignore */
  }
  return { gpu: '', vram: 8, ram: 16, detected: false };
}

function saveHardware(hw: HardwareConfig) {
  try {
    localStorage.setItem(HW_KEY, JSON.stringify(hw));
  } catch {
    /* ignore */
  }
}

/** Detección best-effort vía WebGL + navigator.deviceMemory. La VRAM no es
 *  detectable de forma fiable desde el navegador: se sugiere por GPU y el
 *  usuario puede ajustarla (la UI lo marca como estimación). */
function detectGpu(): { gpu: string; vram: number } {
  let gpu = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const info = String(gl.getParameter((ext as any).UNMASKED_RENDERER_WEBGL) || '');
        const m = info.match(
          /(RTX\s*[A-Za-z0-9 ]*|GTX\s*[A-Za-z0-9 ]*|RX\s*[A-Za-z0-9 ]*|Arc\s*[A-Za-z0-9 ]*|Apple\s*M\d+|Intel\s*(UHD|Iris|HD)\s*[A-Za-z0-9 ]*)/i,
        );
        gpu = (m ? m[1] : info.split(',')[0]).trim().slice(0, 60);
      }
    }
  } catch {
    /* ignore */
  }
  const g = gpu.toLowerCase();
  let vram = 8;
  if (/4090|3090/.test(g)) vram = 24;
  else if (/4080|4070\s*ti|3080|7900/.test(g)) vram = 16;
  else if (/4070|3060/.test(g)) vram = 12;
  else if (/3070|4060|4050|3050|A770/.test(g)) vram = 8;
  return { gpu, vram };
}

function sizeBucket(paramsB: number | null): string | null {
  if (paramsB == null) return null;
  if (paramsB < 3) return '<3B';
  if (paramsB < 7) return '3B–7B';
  if (paramsB < 14) return '7B–14B';
  if (paramsB < 32) return '14B–32B';
  if (paramsB < 70) return '32B–70B';
  return '>70B';
}

function contextBucket(ctx?: number | null): string | null {
  if (!ctx) return null;
  if (ctx >= 131072) return '128K+';
  if (ctx >= 65536) return '64K+';
  if (ctx >= 32768) return '32K+';
  if (ctx >= 8192) return '8K+';
  return null;
}

function applyFilters(models: CatalogEntry[], f: Filters, hw: HardwareConfig): CatalogEntry[] {
  return models.filter((m) => {
    const paramsB = parseParamsB(m.params);
    const bucket = sizeBucket(paramsB);
    if (f.sizes.length > 0 && (!bucket || !f.sizes.includes(bucket))) return false;
    if (f.architectures.length > 0 && (!m.architecture || !f.architectures.includes(m.architecture)))
      return false;
    if (f.modalities.length > 0 && (!m.modality || !f.modalities.includes(m.modality)))
      return false;
    if (
      f.caps.length > 0 &&
      !(m.capabilities ?? []).some((c) => f.caps.includes(CAPABILITY_LABELS[c] ?? c))
    )
      return false;
    const ctx = contextBucket(m.contextMax);
    if (f.contexts.length > 0 && (!ctx || !f.contexts.includes(ctx))) return false;
    if (f.compatibleOnly) {
      const modelGB = paramsB ? estimateGB(paramsB, quantBits(m.quant)) : 0;
      if (modelGB <= 0) return false;
      const { level } = classifyCompat(modelGB, hw.vram, hw.ram);
      if (level !== 'excellent' && level !== 'good') return false;
    }
    return true;
  });
}

/** Normaliza un id de modelo para comparar instalados (quita :latest, minúsculas). */
function normalizeModelId(id: string): string {
  return id.toLowerCase().replace(/:latest$/, '');
}

/** Id de descarga: ollamaTag del catálogo, GGUF de HF (hf.co/repo) o el id crudo. */
function downloadIdFor(entry: CatalogEntry): string {
  if (entry.ollamaTag) {
    return entry.ollamaTag;
  }
  if (entry.source === 'huggingface' && entry.hfRepo) {
    return `hf.co/${entry.hfRepo}`;
  }
  return entry.id;
}

function canDownloadEntry(entry: CatalogEntry): boolean {
  const source = entry.source ?? 'catalog';
  return (source === 'catalog' && Boolean(entry.ollamaTag)) || source === 'huggingface';
}

/** ¿El entry ya está instalado (comparando con los modelos de Ollama)? */
function isInstalled(entry: CatalogEntry, installedSet: Set<string>): boolean {
  const source = entry.source ?? 'catalog';
  if (source === 'catalog' && entry.ollamaTag) {
    return installedSet.has(normalizeModelId(entry.ollamaTag));
  }
  if (source === 'huggingface' && entry.hfRepo) {
    return installedSet.has(normalizeModelId(`hf.co/${entry.hfRepo}`));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Componentes pequeños                                               */
/* ------------------------------------------------------------------ */

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        connected ? 'bg-green-500' : 'bg-text-secondary',
      )}
    />
  );
}

function StatusBadge({ status }: { status: ProviderStatus | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
        <span className="size-1.5 rounded-full bg-text-secondary" aria-hidden="true" />
        Desconocido
      </span>
    );
  }
  if (status.connected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Conectado{status.version ? ` · v${status.version}` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
      <XCircle className="size-3" aria-hidden="true" />
      No disponible
    </span>
  );
}

const COMPAT_STYLES: Record<CompatLevel, string> = {
  excellent: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
  good: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  slow: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  no: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
};

function CompatBadge({ compat }: { compat: ReturnType<typeof classifyCompat> }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        COMPAT_STYLES[compat.level],
      )}
      title={`${compat.label}. ${compat.detail} (estimación)`}
    >
      <HardDrive className="size-3" aria-hidden="true" />
      {compat.label}
      <span className="opacity-80">· VRAM ≈ {compat.vramEst}</span>
    </span>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-surface-tertiary px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Motores instalados (FASE 34) — categoría INSTALADOS                */
/* ------------------------------------------------------------------ */

interface EngineState {
  ok: boolean;
  detail?: string;
}

/** Health check ligero de un motor (nunca bloquea la UI). */
function useEngineHealth(url: string) {
  const [state, setState] = useState<EngineState>({ ok: false });
  const [checked, setChecked] = useState(false);
  const refresh = useCallback(async () => {
    setChecked(false);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });
      const json = await res.json().catch(() => ({}));
      const ok = res.ok && Boolean(json?.ok || json?.system);
      setState({ ok, detail: ok ? undefined : json?.error || `HTTP ${res.status}` });
    } catch (e) {
      setState({ ok: false, detail: String((e as Error)?.message || e) });
    } finally {
      setChecked(true);
    }
  }, [url]);
  return { state, checked, refresh };
}

/**
 * Strip compacto de MOTORES INSTALADOS: ComfyUI, Kokoro y faster-whisper
 * con su estado en vivo. Es la parte de "motores" de la categoría
 * INSTALADOS (los modelos instalados y los providers Ollama/llama.cpp/
 * LM Studio viven en la lista de abajo).
 */
function InstalledEnginesStrip() {
  const comfy = useEngineHealth('/api/comfyui/health');
  const runtimes = useEngineHealth('/api/ai-runtimes/health');

  const engines: { name: string; state: EngineState; checked: boolean; refresh: () => void }[] = [
    { name: 'ComfyUI', state: comfy.state, checked: comfy.checked, refresh: comfy.refresh },
    { name: 'Kokoro (TTS)', state: runtimes.state, checked: runtimes.checked, refresh: runtimes.refresh },
    { name: 'whisper (STT)', state: runtimes.state, checked: runtimes.checked, refresh: runtimes.refresh },
  ];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Motores instalados
        </p>
        <button
          type="button"
          onClick={() => {
            void comfy.refresh();
            void runtimes.refresh();
          }}
          className="text-[10px] text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          Actualizar estados
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {engines.map((e) => (
          <span
            key={e.name}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
              !e.checked
                ? 'border-border-light bg-surface-tertiary text-text-secondary'
                : e.state.ok
                  ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'border-red-500/30 bg-red-500/10 text-red-500',
            )}
            title={e.state.detail}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full',
                !e.checked ? 'bg-text-secondary' : e.state.ok ? 'bg-green-500' : 'bg-red-500',
              )}
            />
            {e.name}
            {e.checked && (e.state.ok ? ' ✓' : ' ✗')}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta de modelo instalado                                        */
/* ------------------------------------------------------------------ */

function InstalledModelCard({
  model,
  onUse,
  onDelete,
  canUse,
  canDelete,
  deleting,
  hw,
}: {
  model: LocalModel;
  onUse: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  canUse: boolean;
  canDelete: boolean;
  deleting?: boolean;
  hw: HardwareConfig;
}) {
  const badges = [
    model.sizeHuman,
    model.parameters,
    model.quantization,
    model.license ? `Licencia: ${shortLicense(model.license)}` : null,
  ].filter((b): b is string => Boolean(b));
  const meta = [
    model.architecture ? `Arquitectura: ${model.architecture}` : null,
    model.contextLength ? `Contexto: ${model.contextLength.toLocaleString()}` : null,
    model.modifiedAt ? `Modificado: ${new Date(model.modifiedAt).toLocaleDateString()}` : null,
  ].filter((m): m is string => Boolean(m));
  const capabilities = model.capabilities ?? [];

  const paramsB = parseParamsB(model.parameters);
  const compat = paramsB
    ? classifyCompat(estimateGB(paramsB, quantBits(model.quantization)), hw.vram, hw.ram)
    : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-light bg-surface-secondary p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary" title={model.name}>
            {model.name}
          </p>
          <p className="text-xs text-text-secondary">Local · {model.provider}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onUse(model.name)}
            disabled={!canUse}
            title={canUse ? 'Usar este modelo en el chat' : 'Sin endpoint de chat configurado'}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              canUse
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'cursor-not-allowed bg-surface-tertiary text-text-secondary',
            )}
          >
            Usar
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete?.(model.name)}
              disabled={deleting}
              title="Borrar este modelo del disco"
              className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {deleting ? (
                <Spinner className="size-3" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3" aria-hidden="true" />
              )}
              Borrar
            </button>
          )}
        </div>
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((badge) => (
            <MetaChip key={badge}>{badge}</MetaChip>
          ))}
        </div>
      )}
      {compat && <CompatBadge compat={compat} />}
      {meta.length > 0 && (
        <p className="truncate text-[11px] text-text-secondary" title={meta.join(' · ')}>
          {meta.join(' · ')}
        </p>
      )}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-text-secondary">Capacidades:</span>
          {capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded-full border border-border-light px-1.5 py-0.5 text-[10px] text-text-primary"
            >
              {CAPABILITY_LABELS[cap] ?? cap}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hardware + filtros                                                 */
/* ------------------------------------------------------------------ */

function HardwareCard({
  hw,
  onChange,
}: {
  hw: HardwareConfig;
  onChange: (hw: HardwareConfig) => void;
}) {
  const [gpuDraft, setGpuDraft] = useState(hw.gpu);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    setGpuDraft(hw.gpu);
  }, [hw.gpu]);

  const handleDetect = () => {
    setDetecting(true);
    setTimeout(() => {
      const { gpu, vram } = detectGpu();
      const ram = (navigator as any).deviceMemory || 16;
      onChange({ gpu, vram, ram, detected: true });
      setDetecting(false);
    }, 50);
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-light bg-surface-tertiary/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <Laptop className="size-3.5" aria-hidden="true" />
          Mi hardware
        </p>
        <button
          type="button"
          onClick={handleDetect}
          disabled={detecting}
          className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {detecting ? (
            <Spinner className="size-3" aria-hidden="true" />
          ) : (
            <Cpu className="size-3" aria-hidden="true" />
          )}
          {detecting ? 'Detectando…' : 'Detectar automáticamente'}
        </button>
      </div>
      {hw.detected && (
        <p className="text-[10px] text-green-600 dark:text-green-400">
          ✓ Configuración detectada — ajusta si es necesario (estimación).
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[10px] text-text-secondary">
          GPU
          <input
            type="text"
            value={gpuDraft}
            onChange={(e) => {
              setGpuDraft(e.target.value);
              onChange({ ...hw, gpu: e.target.value, detected: false });
            }}
            placeholder="Ej. RTX 3060"
            className="h-7 w-full rounded-md border border-border-light bg-surface-secondary px-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
          VRAM (GB)
          <select
            value={hw.vram}
            onChange={(e) => onChange({ ...hw, vram: Number(e.target.value), detected: false })}
            className="h-7 rounded-md border border-border-light bg-surface-secondary px-1.5 text-xs text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {[4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-text-secondary">
          RAM (GB)
          <select
            value={hw.ram}
            onChange={(e) => onChange({ ...hw, ram: Number(e.target.value), detected: false })}
            className="h-7 rounded-md border border-border-light bg-surface-secondary px-1.5 text-xs text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {[8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[10px] text-text-secondary">
        La VRAM no es detectable de forma fiable desde el navegador: se sugiere por GPU y puedes
        ajustarla. Las estimaciones de compatibilidad son aproximadas.
      </p>
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (key: keyof Filters, value: string) => {
    const list = filters[key] as string[];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onChange({ ...filters, [key]: next });
  };

  const group = (label: string, key: keyof Filters, options: string[]) => (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = (filters[key] as string[]).includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(key, opt)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border-light bg-surface-secondary text-text-secondary hover:text-text-primary',
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-light bg-surface-tertiary/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Filtros
        </p>
        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-text-secondary">
          <input
            type="checkbox"
            checked={filters.compatibleOnly}
            onChange={(e) => onChange({ ...filters, compatibleOnly: e.target.checked })}
            className="size-3.5"
          />
          ✓ Compatible con mi PC
        </label>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="text-[11px] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {open ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-1.5">
          {group('Tamaño', 'sizes', ['<3B', '3B–7B', '7B–14B', '14B–32B', '32B–70B', '>70B'])}
          {group('Arquitectura', 'architectures', ['Dense', 'MoE'])}
          {group('Modalidad', 'modalities', ['Texto', 'Multimodal', 'Visión', 'Audio'])}
          {group(
            'Capacidades',
            'caps',
            ['Tools', 'Reasoning', 'Visión', 'Coding', 'Structured output'],
          )}
          {group('Contexto', 'contexts', ['8K+', '32K+', '64K+', '128K+'])}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta de catálogo / fuentes externas                             */
/* ------------------------------------------------------------------ */

function ExploreCard({
  entry,
  pulling,
  installed,
  hfQuants,
  quantOpen,
  quantSel,
  onDownload,
  onDownloadQuant,
  onToggleQuant,
  onSelectQuant,
  onPause,
  onResume,
  hw,
  diskSpace,
  badge,
}: {
  entry: CatalogEntry;
  pulling?: PullState;
  installed: boolean;
  hfQuants?: { quants: HfQuant[]; error?: string } | null;
  quantOpen?: boolean;
  quantSel?: string;
  onDownload: (entry: CatalogEntry) => void;
  onDownloadQuant: (modelId: string, quant: string) => void;
  onToggleQuant: (id: string) => void;
  onSelectQuant: (id: string, quant: string) => void;
  onPause: (modelId: string) => void;
  onResume: (modelId: string) => void;
  hw: HardwareConfig;
  diskSpace?: { freeBytes: number; totalBytes: number } | null;
  badge?: string;
}) {
  const source = entry.source || 'catalog';
  const badges = [
    entry.params ? `Params: ${entry.params}` : null,
    entry.quant ? `Quant: ${entry.quant}` : null,
    entry.sizeHuman
      ? entry.sizeReal
        ? `Disco: ${entry.sizeHuman}`
        : `Disco: ~${entry.sizeHuman}`
      : null,
    entry.contextMax ? `Contexto: ${entry.contextMax.toLocaleString()}` : null,
    entry.pipelineTag ? `Tipo: ${entry.pipelineTag}` : null,
    entry.architecture ? `Arquitectura: ${entry.architecture}` : null,
    entry.license ? `Licencia: ${shortLicense(entry.license)}` : null,
    entry.downloads ? `Descargas: ${entry.downloads.toLocaleString()}` : null,
    entry.likes ? `Likes: ${entry.likes.toLocaleString()}` : null,
    entry.stars ? `Stars: ${entry.stars.toLocaleString()}` : null,
  ].filter((b): b is string => Boolean(b));

  const paramsB = parseParamsB(entry.params);
  const compat = paramsB
    ? classifyCompat(estimateGB(paramsB, quantBits(entry.quant)), hw.vram, hw.ram)
    : null;

  const isPulling = Boolean(pulling && (pulling.status === 'pulling' || pulling.status === 'conectando…'));
  const isPaused = Boolean(pulling?.paused);
  const active = isPulling && pulling?.total;
  const percent = active
    ? Math.min(100, Math.round(((pulling?.completed ?? 0) / (pulling?.total ?? 1)) * 100))
    : 0;

  const canDownload =
    (source === 'catalog' && Boolean(entry.ollamaTag)) || source === 'huggingface';
  const hfRepo = source === 'huggingface' ? entry.hfRepo : null;

  // FASE 20 — espacio en disco: ¿cabe el tamaño conocido (catálogo real o
  // cuantización seleccionada) en el volumen de Ollama?
  const sizeBytesKnown =
    typeof entry.sizeBytes === 'number' && entry.sizeBytes > 0 ? entry.sizeBytes : null;
  const fitsDisk = (bytes: number | null): boolean => {
    if (!bytes || !diskSpace?.freeBytes) return true;
    return bytes < diskSpace.freeBytes;
  };
  const noDisk = !fitsDisk(sizeBytesKnown);
  const freeHuman = diskSpace?.freeBytes ? humanBytes(diskSpace.freeBytes) : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-light bg-surface-secondary p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate font-medium text-text-primary" title={entry.name}>
            {entry.name}
            {badge && <span className="shrink-0 text-xs">{badge}</span>}
            {installed && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400"
                title="Ya está instalado en tu equipo"
              >
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Instalado
              </span>
            )}
          </p>
          <p className="text-xs text-text-secondary">
            {entry.family} ·{' '}
            {source === 'catalog'
              ? 'descarga vía Ollama'
              : source === 'huggingface'
                ? 'Hugging Face · GGUF vía Ollama'
                : source === 'civitai'
                  ? 'Civitai · imagen/video/animación'
                  : 'GitHub'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {source === 'huggingface' && hfRepo && (
            <a
              href={`https://huggingface.co/${hfRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              Ver en HF
            </a>
          )}
          {(source === 'github' || source === 'civitai') && entry.htmlUrl && (
            <a
              href={entry.htmlUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              {source === 'civitai' ? 'Ver en Civitai' : 'Ver repo'}
            </a>
          )}
          {canDownload && installed && !isPulling && !isPaused && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2.5 py-1 text-xs text-text-secondary">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Instalado
            </span>
          )}
          {canDownload && isPulling && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPause(downloadIdFor(entry))}
                title="Pausar la descarga"
                className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Pause className="size-3" aria-hidden="true" />
                Pausar
              </button>
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 font-mono text-xs text-text-secondary">
                {percent || 0}%
              </span>
            </div>
          )}
          {canDownload && isPaused && (
            <button
              type="button"
              onClick={() => onResume(downloadIdFor(entry))}
              title="Reanudar la descarga (Ollama continúa desde donde quedó)"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Play className="size-3" aria-hidden="true" />
              Reanudar
            </button>
          )}
          {canDownload && !isPulling && !isPaused && !installed && (
            <button
              type="button"
              onClick={() =>
                hfRepo && hfQuants && hfQuants.quants.length > 1
                  ? onToggleQuant(entry.id)
                  : onDownload(entry)
              }
              title={
                noDisk
                  ? `No cabe en disco: el modelo pesa ${entry.sizeHuman ?? ''} y quedan ${freeHuman ?? '?'} libres.`
                  : compat && compat.level === 'no'
                    ? `No recomendado: ${compat.detail} (estimación)`
                    : source === 'huggingface'
                      ? 'Descargar GGUF con Ollama (hf.co)'
                      : 'Descargar con Ollama'
              }
              disabled={noDisk}
              aria-disabled={noDisk}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                noDisk
                  ? 'cursor-not-allowed bg-amber-500/15 text-amber-600/80 dark:text-amber-400/80'
                  : compat && compat.level === 'no'
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
                    : 'bg-primary text-primary-foreground hover:opacity-90',
              )}
            >
              <Download className="size-3" aria-hidden="true" />
              {noDisk ? 'Sin espacio' : 'Descargar'}
            </button>
          )}
        </div>
      </div>
      {isPulling && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {isPaused && (
        <p className="text-[11px] text-text-secondary">
          ⏸ Descarga pausada al {pulling?.percent ?? 0}% — pulsa «Reanudar» para continuar.
        </p>
      )}
      {pulling && !isPulling && !isPaused && (
        <p className="text-[11px] text-text-secondary">
          {pulling.status === 'success' || pulling.status === 'done'
            ? 'Descarga completada'
            : pulling.status === 'error'
              ? 'Error en la descarga (revisa el repo o la conexión)'
              : pulling.status}
        </p>
      )}
      {quantOpen && hfRepo && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border-light bg-surface-tertiary/50 p-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            Cuantización
          </p>
          {hfQuants?.error ? (
            <p className="text-[10px] text-text-secondary">
              No se pudieron listar las cuantizaciones ({hfQuants.error}). Se usará la predeterminada.
            </p>
          ) : !hfQuants ? (
            <p className="flex items-center gap-1 text-[10px] text-text-secondary">
              <Spinner className="size-3" aria-hidden="true" />
              Consultando cuantizaciones…
            </p>
          ) : (
            <div className="flex items-center gap-1.5">
              <select
                value={quantSel}
                onChange={(e) => onSelectQuant(entry.id, e.target.value)}
                className="h-7 min-w-0 flex-1 rounded-md border border-border-light bg-surface-secondary px-1.5 text-xs text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Cuantización de ${entry.name}`}
              >
                {hfQuants.quants.map((q) => {
                  const qFits = fitsDisk(q.size);
                  return (
                    <option key={q.quant} value={q.quant}>
                      {q.quant}
                      {q.size ? ` · ${humanBytes(q.size)}` : ''}
                      {q.size && !qFits ? ` · ⚠ no cabe (${freeHuman})` : ''}
                    </option>
                  );
                })}
              </select>
              {(() => {
                const selQuant = hfQuants.quants.find((q) => q.quant === quantSel);
                const selFits = fitsDisk(selQuant?.size ?? null);
                return (
                  <button
                    type="button"
                    onClick={() =>
                      selQuant && !selFits
                        ? undefined
                        : onDownloadQuant(entry.id, quantSel || hfQuants.quants[0]?.quant || '')
                    }
                    disabled={Boolean(selQuant && !selFits)}
                    title={
                      selQuant && !selFits
                        ? `No cabe: ${humanBytes(selQuant.size as number)} > ${freeHuman ?? '?'} libres`
                        : 'Descargar esta cuantización'
                    }
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed',
                      selQuant && !selFits
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        : 'bg-primary text-primary-foreground hover:opacity-90',
                    )}
                  >
                    <Download className="size-3" aria-hidden="true" />
                    Descargar
                  </button>
                );
              })()}
            </div>
          )}
        </div>
      )}
      {noDisk && (
        <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <CircleAlert className="size-3 shrink-0" aria-hidden="true" />
          No cabe en disco: pesa {entry.sizeHuman ?? 'desconocido'} y quedan{' '}
          {freeHuman ?? '?'} libres en el volumen de Ollama.
        </p>
      )}
      {compat && <CompatBadge compat={compat} />}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => (
            <MetaChip key={b}>{b}</MetaChip>
          ))}
        </div>
      )}
      {entry.description && (
        <p className="line-clamp-2 text-[11px] text-text-secondary">{entry.description}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel principal                                                    */
/* ------------------------------------------------------------------ */

export type LocalModelsCategory =
  | 'llm'
  | 'imagen'
  | 'video'
  | 'animacion'
  | 'voz'
  | 'stt'
  | 'audio'
  | 'musica'
  | 'embeddings'
  | 'multimodal'
  | 'vision'
  | 'ocr'
  | 'traduccion'
  | '3d'
  | 'reranking'
  | 'codigo'
  | 'agentes'
  | 'robotica';

export default function LocalModelsPanel({
  onUseModel,
  initialTab = 'installed',
  initialCategory = 'llm',
  fixedCategory = false,
  showUrlInput = false,
}: {
  onUseModel: (providerId: string, modelId: string) => void;
  /** FASE 30 — el selector universal puede abrir el panel pre-filtrado. */
  initialTab?: 'installed' | 'explore';
  initialCategory?: LocalModelsCategory;
  /** FASE 31 — oculta los chips de categoría y fija la categoría inicial
   *  (el Explorar de "Modelos locales" queda solo-LLM; los bloques del
   *  selector universal quedan fijados a su modalidad). */
  fixedCategory?: boolean;
  /** FASE 31 — muestra el campo para pegar la URL de un proyecto/modelo
   *  (Hugging Face, GitHub o id de Ollama) y agregarlo a los resultados. */
  showUrlInput?: boolean;
}) {
  const localize = useLocalize();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const [tab, setTab] = useState<'installed' | 'explore'>(initialTab);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');

  const [source, setSource] = useState<'catalog' | 'huggingface' | 'github' | 'civitai'>(
    // FASE 30: el catálogo curado solo contiene LLMs; si el selector universal
    // pide imagen/video/voz/audio/embeddings/multimodal, Hugging Face es la
    // fuente que sí filtra por pipeline_tag → se preselecciona.
    initialCategory === 'llm' ? 'catalog' : 'huggingface',
  );
  // FASE 26: categoría del Explorar — separa LLM de imagen/video/voz/audio/embeddings.
  // FASE 31: con fixedCategory, la categoría queda fija (chips ocultos).
  const [category, setCategory] = useState<LocalModelsCategory>(initialCategory);
  // FASE 31: URL de proyecto pegado por el usuario (resuelta por el backend).
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogEntry[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const [hw, setHw] = useState<HardwareConfig>(loadHardware);
  const [filters, setFilters] = useState<Filters>({
    sizes: [],
    architectures: [],
    modalities: [],
    caps: [],
    contexts: [],
    compatibleOnly: false,
  });

  const [pulls, setPulls] = useState<Record<string, PullState>>({});
  const pullAborts = useRef<Record<string, AbortController>>({});
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Espacio libre del volumen de Ollama (FASE 20) — null si no se puede saber. */
  const [diskSpace, setDiskSpace] = useState<{ freeBytes: number; totalBytes: number } | null>(
    null,
  );

  const [hfQuants, setHfQuants] = useState<Record<string, { quants: HfQuant[]; error?: string }>>({});
  const [quantOpen, setQuantOpen] = useState<Record<string, boolean>>({});
  const [quantSel, setQuantSel] = useState<Record<string, string>>({});

  const setHardware = useCallback((next: HardwareConfig) => {
    setHw(next);
    saveHardware(next);
  }, []);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson('/api/local-models');
      setProviders(data.providers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadResults = useCallback(async (src: string, q: string, cat: string) => {
    setResultsLoading(true);
    setResultsError(null);
    try {
      const data = await fetchJson(
        `/api/local-models/search?source=${encodeURIComponent(src)}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`,
      );
      setResults(data.models ?? []);
    } catch (err) {
      setResults([]);
      setResultsError(err instanceof Error ? err.message : 'error de conexión');
    } finally {
      setResultsLoading(false);
    }
  }, []);

  /** Carga las cuantizaciones GGUF de un repo HF y devuelve la lista (FASE 19). */
  const loadQuants = useCallback(async (id: string): Promise<HfQuant[]> => {
    const repo = id.replace(/^hf\.co\//, '');
    try {
      const data = await fetchJson(
        `/api/local-models/hf-quants?repo=${encodeURIComponent(repo)}`,
      );
      const quants = data.quants ?? [];
      setHfQuants((prev) => ({ ...prev, [id]: { quants } }));
      if (quants.length > 0) {
        setQuantSel((prev) => {
          if (prev[id]) return prev;
          const preferred = quants.find((q: HfQuant) =>
            ['Q4_K_M', 'q4_k_m', 'Q4_0', 'q4_0'].includes(q.quant),
          );
          return { ...prev, [id]: (preferred ?? quants[0]).quant };
        });
      }
      return quants;
    } catch (err) {
      setHfQuants((prev) => ({
        ...prev,
        [id]: { quants: [], error: err instanceof Error ? err.message : 'error' },
      }));
      return [];
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    fetchJson('/api/local-models/ollama/space')
      .then((data) => {
        if (data?.space) {
          setDiskSpace(data.space);
        }
      })
      .catch(() => {
        /* sin acceso al espacio → se omite la validación */
      });
  }, []);

  useEffect(() => {
    if (tab === 'explore') {
      if (queryTimer.current) {
        clearTimeout(queryTimer.current);
      }
      queryTimer.current = setTimeout(() => {
        void loadResults(source, query, category);
      }, 250);
      return () => {
        if (queryTimer.current) {
          clearTimeout(queryTimer.current);
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, source, query, category]);

  const pausePull = useCallback((modelId: string) => {
    const controller = pullAborts.current[modelId];
    if (!controller) {
      return;
    }
    setPulls((prev) => {
      const cur = prev[modelId] || {};
      return {
        ...prev,
        [modelId]: { ...cur, paused: true, status: 'paused' },
      };
    });
    controller.abort();
  }, []);

  const startPull = useCallback(
    (modelId: string, quant?: string) => {
      const finalId = quant ? `${modelId}:${quant}` : modelId;
      const current = pulls[finalId];
      if ((current && !current.paused) || pullAborts.current[finalId]) {
        return;
      }
      const controller = new AbortController();
      pullAborts.current[finalId] = controller;
      setPulls((prev) => ({
        ...prev,
        [finalId]: { status: 'conectando…', paused: false, percent: current?.percent },
      }));

      authFetch('/api/local-models/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ model: finalId }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status}`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
              const chunk = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const line = chunk
                .split('\n')
                .find((l) => l.startsWith('data:'))
                ?.slice(5)
                .trim();
              if (!line) continue;
              try {
                const evt = JSON.parse(line);
                setPulls((prev) => {
                  const cur = prev[finalId] || {};
                  return {
                    ...prev,
                    [finalId]: {
                      status: evt.status || cur.status,
                      completed: evt.completed ?? cur.completed,
                      total: evt.total ?? cur.total,
                      percent: evt.total
                        ? Math.min(100, Math.round(((evt.completed ?? 0) / evt.total) * 100))
                        : cur.percent,
                      paused: false,
                    },
                  };
                });
                if (evt.status === 'done' || evt.status === 'success') {
                  void loadProviders();
                  void loadResults(source, query, category);
                }
              } catch {
                /* ignorar línea no-JSON */
              }
            }
          }
        })
        .catch(() => {
          setPulls((prev) => {
            const cur = prev[finalId];
            if (cur && cur.paused) {
              return { ...prev, [finalId]: { ...cur, status: 'paused' } };
            }
            return { ...prev, [finalId]: { status: 'error', percent: cur?.percent } };
          });
        })
        .finally(() => {
          delete pullAborts.current[finalId];
          setTimeout(() => {
            setPulls((prev) => {
              const cur = prev[finalId];
              if (cur && cur.paused) {
                return prev;
              }
              const next = { ...prev };
              delete next[finalId];
              return next;
            });
          }, 4000);
        });
    },
    [loadProviders, loadResults, pulls, query, source, category],
  );

  const resumePull = useCallback(
    (modelId: string) => {
      startPull(modelId);
    },
    [startPull],
  );

  /**
   * Click en «Descargar» de una tarjeta: para HF carga las cuantizaciones y
   * decide — >1 abre el selector, 1 descarga esa, 0 descarga el repo directo
   * (Ollama avisa si el repo no es GGUF). Para catálogo descarga directa.
   */
  const handleCardDownload = useCallback(
    async (entry: CatalogEntry) => {
      if (entry.source === 'huggingface' && entry.hfRepo) {
        const id = downloadIdFor(entry);
        const quants = await loadQuants(id);
        if (quants.length > 1) {
          setQuantOpen((prev) => ({ ...prev, [entry.id]: true }));
        } else if (quants.length === 1) {
          startPull(`${id}:${quants[0].quant}`);
        } else {
          startPull(id);
        }
        return;
      }
      startPull(downloadIdFor(entry));
    },
    [loadQuants, startPull],
  );

  /** FASE 31 — resuelve la URL/id pegado por el usuario y lo agrega arriba. */
  const resolveUrl = useCallback(async () => {
    const raw = urlInput.trim();
    if (!raw) {
      return;
    }
    setUrlBusy(true);
    setUrlError(null);
    try {
      const data = await fetchJson(
        `/api/local-models/resolve-url?url=${encodeURIComponent(raw)}`,
      );
      const entry = data?.model;
      if (!entry) {
        throw new Error('sin respuesta del servidor');
      }
      // Añade el modelo resuelto a la lista de resultados (evita duplicados).
      setResults((prev) => {
        const seen = prev.map((e) => `${e.source ?? ''}:${e.id}`);
        if (seen.includes(`${entry.source ?? ''}:${entry.id}`)) {
          return prev;
        }
        return [entry, ...prev];
      });
      setUrlInput('');
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'error de conexión');
    } finally {
      setUrlBusy(false);
    }
  }, [urlInput]);

  const deleteModel = useCallback(
    async (modelId: string) => {
      const ok = window.confirm(
        `¿Borrar «${modelId}» del disco? Se liberará el espacio pero se perderá el modelo instalado.`,
      );
      if (!ok) {
        return;
      }
      setDeleting((prev) => ({ ...prev, [modelId]: true }));
      try {
        const res = await authFetch('/api/local-models/ollama/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelId }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        await loadProviders();
      } catch (err) {
        window.alert(
          `No se pudo borrar el modelo: ${err instanceof Error ? err.message : 'error de conexión'}`,
        );
      } finally {
        setDeleting((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }
    },
    [loadProviders],
  );

  const connectedCount = useMemo(
    () => providers.filter((p) => p.enabled && p.status?.connected).length,
    [providers],
  );

  const visibleProviders = useMemo(() => {
    if (selectedProvider === 'all') {
      return providers;
    }
    return providers.filter((p) => p.id === selectedProvider);
  }, [providers, selectedProvider]);

  const installedModels = useMemo(
    () => visibleProviders.flatMap((p) => p.models.map((m) => ({ provider: p, model: m }))),
    [visibleProviders],
  );

  const installedSet = useMemo(
    () =>
      new Set(
        providers.flatMap((p) => p.models.map((m) => normalizeModelId(m.name))),
      ),
    [providers],
  );

  const filteredResults = useMemo(
    () => applyFilters(results, filters, hw),
    [results, filters, hw],
  );

  const ranked = useMemo(() => {
    return filteredResults
      .map((entry) => {
        const paramsB = parseParamsB(entry.params);
        const modelGB = paramsB ? estimateGB(paramsB, quantBits(entry.quant)) : 0;
        const compat = modelGB > 0 ? classifyCompat(modelGB, hw.vram, hw.ram) : null;
        const { score, efficiency } = computeScore(entry, compat?.level ?? 'no');
        return { entry, compat, score, efficiency };
      })
      .sort((a, b) => b.score - a.score);
  }, [filteredResults, hw]);

  const recommended = useMemo(() => ranked.filter((r) => r.compat).slice(0, 3), [ranked]);

  const badges = useMemo(() => {
    const map = new Map<string, string | null>();
    const eligible = ranked.filter((r) => r.compat);
    const top = eligible[0];
    if (top) {
      map.set(top.entry.id, '🏆');
    }
    const bestEff = [...eligible].sort((a, b) => b.efficiency - a.efficiency)[0];
    if (bestEff) {
      map.set(bestEff.entry.id, `${map.get(bestEff.entry.id) ?? ''} ⚡`);
    }
    const hfTrending = ranked
      .filter((r) => r.entry.source === 'huggingface' && (r.entry.trendingScore ?? 0) > 0)
      .sort((a, b) => (b.entry.trendingScore ?? 0) - (a.entry.trendingScore ?? 0))
      .slice(0, 3);
    hfTrending.forEach((r) => {
      map.set(r.entry.id, `${map.get(r.entry.id) ?? ''} 🔥`);
    });
    ranked
      .filter(
        (r) =>
          r.entry.source === 'huggingface' &&
          (r.entry.likes ?? 0) >= 8 &&
          (r.entry.downloads ?? 0) < 20000,
      )
      .forEach((r) => {
        map.set(r.entry.id, `${map.get(r.entry.id) ?? ''} 💎`);
      });
    return map;
  }, [ranked]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 p-4 text-sm text-text-secondary"
        role="status"
      >
        <Spinner className="size-4" aria-hidden="true" />
        {localize('com_ui_loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-1.5">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-tertiary/60 p-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-tertiary">
            <OllamaIcon className="size-5 text-text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">Modelos locales</p>
            <p className="flex items-center gap-1 truncate text-xs text-text-secondary">
              <Server className="size-3 shrink-0" aria-hidden="true" />
              {connectedCount > 0
                ? `${connectedCount} runtime${connectedCount > 1 ? 's' : ''} conectado${connectedCount > 1 ? 's' : ''}`
                : 'ningún runtime disponible'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadProviders()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {/* Chips de proveedores — TODOS JUNTOS (Ollama + runtimes headless) */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setSelectedProvider('all')}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            selectedProvider === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-tertiary text-text-secondary hover:text-text-primary',
          )}
        >
          Todos
        </button>
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedProvider(p.id)}
            title={`${p.name} — ${p.endpoint}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selectedProvider === p.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-tertiary text-text-secondary hover:text-text-primary',
            )}
          >
            <StatusDot connected={Boolean(p.enabled && p.status?.connected)} />
            {p.name}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-light">
        {(
          [
            ['installed', 'Instalados'],
            ['explore', 'Explorar'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'border-b-2 px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none',
              tab === key
                ? 'border-primary text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-1.5 rounded-md border border-border-light bg-surface-tertiary/60 p-2 text-xs text-text-secondary">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            No se pudo consultar los runtimes locales ({error}). Si tu sesión expiró, la app intenta
            renovarla automáticamente.
          </span>
        </div>
      )}

      {/* ---- PESTAÑA INSTALADOS ---- */}
      {tab === 'installed' && (
        <div className="flex flex-col gap-2">
          {/* FASE 34 — motores instalados (ComfyUI / Kokoro / whisper) */}
          <InstalledEnginesStrip />
          <div className="h-px bg-border-light" />
          {visibleProviders.length === 0 && (
            <p className="rounded-md border border-dashed border-border-light p-2.5 text-xs text-text-secondary">
              No hay runtimes locales configurados.
            </p>
          )}
          {visibleProviders.map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                  <StatusDot connected={Boolean(p.enabled && p.status?.connected)} />
                  {p.name}
                </p>
                <div className="flex items-center gap-1.5">
                  {p.models.length > 0 && (
                    <span className="rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary">
                      {p.models.length} modelo{p.models.length > 1 ? 's' : ''}
                    </span>
                  )}
                  <StatusBadge status={p.status} />
                </div>
              </div>
              {!p.enabled && (
                <p className="text-[11px] text-text-secondary">Proveedor desactivado.</p>
              )}
              {p.enabled && !p.status?.connected && (
                <p className="text-[11px] text-text-secondary">
                  No responde en {p.endpoint}.{' '}
                  {p.id === 'ollama'
                    ? 'Levanta el contenedor: docker start chat-ollama'
                    : 'Inicia el servidor en el host (headless) y pulsa Actualizar.'}
                </p>
              )}
              {p.enabled && p.status?.connected && p.models.length === 0 && (
                <p className="text-[11px] text-text-secondary">
                  Conectado pero sin modelos cargados.
                </p>
              )}
              {p.models.map((m) => (
                <InstalledModelCard
                  key={m.id}
                  model={m}
                  hw={hw}
                  canUse={p.id === 'ollama'}
                  canDelete={p.id === 'ollama'}
                  deleting={Boolean(deleting[m.name])}
                  onUse={(modelId) => onUseModel(p.id, modelId)}
                  onDelete={deleteModel}
                />
              ))}
            </div>
          ))}
          {installedModels.length === 0 && connectedCount === 0 && (
            <p className="rounded-md border border-dashed border-border-light p-2.5 text-xs text-text-secondary">
              Descarga un modelo desde la pestaña «Explorar» para empezar.
            </p>
          )}
        </div>
      )}

      {/* ---- PESTAÑA EXPLORAR ---- */}
      {tab === 'explore' && (
        <div className="flex flex-col gap-2">
          {/* Fuentes */}
          <div className="flex items-center gap-1">
            {(
              [
                ['catalog', '📦 Catálogo'],
                ['huggingface', '🤗 Hugging Face'],
                ['github', '🐙 GitHub'],
                ['civitai', '🎨 Civitai'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSource(key)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  source === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-tertiary text-text-secondary hover:text-text-primary',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Categorías (FASE 26) — separa LLM de imagen/video/voz/audio/embeddings.
              FASE 31: se ocultan cuando el panel abre con categoría fija
              ("Modelos locales" queda solo-LLM; los bloques del selector
              universal quedan fijados a su modalidad). */}
          {!fixedCategory && (
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['llm', '💬 LLM'],
                  ['imagen', '🖼 Imagen'],
                  ['video', '🎬 Video'],
                  ['animacion', '🎞 Animación'],
                  ['voz', '🗣 Voz'],
                  ['stt', '🎤 STT'],
                  ['audio', '🎵 Audio'],
                  ['musica', '🎼 Música'],
                  ['embeddings', '🧲 Embeddings'],
                  ['multimodal', '🌐 Multimodal'],
                  ['vision', '👁 Visión'],
                  ['ocr', '📄 OCR'],
                  ['traduccion', '🌍 Traducción'],
                  ['3d', '🧊 3D'],
                  ['reranking', '🔁 Reranking'],
                  ['codigo', '💻 Código'],
                  ['agentes', '🤖 Agentes'],
                  ['robotica', '🦾 Robótica'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  title={
                    key === 'llm'
                      ? 'Modelos de lenguaje (chat, coding, reasoning)'
                      : key === 'imagen'
                        ? 'Generación y comprensión de imágenes'
                        : key === 'video'
                          ? 'Generación de video'
                          : key === 'animacion'
                            ? 'Animación'
                            : key === 'voz'
                              ? 'Texto a voz'
                              : key === 'stt'
                                ? 'Reconocimiento de voz'
                                : key === 'audio'
                                  ? 'Audio y reconocimiento'
                                  : key === 'musica'
                                    ? 'Música y sonido'
                                    : key === 'embeddings'
                                      ? 'Embeddings y similitud'
                                      : key === 'vision'
                                        ? 'Comprensión de imágenes'
                                        : key === 'ocr'
                                          ? 'Extracción de texto de imágenes'
                                          : key === 'traduccion'
                                            ? 'Traducción automática'
                                            : key === '3d'
                                              ? 'Modelos 3D'
                                              : key === 'reranking'
                                                ? 'Re-ranking de resultados'
                                                : key === 'codigo'
                                                  ? 'Modelos de código'
                                                  : key === 'agentes'
                                                    ? 'Agentes de IA'
                                                    : key === 'robotica'
                                                      ? 'Robótica'
                                                      : 'Multimodal (texto + imagen)'
                  }
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    category === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-tertiary text-text-secondary hover:text-text-primary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Buscador */}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                category === 'llm'
                  ? 'Buscar LLM: qwen, deepseek, vision, coding, 7B, MoE…'
                  : `Buscar modelos de ${category}: nombre, familia, capacidad…`
              }
              className="h-8 w-full rounded-lg border border-border-light bg-surface-secondary pl-7 pr-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Buscar modelos abiertos"
            />
          </div>

          {/* FASE 31 — pegar URL/id de un proyecto (HF, GitHub o Ollama) */}
          {showUrlInput && (
            <div className="flex flex-col gap-1 rounded-lg border border-border-light bg-surface-tertiary/50 p-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void resolveUrl();
                    }
                  }}
                  placeholder="Pega la URL de un proyecto (huggingface.co/owner/repo, github.com/owner/repo o id de Ollama)…"
                  aria-label="URL de proyecto a consultar"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border-light bg-surface-secondary px-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => void resolveUrl()}
                  disabled={urlBusy || !urlInput.trim()}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {urlBusy ? <Spinner className="size-3" aria-hidden="true" /> : <ExternalLink className="size-3" aria-hidden="true" />}
                  Consultar
                </button>
              </div>
              {urlError && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  No se pudo resolver la URL: {urlError}
                </p>
              )}
              <p className="text-[10px] text-text-secondary">
                Consulta un modelo o proyecto directamente por su URL para ver peso, parámetros,
                licencia, arquitectura (MoE/Dense), modalidad y descargas — y descargarlo si aplica.
              </p>
            </div>
          )}

          {/* Mi hardware */}
          <HardwareCard hw={hw} onChange={setHardware} />

          {/* Recomendados */}
          {recommended.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border-light bg-surface-tertiary/40 p-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                <Star className="size-3.5 text-amber-500" aria-hidden="true" />
                Recomendados para tu hardware
              </p>
              {recommended.map(({ entry, compat }) => {
                const recInstalled = isInstalled(entry, installedSet);
                const recId = downloadIdFor(entry);
                const recPull = pulls[recId];
                const recPulling = Boolean(
                  recPull && (recPull.status === 'pulling' || recPull.status === 'conectando…'),
                );
                const recPaused = Boolean(recPull?.paused);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-surface-secondary px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-text-primary">{entry.name}</p>
                      {compat && (
                        <p className="text-[10px] text-text-secondary">
                          {compat.label} · VRAM ≈ {compat.vramEst} (estimación)
                        </p>
                      )}
                    </div>
                    {canDownloadEntry(entry) && recInstalled && !recPulling && !recPaused ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-[11px] text-text-secondary">
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                        Instalado
                      </span>
                    ) : recPulling ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => pausePull(recId)}
                          className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Pause className="size-3" aria-hidden="true" />
                          Pausar
                        </button>
                        <span className="rounded-md bg-surface-tertiary px-2 py-1 font-mono text-[11px] text-text-secondary">
                          {recPull?.percent ?? 0}%
                        </span>
                      </div>
                    ) : recPaused ? (
                      <button
                        type="button"
                        onClick={() => resumePull(recId)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Play className="size-3" aria-hidden="true" />
                        Reanudar
                      </button>
                    ) : canDownloadEntry(entry) ? (
                      (() => {
                        const recBytes =
                          typeof entry.sizeBytes === 'number' && entry.sizeBytes > 0
                            ? entry.sizeBytes
                            : null;
                        const recFits =
                          !recBytes || !diskSpace?.freeBytes || recBytes < diskSpace.freeBytes;
                        return (
                          <button
                            type="button"
                            onClick={() => recFits && startPull(recId)}
                            disabled={!recFits}
                            title={
                              !recFits
                                ? `No cabe en disco: quedan ${humanBytes(diskSpace?.freeBytes ?? 0)} libres`
                                : 'Descargar con Ollama'
                            }
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed',
                              recFits
                                ? 'bg-primary text-primary-foreground hover:opacity-90'
                                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
                            )}
                          >
                            <Download className="size-3" aria-hidden="true" />
                            Descargar
                          </button>
                        );
                      })()
                    ) : (
                      <Zap className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Filtros */}
          <FilterBar filters={filters} onChange={setFilters} />

          {resultsLoading ? (
            <div
              className="flex items-center justify-center gap-2 p-3 text-xs text-text-secondary"
              role="status"
            >
              <Spinner className="size-3.5" aria-hidden="true" />
              Consultando {source === 'huggingface' ? 'Hugging Face' : source === 'github' ? 'GitHub' : source === 'civitai' ? 'Civitai' : 'catálogo'}…
            </div>
          ) : resultsError ? (
            <div className="flex items-start gap-1.5 rounded-md border border-border-light bg-surface-tertiary/60 p-2 text-xs text-text-secondary">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                No se pudo consultar{' '}
                {source === 'huggingface'
                  ? 'Hugging Face'
                  : source === 'github'
                    ? 'GitHub'
                    : 'el catálogo'}{' '}
                ({resultsError}). Los demás orígenes siguen disponibles.
              </span>
            </div>
          ) : filteredResults.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-light p-2.5 text-xs text-text-secondary">
              Sin resultados para «{query || '…'}» con los filtros actuales.
            </p>
          ) : (
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-0.5">
              {filteredResults.map((entry) => (
                <ExploreCard
                  key={`${entry.source ?? 'catalog'}:${entry.id}`}
                  entry={entry}
                  hw={hw}
                  diskSpace={diskSpace}
                  badge={badges.get(entry.id) ?? undefined}
                  installed={isInstalled(entry, installedSet)}
                  pulling={pulls[downloadIdFor(entry)]}
                  hfQuants={entry.source === 'huggingface' ? hfQuants[downloadIdFor(entry)] : null}
                  quantOpen={Boolean(quantOpen[entry.id])}
                  quantSel={quantSel[entry.id]}
                  onDownload={(e) => void handleCardDownload(e)}
                  onDownloadQuant={(id, quant) => startPull(id, quant)}
                  onToggleQuant={(id) => {
                    const next = !quantOpen[id];
                    setQuantOpen((prev) => ({ ...prev, [id]: next }));
                    if (next && !hfQuants[downloadIdFor(entry)]) {
                      void loadQuants(downloadIdFor(entry));
                    }
                  }}
                  onSelectQuant={(id, quant) => setQuantSel((prev) => ({ ...prev, [id]: quant }))}
                  onPause={pausePull}
                  onResume={resumePull}
                />
              ))}
            </div>
          )}
          <p className="text-[10px] text-text-secondary">
            Catálogo: tamaños reales desde el registry de Ollama (si no se alcanza, aproximado con
            ~). Hugging Face y GitHub consultan sus APIs públicas (datos reales: descargas, likes,
            stars). En Hugging Face, «Descargar» baja el GGUF vía Ollama (hf.co/repo) y permite
            elegir cuantización cuando el repo tiene varias; la descarga puede pausarse y reanudarse.
            GitHub son repos que contienen modelos (se abre el repo, no se descarga).
          </p>
        </div>
      )}
    </div>
  );
}
