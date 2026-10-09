/**
 * AgentEngine routes — FASE 6: Agent Engine.
 *
 * GET  /api/agent-engine/agents           — list all 18 specialist agents
 * GET  /api/agent-engine/agents/:id       — get single agent spec
 * POST /api/agent-engine/select           — select best agent for a task
 * POST /api/agent-engine/spawn            — spawn an agent on a task
 * POST /api/agent-engine/delegate         — delegate a subtask between agents
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { AgentEngine, AGENT_REGISTRY } = require('~/server/services/AgentEngine/AgentEngine');

const router = express.Router();
router.use(requireJwtAuth);

let _engine = null;
function getEngine() {
  if (!_engine) _engine = new AgentEngine();
  return _engine;
}

/** GET /api/agent-engine/agents */
router.get('/agents', (_req, res) => {
  try {
    const agents = getEngine().listAgents();
    res.json({ success: true, agents, count: agents.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** GET /api/agent-engine/agents/:id */
router.get('/agents/:id', (req, res) => {
  try {
    const agent = getEngine().getAgent(req.params.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
    res.json({ success: true, agent });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /api/agent-engine/select
 * Body: { task, requiredCapabilities? }
 */
router.post('/select', (req, res) => {
  try {
    const { task, requiredCapabilities } = req.body || {};
    if (!task) return res.status(400).json({ success: false, error: 'task is required' });
    const agent = getEngine().selectAgent(task, Array.isArray(requiredCapabilities) ? requiredCapabilities : []);
    res.json({ success: true, agent });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST /api/agent-engine/spawn
 * Body: { agentId, task, projectId }
 */
router.post('/spawn', async (req, res) => {
  try {
    const { agentId, task, projectId } = req.body || {};
    if (!agentId || !task) {
      return res.status(400).json({ success: false, error: 'agentId and task are required' });
    }
    const result = await getEngine().spawn(agentId, { task, userId: req.user.id, projectId });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/agent-engine/delegate
 * Body: { fromAgentId, toAgentId, task, projectId }
 */
router.post('/delegate', async (req, res) => {
  try {
    const { fromAgentId, toAgentId, task, projectId } = req.body || {};
    if (!fromAgentId || !toAgentId || !task) {
      return res.status(400).json({ success: false, error: 'fromAgentId, toAgentId and task are required' });
    }
    const result = await getEngine().delegate(fromAgentId, toAgentId, task, {
      userId: req.user.id,
      projectId,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    const status = e.message.includes('cannot delegate') || e.message.includes('Unknown agent') ? 400 : 500;
    res.status(status).json({ success: false, error: e.message });
  }
});

module.exports = router;
