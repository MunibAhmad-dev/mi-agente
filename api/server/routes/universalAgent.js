'use strict';

/**
 * universalAgent.js — REST API for Gen B Universal Agent phases.
 * Mounted at /api/agent
 *
 * Endpoints:
 *   GET  /status                    — health + stats of all components
 *   POST /route                     — run a prompt through UniversalAgentAbstraction
 *   POST /decide                    — DecisionEngine: YES/NO/ASK decision
 *   POST /ask-vs-act                — AskVsAct evaluation
 *   POST /complexity                — TaskComplexityEngine analysis
 *   POST /context/resolve           — ContextResolution
 *   POST /cognition/adapt           — AdaptiveCognition: adapt session strategy
 *   GET  /cognition/:sessionId      — AdaptiveCognition: get session strategy
 *   POST /performance/record        — ModelPerformanceMemory: record metric
 *   GET  /performance/:modelId      — ModelPerformanceMemory: get model stats
 *   GET  /performance/best/:taskType — ModelPerformanceMemory: best model for task
 *   POST /loop/check                — LoopDetection: check for loops
 *   DELETE /loop/:sessionId         — LoopDetection: reset session
 *   POST /progress/start            — ProgressEngine: start task
 *   POST /progress/:taskId/advance  — ProgressEngine: advance step
 *   POST /progress/:taskId/complete — ProgressEngine: complete task
 *   GET  /progress/:taskId          — ProgressEngine: get progress
 *   GET  /capabilities              — CapabilityRegistry: list capabilities
 *   POST /capabilities              — CapabilityRegistry: register capability
 *   PATCH /capabilities/:name       — CapabilityRegistry: enable/disable
 *   DELETE /capabilities/:name      — CapabilityRegistry: unregister
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

// ─── Lazy loaders ────────────────────────────────────────────────────────────

function getAbstraction() {
  return require('~/server/services/CognitiveBehavior/UniversalAgentAbstraction').getUniversalAgentAbstraction();
}
function getCapabilities() {
  return require('~/server/services/CognitiveBehavior/CapabilityRegistry').getCapabilityRegistry();
}
function getContextRes() {
  return require('~/server/services/CognitiveBehavior/ContextResolution').getContextResolution();
}
function getComplexity() {
  return require('~/server/services/CognitiveBehavior/TaskComplexityEngine').getTaskComplexityEngine();
}
function getCognition() {
  return require('~/server/services/CognitiveBehavior/AdaptiveCognition').getAdaptiveCognition();
}
function getDecision() {
  return require('~/server/services/CognitiveBehavior/DecisionEngine').getDecisionEngine();
}
function getAskAct() {
  return require('~/server/services/CognitiveBehavior/AskVsAct').getAskVsAct();
}
function getPerfMem() {
  return require('~/server/services/CognitiveBehavior/ModelPerformanceMemory').getModelPerformanceMemory();
}
function getLoops() {
  return require('~/server/services/CognitiveBehavior/LoopDetection').getLoopDetection();
}
function getProgress() {
  return require('~/server/services/CognitiveBehavior/ProgressEngine').getProgressEngine();
}

// ─── Health / status ─────────────────────────────────────────────────────────

// GET /api/agent/status
router.get('/status', (req, res) => {
  try {
    res.json({
      service: 'UniversalAgent',
      status: 'ok',
      components: {
        abstraction: getAbstraction().getStats(),
        capabilities: getCapabilities().getStats(),
        contextResolution: getContextRes().getStats(),
        complexity: getComplexity().getStats(),
        cognition: getCognition().getStats(),
        decision: getDecision().getStats(),
        askVsAct: getAskAct().getStats(),
        performance: getPerfMem().getStats(),
        loopDetection: getLoops().getStats(),
        progress: getProgress().getStats(),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Universal Agent Abstraction ─────────────────────────────────────────────

// POST /api/agent/route
router.post('/route', requireJwtAuth, async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const result = await getAbstraction().route(prompt, context || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DecisionEngine ──────────────────────────────────────────────────────────

// POST /api/agent/decide
router.post('/decide', requireJwtAuth, (req, res) => {
  try {
    const { question, context } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });
    res.json(getDecision().decide(question, context || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/decide/history
router.get('/decide/history', requireJwtAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json({ history: getDecision().getHistory(limit), stats: getDecision().getStats() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── AskVsAct ────────────────────────────────────────────────────────────────

// POST /api/agent/ask-vs-act
router.post('/ask-vs-act', requireJwtAuth, (req, res) => {
  try {
    const { task, context } = req.body;
    if (!task) return res.status(400).json({ error: 'task is required' });
    res.json(getAskAct().evaluate(task, context || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── TaskComplexityEngine ────────────────────────────────────────────────────

// POST /api/agent/complexity
router.post('/complexity', requireJwtAuth, (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    res.json(getComplexity().analyze(text));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ContextResolution ───────────────────────────────────────────────────────

// POST /api/agent/context/resolve
router.post('/context/resolve', requireJwtAuth, (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    res.json(getContextRes().resolve(message, history || []));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── AdaptiveCognition ───────────────────────────────────────────────────────

// POST /api/agent/cognition/adapt
router.post('/cognition/adapt', requireJwtAuth, (req, res) => {
  try {
    const { sessionId, feedback } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    res.json(getCognition().adapt(sessionId, feedback || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/cognition/:sessionId
router.get('/cognition/:sessionId', requireJwtAuth, (req, res) => {
  try {
    res.json(getCognition().getStrategy(req.params.sessionId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/agent/cognition/:sessionId/set
router.post('/cognition/:sessionId/set', requireJwtAuth, (req, res) => {
  try {
    const { strategy } = req.body;
    if (!strategy) return res.status(400).json({ error: 'strategy is required' });
    res.json(getCognition().setStrategy(req.params.sessionId, strategy));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/cognition/strategies/list
router.get('/cognition/strategies/list', requireJwtAuth, (req, res) => {
  try {
    res.json(getCognition().listStrategies());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ModelPerformanceMemory ──────────────────────────────────────────────────

// POST /api/agent/performance/record
router.post('/performance/record', requireJwtAuth, (req, res) => {
  try {
    const { modelId, task, metrics } = req.body;
    if (!modelId || !task) return res.status(400).json({ error: 'modelId and task are required' });
    res.json(getPerfMem().record(modelId, task, metrics || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/performance/best/:taskType
router.get('/performance/best/:taskType', requireJwtAuth, (req, res) => {
  try {
    res.json(getPerfMem().getBestModelFor(req.params.taskType));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/performance/ranking/:taskType
router.get('/performance/ranking/:taskType', requireJwtAuth, (req, res) => {
  try {
    res.json(getPerfMem().getRanking(req.params.taskType));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/performance/:modelId
router.get('/performance/:modelId', requireJwtAuth, (req, res) => {
  try {
    const id = req.params.modelId === 'all' ? undefined : req.params.modelId;
    res.json(getPerfMem().getStats(id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── LoopDetection ───────────────────────────────────────────────────────────

// POST /api/agent/loop/check
router.post('/loop/check', requireJwtAuth, (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) return res.status(400).json({ error: 'sessionId and message are required' });
    res.json(getLoops().check(sessionId, message));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/agent/loop/:sessionId
router.delete('/loop/:sessionId', requireJwtAuth, (req, res) => {
  try {
    res.json(getLoops().reset(req.params.sessionId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ProgressEngine ──────────────────────────────────────────────────────────

// POST /api/agent/progress/start
router.post('/progress/start', requireJwtAuth, (req, res) => {
  try {
    const { taskId, steps, meta } = req.body;
    if (!taskId) return res.status(400).json({ error: 'taskId is required' });
    res.json(getProgress().start(taskId, steps || [], meta || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/agent/progress/:taskId/advance
router.post('/progress/:taskId/advance', requireJwtAuth, (req, res) => {
  try {
    const { step, result } = req.body;
    if (step === undefined) return res.status(400).json({ error: 'step is required' });
    res.json(getProgress().advance(req.params.taskId, step, result || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/agent/progress/:taskId/complete
router.post('/progress/:taskId/complete', requireJwtAuth, (req, res) => {
  try {
    res.json(getProgress().complete(req.params.taskId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/agent/progress/:taskId/fail
router.post('/progress/:taskId/fail', requireJwtAuth, (req, res) => {
  try {
    const { reason } = req.body;
    res.json(getProgress().fail(req.params.taskId, reason));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/progress/active
router.get('/progress/active', requireJwtAuth, (req, res) => {
  try {
    res.json(getProgress().listActive());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/progress/:taskId
router.get('/progress/:taskId', requireJwtAuth, (req, res) => {
  try {
    res.json(getProgress().getProgress(req.params.taskId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CapabilityRegistry ──────────────────────────────────────────────────────

// GET /api/agent/capabilities
router.get('/capabilities', requireJwtAuth, (req, res) => {
  try {
    const { type, enabled } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (enabled !== undefined) filter.enabled = enabled === 'true';
    res.json(getCapabilities().list(filter));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/agent/capabilities
router.post('/capabilities', requireJwtAuth, (req, res) => {
  try {
    const result = getCapabilities().register(req.body);
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/agent/capabilities/:name
router.patch('/capabilities/:name', requireJwtAuth, (req, res) => {
  try {
    const { enabled } = req.body;
    if (enabled === undefined) return res.status(400).json({ error: 'enabled is required' });
    const result = getCapabilities().setEnabled(req.params.name, enabled);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/agent/capabilities/:name
router.delete('/capabilities/:name', requireJwtAuth, (req, res) => {
  try {
    const result = getCapabilities().unregister(req.params.name);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
