'use strict';

/**
 * Self-Improvement Engine routes — Face 16: Self-Improvement & Autonomous Upgrades.
 *
 * GET  /api/self-improvement/stats                    — overall stats + proposal count
 * GET  /api/self-improvement/proposals                — list all proposals
 * GET  /api/self-improvement/proposals/:id            — get a single proposal
 * POST /api/self-improvement/proposals                — submit a new improvement proposal
 * POST /api/self-improvement/proposals/:id/sandbox    — run proposal in sandbox
 * POST /api/self-improvement/proposals/:id/benchmark  — benchmark before/after metrics
 * POST /api/self-improvement/proposals/:id/approve    — approve a sandboxed proposal
 * POST /api/self-improvement/proposals/:id/deploy     — deploy an approved proposal
 * POST /api/self-improvement/proposals/:id/rollback   — rollback a deployed version
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

let _engine = null;

function getEngine() {
  if (!_engine) {
    try {
      const { SelfImprovementEngine } = require(
        '~/server/services/Harness/cognitive/improvement/SelfImprovementEngine',
      );
      _engine = new SelfImprovementEngine({});
    } catch (e) {
      console.warn('[self-improvement] SelfImprovementEngine unavailable:', e.message);
      _engine = {
        propose: async () => ({ id: null, error: 'engine not loaded' }),
        sandbox: async () => null,
        benchmark: async () => null,
        approve: async () => null,
        deploy: async () => null,
        rollback: async () => null,
        getStats: () => ({ error: 'engine not loaded' }),
        proposals: new Map(),
      };
    }
  }
  return _engine;
}

/** GET /stats */
router.get('/stats', (req, res) => {
  try {
    res.json(getEngine().getStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /proposals — list all proposals with status */
router.get('/proposals', (req, res) => {
  try {
    const engine = getEngine();
    const proposals = Array.from(engine.proposals?.values() || []);
    res.json({ proposals, total: proposals.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /proposals/:id */
router.get('/proposals/:id', (req, res) => {
  try {
    const engine = getEngine();
    const proposal = engine.proposals?.get(req.params.id) || null;
    if (!proposal) return res.status(404).json({ error: 'proposal not found' });
    res.json(proposal);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /proposals — submit a new improvement proposal.
 * body: { description, type?, target?, expectedImpact? }
 */
router.post('/proposals', async (req, res) => {
  try {
    const { description, type, target, expectedImpact } = req.body;
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'description is required' });
    }
    const proposal = await getEngine().propose({ description, type, target, expectedImpact });
    res.status(201).json(proposal);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /proposals/:id/sandbox — run in isolated sandbox, mark safe/unsafe */
router.post('/proposals/:id/sandbox', async (req, res) => {
  try {
    const result = await getEngine().sandbox(req.params.id);
    if (!result) return res.status(404).json({ error: 'proposal not found' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /proposals/:id/benchmark — compare metrics before and after */
router.post('/proposals/:id/benchmark', async (req, res) => {
  try {
    const result = await getEngine().benchmark(req.params.id);
    if (!result) return res.status(404).json({ error: 'proposal not found' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /proposals/:id/approve — approve a sandboxed proposal */
router.post('/proposals/:id/approve', async (req, res) => {
  try {
    const result = await getEngine().approve(req.params.id);
    if (!result) return res.status(404).json({ error: 'proposal not found' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /proposals/:id/deploy — deploy an approved proposal to production */
router.post('/proposals/:id/deploy', async (req, res) => {
  try {
    const result = await getEngine().deploy(req.params.id);
    if (!result) return res.status(404).json({ error: 'proposal not found' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /proposals/:id/rollback — rollback a deployed version */
router.post('/proposals/:id/rollback', async (req, res) => {
  try {
    const result = await getEngine().rollback(req.params.id);
    if (!result) return res.status(404).json({ error: 'version not found' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/self-improvement/watch-performance — Face 16: start performance watcher.
 * body: { checkIntervalMs?, qualityThreshold? }
 */
router.post('/watch-performance', (req, res) => {
  try {
    const { checkIntervalMs, qualityThreshold } = req.body || {};
    const result = getEngine().watchPerformance(
      typeof checkIntervalMs === 'number' ? checkIntervalMs : undefined,
      typeof qualityThreshold === 'number' ? qualityThreshold : undefined,
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/self-improvement/stop-watching — Face 16: stop performance watcher.
 */
router.post('/stop-watching', (req, res) => {
  try {
    res.json(getEngine().stopWatchingPerformance());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
