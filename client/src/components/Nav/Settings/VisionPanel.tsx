import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from '@librechat/client';
import { getTokenHeader } from 'librechat-data-provider';
import { Box, CircleAlert, Eye, ImagePlus, RefreshCw, ScanText, Shapes, Tags, Trash2 } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * VisionPanel — Visión por computadora (FASE 31).
 * Analiza imágenes con un modelo de visión local (Ollama: qwen2.5vl, llava,
 * gemma3, moondream…) cuando está instalado. La interfaz deja clara la
 * disponibilidad real del runtime; si no hay modelo, muestra instrucciones
 * de instalación, nunca un error crítico.
 */

interface VisionModelInfo {
  id: string;
  name: string;
  provider?: string;
  source?: 'local' | 'provider';
  sizeBytes: number | null;
  parameterSize: string | null;
  quantization: string | null;
  contextLength: number | null;
}

interface StatusResult {
  success: boolean;
  available: boolean;
  error?: string | null;
  models: VisionModelInfo[];
}

interface BoxEntry {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function getToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length);
    }
  } catch { /* ignore */ }
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

function humanBytes(bytes: number | null): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

const TASKS = [
  { id: 'describe', label: 'Describir', desc: 'Descripción general de la imagen', icon: Eye },
  { id: 'ocr', label: 'Extraer texto (OCR)', desc: 'Todo el texto visible, en orden', icon: ScanText },
  { id: 'detect', label: 'Detectar objetos', desc: 'Objetos y personas con ubicación', icon: Shapes },
  { id: 'detect_boxes', label: 'Detectar (cajas)', desc: 'Objetos con cajas dibujadas sobre la imagen', icon: Box },
  { id: 'classify', label: 'Clasificar', desc: 'Tipo, categoría y calidad', icon: Tags },
] as const;

type TaskId = (typeof TASKS)[number]['id'];

