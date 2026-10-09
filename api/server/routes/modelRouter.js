/**
 * ModelRouter routes — FASE 3: Multi-LLM + Router.
 *
 * Exposes the AgentArchitect modelRouter as an HTTP API.
 * Capability-based model selection: given a task or a list of required
 * capabilities, returns the best model (local-first, ranked by matchScore).
 *
 * GET  /api/model-router/models            — all models in registry (real Ollama)
 * POST /api/model-router/route             — route one agent to best model
 * POST /api/model-router/route-plan        — route multiple agents in a plan
 * GET  /api/model-router/capabilities      — list known capabilities
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const {
  routeModelForAgent,
  routePlanToModels,
  fetchOllamaModels,
  buildModelRegistryFromOllama,
  capabilitiesForOllamaModel,
} = require('~/server/services/AgentArchitect/modelRouter');
const { Capabilities } = require('~/server/services/CapabilityOrchestrator/constants/Types');

const router = express.Router();
router.use(requireJwtAuth);

let _registry = null;
let _registryBuiltAt = 0;
const REGISTRY_TTL = 60_000; // rebuild every 60s

/** Round-robin counters keyed by sorted capability string — prevents starvation of tied models. */
const _rrCounters = new Map();

async function getRegistry() {
  const now = Date.now();
  if (_registry && now - _registryBuiltAt < REGISTRY_TTL) return _registry;
  try {
    const models = await fetchOllamaModels().catch(() => []);
    _registry = buildModelRegistryFromOllama(models);
    _registryBuiltAt = now;
  } catch {
    if (!_registry) _registry = buildModelRegistryFromOllama([]);
  }
  return _registry;
}

/** GET /api/model-router/models */
router.get('/models', async (_req, res) => {
  try {
    const models = await fetchOllamaModels().catch(() => []);
    const enriched = models.map((m) => ({
      name: m.name,
      size: m.size,
      details: m.details || {},
      capabilities: capabilitiesForOllamaModel(m.name),
    }));
    res.json({ success: true, models: enriched, count: enriched.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Apply round-robin across tied alternatives so no single model is always first.
 * Mutates decision.chosen when alternatives exist and score equality applies.
 */
function applyRoundRobin(capabilities, decision) {
  const pool = decision.chosen
    ? [{ model: decision.chosen, score: decision.score }, ...decision.alternatives]
    : decision.alternatives;

  if (pool.length <= 1) return decision;

  // Collect all candidates tied at the top score
  const topScore = pool[0].score;
  const tied = pool.filter((m) => m.score >= topScore - 0.05);
  if (tied.length <= 1) return decision;

  const key = [...capabilities].sort().join(',');
  const idx = (_rrCounters.get(key) || 0) % tied.length;
  _rrCounters.set(key, idx + 1);

  const chosen = tied[idx].model;
  const rest = pool.filter((m) => m.model !== chosen);
  return { ...decision, chosen, alternatives: rest, loadBalanced: true, rrIndex: idx };
}

/** POST /api/model-router/route
 * Body: { capabilities: string[], options?: { exclude?: string[] } }
 */
router.post('/route', async (req, res) => {
  try {
    const { capabilities, options } = req.body || {};
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      return res.status(400).json({ success: false, error: 'capabilities[] is required' });
    }
    const registry = await getRegistry();
    const raw = routeModelForAgent({ capabilities, registry, options: options || {} });
    const decision = applyRoundRobin(capabilities, raw);
    res.json({ success: true, ...decision });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /api/model-router/route-plan
 * Body: { agents: [{ key, name, capabilities[] }] }
 */
router.post('/route-plan', async (req, res) => {
  try {
    const { agents } = req.body || {};
    if (!Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ success: false, error: 'agents[] is required' });
    }
    const registry = await getRegistry();
    const report = routePlanToModels({ agents, registry });
    res.json({ success: true, ...report });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** GET /api/model-router/capabilities — list all known capability keys */
router.get('/capabilities', (_req, res) => {
  const caps = Object.entries(Capabilities || {}).map(([key, value]) => ({ key, value }));
  res.json({ success: true, capabilities: caps, count: caps.length });
});

module.exports = router;
