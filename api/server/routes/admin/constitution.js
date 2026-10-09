/**
 * Admin routes for the Agent Constitution (Face 7 — Prompt Maestro).
 *
 * GET  /api/admin/constitution          — list all versions
 * GET  /api/admin/constitution/active   — get the active version
 * POST /api/admin/constitution          — create / update a version
 * PUT  /api/admin/constitution/:id/activate — make a version the active one
 */
const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const {
  AgentConstitution,
  getActiveConstitution,
  activateConstitution,
  upsertConstitution,
} = require('~/models/AgentConstitution');

const router = express.Router();
router.use(requireJwtAuth, requireCapability(SystemCapabilities.ACCESS_ADMIN));

/** List all constitution versions (newest first). */
router.get('/', async (req, res) => {
  try {
    const list = await AgentConstitution.find({}).sort({ version: -1 }).lean();
    res.json({ constitutions: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Get active constitution. */
router.get('/active', async (req, res) => {
  try {
    const active = await getActiveConstitution();
    res.json({ constitution: active });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Create or update a constitution version. */
router.post('/', async (req, res) => {
  try {
    const doc = await upsertConstitution(req.body, req.user?.id);
    res.json({ constitution: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Activate a constitution version. */
router.put('/:id/activate', async (req, res) => {
  try {
    const doc = await activateConstitution(req.params.id, req.user?.id);
    if (!doc) {
      return res.status(404).json({ error: 'Constitution not found' });
    }
    res.json({ constitution: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Force-reseed Face 7 constitution (replaces active). */
router.post('/reseed', async (req, res) => {
  try {
    const { seedConstitution } = require('~/server/scripts/seedConstitution');
    process.env.FORCE_RESEED = '1';
    const result = await seedConstitution();
    delete process.env.FORCE_RESEED;
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Get the full text of a specific constitution version. */
router.get('/:id/text', async (req, res) => {
  try {
    const doc = await AgentConstitution.findById(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({ error: 'Constitution not found' });
    }
    res.type('text/plain').send(doc.fullText || '');
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
