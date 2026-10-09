'use strict';

/**
 * universalAgentBatchC.js — REST API for Gen B Batch-C: Prompt & Memory phases.
 * Mounted at /api/agent/memory
 *
 * Endpoints:
 *   POST   /prompts/:promptId            — PromptVersioning.save
 *   GET    /prompts/:promptId            — PromptVersioning.getLatest
 *   GET    /prompts/:promptId/history    — PromptVersioning.getHistory
 *   POST   /prompt-engine/render         — DynamicPromptEngine.render
 *   POST   /prompt-engine/inline         — DynamicPromptEngine.renderInline
 *   GET    /prompt-engine/templates      — DynamicPromptEngine.getBuiltinTemplates
 *   POST   /direct-answer/analyze        — DirectAnswerFirst.analyze
 *   POST   /multi-turn/:sessionId        — MultiTurnMemory.addTurn
 *   GET    /multi-turn/:sessionId/context — MultiTurnMemory.getContext
 *   GET    /multi-turn/:sessionId/relevant — MultiTurnMemory.getRelevant (q=)
 *   POST   /entities/:sessionId/extract  — EntityTracker.extract
 *   GET    /entities/:sessionId          — EntityTracker.getEntities
 *   POST   /goals/:sessionId             — GoalStateMonitor.setGoal
 *   PATCH  /goals/:sessionId/:goalId     — GoalStateMonitor.updateProgress
 *   GET    /goals/:sessionId             — GoalStateMonitor.getGoalState
 *   POST   /queue                        — PriorityQueue.enqueue
 *   GET    /queue/next                   — PriorityQueue.dequeue
 *   GET    /queue                        — PriorityQueue.list
 *   POST   /time/parse                   — TimeAwareness.parse
 *   GET    /time/context                 — TimeAwareness.getContext
 *   GET    /status                       — all stats
 */

const express = require('express');
const router = express.Router();

// ─── Lazy loaders ─────────────────────────────────────────────────────────────

function getPromptVersioning() {
  return require('~/server/services/CognitiveBehavior/PromptVersioning').getPromptVersioning();
}
function getDynamicPromptEngine() {
  return require('~/server/services/CognitiveBehavior/DynamicPromptEngine').getDynamicPromptEngine();
}
function getDirectAnswerFirst() {
  return require('~/server/services/CognitiveBehavior/DirectAnswerFirst').getDirectAnswerFirst();
}
function getMultiTurnMemory() {
  return require('~/server/services/CognitiveBehavior/MultiTurnMemory').getMultiTurnMemory();
}
function getEntityTracker() {
  return require('~/server/services/CognitiveBehavior/EntityTracker').getEntityTracker();
}
function getGoalStateMonitor() {
  return require('~/server/services/CognitiveBehavior/GoalStateMonitor').getGoalStateMonitor();
}
function getPriorityQueue() {
  return require('~/server/services/CognitiveBehavior/PriorityQueue').getPriorityQueue();
}
function getTimeAwareness() {
  return require('~/server/services/CognitiveBehavior/TimeAwareness').getTimeAwareness();
}

// ─── Status ──────────────────────────────────────────────────────────────────

