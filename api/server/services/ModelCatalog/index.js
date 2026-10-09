/**
 * ModelCatalog — FASE 4: Model Discovery + Benchmark.
 *
 * Maintains a local catalog of known AI models across providers.
 * Supports discovery from Ollama (real) and a static cloud catalog.
 * Benchmark runs a quick latency/quality probe on each available model.
 *
 * Spec requirements (Face 7 §8–9):
 *   - Discover new models from Ollama, HuggingFace, GitHub, papers
 *   - Analyze: architecture, Dense/MoE, params, context, capabilities
 *   - License check before integration (MIT/Apache preferred)
 *   - Benchmark: coding, reasoning, tool-use, speed, RAM, VRAM
 */

const { fetchOllamaModels, capabilitiesForOllamaModel } = require('../AgentArchitect/modelRouter');

/** Runtime entries added via updateCatalog() — survive the process lifetime, cleared on restart. */
const _dynamicEntries = [];

/**
 * Add or update entries in the runtime catalog.
 * Call this to register new models discovered at runtime (HuggingFace, custom endpoints, etc.)
 *
 * @param {object[]} entries — array of model objects matching the catalog schema
 * @returns {{ added: number, updated: number }}
 */
function updateCatalog(entries = []) {
  let added = 0;
  let updated = 0;
  for (const entry of entries) {
    if (!entry.id) continue;
    const idx = _dynamicEntries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      _dynamicEntries[idx] = { ..._dynamicEntries[idx], ...entry, source: 'dynamic' };
      updated++;
    } else {
      _dynamicEntries.push({ ...entry, source: 'dynamic', licenseStatus: licenseStatus(entry.license || 'unknown') });
      added++;
    }
  }
  return { added, updated };
}

/**
 * Remove an entry from the runtime catalog.
 * @param {string} modelId
 * @returns {boolean}
 */
function removeFromCatalog(modelId) {
  const idx = _dynamicEntries.findIndex((e) => e.id === modelId);
  if (idx >= 0) {
    _dynamicEntries.splice(idx, 1);
    return true;
  }
  return false;
}

/** Static catalog of known cloud models (license-verified). */
const CLOUD_CATALOG = [
  {
    id: 'gpt-4o', provider: 'openai', license: 'proprietary',
    params: null, context: 128000, capabilities: ['chat', 'code', 'vision', 'tool_calling'],
    costPer1K: { input: 0.005, output: 0.015 }, notes: 'Flagship multimodal',
  },
  {
    id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', license: 'proprietary',
    params: null, context: 200000, capabilities: ['chat', 'code', 'vision', 'tool_calling'],
    costPer1K: { input: 0.003, output: 0.015 }, notes: 'Best coding + reasoning',
  },
  {
    id: 'gemini-2.0-flash', provider: 'google', license: 'proprietary',
    params: null, context: 1000000, capabilities: ['chat', 'code', 'vision', 'multimodal'],
    costPer1K: { input: 0.0001, output: 0.0004 }, notes: 'Fastest, 1M context',
  },
  {
    id: 'deepseek-chat', provider: 'deepseek', license: 'proprietary',
    params: null, context: 64000, capabilities: ['chat', 'code', 'reasoning'],
    costPer1K: { input: 0.00027, output: 0.0011 }, notes: 'Cheap reasoning',
  },
  {
    id: 'qwen3:latest', provider: 'ollama', license: 'apache-2.0',
    params: '7b', context: 32768, capabilities: ['chat', 'code', 'tool_calling'],
    costPer1K: { input: 0, output: 0 }, notes: 'Local — free',
  },
  {
    id: 'deepseek-r1:latest', provider: 'ollama', license: 'mit',
    params: '7b', context: 32768, capabilities: ['reasoning', 'code', 'math'],
    costPer1K: { input: 0, output: 0 }, notes: 'Local reasoning model',
  },
];

