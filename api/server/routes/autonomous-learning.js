'use strict';

/**
 * Autonomous Learning Engine API — Phase 10
 * Mounted at /api/autonomous-learning
 *
 * GET  /api/autonomous-learning/status              — engine health + stats
 * POST /api/autonomous-learning/learn               — submit an event for learning
 * GET  /api/autonomous-learning/capabilities        — capability graph as JSON
 * POST /api/autonomous-learning/hypothesize         — generate hypotheses for a topic
 * POST /api/autonomous-learning/experiment          — record experiment result
 * GET  /api/autonomous-learning/confidence/:topic   — get confidence score for a topic
 */

const express = require('express');
const router = express.Router();

// Lazy-load the engine to avoid circular-dep issues at boot
let _engine = null;
function getEngine() {
  if (!_engine) {
    try {
      const { getAutonomousLearningEngine } = require('~/server/services/AutonomousLearning/AutonomousLearningEngine');
      _engine = getAutonomousLearningEngine();
    } catch (err) {
      // Return a degraded stub
      _engine = {
        getLearningStats: () => ({ error: err.message, lessonsLearned: 0 }),
        learn: () => { throw new Error('AutonomousLearningEngine unavailable'); },
        capabilityGraph: { toJSON: () => ({ nodes: [], edges: [] }) },
        hypothesize: () => [],
        designExperiment: () => 'unavailable',
        recordExperiment: () => { throw new Error('unavailable'); },
        getConfidence: () => 0,
        council: { deliberate: () => ({ perspectives: [], consensus: 'unavailable', dissent: [], confidence: 0 }) },
      };
    }
  }
  return _engine;
}

/**
 * GET /api/autonomous-learning/status
 * Returns engine health + full learning stats.
 */
router.get('/status', (req, res) => {
  try {
    const stats = getEngine().getLearningStats();
    res.json({ system: 'AutonomousLearningEngine', status: 'ok', ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autonomous-learning/learn
 * Submit a learning event.
 *
 * Body: { type: string, description: string, success?: boolean, meta?: object }
 * Returns: { lessonId, lesson, generalizations, skill, confidence }
 */
router.post('/learn', (req, res) => {
  const { type, description, success, meta } = req.body || {};
  if (!type || !description) {
    return res.status(400).json({ error: 'type and description are required' });
  }
  try {
    const result = getEngine().learn({ type, description, success: !!success, meta: meta || {} });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/autonomous-learning/capabilities
 * Returns the full capability graph as JSON.
 */
router.get('/capabilities', (req, res) => {
  try {
    const graph = getEngine().capabilityGraph.toJSON();
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autonomous-learning/hypothesize
 * Generate hypotheses for a topic.
 *
 * Body: { topic: string, context?: object }
 * Returns: { hypotheses: Array<{hypothesis, plausibility, rationale}> }
 */
router.post('/hypothesize', (req, res) => {
  const { topic, context } = req.body || {};
  if (!topic) {
    return res.status(400).json({ error: 'topic is required' });
  }
  try {
    const hypotheses = getEngine().hypothesize(topic, context || {});
    res.json({ topic, hypotheses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autonomous-learning/experiment
 * Record the result of an experiment, or design a new one.
 *
 * To design: body: { action: 'design', hypothesis, steps, expectedOutcome }
 * To record:  body: { action: 'record', experimentId, actualOutcome, conclusion? }
 */
router.post('/experiment', (req, res) => {
  const { action, experimentId, actualOutcome, conclusion, hypothesis, steps, expectedOutcome } = req.body || {};
  try {
    const engine = getEngine();

    if (action === 'design' || (!action && hypothesis)) {
      if (!hypothesis) return res.status(400).json({ error: 'hypothesis is required for design' });
      const id = engine.designExperiment({ hypothesis, steps: steps || [], expectedOutcome: expectedOutcome || '' });
      return res.json({ experimentId: id, status: 'designed' });
    }

    if (!experimentId || !actualOutcome) {
      return res.status(400).json({ error: 'experimentId and actualOutcome are required to record a result' });
    }
    const result = engine.recordExperiment(experimentId, actualOutcome, conclusion || '');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/autonomous-learning/confidence/:topic
 * Get the knowledge confidence score (0–1) for a given topic.
 */
router.get('/confidence/:topic', (req, res) => {
  const { topic } = req.params;
  if (!topic) {
    return res.status(400).json({ error: 'topic parameter is required' });
  }
  try {
    const score = getEngine().getConfidence(topic);
    res.json({ topic, confidence: score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autonomous-learning/council
 * Convene the AI Council to deliberate on a hypothesis.
 *
 * Body: { hypothesis: string, context?: object }
 */
router.post('/council', (req, res) => {
  const { hypothesis, context } = req.body || {};
  if (!hypothesis) {
    return res.status(400).json({ error: 'hypothesis is required' });
  }
  try {
    const result = getEngine().council.deliberate(hypothesis, context || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
