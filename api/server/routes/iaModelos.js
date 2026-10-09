'use strict';

/**
 * IA y Modelos Routes — Face 13 full implementation.
 *
 * Mounted at: /api/ia-modelos
 *
 * GET  /providers                  — list all providers with status
 * POST /providers/refresh          — force re-probe all providers
 * GET  /providers/:id              — single provider details
 * GET  /providers/:id/models       — models for a specific provider
 * GET  /models/local               — locally installed models (Ollama + LM Studio)
 * GET  /models/search              — search across GitHub + HuggingFace + providers
 * GET  /models/github              — GitHub AI model repos
 * GET  /models/huggingface         — HuggingFace models
 * GET  /models/recommended         — AI Router recommendation
 * GET  /models/favorites           — saved favorites
 * POST /models/favorites           — add to favorites
 * DELETE /models/favorites/:id     — remove from favorites
 * GET  /models/history             — usage history
 * POST /router/select              — select best model for a task
 * POST /models/compare             — compare 2-5 models side by side
 * GET  /hardware                   — local hardware info
 * POST /hardware/check             — compatibility check for a model
 * GET  /system/status              — overall system status
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const ProviderManager = require('~/server/services/ProviderManager');

const router = express.Router();
router.use(requireJwtAuth);

// ─── Providers ──────────────────────────────────────────────────────────────

router.get('/providers', async (_req, res) => {
  try {
    const providers = await ProviderManager.getProviders();
    res.json({
      providers,
      summary: {
        total: providers.length,
        reachable: providers.filter((p) => p.reachable).length,
        totalModels: providers.reduce((sum, p) => sum + (p.models?.length || 0), 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/providers/refresh', async (_req, res) => {
  try {
    const providers = await ProviderManager.refreshProviders();
    res.json({ ok: true, providers, refreshedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/providers/:id', async (req, res) => {
  try {
    const providers = await ProviderManager.getProviders();
    const p = providers.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Provider not found' });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/providers/:id/models', async (req, res) => {
  try {
    const models = await ProviderManager.getProviderModels(req.params.id);
    if (!models) return res.status(404).json({ error: 'Provider not found' });
    res.json({ providerId: req.params.id, models, count: models.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Local models ────────────────────────────────────────────────────────────

router.get('/models/local', async (_req, res) => {
  try {
    const providers = await ProviderManager.getProviders();
    const localProviders = providers.filter((p) => ['ollama', 'lmstudio', 'litellm'].includes(p.id));
    const models = [];
    for (const p of localProviders) {
      for (const m of p.models || p.knownModels || []) {
        models.push({ modelId: m, providerId: p.id, providerLabel: p.label, local: true });
      }
    }
    res.json({ models, count: models.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Model search ─────────────────────────────────────────────────────────────

router.get('/models/search', async (req, res) => {
  try {
    const { q = '', source = 'all' } = req.query;
    const results = {};

    if (source === 'all' || source === 'github') {
      results.github = await ProviderManager.searchGitHub(q);
    }
    if (source === 'all' || source === 'huggingface') {
      results.huggingface = await ProviderManager.searchHuggingFace(q);
    }
    if (source === 'all' || source === 'providers') {
      const providers = await ProviderManager.getProviders();
      const allModels = [];
      for (const p of providers) {
        for (const m of p.models || []) {
          if (!q || m.toLowerCase().includes(q.toLowerCase())) {
            allModels.push({ modelId: m, providerId: p.id, providerLabel: p.label, reachable: p.reachable });
          }
        }
      }
      results.providers = { results: allModels, count: allModels.length };
    }

    res.json({ query: q, source, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/models/github', async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;
    const result = await ProviderManager.searchGitHub(q, parseInt(limit, 10));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/models/huggingface', async (req, res) => {
  try {
    const { q = '', limit = 20, task = 'text-generation' } = req.query;
    const result = await ProviderManager.searchHuggingFace(q, { limit: parseInt(limit, 10), task });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Recommendations & router ─────────────────────────────────────────────────

router.get('/models/recommended', async (req, res) => {
  try {
    const { task = 'chat', preferLocal, preferFree, minimizeCost } = req.query;
    const result = await ProviderManager.recommendModel(task, {
      preferLocal: preferLocal === 'true',
      preferFree: preferFree !== 'false',
      minimizeCost: minimizeCost === 'true',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/router/select', async (req, res) => {
  try {
    const { task = 'chat', preferLocal, preferFree, minimizeCost } = req.body || {};
    const result = await ProviderManager.recommendModel(task, { preferLocal, preferFree, minimizeCost });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Favorites ───────────────────────────────────────────────────────────────

router.get('/models/favorites', (_req, res) => {
  res.json({ favorites: ProviderManager.getFavorites() });
});

router.post('/models/favorites', (req, res) => {
  const { modelId } = req.body || {};
  if (!modelId) return res.status(400).json({ error: 'modelId required' });
  res.json(ProviderManager.addFavorite(modelId));
});

router.delete('/models/favorites/:id', (req, res) => {
  res.json(ProviderManager.removeFavorite(decodeURIComponent(req.params.id)));
});

// ─── History ─────────────────────────────────────────────────────────────────

router.get('/models/history', (req, res) => {
  const { limit = 50 } = req.query;
  res.json({ history: ProviderManager.getHistory(parseInt(limit, 10)) });
});

router.post('/models/history', (req, res) => {
  const { modelId, providerId, task, tokens, latencyMs } = req.body || {};
  if (!modelId) return res.status(400).json({ error: 'modelId required' });
  ProviderManager.recordUsage({ modelId, providerId, task, tokens, latencyMs });
  res.json({ ok: true });
});

// ─── Model comparison ─────────────────────────────────────────────────────────

router.post('/models/compare', async (req, res) => {
  try {
    const { models: modelIds = [] } = req.body || {};
    if (modelIds.length < 2 || modelIds.length > 5) {
      return res.status(400).json({ error: 'Selecciona entre 2 y 5 modelos para comparar' });
    }

    const providers = await ProviderManager.getProviders();
    const providerMap = {};
    for (const p of providers) {
      for (const m of p.models || []) {
        providerMap[m] = p;
      }
    }

    const comparison = modelIds.map((modelId) => {
      const provider = providerMap[modelId];
      return {
        modelId,
        provider: provider ? { id: provider.id, label: provider.label, reachable: provider.reachable } : null,
        available: !!provider,
        free: provider ? ['ollama', 'groq', 'lmstudio', 'litellm', 'openrouter'].includes(provider.id) : false,
        local: provider ? ['ollama', 'lmstudio', 'litellm'].includes(provider.id) : false,
      };
    });

    res.json({ models: comparison, count: comparison.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Hardware ─────────────────────────────────────────────────────────────────

router.get('/hardware', (_req, res) => {
  try {
    const hw = ProviderManager.getHardwareInfo();
    res.json(hw);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hardware/check', (req, res) => {
  try {
    const { vramGB, ramGB, params } = req.body || {};
    const result = ProviderManager.checkModelCompatibility({ vramGB, ramGB, params });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── System status ────────────────────────────────────────────────────────────

router.get('/system/status', async (_req, res) => {
  try {
    const [providers, hw] = await Promise.all([
      ProviderManager.getProviders(),
      Promise.resolve(ProviderManager.getHardwareInfo()),
    ]);

    const reachable = providers.filter((p) => p.reachable);
    const totalModels = providers.reduce((sum, p) => sum + (p.models?.length || 0), 0);

    res.json({
      status: reachable.length > 0 ? 'operational' : 'degraded',
      providers: { total: providers.length, reachable: reachable.length },
      models: { total: totalModels },
      hardware: {
        cpuCores: hw.cpu?.cores,
        ramTotalGB: hw.ram?.totalGB,
        ramFreeGB: hw.ram?.freeGB,
        vramGB: hw.vramGB,
        gpu: hw.gpu?.name || null,
      },
      favorites: ProviderManager.getFavorites().length,
      historyEntries: ProviderManager.getHistory(1000).length,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
