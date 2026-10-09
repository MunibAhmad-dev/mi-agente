/**
 * MultiAgent API Routes
 *
 * Endpoints para control multi-agente
 */

const express = require('express');
const router = express.Router();
const {
  multiAgentController,
  AgentStatus,
  AgentType,
  TaskPriority,
} = require('../services/MultiAgentController');
const { requireJwtAuth } = require('../middleware');

// EventBus integration
let eventBus = null;
try {
  const eventBusModule = require('../services/EventBus');
  eventBus = eventBusModule.getEventBus();
} catch (err) {
  console.warn('[MultiAgent Routes] EventBus not available:', err.message);
}

// ============ Funciones auxiliares ============

function getUserId(req) {
  return req.user?.id || req.user?._id?.toString() || 'anonymous';
}

/**
 * Verify the requesting user owns the given session.
 * Returns the session on success, sends 403/404 and returns null on failure.
 */
async function requireSessionOwnership(req, res, sessionId) {
  const session = await multiAgentController.getSession(sessionId);
  if (!session) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return null;
  }
  const userId = getUserId(req);
  if (session.userId && session.userId !== userId) {
    res.status(403).json({ success: false, error: 'Access denied' });
    return null;
  }
  return session;
}

/**
 * Helper para publicar eventos de API al EventBus
 */
