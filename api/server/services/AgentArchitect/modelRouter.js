/**
 * modelRouter.js — Model Router por capacidades (FASE 4).
 *
 * Para cada agente de un plan, elige el modelo (local/cloud) que mejor cubre
 * las capacidades que el Capability Discovery (FASE 3) detectó para su rol.
 *
 * Reutiliza el `ModelRegistry` del CapabilityOrchestrator (registro real con
 * índice invertido y matchScore), en vez de inventar un registro paralelo:
 *   - `buildModelRegistryFromOllama()` registra los modelos REALES de Ollama
 *     (fetch a /api/tags) con perfiles de capacidades deterministas,
 *   - `routePlanToModels()` consulta `findByCapabilities` por agente y rankea
 *     por matchScore con preferencia local (provider ollama/lmstudio/local)
 *     y menor latencia estimada,
 *   - las capacidades sin cobertura se reportan con honestidad (nunca se
 *     inventa un modelo que no existe).
 *
 * El router es determinista y testeable: la única dependencia externa es la
 * lista de modelos disponibles (se inyecta o se obtiene del fetch real).
 */

const { ModelRegistry } = require('../CapabilityOrchestrator/models/ModelRegistry');
const { Capabilities, ModelStatus } = require('../CapabilityOrchestrator/constants/Types');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

/* ─────────────── Perfiles de capacidades por modelo ────────────────────── */

const CHAT_CORE = [Capabilities.CHAT, Capabilities.REASONING, Capabilities.ANALYSIS];

/** Capacidades base por heurística del nombre del modelo (determinista). */
const MODEL_CAPABILITY_PROFILES = [
  {
    match: /qwen[23]|qwen/i,
    capabilities: [
      ...CHAT_CORE,
      Capabilities.CODE,
      Capabilities.TOOL_CALLING,
      Capabilities.FUNCTION_CALLING,
      Capabilities.SUMMARIZATION,
      Capabilities.TRANSLATION,
      Capabilities.WRITING,
    ],
  },
  {
    match: /deepseek/,
    capabilities: [
      ...CHAT_CORE,
      Capabilities.REASONING_CHAIN,
      Capabilities.CODE,
      Capabilities.MATH,
      Capabilities.WRITING,
      Capabilities.TOOL_CALLING,
      Capabilities.JSON_MODE,
    ],
  },
  {
    match: /llama3\.2-vision|qwen2.*-vl|llava|minicpm-v|moondream|bakllava|vision/i,
    capabilities: [
      ...CHAT_CORE,
      Capabilities.VISION,
      Capabilities.MULTIMODAL,
      Capabilities.IMAGE_GEN,
    ],
  },
  {
    match: /llama3|llama|gemma|mistral|phi|mixtral/i,
    capabilities: [
      ...CHAT_CORE,
      Capabilities.SUMMARIZATION,
      Capabilities.TRANSLATION,
      Capabilities.WRITING,
    ],
  },
  {
    match: /whisper|kokoro|speech|tts|stt/i,
    capabilities: [Capabilities.AUDIO, Capabilities.MULTIMODAL],
  },
  {
    match: /embed|mxbai|nomic/i,
    capabilities: [Capabilities.EMBEDDINGS],
  },
];

const DEFAULT_MODEL_CAPABILITIES = CHAT_CORE;

/** Devuelve las capacidades que un modelo de Ollama cubre según su nombre. */
function capabilitiesForOllamaModel(modelName = '') {
  for (const profile of MODEL_CAPABILITY_PROFILES) {
    if (profile.match.test(modelName)) return [...profile.capabilities];
  }
  return [...DEFAULT_MODEL_CAPABILITIES];
}

/** Estimación de tamaño (parámetros) desde el nombre: qwen3:0.6b → 0.6. */
function estimateSizeFromName(modelName = '') {
  const m = String(modelName).match(/(\d+(?:\.\d+)?)[bB]/);
  return m ? parseFloat(m[1]) : 7;
}

/* ─────────────── Registro real (Ollama / cloud) ────────────────────────── */

