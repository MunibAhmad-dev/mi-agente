/**
 * LocalModelRegistry — registro de proveedores de modelos locales.
 *
 * FASE 14: el selector/dashboard NUNCA depende de un runtime concreto.
 * Para agregar un proveedor nuevo (LM Studio, llama.cpp, vLLM…) basta crear
 * un adapter que extienda LocalModelProvider y registrarlo en `providers`.
 *
 * Estado:
 *  - Config por proveedor persistida en ./config.json (enabled + endpoint
 *    override). Si no existe el archivo se usan los defaults del provider.
 *  - El estado de conexión/modelos se calcula en cada request (sin polling
 *    excesivo): el dashboard consulta bajo demanda y con botón "Actualizar".
 */

const fs = require('fs');
const path = require('path');
const { OllamaProvider } = require('./OllamaProvider');
const { OpenAICompatProvider } = require('./OpenAICompatProvider');
const {
  searchCatalog,
  searchExternal,
  getHfQuants,
  resolveProjectUrl,
} = require('./CatalogService');

const CONFIG_PATH = path.join(__dirname, 'config.json');

/**
 * Proveedores locales registrados (FASE 17): todos headless, NINGUNO es
 * LM Studio Desktop/GUI — solo los componentes que exponen un endpoint
 * OpenAI-compatible (llama.cpp server, lms CLI, mlx-engine, SDKs JS/Python).
 */
const PROVIDER_DEFS = [
  { id: 'ollama', build: () => new OllamaProvider() },
  {
    id: 'llama.cpp',
    build: () =>
      new OpenAICompatProvider({
        id: 'llama.cpp',
        name: 'llama.cpp',
        kind: 'server',
        // Base sin /v1: los paths del adapter ya incluyen /v1 (FASE 19 fix).
        defaultEndpoint: 'http://host.docker.internal:8080',
      }),
  },
  {
    id: 'lms',
    build: () =>
      new OpenAICompatProvider({
        id: 'lms',
        name: 'lms CLI (LM Studio)',
        kind: 'cli',
        defaultEndpoint: 'http://host.docker.internal:1234',
      }),
  },
  {
    id: 'mlx-engine',
    build: () =>
      new OpenAICompatProvider({
        id: 'mlx-engine',
        name: 'MLX Engine',
        kind: 'engine',
        defaultEndpoint: 'http://host.docker.internal:1234',
      }),
  },
  {
    id: 'lmstudio-js',
    build: () =>
      new OpenAICompatProvider({
        id: 'lmstudio-js',
        name: 'lmstudio-js (SDK)',
        kind: 'sdk',
        defaultEndpoint: 'http://host.docker.internal:1234',
      }),
  },
  {
    id: 'lmstudio-python',
    build: () =>
      new OpenAICompatProvider({
        id: 'lmstudio-python',
        name: 'lmstudio-python (SDK)',
        kind: 'sdk',
        defaultEndpoint: 'http://host.docker.internal:1234',
      }),
  },
];

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return parsed && parsed.providers ? parsed.providers : {};
    }
  } catch {
    /* config corrupta → defaults */
  }
  return {};
}

function writeConfig(providersConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ providers: providersConfig }, null, 2));
    return true;
  } catch (error) {
    console.error('[LocalModelRegistry] No se pudo persistir config:', error.message);
    return false;
  }
}

/** Construye la lista de providers aplicando la config persistida. */
function buildProviders() {
  const stored = readConfig();
  return PROVIDER_DEFS.map(({ id, build }) => {
    const provider = build();
    const cfg = stored[id] || {};
    if (typeof cfg.enabled === 'boolean') provider.enabled = cfg.enabled;
    if (cfg.endpoint) provider.setEndpoint(cfg.endpoint);
    return provider;
  });
}

let _providers = null;

function getProviders() {
  if (!_providers) _providers = buildProviders();
  return _providers;
}

function getProvider(id) {
  return getProviders().find((p) => p.id === id) || null;
}

/** Estado + modelos de un solo provider (con manejo de errores por provider). */
async function inspectProvider(provider) {
  if (!provider.enabled) {
    return {
      id: provider.id,
      name: provider.name,
      enabled: false,
      endpoint: provider.endpoint,
      status: { connected: false, modelCount: 0, error: 'proveedor desactivado' },
      models: [],
    };
  }
  const status = await provider.getStatus();
  let models = [];
  if (status.connected) {
    try {
      models = await provider.listModelsDetailed();
    } catch (error) {
      status.error = `modelos no disponibles (${error.message})`;
      status.modelsError = error.message;
    }
  }
  return {
    id: provider.id,
    name: provider.name,
    enabled: true,
    endpoint: provider.endpoint,
    status,
    models,
  };
}

