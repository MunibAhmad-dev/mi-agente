/**
 * ModelCatalog routes — FASE 4: Model Discovery + Benchmark.
 *
 * GET    /api/model-catalog/discover        — all available models (local + cloud + dynamic)
 * GET    /api/model-catalog/licenses        — license compatibility reference
 * POST   /api/model-catalog/benchmark       — run latency probe on a model (admin)
 * POST   /api/model-catalog/catalog         — add/update runtime catalog entries (admin)
 * DELETE /api/model-catalog/catalog/:id     — remove a dynamic entry (admin)
 * GET    /api/model-catalog/:id             — single model entry
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const catalog = require('~/server/services/ModelCatalog');

const router = express.Router();
router.use(requireJwtAuth);
const requireAdmin = requireCapability(SystemCapabilities.ACCESS_ADMIN);

/** GET /api/model-catalog/discover */
router.get('/discover', async (_req, res) => {
  try {
    const models = await catalog.discover();
    res.json({ success: true, models, count: models.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** GET /api/model-catalog/licenses */
router.get('/licenses', (_req, res) => {
  const { LICENSE_STATUS } = require('~/server/services/ModelCatalog');
  const table = Object.entries(LICENSE_STATUS || {}).map(([license, status]) => ({ license, status }));
  res.json({ success: true, licenses: table });
});

/** POST /api/model-catalog/benchmark (admin only) */
router.post('/benchmark', requireAdmin, async (req, res) => {
  try {
    const { modelId, timeoutMs } = req.body || {};
    if (!modelId) return res.status(400).json({ success: false, error: 'modelId is required' });
    const result = await catalog.benchmark(modelId, { timeoutMs });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/model-catalog/sync (admin) — pull all installed Ollama models into catalog.
 * Call after `ollama pull <model>` to register new models without restart.
 */
router.post('/sync', requireAdmin, async (_req, res) => {
  try {
    const result = await catalog.syncFromOllamaRegistry();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/model-catalog/catalog (admin) — add/update dynamic entries at runtime.
 * body: { entries: [{ id, provider, license, capabilities, costPer1K, notes, ... }] }
 */
router.post('/catalog', requireAdmin, (req, res) => {
  try {
    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: 'entries array is required' });
    }
    const result = catalog.updateCatalog(entries);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** DELETE /api/model-catalog/catalog/:id (admin) — remove a dynamic entry. */
router.delete('/catalog/:id', requireAdmin, (req, res) => {
  try {
    const removed = catalog.removeFromCatalog(req.params.id);
    res.json({ success: true, removed, modelId: req.params.id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** GET /api/model-catalog/:id */
router.get('/:id', async (req, res) => {
  try {
    const model = await catalog.getModel(req.params.id);
    if (!model) return res.status(404).json({ success: false, error: 'Model not found in catalog' });
    res.json({ success: true, model });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
