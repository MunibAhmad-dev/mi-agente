/**
 * IA y Modelos — Face 13 full implementation.
 *
 * Sections:
 *  - Dashboard: summary tiles (providers, models, hardware)
 *  - IA Local: Ollama + LM Studio + LiteLLM models
 *  - Proveedores: cloud providers with status, models, signup links
 *  - Explorar: search GitHub + HuggingFace models
 *  - Hardware: compatibility checker
 *  - Router IA: intelligent model recommendation
 */
import React, { useState, useCallback } from 'react';
import { RefreshCw, Cpu, Server, Star, Search, Zap, CheckCircle, XCircle, AlertCircle, ExternalLink, Heart, GitBranch, Download } from 'lucide-react';
import {
  useProviders,
  useRefreshProviders,
  useHardware,
  useCompatibilityCheck,
  useHFSearch,
  useGHSearch,
  useRecommendation,
  useFavorites,
  useSystemStatus,
  type Provider,
} from '~/hooks/useIAModelos';

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ reachable }: { reachable: boolean }) {
  if (reachable) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-400">
        <CheckCircle className="h-3 w-3" /> Online
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/40 dark:text-red-400">
      <XCircle className="h-3 w-3" /> Offline
    </span>
  );
}

function SummaryTile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-sm font-medium">{label}</div>
      {sub && <div className="mt-0.5 text-xs opacity-70">{sub}</div>}
    </div>
  );
}

// ── Provider Card ──────────────────────────────────────────────────────────

