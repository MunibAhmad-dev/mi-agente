'use strict';

/**
 * CognitiveEngine routes — Face 17: Universal Cognitive System.
 *
 * GET  /api/cognitive/status     — full engine status + availability map
 * POST /api/cognitive/remember   — store a fact into memory
 * POST /api/cognitive/recall     — query memories
 * POST /api/cognitive/consolidate — run dedup / decay / generalization pass
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

let _engine = null;

function getEngine() {
  if (!_engine) {
    try {
      const { CognitiveEngine } = require('~/server/services/Harness/cognitive/CognitiveEngine');
      _engine = new CognitiveEngine({});
    } catch (e) {
      console.warn('[cognitive route] CognitiveEngine unavailable:', e.message);
      _engine = {
        getStatus: () => ({ initialized: false, engines: [], error: e.message }),
        getAvailableEngines: () => [],
        remember: async () => ({ id: null, error: 'engine not loaded' }),
        recall: async () => ({ memories: [], knowledge: null, evidence: null }),
        consolidate: async () => ({ error: 'engine not loaded' }),
      };
    }
  }
  return _engine;
}

/** GET /api/cognitive/status */
router.get('/status', (req, res) => {
  try {
    res.json(getEngine().getStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/cognitive/remember — body: { fact: string, context?: object } */
router.post('/remember', async (req, res) => {
  try {
    const { fact, context = {} } = req.body;
    if (!fact) return res.status(400).json({ error: 'fact required' });
    const result = await getEngine().remember(fact, { ...context, userId: req.user?.id });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/cognitive/recall — body: { query: string, options?: object } */
router.post('/recall', async (req, res) => {
  try {
    const { query, options = {} } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });
    const result = await getEngine().recall(query, { ...options, userId: req.user?.id });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/cognitive/consolidate */
router.post('/consolidate', async (req, res) => {
  try {
    const result = await getEngine().consolidate();
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