/** Descubre todos los proveedores (paralelo, aislado por provider). */
async function discoverAll() {
  const providers = getProviders();
  const results = await Promise.all(providers.map((p) => inspectProvider(p)));
  return results;
}

/** Refresh de un provider puntual. */
async function refreshProvider(id) {
  const provider = getProvider(id);
  if (!provider) throw new Error(`proveedor local desconocido: ${id}`);
  return inspectProvider(provider);
}

/**
 * Actualiza la config de un provider (endpoint/enabled) y la persiste.
 * Devuelve { updated, persisted } — persisted=false si no se pudo escribir.
 */
function updateProvider(id, { endpoint, enabled } = {}) {
  const provider = getProvider(id);
  if (!provider) throw new Error(`proveedor local desconocido: ${id}`);

  if (typeof endpoint === 'string') {
    if (endpoint.trim()) {
      const ok = provider.setEndpoint(endpoint.trim());
      if (!ok) throw new Error('endpoint inválido (solo http/https, sin credenciales)');
    } else {
      // endpoint vacío → revertir al default del provider
      provider._endpointOverride = null;
    }
  }
  if (typeof enabled === 'boolean') {
    provider.enabled = enabled;
  }

  const stored = readConfig();
  stored[id] = {
    enabled: provider.enabled,
    endpoint: provider._endpointOverride || undefined,
  };
  const persisted = writeConfig(stored);

  return {
    id: provider.id,
    endpoint: provider.endpoint,
    enabled: provider.enabled,
    persisted,
  };
}

/**
 * Espacio libre del volumen de Ollama (FASE 20). El api monta `ollama-data`
 * en /root/.ollama (read-only) para poder validar que una descarga cabe antes
 * de iniciarla. Si el mount o statfs no está disponible devuelve null (la UI
 * simplemente omite la validación, no bloquea nada).
 */
function getOllamaDiskSpace() {
  try {
    if (!fs.existsSync('/root/.ollama')) {
      return null;
    }
    const s = fs.statfsSync('/root/.ollama');
    return {
      freeBytes: s.bfree * s.bsize,
      totalBytes: s.blocks * s.bsize,
    };
  } catch {
    return null;
  }
}

/**
 * Descarga un modelo en Ollama y devuelve un async iterable con el progreso
 * ({ status, digest, total, completed }). El body de /api/pull valida el
 * modelo, y el patrón aquí evita cualquier inyección.
 *
 * `signal` (opcional): FASE 19 — pausar/reanudar. Si el cliente aborta su
 * conexión, la ruta aborta este signal y Ollama detiene la descarga
 * (conserva blobs parciales); un pull posterior REANUDA desde ahí.
 */
async function* pullOllamaModel(modelId, signal) {
  const ollama = getProvider('ollama');
  if (!ollama) throw new Error('proveedor ollama no registrado');
  // Acepta ids de Ollama (qwen3:0.6b) y GGUF de Hugging Face
  // (hf.co/owner/repo:quant). Solo viaja en el body JSON del API de Ollama.
  if (typeof modelId !== 'string' || modelId.length > 200 || !/^[\w.\-:/]+$/.test(modelId)) {
    throw new Error('id de modelo inválido');
  }
  const res = await fetch(`${ollama.endpoint}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama respondió HTTP ${res.status || 'sin conexión'}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line);
        } catch {
          /* línea no-JSON → ignorar */
        }
      }
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('PULL_PAUSED');
    }
    throw error;
  }
}

/**
 * Borra un modelo instalado en Ollama (FASE 19).
 * Solo viaja en el body JSON del API de Ollama (sin shell).
 */
async function deleteOllamaModel(modelId) {
  const ollama = getProvider('ollama');
  if (!ollama) throw new Error('proveedor ollama no registrado');
  if (typeof modelId !== 'string' || modelId.length > 200 || !/^[\w.\-:/]+$/.test(modelId)) {
    throw new Error('id de modelo inválido');
  }
  const res = await fetch(`${ollama.endpoint}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId }),
  });
  if (!res.ok) {
    throw new Error(`Ollama respondió HTTP ${res.status || 'sin conexión'}`);
  }
  return { deleted: modelId };
}

module.exports = {
  LocalModelRegistry: { discoverAll, refreshProvider, updateProvider, getProvider, getProviders },
  getProviders,
  getProvider,
  discoverAll,
  refreshProvider,
  updateProvider,
  searchCatalog,
  searchExternal,
  getHfQuants,
  getOllamaDiskSpace,
  pullOllamaModel,
  deleteOllamaModel,
  resolveProjectUrl,
};