function ProviderCard({ provider }: { provider: Provider }) {
  const [expanded, setExpanded] = useState(false);
  const models = provider.models?.length > 0 ? provider.models : (provider.knownModels || []);
  const isFree = ['ollama', 'groq', 'lmstudio', 'litellm', 'openrouter'].includes(provider.id);
  const isLocal = ['ollama', 'lmstudio', 'litellm'].includes(provider.id);

  return (
    <div className="rounded-xl border border-black/10 bg-white transition-shadow hover:shadow-md dark:border-white/10 dark:bg-gray-900">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-lg dark:bg-indigo-900/40">
          {isLocal ? '🖥️' : '☁️'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{provider.label}</h3>
            <StatusBadge reachable={provider.reachable} />
            {isFree && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                Gratis
              </span>
            )}
            {isLocal && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                Local
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {models.length} modelos disponibles
          </p>
          {provider.description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{provider.description}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 rounded-lg p-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && models.length > 0 && (
        <div className="border-t border-black/10 px-4 pb-4 pt-3 dark:border-white/10">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Modelos</div>
          <div className="flex flex-wrap gap-1.5">
            {models.slice(0, 20).map((m) => (
              <span key={m} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs dark:bg-gray-800">
                {m}
              </span>
            ))}
            {models.length > 20 && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">
                +{models.length - 20} más
              </span>
            )}
          </div>
          {!provider.reachable && provider.signupUrl && (
            <a
              href={provider.signupUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <ExternalLink className="h-3 w-3" />
              {provider.envKey ? `Obtener ${provider.envKey} gratis` : 'Ver documentación'}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hardware Panel ──────────────────────────────────────────────────────────

function HardwarePanel() {
  const hw = useHardware();
  const compat = useCompatibilityCheck();
  const [vram, setVram] = useState('');
  const [ram, setRam] = useState('');

  const check = useCallback(() => {
    compat.mutate({ vramGB: vram ? parseFloat(vram) : undefined, ramGB: ram ? parseFloat(ram) : undefined });
  }, [vram, ram, compat]);

  if (hw.isLoading) return <div className="p-4 text-sm text-gray-500">Detectando hardware...</div>;
  if (hw.isError) return <div className="p-4 text-sm text-red-500">No se pudo detectar el hardware.</div>;

  const h = hw.data!;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="CPU" value={h.cpu.cores + ' cores'} sub={h.cpu.model.split(' ').slice(-3).join(' ')} color="border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900" />
        <SummaryTile label="RAM Total" value={h.ram.totalGB + ' GB'} sub={`${h.ram.freeGB} GB libre`} color="border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900" />
        <SummaryTile label="GPU" value={h.gpu?.name?.split(' ').slice(-2).join(' ') || 'N/D'} sub="" color="border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900" />
        <SummaryTile label="VRAM" value={h.vramGB ? h.vramGB + ' GB' : 'N/D'} sub={h.os.platform} color="border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900" />
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-gray-900">
        <h3 className="mb-3 font-semibold">¿Puede mi sistema ejecutar este modelo?</h3>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">VRAM requerida (GB)</label>
            <input
              type="number"
              value={vram}
              onChange={(e) => setVram(e.target.value)}
              placeholder="ej: 8"
              className="w-28 rounded-lg border border-black/20 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-gray-800"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">RAM requerida (GB)</label>
            <input
              type="number"
              value={ram}
              onChange={(e) => setRam(e.target.value)}
              placeholder="ej: 16"
              className="w-28 rounded-lg border border-black/20 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-gray-800"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={check}
              disabled={compat.isLoading}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Comprobar
            </button>
          </div>
        </div>

        {compat.data && (() => {
          const cd = compat.data as { status: string; issues?: string[] };
          return (
            <div className={`mt-4 rounded-lg border p-3 text-sm ${
              cd.status === 'compatible'
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800/50 dark:bg-green-900/20 dark:text-green-300'
                : cd.status === 'compatible_with_limitations'
                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300'
            }`}>
              <div className="font-semibold">
                {cd.status === 'compatible' && '✓ Compatible'}
                {cd.status === 'compatible_with_limitations' && '⚠ Compatible con limitaciones'}
                {cd.status === 'incompatible' && '✗ No compatible'}
              </div>
              {cd.issues?.map((issue: string, i: number) => (
                <div key={i} className="mt-1 text-xs">{issue}</div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Router IA Panel ────────────────────────────────────────────────────────

function RouterPanel() {
  const [task, setTask] = useState('chat');
  const rec = useRecommendation(task);

  const tasks = [
    { id: 'chat', label: 'Chat' },
    { id: 'code', label: 'Código' },
    { id: 'reasoning', label: 'Razonamiento' },
    { id: 'fast', label: 'Velocidad' },
    { id: 'vision', label: 'Visión' },
    { id: 'free_only', label: 'Solo gratis' },
    { id: 'local_only', label: 'Solo local' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm text-gray-500">Selecciona el tipo de tarea</div>
        <div className="flex flex-wrap gap-2">
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => setTask(t.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                task === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {rec.isLoading && <div className="text-sm text-gray-500">Analizando proveedores...</div>}
      {rec.data?.recommendation && rec.data.recommendation.providerId && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800/50 dark:bg-indigo-900/20">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            Mejor opción para &ldquo;{task}&rdquo;
          </div>
          <div className="font-mono text-lg font-bold">{rec.data.recommendation.modelId}</div>
          <div className="mt-0.5 text-sm text-indigo-700 dark:text-indigo-300">
            vía {rec.data.recommendation.providerLabel}
          </div>
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">{rec.data.recommendation.reason}</div>

          {rec.data.recommendation.fallbacks?.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-gray-500">Cadena de fallback automático:</div>
              <div className="flex flex-wrap gap-1.5">
                {rec.data.recommendation.fallbacks.map((fb: { modelId: string; providerId: string }, i: number) => (
                  <span key={i} className="rounded bg-white/60 px-2 py-0.5 font-mono text-xs dark:bg-black/20">
                    {i + 1}. {fb.modelId}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {rec.data?.recommendation && !rec.data.recommendation.providerId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertCircle className="mb-1 h-4 w-4" />
          No hay proveedores disponibles para esta tarea. Arranca Ollama o añade una clave API gratuita.
        </div>
      )}
    </div>
  );
}

// ── Model Explorer ──────────────────────────────────────────────────────────

function ModelExplorer() {
  const [source, setSource] = useState<'huggingface' | 'github'>('huggingface');
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const handleSearch = useCallback(() => setDebouncedQ(query), [query]);

  const hf = useHFSearch(debouncedQ, source === 'huggingface');
  const gh = useGHSearch(debouncedQ, source === 'github');

  const results = source === 'huggingface' ? hf.data?.results : gh.data?.results;
  const isLoading = source === 'huggingface' ? hf.isLoading : gh.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setSource('huggingface')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${source === 'huggingface' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
        >
          🤗 Hugging Face
        </button>
        <button
          onClick={() => setSource('github')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${source === 'github' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
        >
          <GitBranch className="mr-1 inline h-3.5 w-3.5" />
          GitHub
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={source === 'huggingface' ? 'Buscar modelos... ej: llama, qwen, mistral' : 'Buscar proyectos AI en GitHub...'}
            className="w-full rounded-lg border border-black/20 py-2 pl-8 pr-3 text-sm dark:border-white/20 dark:bg-gray-800"
          />
        </div>
        <button
          onClick={handleSearch}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Buscar
        </button>
      </div>

      {isLoading && <div className="text-sm text-gray-500">Buscando modelos...</div>}

      {results && results.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {results.slice(0, 16).map((item: any) => (
            <div key={item.id || item.fullName} className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm font-semibold">{item.id || item.fullName}</div>
                  {item.description && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.description}</div>
                  )}
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                  <ExternalLink className="h-4 w-4 text-gray-400 hover:text-indigo-500" />
                </a>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.params && (
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    {item.params}
                  </span>
                )}
                {item.vramEstimateGB && (
                  <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                    ~{item.vramEstimateGB} GB VRAM
                  </span>
                )}
                {item.license && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    {item.license}
                  </span>
                )}
                {(item.downloads || item.stars) && (
                  <span className="flex items-center gap-0.5 text-xs text-gray-500">
                    {item.downloads ? <><Download className="h-3 w-3" /> {(item.downloads / 1000).toFixed(0)}K</> : <><Star className="h-3 w-3" /> {item.stars?.toLocaleString()}</>}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {results && results.length === 0 && debouncedQ && (
        <div className="text-sm text-gray-500">Sin resultados para &ldquo;{debouncedQ}&rdquo;</div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'local' | 'providers' | 'explore' | 'hardware' | 'router';

export default function IAModelos() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const providers = useProviders();
  const refresh = useRefreshProviders();
  const status = useSystemStatus();

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'local', label: 'IA Local', icon: '🖥️' },
    { id: 'providers', label: 'Proveedores', icon: '☁️' },
    { id: 'explore', label: 'Explorar', icon: '🔍' },
    { id: 'hardware', label: 'Hardware', icon: '⚙️' },
    { id: 'router', label: 'Router IA', icon: '⚡' },
  ];

  const allProviders = providers.data?.providers || [];
  const localProviders = allProviders.filter((p) => ['ollama', 'lmstudio', 'litellm'].includes(p.id));
  const cloudProviders = allProviders.filter((p) => !['ollama', 'lmstudio', 'litellm'].includes(p.id));
  const summary = providers.data?.summary;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-black/10 px-4 pb-3 pt-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">IA y Modelos</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Administra modelos locales, proveedores, hardware y configuración desde un solo lugar
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status.data && (
              <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                status.data.status === 'operational'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
              }`}>
                {status.data.status === 'operational' ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {status.data.status === 'operational' ? 'Operacional' : 'Degradado'}
              </span>
            )}
            <button
              onClick={() => refresh.mutate()}
              disabled={refresh.isLoading || providers.isFetching}
              className="flex items-center gap-1.5 rounded-lg border border-black/20 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-white/20 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refresh.isLoading || providers.isFetching ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="mt-3 flex gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile
                label="Proveedores activos"
                value={providers.isLoading ? '...' : summary?.reachable ?? 0}
                sub={`de ${summary?.total ?? 0} total`}
                color="border border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-800/50 dark:bg-indigo-900/20 dark:text-indigo-100"
              />
              <SummaryTile
                label="Modelos disponibles"
                value={providers.isLoading ? '...' : summary?.totalModels ?? 0}
                sub="en todos los proveedores"
                color="border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-100"
              />
              <SummaryTile
                label="Proveedores gratuitos"
                value={providers.isLoading ? '...' : allProviders.filter(p => ['ollama','groq','lmstudio','litellm','openrouter'].includes(p.id) && p.reachable).length}
                sub="sin coste de uso"
                color="border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-100"
              />
              <SummaryTile
                label="Modelos locales"
                value={providers.isLoading ? '...' : localProviders.reduce((s, p) => s + (p.models?.length || 0), 0)}
                sub="ejecutando en tu máquina"
                color="border border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-800/50 dark:bg-purple-900/20 dark:text-purple-100"
              />
            </div>

            {/* Quick provider grid */}
            {providers.isLoading && <div className="text-sm text-gray-500">Cargando proveedores...</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              {allProviders.map((p) => <ProviderCard key={p.id} provider={p} />)}
            </div>

            {allProviders.length === 0 && !providers.isLoading && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
                <AlertCircle className="mb-1 h-5 w-5 text-amber-600" />
                <h3 className="font-semibold text-amber-800 dark:text-amber-300">No hay proveedores activos</h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  Arranca Ollama localmente o añade una clave API gratuita en tu archivo <code>.env</code>.
                </p>
                <div className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-400">
                  <div>• <strong>Ollama (local, gratis):</strong> descarga en <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline">ollama.com</a></div>
                  <div>• <strong>Groq (cloud, gratis):</strong> clave en <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline">console.groq.com</a></div>
                  <div>• <strong>OpenRouter (modelos gratis):</strong> clave en <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="underline">openrouter.ai</a></div>
                  <div>• <strong>LiteLLM (gateway):</strong> arranca con <code>docker compose up litellm</code></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* IA LOCAL */}
        {tab === 'local' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Modelos ejecutados directamente en tu infraestructura. Sin límites de uso, sin coste, sin internet.
            </p>
            {localProviders.length === 0 ? (
              <div className="rounded-xl border border-black/10 p-6 text-center dark:border-white/10">
                <div className="text-3xl">🖥️</div>
                <h3 className="mt-2 font-semibold">Sin modelos locales detectados</h3>
                <p className="mt-1 text-sm text-gray-500">Instala Ollama o LM Studio para ejecutar modelos sin internet.</p>
                <div className="mt-3 flex justify-center gap-3">
                  <a href="https://ollama.com" target="_blank" rel="noreferrer" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                    Instalar Ollama
                  </a>
                  <a href="https://lmstudio.ai" target="_blank" rel="noreferrer" className="rounded-lg border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-white/20 dark:hover:bg-gray-800">
                    Instalar LM Studio
                  </a>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {localProviders.map((p) => <ProviderCard key={p.id} provider={p} />)}
              </div>
            )}
          </div>
        )}

        {/* PROVEEDORES */}
        {tab === 'providers' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Proveedores externos. El sistema selecciona automáticamente el mejor disponible. Todos los proveedores gratuitos no requieren tarjeta de crédito.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {cloudProviders.map((p) => <ProviderCard key={p.id} provider={p} />)}
            </div>
            {cloudProviders.length === 0 && !providers.isLoading && (
              <div className="text-sm text-gray-500">No hay proveedores cloud configurados.</div>
            )}
          </div>
        )}

        {/* EXPLORE */}
        {tab === 'explore' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Descubre modelos de Hugging Face y proyectos de GitHub. Sin API key para la mayoría de búsquedas.
            </p>
            <ModelExplorer />
          </div>
        )}

        {/* HARDWARE */}
        {tab === 'hardware' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Información del hardware de tu sistema y comprobador de compatibilidad para modelos.
            </p>
            <HardwarePanel />
          </div>
        )}

        {/* ROUTER IA */}
        {tab === 'router' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Selección inteligente del mejor modelo según la tarea. Si el modelo principal falla, el sistema cambia automáticamente al siguiente.
            </p>
            <RouterPanel />
          </div>
        )}
      </div>
    </div>
  );
}
