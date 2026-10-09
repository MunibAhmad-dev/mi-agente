/**
 * SkillsRegistry Route — Zona visible de skills/plugins/MCP en configuración.
 *
 * Endpoints:
 *   GET    /api/config/skills-registry           — Ver registry completo (separado por tipo/categoría)
 *   GET    /api/config/skills-registry/installed  — Lista skills instalados
 *   POST   /api/config/skills-registry/search     — Buscar en todas las fuentes
 *   POST   /api/config/skills-registry/install    — Instalar un skill
 *   DELETE /api/config/skills-registry/:name      — Desinstalar un skill
 *   POST   /api/config/skills-registry/auto-match — IA analiza tarea → recomienda → instala
 */

const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const SkillsDiscovery = require('~/server/services/SkillsDiscovery');

const router = express.Router();
const requireAdmin = requireCapability(SystemCapabilities.ACCESS_ADMIN);

// ── Face 15: Skill Version Manager + External Registry ───────────────────────
let _versionMgr = null;
let _extRegistry = null;
function getVersionMgr() {
  if (!_versionMgr) _versionMgr = require('~/server/services/SkillsEngine/SkillVersionManager').getSkillVersionManager();
  return _versionMgr;
}
function getExtRegistry(type = 'npm') {
  if (!_extRegistry) {
    const { ExternalSkillRegistry } = require('~/server/services/SkillsEngine/ExternalSkillRegistry');
    _extRegistry = new ExternalSkillRegistry({ type });
  }
  return _extRegistry;
}

router.use(requireJwtAuth);

/**
 * GET /api/config/skills-registry
 * Query params: ?type=skills&category=engineering&platform=claude-code
 */
router.get('/', (req, res) => {
  try {
    const filters = {};
    if (req.query.type) filters.type = req.query.type;
    if (req.query.category) filters.category = req.query.category;
    if (req.query.platform) filters.platform = req.query.platform;

    const registry = SkillsDiscovery.getRegistry(filters);
    res.json({
      success: true,
      ...registry,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/config/skills-registry/installed
 */
router.get('/installed', (req, res) => {
  try {
    const installed = SkillsDiscovery.listInstalled();
    res.json({
      success: true,
      installed,
      count: installed.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/config/skills-registry/search
 * Body: { query, type, category, limit, providers }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, type, category, limit, providers } = req.body || {};
    const results = await SkillsDiscovery.search({
      query,
      type,
      category,
      limit: limit || 20,
      providers,
    });
    res.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/config/skills-registry/install
 * Body: { entry } — entry normalizado del discovery o whitelist
 */
router.post('/install', requireAdmin, (req, res) => {
  try {
    const { entry } = req.body || {};
    if (!entry) {
      return res.status(400).json({
        success: false,
        error: 'entry is required',
      });
    }
    const result = SkillsDiscovery.install(entry, undefined, { authorized: true });
    res.json({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/config/skills-registry/:name
 */
router.delete('/:name', requireAdmin, (req, res) => {
  try {
    const { name } = req.params;
    const removed = SkillsDiscovery.uninstall(name);
    res.json({
      success: removed,
      removed,
      name,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/config/skills-registry/auto-match
 * Body: { userTask, llmResponse, installedSkills }
 * La IA analiza la tarea, recomienda skills, las instala y configura.
 */
router.post('/auto-match', async (req, res) => {
  try {
    const { userTask, llmResponse, installedSkills } = req.body || {};
    if (!userTask) {
      return res.status(400).json({
        success: false,
        error: 'userTask is required',
      });
    }
    const result = await SkillsDiscovery.autoMatch({
      userTask,
      llmResponse,
      installedSkills: installedSkills || SkillsDiscovery.listInstalled(),
    });
    res.json({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ── Face 15: Skill version history ──────────────────────────────────────────
// GET /api/config/skills-registry/versions — list all versioned skills
router.get('/versions', (req, res) => {
  try { res.json({ skills: getVersionMgr().listSkills() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/config/skills-registry/versions/:skillId — version history for a skill
router.get('/versions/:skillId', (req, res) => {
  try {
    const history = getVersionMgr().getHistory(req.params.skillId);
    const current = getVersionMgr().getCurrentVersion(req.params.skillId);
    res.json({ skillId: req.params.skillId, current_version: current?.version || null, versions: history });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/config/skills-registry/versions/:skillId — publish a new version
router.post('/versions/:skillId', requireAdmin, (req, res) => {
  try {
    const { definition, version = 'auto', bump = 'patch' } = req.body;
    if (!definition) return res.status(400).json({ error: 'definition required' });
    const entry = getVersionMgr().publish(req.params.skillId, definition, version, bump);
    res.status(201).json(entry);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/config/skills-registry/versions/:skillId/rollback — rollback to a version
router.post('/versions/:skillId/rollback', requireAdmin, (req, res) => {
  try {
    const { target_version } = req.body;
    if (!target_version) return res.status(400).json({ error: 'target_version required' });
    res.json(getVersionMgr().rollback(req.params.skillId, target_version));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/config/skills-registry/versions/:skillId/:version — delete a specific version
router.delete('/versions/:skillId/:version', requireAdmin, (req, res) => {
  try { res.json(getVersionMgr().deleteVersion(req.params.skillId, req.params.version)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Face 15: External Skill Registry ─────────────────────────────────────────
// GET /api/config/skills-registry/external/search?q=...&type=npm|github
router.get('/external/search', async (req, res) => {
  try {
    const { q = '', type = 'npm' } = req.query;
    const { ExternalSkillRegistry } = require('~/server/services/SkillsEngine/ExternalSkillRegistry');
    const reg = new ExternalSkillRegistry({ type });
    const results = await reg.search(q);
    res.json({ query: q, registry: type, results, count: results.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/config/skills-registry/external/metadata/:skillId?type=npm
router.get('/external/metadata/:skillId', async (req, res) => {
  try {
    const type = req.query.type || 'npm';
    const { ExternalSkillRegistry } = require('~/server/services/SkillsEngine/ExternalSkillRegistry');
    const reg = new ExternalSkillRegistry({ type });
    const meta = await reg.getMetadata(req.params.skillId);
    if (!meta) return res.status(404).json({ error: 'Not found' });
    res.json(meta);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
