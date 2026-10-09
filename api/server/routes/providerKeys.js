/**
 * Provider Key Management routes — CRUD for APIKeyManager singleton.
 * Mounted at /api/provider-keys (see index.js).
 *
 * Face 13: f13-2 (LLM management panel) + f13-3 (API key rotation UI).
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

router.use(requireJwtAuth);

function getManager() {
  const { getAPIKeyManager } = require('~/server/services/APIKeyManager/APIKeyManager');
  return getAPIKeyManager();
}

/**
 * GET /api/provider-keys
 * List all providers with masked key info + usage stats.
 */
router.get('/', (req, res) => {
  try {
    const mgr = getManager();
    const providers = mgr.listProviders();
    const stats = mgr.getStats();
    res.json({ providers, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/provider-keys
 * Add or update a provider key.
 * body: { provider, key, metadata? }
 */
router.post('/', (req, res) => {
  try {
    const { provider, key, metadata } = req.body;
    if (!provider || !key) {
      return res.status(400).json({ error: 'provider and key are required' });
    }
    const mgr = getManager();
    mgr.addKey(provider, key, metadata);
    res.json({ success: true, provider });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * DELETE /api/provider-keys/:provider
 * Remove a provider key.
 */
router.delete('/:provider', (req, res) => {
  try {
    const mgr = getManager();
    mgr.removeKey(req.params.provider);
    res.json({ success: true, provider: req.params.provider });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * GET /api/provider-keys/router-metrics
 * Adaptive router runtime metrics (success rates, latency per model).
 */
router.get('/router-metrics', (req, res) => {
  try {
    const { onModelSelect } = require('~/server/services/AgentRuntime/runtimeHooks');
    // Probe router state — select with no args to get stats
    const result = onModelSelect({ capabilities: ['__probe__'] });
    res.json({ available: true, result });
  } catch (e) {
    // Router may not be wired — return empty stats
    res.json({ available: false, message: e.message });
  }
});

/**
 * POST /api/provider-keys/:provider/rotate
 * Rotate a provider key — removes the current key and marks the slot as needing
 * a new one. The client must immediately POST a replacement via POST /api/provider-keys.
 * Face 13: f13-3 — key rotation UI.
 * body: { reason? } — optional rotation reason for the audit log
 */
router.post('/:provider/rotate', (req, res) => {
  try {
    const { provider } = req.params;
    const { reason = 'manual rotation' } = req.body;
    const mgr = getManager();

    const providerList = mgr.listProviders ? mgr.listProviders() : [];
    const existing = providerList.find(
      (p) => p.provider === provider || p.name === provider,
    );
    if (!existing) {
      return res.status(404).json({ error: `Provider "${provider}" not found` });
    }

    // Remove the current key — caller must add replacement immediately
    if (typeof mgr.removeKey === 'function') {
      mgr.removeKey(provider);
    }

    res.json({
      success: true,
      provider,
      rotated: true,
      reason,
      rotatedAt: new Date().toISOString(),
      nextStep: `POST /api/provider-keys with { provider: "${provider}", key: "<new-key>" }`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/provider-keys/health
 * Returns live reachability status for all configured providers.
 * Calls a lightweight probe (list models or echo) without streaming.
 * Face 13: f13-4 — provider health dashboard.
 */
router.get('/health', async (req, res) => {
  try {
    const mgr = getManager();
    const providerList = mgr.listProviders ? mgr.listProviders() : [];

    const results = await Promise.allSettled(
      providerList.map(async (p) => {
        const name = p.provider || p.name;
        const start = Date.now();
        try {
          const { UniversalLLMRouter } = require('~/server/services/UniversalLLMRouter');
          await UniversalLLMRouter.chat(
            [{ role: 'user', content: 'ping' }],
            { model: p.defaultModel || p.model || name, maxTokens: 1 },
          );
          return { provider: name, reachable: true, latencyMs: Date.now() - start };
        } catch (err) {
          return { provider: name, reachable: false, latencyMs: Date.now() - start, error: err.message };
        }
      }),
    );

    const health = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { provider: 'unknown', reachable: false, error: r.reason?.message },
    );

    res.json({
      health,
      summary: {
        total: health.length,
        reachable: health.filter((h) => h.reachable).length,
        unreachable: health.filter((h) => !h.reachable).length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
