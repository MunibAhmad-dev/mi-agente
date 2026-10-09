/**
 * Integration routes — FASE 2: Integration Architecture.
 *
 * GET  /api/integration/health          — subsystem status (all roles)
 * GET  /api/integration/health/detailed — full metrics: uptime, RAM, model count (admin)
 * POST /api/integration/boot            — boot/re-boot facade (admin)
 * POST /api/integration/route           — route a task through the full pipeline
 * POST /api/integration/remember        — store a memory entry
 * POST /api/integration/recall          — retrieve memories by query
 * POST /api/integration/memory/prune    — prune stale/low-importance entries (admin)
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');

const router = express.Router();
router.use(requireJwtAuth);

const requireAdmin = requireCapability(SystemCapabilities.ACCESS_ADMIN);

let _facade = null;
function getFacade() {
  if (!_facade) _facade = require('~/server/services/IntegrationFacade');
  return _facade;
}

/** GET /api/integration/health */
router.get('/health', async (_req, res) => {
  try {
    const h = await getFacade().health();
    res.json({ success: true, ...h });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** GET /api/integration/health/detailed (admin) — full metrics for dashboard */
router.get('/health/detailed', requireAdmin, async (_req, res) => {
  try {
    const h = await getFacade().healthDetailed();
    res.json({ success: true, ...h });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /api/integration/boot (admin) */
router.post('/boot', requireAdmin, async (_req, res) => {
  try {
    const result = await getFacade().boot();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /api/integration/route */
router.post('/route', async (req, res) => {
  try {
    const { task, projectId, requiredCapabilities } = req.body || {};
    if (!task) return res.status(400).json({ success: false, error: 'task is required' });
    const result = await getFacade().route({
      task,
      userId: req.user.id,
      projectId,
      requiredCapabilities: Array.isArray(requiredCapabilities) ? requiredCapabilities : [],
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /api/integration/remember */
router.post('/remember', async (req, res) => {
  try {
    const { layer, type, content, projectId, tags, importance } = req.body || {};
    if (!layer || !content) {
      return res.status(400).json({ success: false, error: 'layer and content are required' });
    }
    const entry = getFacade().remember({
      layer, type, content,
      userId: req.user.id,
      projectId,
      tags: Array.isArray(tags) ? tags : [],
      importance: typeof importance === 'number' ? importance : 0.5,
    });
    res.json({ success: true, entry });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /api/integration/recall */
router.post('/recall', async (req, res) => {
  try {
    const { query, layer, projectId, topK } = req.body || {};
    const entries = getFacade().recall({
      query,
      layer,
      userId: req.user.id,
      projectId,
      topK: typeof topK === 'number' ? topK : 10,
    });
    res.json({ success: true, entries, count: entries.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/integration/memory/auto-decay (admin)
 * body: { enabled: bool, intervalMs?, olderThanMs?, minImportance? }
 */
router.post('/memory/auto-decay', requireAdmin, (req, res) => {
  try {
    const facade = getFacade();
    if (!facade._memory) return res.status(503).json({ success: false, error: 'Memory not initialized' });
    const { enabled, intervalMs, olderThanMs, minImportance } = req.body || {};
    if (enabled === false) {
      const result = facade._memory.stopAutoDecay();
      return res.json({ success: true, ...result });
    }
    const result = facade._memory.startAutoDecay(
      typeof intervalMs === 'number' ? intervalMs : undefined,
      {
        olderThanMs: typeof olderThanMs === 'number' ? olderThanMs : undefined,
        minImportance: typeof minImportance === 'number' ? minImportance : undefined,
      },
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/integration/memory/prune (admin)
 * body: { olderThanMs?, minImportance?, layer?, projectId? }
 */
router.post('/memory/prune', requireAdmin, (req, res) => {
  try {
    const { olderThanMs, minImportance, layer, projectId } = req.body || {};
    const result = getFacade().pruneMemory({
      olderThanMs: typeof olderThanMs === 'number' ? olderThanMs : undefined,
      minImportance: typeof minImportance === 'number' ? minImportance : undefined,
      layer,
      userId: req.user.id,
      projectId,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/integration/memory/export — Face 17: export all in-memory entries as JSON.
 * query: { layer?, projectId? }
 */
router.get('/memory/export', requireAdmin, (req, res) => {
  try {
    const facade = getFacade();
    if (!facade._memory) return res.status(503).json({ success: false, error: 'Memory not initialized' });
    const { layer, projectId } = req.query;
    const userId = req.user.id;
    const entries = facade.recall({ query: '', layer, userId, projectId, topK: 10_000 });
    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      userId,
      layer: layer || 'all',
      count: entries.length,
      entries,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/integration/memory/import — Face 17: bulk-import memory entries.
 * body: { entries: Array<{ layer, type, content, tags?, importance? }> }
 */
router.post('/memory/import', requireAdmin, (req, res) => {
  try {
    const facade = getFacade();
    const { entries } = req.body || {};
    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, error: 'entries must be an array' });
    }
    const userId = req.user.id;
    let imported = 0;
    const errors = [];
    for (const entry of entries) {
      try {
        facade.remember({
          layer: entry.layer,
          type: entry.type,
          content: entry.content,
          userId,
          projectId: entry.projectId || null,
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          importance: typeof entry.importance === 'number' ? entry.importance : 0.5,
        });
        imported++;
      } catch (err) {
        errors.push({ entry: entry.layer, error: err.message });
      }
    }
    res.json({ success: true, imported, errors, total: entries.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