/**
 * Obtiene los modelos REALES de Ollama (GET /api/tags).
 * @param {{ ollamaBaseUrl?: string, fetchFn?: typeof fetch }} deps
 */
async function fetchOllamaModels({ ollamaBaseUrl = OLLAMA_BASE_URL, fetchFn = fetch } = {}) {
  const res = await fetchFn(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`Ollama /api/tags error ${res.status}`);
  }
  const json = await res.json();
  const models = (json.models || []).map((m) => ({
    name: m.name,
    size: m.size || 0,
    digest: m.digest,
    modified_at: m.modified_at,
    details: m.details || {},
  }));
  return models;
}

/**
 * Registra los modelos de Ollama en un ModelRegistry REAL del
 * CapabilityOrchestrator. El fetch ya habilitó el health check (si listó
 * modelos, el runtime responde).
 */
function buildModelRegistryFromOllama(ollamaModels = []) {
  const registry = new ModelRegistry({ logger: console });
  for (const m of ollamaModels) {
    registry.registerModel({
      provider: 'ollama',
      model: m.name,
      name: m.name,
      description: `Modelo local Ollama (${m.details?.parameter_size || m.details?.family || 'desconocido'})`,
      capabilities: { capabilities: capabilitiesForOllamaModel(m.name) },
      metrics: { avgLatency: Math.max(100, estimateSizeFromName(m.name) * 400) }, // ms estimados por tamaño
      costPer1K: { input: 0, output: 0 },
      limits: { maxContext: m.details?.context_length || 32768, maxTokens: 4096 },
      status: ModelStatus.ACTIVE,
      healthCheck: { isHealthy: true, lastCheck: new Date() },
    });
  }
  return registry;
}

/* ─────────────── Routing por capacidades ───────────────────────────────── */

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'local', 'comfyui', 'kokoro']);

/** Tag "limpio": oficial de Ollama (sin prefijo hf.co/ ni forks QuantFactory). */
function isCleanTag(modelId = '') {
  const id = String(modelId);
  return !id.includes('hf.co') && !id.includes('QuantFactory');
}

/**
 * Ranking: matchScore desc → local primero → menor latencia → tag limpio
 * (evita que los aliases hf.co/QuantFactory ganen por orden alfabético a los
 * tags oficiales) → orden alfabético.
 */
function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    const aLocal = LOCAL_PROVIDERS.has(String(a.provider).toLowerCase()) ? 1 : 0;
    const bLocal = LOCAL_PROVIDERS.has(String(b.provider).toLowerCase()) ? 1 : 0;
    if (bLocal !== aLocal) return bLocal - aLocal;
    if ((a.estimatedLatency || 0) !== (b.estimatedLatency || 0)) {
      return (a.estimatedLatency || 0) - (b.estimatedLatency || 0);
    }
    const aClean = isCleanTag(a.modelId) ? 1 : 0;
    const bClean = isCleanTag(b.modelId) ? 1 : 0;
    if (bClean !== aClean) return bClean - aClean;
    return String(a.modelId).localeCompare(String(b.modelId));
  });
}

/**
 * Elige el mejor modelo para un agente dadas sus capacidades.
 *
 * @param {object} params
 * @param {string[]} params.capabilities - capacidades del agente (FASE 3)
 * @param {ModelRegistry} params.registry - ModelRegistry real (o fake en tests)
 * @param {object} [params.options] - { activeOnly, healthyOnly, exclude }
 * @returns {object} decisión de routing
 */
function routeModelForAgent({ capabilities, registry, options = {} }) {
  const required = capabilities || [];
  const candidates = registry.findByCapabilities(required, {
    matchAll: false,
    activeOnly: options.activeOnly ?? true,
    healthyOnly: options.healthyOnly ?? true,
    exclude: options.exclude,
  });

  const ranked = rankCandidates(candidates);
  const chosen = ranked[0] ?? null;

  return {
    chosen,
    alternatives: ranked.slice(0, 5),
    candidatesConsidered: ranked.length,
    unmatchedCapabilities: chosen ? chosen.missingCapabilities : [...required],
    matchedCapabilities: chosen ? chosen.matchedCapabilities : [],
    matchScore: chosen ? chosen.matchScore : 0,
  };
}

