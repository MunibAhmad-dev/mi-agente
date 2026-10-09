/**
 * LLM Router routes — Face 17: Universal Cognitive System.
 *
 * Model-agnostic reasoning layer: abstracts all LLM calls so the agent
 * can reason using any provider (Ollama, OpenAI, Grok, etc.) without
 * changing the reasoning logic.
 *
 * GET  /api/llm-router/providers     — list available providers + health
 * POST /api/llm-router/chat          — route a chat request to best provider
 * GET  /api/llm-router/stats         — usage stats per provider
 * POST /api/llm-router/select        — force-select a provider for next calls
 */
const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

let _router = null;
function getRouter() {
  if (!_router) {
    const UniversalLLMRouter = require('~/server/services/Harness/cognitive/llm/UniversalLLMRouter');
    _router = new UniversalLLMRouter();
  }
  return _router;
}

/** GET /api/llm-router/providers */
router.get('/providers', async (req, res) => {
  try {
    const r = getRouter();
    const providers = [];
    for (const [key, spec] of r.providers.entries()) {
      providers.push({
        id: key,
        name: spec.name || key,
        type: spec.type || 'unknown',
        requiresApiKey: spec.requiresApiKey !== false,
        capabilities: spec.capabilities || [],
        models: spec.models || [],
        priority: spec.priority || 99,
      });
    }
    providers.sort((a, b) => a.priority - b.priority);
    res.json({ providers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/llm-router/chat */
router.post('/chat', async (req, res) => {
  try {
    const r = getRouter();
    const { messages, model, provider, options } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages (array) required' });
    }

    if (typeof r.route !== 'function') {
      return res.status(501).json({ error: 'UniversalLLMRouter.route() not implemented' });
    }

    const result = await r.route({ messages, model, provider, options });
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/llm-router/stats */
router.get('/stats', (req, res) => {
  try {
    const r = getRouter();
    res.json({ stats: r.stats || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/llm-router/health-check */
router.post('/health-check', async (req, res) => {
  try {
    const r = getRouter();
    const results = [];
    for (const [key, spec] of r.providers.entries()) {
      const baseUrl = spec.baseUrl;
      if (!baseUrl || spec.type !== 'local') {
        results.push({ id: key, reachable: null, note: 'remote/key-based' });
        continue;
      }
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res2 = await fetch(baseUrl, { signal: ctrl.signal }).catch(() => null);
        clearTimeout(timer);
        results.push({ id: key, reachable: !!res2, status: res2?.status });
      } catch {
        results.push({ id: key, reachable: false });
      }
    }
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