// GET /api/agent/memory/status
router.get('/status', (req, res) => {
  try {
    res.json({
      service: 'UniversalAgentBatchC',
      status: 'ok',
      components: {
        promptVersioning: getPromptVersioning().getStats(),
        dynamicPromptEngine: getDynamicPromptEngine().getStats(),
        directAnswerFirst: getDirectAnswerFirst().getStats(),
        multiTurnMemory: getMultiTurnMemory().getStats(),
        entityTracker: getEntityTracker().getStats(),
        goalStateMonitor: getGoalStateMonitor().getStats(),
        priorityQueue: getPriorityQueue().getStats(),
        timeAwareness: getTimeAwareness().getStats(),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PromptVersioning ─────────────────────────────────────────────────────────

// POST /api/agent/memory/prompts/:promptId
router.post('/prompts/:promptId', (req, res) => {
  try {
    const { promptId } = req.params;
    const { promptText, metadata } = req.body;
    if (!promptText) return res.status(400).json({ error: 'promptText is required' });
    const result = getPromptVersioning().save(promptId, promptText, metadata || {});
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/prompts/:promptId
router.get('/prompts/:promptId', (req, res) => {
  try {
    const result = getPromptVersioning().getLatest(req.params.promptId);
    if (!result) return res.status(404).json({ error: 'No versions found for prompt' });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/prompts/:promptId/history
router.get('/prompts/:promptId/history', (req, res) => {
  try {
    const history = getPromptVersioning().getHistory(req.params.promptId);
    res.json({ promptId: req.params.promptId, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DynamicPromptEngine ──────────────────────────────────────────────────────

// POST /api/agent/memory/prompt-engine/render
router.post('/prompt-engine/render', (req, res) => {
  try {
    const { templateId, context } = req.body;
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });
    const rendered = getDynamicPromptEngine().render(templateId, context || {});
    res.json({ templateId, rendered });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/agent/memory/prompt-engine/inline
router.post('/prompt-engine/inline', (req, res) => {
  try {
    const { template, context } = req.body;
    if (!template) return res.status(400).json({ error: 'template is required' });
    const rendered = getDynamicPromptEngine().renderInline(template, context || {});
    res.json({ rendered });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/prompt-engine/templates
router.get('/prompt-engine/templates', (req, res) => {
  try {
    const templates = getDynamicPromptEngine().getBuiltinTemplates();
    res.json({ templates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DirectAnswerFirst ────────────────────────────────────────────────────────

// POST /api/agent/memory/direct-answer/analyze
router.post('/direct-answer/analyze', (req, res) => {
  try {
    const { prompt, response } = req.body;
    if (!response) return res.status(400).json({ error: 'response is required' });
    const result = getDirectAnswerFirst().analyze(prompt || '', response);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MultiTurnMemory ──────────────────────────────────────────────────────────

// POST /api/agent/memory/multi-turn/:sessionId
router.post('/multi-turn/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { role, content, metadata } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    const result = getMultiTurnMemory().addTurn(sessionId, role || 'user', content, metadata || {});
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/multi-turn/:sessionId/context
router.get('/multi-turn/:sessionId/context', (req, res) => {
  try {
    const { sessionId } = req.params;
    const maxTurns = parseInt(req.query.maxTurns) || 20;
    const context = getMultiTurnMemory().getContext(sessionId, maxTurns);
    res.json(context);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/multi-turn/:sessionId/relevant?q=
router.get('/multi-turn/:sessionId/relevant', (req, res) => {
  try {
    const { sessionId } = req.params;
    const query = req.query.q || '';
    const topK = parseInt(req.query.topK) || 5;
    const turns = getMultiTurnMemory().getRelevant(sessionId, query, topK);
    res.json({ turns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── EntityTracker ────────────────────────────────────────────────────────────

// POST /api/agent/memory/entities/:sessionId/extract
router.post('/entities/:sessionId/extract', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = getEntityTracker().extract(sessionId, text);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/entities/:sessionId
router.get('/entities/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type } = req.query;
    const entities = getEntityTracker().getEntities(sessionId, type);
    res.json({ entities });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GoalStateMonitor ─────────────────────────────────────────────────────────

// POST /api/agent/memory/goals/:sessionId
router.post('/goals/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { goal, subGoals } = req.body;
    if (!goal) return res.status(400).json({ error: 'goal is required' });
    const result = getGoalStateMonitor().setGoal(sessionId, goal, subGoals || []);
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/agent/memory/goals/:sessionId/:goalId
router.patch('/goals/:sessionId/:goalId', (req, res) => {
  try {
    const { sessionId, goalId } = req.params;
    const { completedSubGoal, evidence } = req.body;
    const result = getGoalStateMonitor().updateProgress(sessionId, goalId, completedSubGoal || '', evidence || '');
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/goals/:sessionId
router.get('/goals/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const state = getGoalStateMonitor().getGoalState(sessionId);
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PriorityQueue ────────────────────────────────────────────────────────────

// POST /api/agent/memory/queue
router.post('/queue', (req, res) => {
  try {
    const { task, priority, metadata } = req.body;
    if (!task) return res.status(400).json({ error: 'task is required' });
    const result = getPriorityQueue().enqueue(task, priority, metadata || {});
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/queue/next
router.get('/queue/next', (req, res) => {
  try {
    const task = getPriorityQueue().dequeue();
    if (!task) return res.status(204).send();
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/queue
router.get('/queue', (req, res) => {
  try {
    const { status, minPriority, maxPriority } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (minPriority) filter.minPriority = parseFloat(minPriority);
    if (maxPriority) filter.maxPriority = parseFloat(maxPriority);
    const tasks = getPriorityQueue().list(filter);
    res.json({ tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── TimeAwareness ────────────────────────────────────────────────────────────

// POST /api/agent/memory/time/parse
router.post('/time/parse', (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = getTimeAwareness().parse(text);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agent/memory/time/context
router.get('/time/context', (req, res) => {
  try {
    res.json(getTimeAwareness().getContext());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
