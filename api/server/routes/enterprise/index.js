/**
 * Enterprise Routes - Endpoints para la nueva arquitectura
 *
 * Estos endpoints permiten probar y usar la nueva arquitectura Enterprise
 * mientras se mantiene el flujo antiguo funcionando.
 *
 * Para activar: ENABLE_ENTERPRISE_ARCHITECTURE=true
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const {
  getIntegrationManager,
  getExecutionStatus,
  shouldUseNewArchitecture,
} = require('~/server/services/ExecutionBridge');

/**
 * Obtener el userId SOLO del token autenticado. Nunca se acepta del body:
 * un cliente no autenticado no puede actuar como otro usuario.
 * (Auditoría forense 10-ago-2026, hallazgo S1.)
 */
function getUserId(req) {
  return req.user?.id || req.user?._id?.toString();
}

/**
 * GET /api/enterprise/status
 * Estado del sistema de ejecución
 */
router.get('/status', requireJwtAuth, async (req, res) => {
  try {
    const status = await getExecutionStatus();
    res.json({
      success: true,
      architecture: status.architecture,
      newArchitectureEnabled: status.enabled,
      status: status.status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/enterprise/health
 * Health check de la arquitectura
 */
router.get('/health', requireJwtAuth, async (req, res) => {
  try {
    if (!shouldUseNewArchitecture()) {
      return res.json({
        success: true,
        newArchitectureEnabled: false,
        message:
          'Enterprise architecture is disabled. Set ENABLE_ENTERPRISE_ARCHITECTURE=true to enable.',
      });
    }

    const manager = await getIntegrationManager();
    const healthy = await manager.healthCheck();

    res.json({
      success: healthy,
      healthy,
      uptime: manager.getStatus().uptime,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/enterprise/chat
 * Chat usando la nueva arquitectura
 */
router.post('/chat', requireJwtAuth, async (req, res) => {
  try {
    const { text, messages, conversationId } = req.body;
    const userId = getUserId(req);

    if (!text && !messages) {
      return res.status(400).json({
        success: false,
        error: 'text or messages is required',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: could not determine user from token',
      });
    }

    const manager = await getIntegrationManager();
    const result = await manager.processRequest({
      type: 'chat',
      intent: text,
      messages: messages || [],
      context: {
        userId,
        conversationId,
      },
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/enterprise/runtimes
 * Listar runtimes registrados
 */
router.get('/runtimes', requireJwtAuth, async (req, res) => {
  try {
    const manager = await getIntegrationManager();
    const status = manager.getStatus();

    res.json({
      success: true,
      runtimes: status.runtimes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/enterprise/events
 * Historial de eventos del EventBus
 */
router.get('/events', requireJwtAuth, async (req, res) => {
  try {
    const { EventBus } = require('~/server/services/EventBus');
    const eventBus = EventBus ? EventBus.getInstance() : null;

    if (!eventBus) {
      return res.json({
        success: true,
        events: [],
        message: 'EventBus not available',
      });
    }

    const { type, limit = 100 } = req.query;
    const events = eventBus.getHistory(type, parseInt(limit));

    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/enterprise/executions
 * Listar todas las ejecuciones
 */
router.get('/executions', requireJwtAuth, async (req, res) => {
  try {
    const manager = await getIntegrationManager();
    const { getExecutionEngine } = require('~/server/services/ExecutionEngine');
    const engine = getExecutionEngine();

    const { active } = req.query;
    const executions = active === 'true' ? engine.getActiveExecutions() : engine.getAllExecutions();

    res.json({
      success: true,
      count: executions.length,
      executions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/enterprise/executions/:id
 * Detalle de una ejecución específica
 */
router.get('/executions/:id', requireJwtAuth, async (req, res) => {
  try {
    const { getExecutionEngine } = require('~/server/services/ExecutionEngine');
    const engine = getExecutionEngine();

    const execution = engine.getExecution(req.params.id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    res.json({
      success: true,
      execution: execution.toJSON ? execution.toJSON() : execution,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/enterprise/engine
 * Estado del ExecutionEngine
 */
router.get('/engine', requireJwtAuth, async (req, res) => {
  try {
    const { getExecutionEngine } = require('~/server/services/ExecutionEngine');
    const engine = getExecutionEngine();

    res.json({
      success: true,
      engine: engine.getStatus(),
      activeExecutions: engine.getActiveExecutions(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/enterprise/plan
 * Crear un plan de tareas (sin ejecutar)
 */
router.post('/plan', requireJwtAuth, async (req, res) => {
  try {
    const { getTaskPlanner } = require('~/server/services/TaskPlanner');
    const planner = getTaskPlanner();

    const { intent } = req.body;

    if (!intent) {
      return res.status(400).json({
        success: false,
        error: 'intent is required',
      });
    }

    const plan = planner.createPlan(intent);

    res.json({
      success: true,
      plan: plan.toJSON(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/enterprise/planner
 * Estado del TaskPlanner
 */
router.get('/planner', requireJwtAuth, async (req, res) => {
  try {
    const { getTaskPlanner } = require('~/server/services/TaskPlanner');
    const planner = getTaskPlanner();

    res.json({
      success: true,
      config: planner.config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
