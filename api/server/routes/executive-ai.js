'use strict';
const express = require('express');
const router = express.Router();
const { getExecutiveAISystem } = require('../services/Executive/ExecutiveAISystem');

// Lazy singleton
function sys() {
  return getExecutiveAISystem();
}

// GET /api/executive-ai/status
router.get('/status', async (req, res) => {
  try {
    const executive = sys();
    if (!executive.initialized) await executive.initialize();
    res.json({ ok: true, ...executive.getStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/executive-ai/execute
router.post('/execute', async (req, res) => {
  try {
    const { task, context } = req.body || {};
    if (!task) return res.status(400).json({ ok: false, error: 'task is required' });
    const executive = sys();
    const result = await executive.execute(task, context || {});
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/executive-ai/task-graph
router.get('/task-graph', async (req, res) => {
  try {
    const executive = sys();
    res.json({ ok: true, graph: executive.getTaskGraph() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/executive-ai/simulate
router.post('/simulate', async (req, res) => {
  try {
    const { action, context } = req.body || {};
    if (!action) return res.status(400).json({ ok: false, error: 'action is required' });
    const executive = sys();
    const result = await executive.simulate(action, context || {});
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/executive-ai/trace
router.get('/trace', async (req, res) => {
  try {
    const n = parseInt(req.query.n) || 50;
    const executive = sys();
    res.json({ ok: true, trace: executive.getTrace(n) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
