/**
 * Capability / Plugin Marketplace routes — Face 12: Tool Harness.
 *
 * Mounted at /api/capability (see api/server/index.js).
 *
 * GET  /api/capability/list          — list all registered capabilities
 * POST /api/capability/search        — search by type/tag/platform
 * POST /api/capability/discover      — run discovery pipeline (admin)
 * GET  /api/capability/:id           — get capability detail
 * POST /api/capability/:id/install   — install a capability (admin)
 * DELETE /api/capability/:id/uninstall — uninstall a capability (admin)
 * POST /api/capability/:id/evaluate  — re-evaluate security + quality (admin)
 * GET  /api/capability/stats         — registry statistics
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');

const router = express.Router();
router.use(requireJwtAuth);

const requireAdmin = requireCapability(SystemCapabilities.ACCESS_ADMIN);

let _manager = null;
function getManager() {
  if (!_manager) {
    const { CapabilityManager } = require('~/server/services/Harness/capability');
    _manager = new CapabilityManager();
  }
  return _manager;
}

/** GET /api/capability/list */
router.get('/list', (req, res) => {
  try {
    const manager = getManager();
    const { type, limit = 50, offset = 0 } = req.query;
    const all = type
      ? manager.registry.search({ type, limit: Number(limit), offset: Number(offset) })
      : manager.registry.getAll({ limit: Number(limit), offset: Number(offset) });
    res.json({ capabilities: all, total: manager.registry.stats.stored });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/capability/search */
router.post('/search', (req, res) => {
  try {
    const manager = getManager();
    const { query, type, platform, tags, license, securityLevel, limit = 20, offset = 0 } = req.body || {};
    const results = manager.registry.search({ query, type, platform, tags, license, securityLevel, limit, offset });
    res.json({ results, count: results.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/capability/discover — admin only, runs the full discovery pipeline */
router.post('/discover', requireAdmin, async (req, res) => {
  try {
    const manager = getManager();
    const discovered = await manager.runDiscovery();
    res.json({ discovered: discovered.length, capabilities: discovered.map((c) => ({ id: c.id, name: c.name, type: c.type })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/capability/stats */
router.get('/stats', (req, res) => {
  try {
    const manager = getManager();
    res.json({ registry: manager.registry.stats, manager: manager.stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/capability/:id */
router.get('/:id', (req, res) => {
  try {
    const manager = getManager();
    const cap = manager.registry.get(req.params.id);
    if (!cap) return res.status(404).json({ error: 'Capability not found' });
    res.json({ capability: cap });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/capability/:id/install — admin only */
router.post('/:id/install', requireAdmin, async (req, res) => {
  try {
    const manager = getManager();
    const cap = manager.registry.get(req.params.id);
    if (!cap) return res.status(404).json({ error: 'Capability not found' });
    const result = await manager.installer.install(cap, req.body || {});
    res.json({ installed: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/capability/:id/uninstall — admin only */
router.delete('/:id/uninstall', requireAdmin, async (req, res) => {
  try {
    const manager = getManager();
    const cap = manager.registry.get(req.params.id);
    if (!cap) return res.status(404).json({ error: 'Capability not found' });
    const result = await manager.installer.uninstall(cap);
    res.json({ uninstalled: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/capability/:id/evaluate — re-run security + evaluation (admin) */
router.post('/:id/evaluate', requireAdmin, async (req, res) => {
  try {
    const manager = getManager();
    const cap = manager.registry.get(req.params.id);
    if (!cap) return res.status(404).json({ error: 'Capability not found' });
    const result = await manager.processCapability(cap);
    manager.registry.register(result);
    res.json({ evaluated: true, capability: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