export default function VisionPanel() {
  const localize = useLocalize();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [status, setStatus] = useState<StatusResult | null>(null);
  const [checking, setChecking] = useState(true);

  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [task, setTask] = useState<TaskId>('describe');
  const [modelId, setModelId] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultModel, setResultModel] = useState<string | null>(null);
  const [resultBoxes, setResultBoxes] = useState<BoxEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/vision/status', {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });
      const json = await res.json();
      setStatus({
        success: Boolean(json?.success),
        available: Boolean(json?.available) || (Array.isArray(json?.models) && json.models.length > 0),
        error: json?.error ?? null,
        models: Array.isArray(json?.models) ? json.models : [],
      });
    } catch (e) {
      setStatus({ success: false, available: false, error: String((e as Error)?.message || e), models: [] });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Solo se aceptan imágenes (JPG, PNG, WebP, GIF…).');
      setImage(null);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('La imagen no puede superar los 8 MB.');
      setImage(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result || ''));
      setImageName(file.name);
      setError(null);
      setResult(null);
      setResultBoxes(null);
    };
    reader.readAsDataURL(file);
  };

  const runAnalyze = async () => {
    if (!image) {
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setResultBoxes(null);
    try {
      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken() ?? ''}`,
        },
        body: JSON.stringify({
          image,
          task,
          model: modelId || undefined,
          prompt: customPrompt.trim() || undefined,
          // FASE 35 — solo los modelos externos llevan provider (los locales
          // como "moondream:latest" no deben tratarse como proveedor).
          provider: availableModels.find((m) => m.id === modelId)?.source === 'provider'
            ? String(modelId).split(':')[0]
            : undefined,
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        setError(json?.error || `HTTP ${res.status}`);
        setStatus((prev) =>
          prev
            ? { ...prev, available: json?.available !== false, error: json?.error ?? prev.error }
            : prev,
        );
        return;
      }
      setResult(json.text);
      setResultModel(json.model);
      setResultBoxes(Array.isArray(json.boxes) ? json.boxes : null);
      if (json.models?.length) {
        setStatus((prev) => (prev ? { ...prev, models: json.models } : prev));
      }
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setAnalyzing(false);
    }
  };

  const availableModels = status?.models ?? [];
  const selectedModel = modelId || availableModels[0]?.name || '';
  const ready = Boolean(image && availableModels.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Estado del runtime */}
      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-tertiary/60 p-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <Eye className="size-3.5" aria-hidden="true" />
          Visión por computadora
        </p>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {checking ? (
        <div className="flex items-center gap-2 p-3 text-sm text-text-secondary" role="status">
          <Spinner className="size-4" aria-hidden="true" />
          {localize('com_ui_loading')}
        </div>
      ) : !status?.available ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border-light p-3">
          <p className="flex items-start gap-1.5 text-sm text-text-primary">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              {status?.error ||
                'No hay modelos de visión instalados en Ollama. Instala uno para activar el análisis de imágenes.'}
            </span>
          </p>
          <code className="rounded-md bg-surface-tertiary px-2 py-1 font-mono text-xs text-text-secondary">
            ollama pull qwen2.5vl:3b
          </code>
          <p className="text-[11px] text-text-secondary">
            También funcionan: llava:7b, gemma3:1b, moondream, minicpm-v. El análisis corre 100%
            local, sin subir tus imágenes a ningún servidor.
          </p>
        </div>
      ) : (
        <>
          {/* Modelo disponible (local + proveedores — FASE 35) */}
          {availableModels.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border border-border-light bg-surface-tertiary/50 p-2">
              <p className="text-xs font-medium text-text-primary">
                Modelo de visión{' '}
                <span className="font-normal text-text-secondary">
                  · local + tus LLM con visión
                </span>
              </p>
              <select
                value={selectedModel}
                onChange={(e) => setModelId(e.target.value)}
                aria-label="Modelo de visión"
                className="h-8 w-full rounded-md border border-border-light bg-surface-secondary px-1.5 text-xs text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.source === 'provider'
                      ? `☁ ${m.name} · (${m.provider})`
                      : `🖥 ${m.name}`}
                    {m.parameterSize ? ` · ${m.parameterSize}` : ''}
                    {m.quantization ? ` · ${m.quantization}` : ''}
                    {m.sizeBytes ? ` · ${humanBytes(m.sizeBytes)}` : ''}
                  </option>
                ))}
              </select>
              {availableModels.some((m) => m.source === 'provider') && (
                <p className="text-[10px] text-text-secondary">
                  ☁ = modelo multimodal de un proveedor configurado (usa tu clave del endpoint).
                  🖥 = modelo local en Ollama (gratis, privado).
                </p>
              )}
            </div>
          )}

          {/* Subir imagen */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Seleccionar imagen"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {!image ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-light bg-surface-tertiary/40 p-5 text-sm text-text-secondary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ImagePlus className="size-5" aria-hidden="true" />
              Subir una imagen para analizar
              <span className="text-[11px]">JPG, PNG, WebP · máx 8 MB</span>
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border-light bg-surface-secondary p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs text-text-primary" title={imageName}>
                  {imageName}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setResult(null);
                    setResultBoxes(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                  Quitar
                </button>
              </div>
              <div className="relative">
                <img
                  src={image}
                  alt="Imagen a analizar"
                  className="max-h-64 w-full rounded-md object-contain"
                />
                {/* FASE 38 — cajas de detección sobre la imagen (coords 0..1) */}
                {resultBoxes && resultBoxes.length > 0 && (
                  <div className="pointer-events-none absolute inset-0">
                    {resultBoxes.map((b, i) => (
                      <div
                        key={`${b.label}-${i}`}
                        className="absolute rounded-sm border-2 border-emerald-500"
                        style={{
                          left: `${b.x1 * 100}%`,
                          top: `${b.y1 * 100}%`,
                          width: `${Math.max(0, (b.x2 - b.x1) * 100)}%`,
                          height: `${Math.max(0, (b.y2 - b.y1) * 100)}%`,
                        }}
                      >
                        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-emerald-500 px-1 py-0.5 text-[9px] font-medium text-white">
                          {b.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tareas */}
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-primary">Tarea</p>
            <div className="flex flex-wrap gap-1">
              {TASKS.map((t) => {
                const Icon = t.icon;
                const active = task === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTask(t.id);
                      setResult(null);
                      setResultBoxes(null);
                    }}
                    title={t.desc}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border-light bg-surface-tertiary text-text-secondary hover:text-text-primary',
                    )}
                  >
                    <Icon className="size-3" aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt personalizado */}
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-primary">
              Prompt personalizado <span className="font-normal text-text-secondary">(opcional)</span>
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Ej.: describe los colores dominantes y el estilo artístico"
              rows={2}
              className="w-full resize-none rounded-lg border border-border-light bg-surface-secondary p-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {error && (
            <p className="flex items-start gap-1.5 rounded-md border border-border-light bg-surface-tertiary/60 p-2 text-xs text-red-600 dark:text-red-400">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {/* Resultado */}
          {result && (
            <div className="flex flex-col gap-1 rounded-lg border border-border-light bg-surface-secondary p-2.5">
              <p className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                <span className="font-medium text-text-primary">Resultado</span>
                {resultModel && <span className="font-mono text-[10px]">{resultModel}</span>}
              </p>
              <p className="whitespace-pre-wrap text-sm text-text-primary">{result}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void runAnalyze()}
            disabled={!ready || analyzing}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              ready
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'cursor-not-allowed bg-surface-tertiary text-text-secondary',
            )}
          >
            {analyzing ? (
              <>
                <Spinner className="size-4" aria-hidden="true" />
                Analizando…
              </>
            ) : (
              <>
                <Eye className="size-4" aria-hidden="true" />
                Analizar imagen
              </>
            )}
          </button>
          <p className="text-[10px] text-text-secondary">
            El análisis usa el modelo de visión seleccionado: local (Ollama, privado y gratis) o
            cualquier LLM multimodal configurado (OpenAI, Anthropic, Google, OpenRouter…). Los
            tiempos dependen del modelo y de tu hardware.
          </p>
        </>
      )}
    </div>
  );
}
