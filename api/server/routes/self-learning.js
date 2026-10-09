'use strict';

/**
 * Self-Learning routes — Phase 16: Agent Self-Learning System.
 *
 * Extends existing /api/self-improvement with a dedicated endpoint.
 * Mounted at /api/self-learning (see server startup; no auth required).
 *
 * GET  /api/self-learning/status          — system health + stats
 * POST /api/self-learning/learn           — submit event for learning
 * GET  /api/self-learning/lessons         — list all lessons with confidence stage
 * GET  /api/self-learning/skills          — list distilled skills
 * POST /api/self-learning/replay/:id      — replay a lesson
 * GET  /api/self-learning/benchmark       — current learning quality score
 * GET  /api/self-learning/causal-map      — causal memory as graph
 */

const express = require('express');

const router = express.Router();

let _system = null;

function getSystem() {
  if (!_system) {
    try {
      const { AgentSelfLearningSystem } = require('~/server/services/SelfLearning/AgentSelfLearningSystem');
      _system = new AgentSelfLearningSystem({});
    } catch (e) {
      console.warn('[self-learning] AgentSelfLearningSystem unavailable:', e.message);
      // Minimal stub so routes still respond
      _system = {
        learn: () => ({ lesson: null, classified: {}, gaps: { gaps: [] }, stage: 'UNVERIFIED' }),
        getLessons: () => [],
        getLesson: () => null,
        getSkills: () => [],
        getSystemStatus: () => ({ error: 'system not loaded' }),
        replay: { replay: () => ({ success: false }) },
        benchmark: { score: () => ({ recall: 0, precision: 0, improvement_rate: 0, total: 0 }) },
        causalMemory: { getAll: () => ({}) },
      };
    }
  }
  return _system;
}

/** GET /status */
router.get('/status', (req, res) => {
  try {
    const sys = getSystem();
    const status = sys.getSystemStatus();
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /learn */
router.post('/learn', (req, res) => {
  try {
    const { event, context } = req.body || {};
    if (!event) {
      return res.status(400).json({ ok: false, error: 'event is required' });
    }
    const sys = getSystem();
    const result = sys.learn(event, context || {});
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /lessons */
router.get('/lessons', (req, res) => {
  try {
    const sys = getSystem();
    const lessons = sys.getLessons();
    res.json({ ok: true, lessons, total: lessons.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /skills */
router.get('/skills', (req, res) => {
  try {
    const sys = getSystem();
    const skills = sys.getSkills();
    res.json({ ok: true, skills, total: skills.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /replay/:id */
router.post('/replay/:id', (req, res) => {
  try {
    const sys = getSystem();
    const result = sys.replay.replay(req.params.id);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /benchmark */
router.get('/benchmark', (req, res) => {
  try {
    const sys = getSystem();
    const score = sys.benchmark.score();
    res.json({ ok: true, score });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /causal-map */
router.get('/causal-map', (req, res) => {
  try {
    const sys = getSystem();
    const graph = sys.causalMemory.getAll();
    // Format as nodes + edges for graph visualization
    const nodes = [];
    const edges = [];
    const nodeSet = new Set();
    for (const [cause, effects] of Object.entries(graph)) {
      if (!nodeSet.has(cause)) {
        nodes.push({ id: cause, type: 'cause' });
        nodeSet.add(cause);
      }
      for (const eff of effects) {
        const effectId = eff.effect;
        if (!nodeSet.has(effectId)) {
          nodes.push({ id: effectId, type: 'effect' });
          nodeSet.add(effectId);
        }
        edges.push({ from: cause, to: effectId, context: eff.context });
      }
    }
    res.json({ ok: true, nodes, edges, raw: graph });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