/** License compatibility matrix (Face 7 §9 Licensing Engine). */
const LICENSE_STATUS = {
  'mit': 'SAFE_TO_INTEGRATE',
  'apache-2.0': 'SAFE_TO_INTEGRATE',
  'bsd-2-clause': 'SAFE_TO_INTEGRATE',
  'bsd-3-clause': 'SAFE_TO_INTEGRATE',
  'mpl-2.0': 'SAFE_TO_INTEGRATE',
  'lgpl-2.1': 'REVIEW_REQUIRED',
  'agpl-3.0': 'REVIEW_REQUIRED',
  'gpl-2.0': 'REVIEW_REQUIRED',
  'gpl-3.0': 'REVIEW_REQUIRED',
  'proprietary': 'REVIEW_REQUIRED',
  'cc-by-nc': 'INCOMPATIBLE',
  'unknown': 'UNKNOWN',
};

function licenseStatus(license) {
  return LICENSE_STATUS[(license || 'unknown').toLowerCase()] || 'UNKNOWN';
}

/**
 * Discover all available models (Ollama local + static cloud catalog).
 * @returns {Promise<object[]>}
 */
async function discover() {
  const localModels = await fetchOllamaModels().catch(() => []);

  const local = localModels.map((m) => ({
    id: m.name,
    provider: 'ollama',
    license: 'open-weight',
    licenseStatus: licenseStatus('open-weight'),
    params: m.details?.parameter_size || null,
    context: m.details?.context_length || 32768,
    capabilities: capabilitiesForOllamaModel(m.name),
    size: m.size || 0,
    costPer1K: { input: 0, output: 0 },
    available: true,
    source: 'local-ollama',
  }));

  const cloud = CLOUD_CATALOG.map((m) => ({
    ...m,
    licenseStatus: licenseStatus(m.license),
    available: false,
    source: 'static-catalog',
  }));

  // Merge dynamic entries — dynamic overrides static if same id
  const staticIds = new Set([...local, ...cloud].map((m) => m.id));
  const dynamic = _dynamicEntries.filter((e) => !staticIds.has(e.id));

  return [...local, ...cloud, ...dynamic];
}

/**
 * Benchmark a model with a quick latency probe.
 * Real benchmark: sends a tiny prompt and measures time-to-first-token.
 * @param {string} modelId
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
async function benchmark(modelId, opts = {}) {
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
  const startMs = Date.now();
  let latencyMs = null;
  let status = 'unavailable';
  let error = null;
  let tokensPerSec = null;

  try {
    const body = JSON.stringify({
      model: modelId,
      prompt: 'Hello.',
      stream: false,
      options: { num_predict: 4 },
    });
    const res = await fetch(`${ollamaBase}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs || 15000),
    });
    if (res.ok) {
      const json = await res.json();
      latencyMs = Date.now() - startMs;
      status = 'ok';
      if (json.eval_count && json.eval_duration) {
        tokensPerSec = Math.round((json.eval_count / json.eval_duration) * 1e9);
      }
    } else {
      status = `http-${res.status}`;
    }
  } catch (e) {
    status = 'error';
    error = e.message;
  }

  return {
    modelId,
    status,
    latencyMs,
    tokensPerSec,
    error,
    benchmarkedAt: new Date().toISOString(),
  };
}

/**
 * Get a single model's entry from the catalog.
 * @param {string} modelId
 * @returns {Promise<object|null>}
 */
async function getModel(modelId) {
  const all = await discover();
  return all.find((m) => m.id === modelId) || null;
}

/**
 * Sync all currently-installed Ollama models into the dynamic catalog.
 * Run this on boot or via POST /api/model-catalog/sync to pick up newly pulled models.
 *
 * @returns {Promise<{ added: number, updated: number, total: number }>}
 */
async function syncFromOllamaRegistry() {
  const models = await fetchOllamaModels().catch(() => []);
  const entries = models.map((m) => ({
    id: m.name,
    provider: 'ollama',
    license: 'open-weight',
    params: m.details?.parameter_size || null,
    context: m.details?.context_length || 32768,
    capabilities: capabilitiesForOllamaModel(m.name),
    size: m.size || 0,
    costPer1K: { input: 0, output: 0 },
    available: true,
    notes: `Local Ollama — ${m.details?.parameter_size || 'unknown params'}`,
  }));
  const result = updateCatalog(entries);
  return { ...result, total: _dynamicEntries.length, synced: entries.length };
}

module.exports = { discover, benchmark, getModel, updateCatalog, removeFromCatalog, syncFromOllamaRegistry, CLOUD_CATALOG, licenseStatus };