/**
 * Rutea TODOS los agentes de un plan a modelos reales según sus capacidades.
 *
 * Distribución: cuando varios candidatos empatan en matchScore, se prefiere
 * asignar modelos DISTINTOS a agentes distintos (el coordinador no comparte
 * el mismo modelo 0.6b que el coder si hay otro con el mismo match), sin
 * sacrificar nunca el match score (reuso permitido si no hay empate).
 *
 * @param {object} params
 * @param {Array<{key: string, name?: string, capabilities: string[]}>} params.agents
 * @param {ModelRegistry} params.registry
 * @returns {object} reporte por agente + stats
 */
function routePlanToModels({ agents = [], registry }) {
  const perAgent = [];
  const assignedIds = new Set();
  for (const agent of agents) {
    const decision = routeModelForAgent({ capabilities: agent.capabilities, registry });

    // Preferir un modelo distinto cuando hay empate de matchScore.
    let chosen = decision.chosen;
    if (chosen && assignedIds.has(chosen.modelId)) {
      const sameScoreUnassigned = decision.alternatives.filter(
        (c) =>
          c.modelId &&
          !assignedIds.has(c.modelId) &&
          Math.abs(c.matchScore - chosen.matchScore) < 1e-9,
      );
      if (sameScoreUnassigned.length > 0) {
        chosen = sameScoreUnassigned[0];
      }
    }
    if (chosen) assignedIds.add(chosen.modelId);

    perAgent.push({
      key: agent.key,
      name: agent.name || agent.key,
      capabilities: agent.capabilities,
      chosenModel: chosen
        ? {
            modelId: chosen.modelId,
            provider: chosen.provider,
            // El candidate del ModelRegistry expone `model` como el objeto
            // ModelInfo completo; el nombre plano vive en `model.model`.
            model: chosen.model?.model || chosen.modelId,
            matchScore: chosen.matchScore,
            matchedCapabilities: chosen.matchedCapabilities,
            missingCapabilities: chosen.missingCapabilities,
            isLocal: LOCAL_PROVIDERS.has(String(chosen.provider).toLowerCase()),
          }
        : null,
      alternatives: decision.alternatives.map((c) => c.modelId),
      unmatchedCapabilities: chosen ? chosen.missingCapabilities : [...agent.capabilities],
    });
  }

  const chosenModels = perAgent.map((a) => a.chosenModel?.modelId).filter(Boolean);
  const uniqueModels = new Set(chosenModels);
  const byProvider = {};
  for (const m of perAgent) {
    const p = m.chosenModel?.provider || 'none';
    byProvider[p] = (byProvider[p] || 0) + 1;
  }

  return {
    agents: perAgent,
    stats: {
      agents: agents.length,
      routed: chosenModels.length,
      unrouted: agents.length - chosenModels.length,
      uniqueModels: uniqueModels.size,
      byProvider,
      allLocal: chosenModels.length > 0 && perAgent.every((a) => a.chosenModel?.isLocal),
    },
  };
}

/**
 * Flujo completo: fetch de Ollama real → registro en ModelRegistry →
 * routing por agente. Devuelve el reporte + el registry (para health/E2E).
 */
async function routePlanWithOllamaModels({ agents, ollamaBaseUrl, fetchFn }) {
  const ollamaModels = await fetchOllamaModels({ ollamaBaseUrl, fetchFn });
  const registry = buildModelRegistryFromOllama(ollamaModels);
  const report = routePlanToModels({ agents, registry });
  return { report, registry, ollamaModels };
}

module.exports = {
  capabilitiesForOllamaModel,
  estimateSizeFromName,
  fetchOllamaModels,
  buildModelRegistryFromOllama,
  routeModelForAgent,
  routePlanToModels,
  routePlanWithOllamaModels,
  rankCandidates,
  isCleanTag,
  MODEL_CAPABILITY_PROFILES,
  OLLAMA_BASE_URL,
};
