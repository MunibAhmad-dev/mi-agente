'use strict';

/**
 * capability-discovery.js — Phase 15: Universal Capability Discovery Engine routes.
 *
 * Mounted at /api/capability-discovery (no auth required).
 *
 * GET  /api/capability-discovery/status               — engine health + registry stats
 * POST /api/capability-discovery/discover             — search for capabilities
 * POST /api/capability-discovery/evaluate             — evaluate a capability
 * GET  /api/capability-discovery/registry             — list all registered capabilities
 * POST /api/capability-discovery/create-skill         — AI skill creator
 * POST /api/capability-discovery/check-compatibility  — compatibility check
 */

const express = require('express');

const router = express.Router();

let _engine = null;

function getEngine() {
  if (!_engine) {
    try {
      const {
        UniversalCapabilityDiscovery,
      } = require('~/server/services/SkillsDiscovery/UniversalCapabilityDiscovery');
      _engine = new UniversalCapabilityDiscovery();
    } catch (e) {
      console.warn('[capability-discovery] UniversalCapabilityDiscovery unavailable:', e.message);
      _engine = null;
    }
  }
  return _engine;
}

function engineOrError(res) {
  const eng = getEngine();
  if (!eng) {
    res.status(503).json({ ok: false, error: 'Capability discovery engine not available' });
    return null;
  }
  return eng;
}

/** GET /status */
router.get('/status', (req, res) => {
  try {
    const eng = engineOrError(res);
    if (!eng) return;
    const stats = eng.getRegistryStats();
    res.json({ ok: true, engine: 'UniversalCapabilityDiscovery', stats });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /discover */
router.post('/discover', async (req, res) => {
  try {
    const eng = engineOrError(res);
    if (!eng) return;
    const { query, options } = req.body || {};
    if (!query) {
      return res.status(400).json({ ok: false, error: 'query is required' });
    }
    const results = await eng.discover(query, options || {});
    res.json({ ok: true, results, total: results.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /evaluate */
router.post('/evaluate', (req, res) => {
  try {
    const eng = engineOrError(res);
    if (!eng) return;
    const { skill, format } = req.body || {};
    if (!skill) {
      return res.status(400).json({ ok: false, error: 'skill is required' });
    }

    const normalized = eng.normalizer.normalize(skill, format || 'unknown');
    const compatibility = eng.compatibility.check(normalized);
    const security = eng.security.scan(normalized);
    const evaluation = eng.evaluator.evaluate(normalized, { compatibility, security });

    res.json({ ok: true, normalized, compatibility, security, evaluation });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /registry */
router.get('/registry', (req, res) => {
  try {
    const eng = engineOrError(res);
    if (!eng) return;
    const { format, minScore } = req.query;
    const filter = {};
    if (format) filter.format = format;
    if (minScore) filter.minScore = parseFloat(minScore);
    const entries = eng.registry.list(filter);
    res.json({ ok: true, capabilities: entries, total: entries.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /create-skill */
router.post('/create-skill', (req, res) => {
  try {
    const eng = engineOrError(res);
    if (!eng) return;
    const { taskDescription } = req.body || {};
    if (!taskDescription) {
      return res.status(400).json({ ok: false, error: 'taskDescription is required' });
    }
    const template = eng.creator.create(taskDescription);
    if (template.error) {
      return res.status(400).json({ ok: false, error: template.error });
    }
    res.json({ ok: true, skill: template });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /check-compatibility */
router.post('/check-compatibility', (req, res) => {
  try {
    const eng = engineOrError(res);
    if (!eng) return;
    const { skill, format } = req.body || {};
    if (!skill) {
      return res.status(400).json({ ok: false, error: 'skill is required' });
    }
    const normalized = eng.normalizer.normalize(skill, format || 'unknown');
    const result = eng.compatibility.check(normalized);
    res.json({ ok: true, result, normalized });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