function publishApiEvent(eventType, payload, req) {
  if (!eventBus) return;

  try {
    eventBus.publish(
      eventType,
      {
        ...payload,
        userId: getUserId(req),
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
      'MultiAgentAPI',
      {
        metadata: {
          endpoint: req.path,
          method: req.method,
        },
      },
    );
  } catch (err) {
    console.error('[MultiAgent Routes] Failed to publish event:', err.message);
  }
}

// ============ Rutas de Sesión ============

/**
 * @route POST /api/multiagent/sessions
 * @desc Crear nueva sesión multi-agente
 */
router.post('/sessions', requireJwtAuth, async (req, res) => {
  try {
    const { name, description, config } = req.body;
    const userId = getUserId(req);

    const session = await multiAgentController.createSession({
      userId,
      name,
      description,
      config,
    });

    // Publicar evento de API
    publishApiEvent(
      'api.multiagent.session.created',
      {
        sessionId: session.id,
        name: session.name,
      },
      req,
    );

    res.status(201).json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('[MultiAgent] Error creating session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/multiagent/sessions
 * @desc Listar sesiones del usuario
 */
router.get('/sessions', requireJwtAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const sessions = await multiAgentController.listSessions(userId);

    res.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error('[MultiAgent] Error listing sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/multiagent/sessions/:sessionId
 * @desc Obtener detalles de sesión
 */
router.get('/sessions/:sessionId', requireJwtAuth, async (req, res) => {
  try {
    const session = await requireSessionOwnership(req, res, req.params.sessionId);
    if (!session) return;
    res.json({ success: true, session });
  } catch (error) {
    console.error('[MultiAgent] Error getting session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route POST /api/multiagent/sessions/:sessionId/pause
 * @desc Pausar sesión
 */
router.post('/sessions/:sessionId/pause', requireJwtAuth, async (req, res) => {
  try {
    const owned = await requireSessionOwnership(req, res, req.params.sessionId);
    if (!owned) return;
    const session = await multiAgentController.pauseSession(req.params.sessionId);
    res.json({ success: true, session });
  } catch (error) {
    console.error('[MultiAgent] Error pausing session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route POST /api/multiagent/sessions/:sessionId/resume
 * @desc Reanudar sesión
 */
router.post('/sessions/:sessionId/resume', requireJwtAuth, async (req, res) => {
  try {
    const owned = await requireSessionOwnership(req, res, req.params.sessionId);
    if (!owned) return;
    const session = await multiAgentController.resumeSession(req.params.sessionId);
    res.json({ success: true, session });
  } catch (error) {
    console.error('[MultiAgent] Error resuming session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route DELETE /api/multiagent/sessions/:sessionId
 * @desc Destruir sesión
 */
router.delete('/sessions/:sessionId', requireJwtAuth, async (req, res) => {
  try {
    const owned = await requireSessionOwnership(req, res, req.params.sessionId);
    if (!owned) return;
    const result = await multiAgentController.destroySession(req.params.sessionId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[MultiAgent] Error destroying session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ Rutas de Agentes ============

/**
 * @route POST /api/multiagent/sessions/:sessionId/agents
 * @desc Agregar agente a sesión
 */
router.post('/sessions/:sessionId/agents', requireJwtAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type, name, config } = req.body;

    const agent = await multiAgentController.addAgent({
      sessionId,
      type,
      name,
      config,
    });

    res.status(201).json({
      success: true,
      agent,
    });
  } catch (error) {
    console.error('[MultiAgent] Error adding agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/multiagent/sessions/:sessionId/agents
 * @desc Listar agentes de sesión
 */
router.get('/sessions/:sessionId/agents', requireJwtAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const agents = await multiAgentController.getSessionAgents(sessionId);

    res.json({
      success: true,
      agents,
      count: agents.length,
    });
  } catch (error) {
    console.error('[MultiAgent] Error listing agents:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/multiagent/agents/:agentId/start
 * @desc Iniciar agente
 */
router.post('/agents/:agentId/start', requireJwtAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await multiAgentController.startAgent(agentId);

    res.json({
      success: true,
      agent,
    });
  } catch (error) {
    console.error('[MultiAgent] Error starting agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/multiagent/agents/:agentId/pause
 * @desc Pausar agente
 */
router.post('/agents/:agentId/pause', requireJwtAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await multiAgentController.pauseAgent(agentId);

    res.json({
      success: true,
      agent,
    });
  } catch (error) {
    console.error('[MultiAgent] Error pausing agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/multiagent/agents/:agentId/resume
 * @desc Reanudar agente
 */
router.post('/agents/:agentId/resume', requireJwtAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await multiAgentController.resumeAgent(agentId);

    res.json({
      success: true,
      agent,
    });
  } catch (error) {
    console.error('[MultiAgent] Error resuming agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/multiagent/agents/:agentId/stop
 * @desc Detener agente
 */
router.post('/agents/:agentId/stop', requireJwtAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await multiAgentController.stopAgent(agentId);

    res.json({
      success: true,
      agent,
    });
  } catch (error) {
    console.error('[MultiAgent] Error stopping agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Rutas de Tareas ============

/**
 * @route POST /api/multiagent/sessions/:sessionId/tasks
 * @desc Crear tarea
 */
router.post('/sessions/:sessionId/tasks', requireJwtAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { agentId, title, description, priority, context } = req.body;

    const task = await multiAgentController.createTask({
      sessionId,
      agentId,
      title,
      description,
      priority,
      context,
    });

    res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    console.error('[MultiAgent] Error creating task:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/multiagent/sessions/:sessionId/tasks
 * @desc Listar tareas de sesión
 */
router.get('/sessions/:sessionId/tasks', requireJwtAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status } = req.query;

    const tasks = await multiAgentController.getSessionTasks(sessionId, { status });

    res.json({
      success: true,
      tasks,
      count: tasks.length,
    });
  } catch (error) {
    console.error('[MultiAgent] Error listing tasks:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/multiagent/tasks/:taskId/complete
 * @desc Marcar tarea como completada
 */
router.post('/tasks/:taskId/complete', requireJwtAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { result } = req.body;

    const task = await multiAgentController.completeTask({ taskId, result });

    res.json({
      success: true,
      task,
    });
  } catch (error) {
    console.error('[MultiAgent] Error completing task:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/multiagent/tasks/:taskId/fail
 * @desc Marcar tarea como fallida
 */
router.post('/tasks/:taskId/fail', requireJwtAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { error } = req.body;

    const task = await multiAgentController.failTask({ taskId, error });

    res.json({
      success: true,
      task,
    });
  } catch (error) {
    console.error('[MultiAgent] Error failing task:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Rutas de Mensajes ============

/**
 * @route POST /api/multiagent/messages
 * @desc Enviar mensaje entre agentes
 */
router.post('/messages', requireJwtAuth, async (req, res) => {
  try {
    const { fromAgentId, toAgentId, content, type } = req.body;

    const message = await multiAgentController.sendMessage({
      fromAgentId,
      toAgentId,
      content,
      type,
    });

    res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    console.error('[MultiAgent] Error sending message:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Rutas de Configuración ============

/**
 * @route GET /api/multiagent/types
 * @desc Obtener tipos de agente disponibles
 */
router.get('/types', requireJwtAuth, (req, res) => {
  res.json({
    success: true,
    agentTypes: Object.values(AgentType),
    taskPriorities: Object.entries(TaskPriority).map(([name, value]) => ({
      name,
      value,
    })),
  });
});

// ============ Peer Mesh — Face 13: Cross-node agent collaboration ============

let _mesh = null;
function getMesh() {
  if (!_mesh) {
    const { getGlobalMesh } = require('../services/MultiAgentController/PeerMesh');
    _mesh = getGlobalMesh();
  }
  return _mesh;
}

/**
 * POST /api/multiagent/peers/register
 * Register a peer (agent node) in the mesh.
 * body: { peerId, meta: { name, role, capabilities, ... } }
 */
router.post('/peers/register', requireJwtAuth, (req, res) => {
  try {
    const { peerId, meta = {} } = req.body || {};
    if (!peerId) return res.status(400).json({ success: false, error: 'peerId is required' });
    const peer = getMesh().register(peerId, { ...meta, registeredByUser: getUserId(req) });
    res.json({ success: true, peer });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * DELETE /api/multiagent/peers/:peerId
 * Unregister a peer from the mesh.
 */
router.delete('/peers/:peerId', requireJwtAuth, (req, res) => {
  try {
    const removed = getMesh().unregister(req.params.peerId);
    res.json({ success: true, removed });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/multiagent/peers
 * List all peers currently in the mesh.
 */
router.get('/peers', requireJwtAuth, (req, res) => {
  try {
    res.json({ success: true, peers: getMesh().getPeers(), stats: getMesh().getStats() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/multiagent/peers/message
 * Send a point-to-point message between peers.
 * body: { fromPeerId, toPeerId, type, payload }
 */
router.post('/peers/message', requireJwtAuth, (req, res) => {
  try {
    const { fromPeerId, toPeerId, type = 'message', payload } = req.body || {};
    if (!fromPeerId || !toPeerId) {
      return res.status(400).json({ success: false, error: 'fromPeerId and toPeerId are required' });
    }
    const receipt = getMesh().send(fromPeerId, toPeerId, { type, payload });
    res.json({ success: true, ...receipt });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/multiagent/peers/broadcast
 * Broadcast a message to all peers except the sender.
 * body: { fromPeerId, type, payload }
 */
router.post('/peers/broadcast', requireJwtAuth, (req, res) => {
  try {
    const { fromPeerId, type = 'broadcast', payload } = req.body || {};
    if (!fromPeerId) return res.status(400).json({ success: false, error: 'fromPeerId is required' });
    const receipt = getMesh().broadcast(fromPeerId, { type, payload });
    res.json({ success: true, ...receipt });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/multiagent/peers/log
 * Get recent message log for the mesh.
 */
router.get('/peers/log', requireJwtAuth, (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json({ success: true, messages: getMesh().getMessageLog(limit) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
