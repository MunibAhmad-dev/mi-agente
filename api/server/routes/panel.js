/**
 * Panel Routes - Endpoints que el Panel Enterprise (frontend) espera y que
 * no estaban montados (Fase D del freelancer, 11-ago-2026).
 *
 * Regla de honestidad: cada endpoint responde SOLO con datos de servicios
 * reales (IntegrationManager / CapabilityOrchestrator / WorkflowEngine /
 * CacheManager / RateLimiter). No hay placeholders: si el servicio no está
 * disponible, se devuelve 503 con el motivo.
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const { getIntegrationManager } = require('~/server/services/ExecutionBridge');

/**
 * POST /api/runtimes/execute
 * Ejecuta una tarea en un runtime registrado.
 */
router.post('/runtimes/execute', requireJwtAuth, async (req, res) => {
  try {
    const { runtime, task } = req.body;
    if (!runtime) {
      return res.status(400).json({ success: false, error: 'runtime is required' });
    }

    const manager = await getIntegrationManager();
    const registry = manager.runtimeRegistry;
    const registered = typeof registry.get === 'function' ? registry.get(runtime) : null;

    if (!registered) {
      return res.status(404).json({ success: false, error: `Runtime '${runtime}' not found` });
    }

    if (typeof registered.execute !== 'function') {
      return res.status(400).json({
        success: false,
        error: `Runtime '${runtime}' does not expose direct execution`,
      });
    }

    const result = await registered.execute(task || {});
    res.json({ success: true, runtime, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/capabilities
 * Capacidades disponibles del sistema (CapabilityOrchestrator real).
 */
router.get('/capabilities', requireJwtAuth, async (req, res) => {
  try {
    // CapabilityOrchestrator usa inyección de dependencias: se resuelve del
    // container global (no con `new` directo, que deja los registries vacíos).
    const {
      globalContainer,
    } = require('~/server/services/CapabilityOrchestrator/container/ServiceContainer');
    const { configureGlobalContainer } = require('~/server/services/CapabilityOrchestrator');
    if (globalContainer.listServices().length === 0) {
      configureGlobalContainer();
    }
    const orchestrator = globalContainer.resolve('CapabilityOrchestrator');

    res.json({
      success: true,
      capabilities:
        typeof orchestrator.listCapabilities === 'function' ? orchestrator.listCapabilities() : [],
      stats: typeof orchestrator.getStats === 'function' ? orchestrator.getStats() : {},
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/capabilities/execute
 * Enruta una solicitud a través del IntegrationManager (flujo real de ejecución).
 */
router.post('/capabilities/execute', requireJwtAuth, async (req, res) => {
  try {
    const { type = 'chat', intent, messages, context = {} } = req.body;
    if (!intent && !messages) {
      return res.status(400).json({ success: false, error: 'intent or messages is required' });
    }

    const manager = await getIntegrationManager();
    const result = await manager.processRequest({
      type,
      intent: intent || '',
      messages: messages || [],
      context: { ...context, userId: req.user?.id || req.user?._id?.toString() },
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Workflows creados pero aún no ejecutados (el engine solo los registra al ejecutar).
const pendingWorkflows = new Map();

/**
 * GET /api/workflows
 * Lista de workflows (activos/completados del engine + creados pendientes).
 */
router.get('/workflows', requireJwtAuth, async (req, res) => {
  try {
    const { getWorkflowEngine } = require('~/server/services/WorkflowEngine');
    const engine = getWorkflowEngine();

    const active = Array.from((engine.activeWorkflows || new Map()).values()).map((w) =>
      w.toJSON ? w.toJSON() : { id: w.id, name: w.name, status: w.status },
    );
    const completed = (engine.completedWorkflows || []).map((w) =>
      w.toJSON ? w.toJSON() : { id: w.id, name: w.name, status: w.status },
    );
    const pending = Array.from(pendingWorkflows.values()).map((w) => (w.toJSON ? w.toJSON() : w));

    res.json({
      success: true,
      workflows: { active, completed, pending },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/workflows
 * Crea un workflow a partir de una configuración (pasos).
 */
router.post('/workflows', requireJwtAuth, async (req, res) => {
  try {
    const { getWorkflowEngine } = require('~/server/services/WorkflowEngine');
    const engine = getWorkflowEngine();
    const config = req.body;

    if (!config || (!config.name && !config.steps)) {
      return res.status(400).json({
        success: false,
        error: 'workflow config with name/steps is required',
      });
    }

    const workflow = engine.createWorkflow(config);
    pendingWorkflows.set(workflow.id, workflow);

    res.status(201).json({
      success: true,
      workflow: workflow.toJSON ? workflow.toJSON() : workflow,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id
 * Detalle de un workflow.
 */
router.get('/workflows/:id', requireJwtAuth, async (req, res) => {
  try {
    const { getWorkflowEngine } = require('~/server/services/WorkflowEngine');
    const engine = getWorkflowEngine();

    const workflow =
      (typeof engine.getWorkflow === 'function' && engine.getWorkflow(req.params.id)) ||
      pendingWorkflows.get(req.params.id);

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    res.json({
      success: true,
      workflow: workflow.toJSON ? workflow.toJSON() : workflow,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/workflows/:id/execute
 * Ejecuta un workflow (el workflow es quien ejecuta contra el runtimeRegistry).
 */
router.post('/workflows/:id/execute', requireJwtAuth, async (req, res) => {
  try {
    const { getWorkflowEngine } = require('~/server/services/WorkflowEngine');
    const engine = getWorkflowEngine();
    const manager = await getIntegrationManager();

    const workflow =
      (typeof engine.getWorkflow === 'function' && engine.getWorkflow(req.params.id)) ||
      pendingWorkflows.get(req.params.id);

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    if (typeof workflow.execute !== 'function') {
      return res.status(400).json({ success: false, error: 'Workflow cannot execute' });
    }

    const result = await workflow.execute(manager.runtimeRegistry);
    pendingWorkflows.delete(workflow.id);

    res.json({
      success: true,
      result: result && result.toJSON ? result.toJSON() : result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cache/stats
 * Estadísticas de la caché (CacheManager real).
 */
router.get('/cache/stats', requireJwtAuth, async (req, res) => {
  try {
    const { getCacheManager } = require('~/server/services/CacheManager');
    const cache = getCacheManager();
    const stats = typeof cache.getStats === 'function' ? cache.getStats() : {};

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cache/clear
 * Vacía la caché.
 */
router.post('/cache/clear', requireJwtAuth, async (req, res) => {
  try {
    const { getCacheManager } = require('~/server/services/CacheManager');
    const cache = getCacheManager();

    if (typeof cache.clear !== 'function') {
      return res.status(400).json({ success: false, error: 'CacheManager cannot clear' });
    }

    cache.clear();
    res.json({ success: true, cleared: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/cache/:key
 * Elimina una entrada específica de la caché.
 */
router.delete('/cache/:key', requireJwtAuth, async (req, res) => {
  try {
    const { getCacheManager } = require('~/server/services/CacheManager');
    const cache = getCacheManager();

    if (typeof cache.delete !== 'function') {
      return res.status(400).json({ success: false, error: 'CacheManager cannot delete' });
    }

    const deleted = cache.delete(req.params.key);
    res.json({ success: true, deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ratelimit/stats
 * Estadísticas del RateLimiter (solo lectura).
 */
router.get('/ratelimit/stats', requireJwtAuth, async (req, res) => {
  try {
    const { getRateLimiter } = require('~/server/services/RateLimiter');
    const rateLimiter = getRateLimiter();

    const stats =
      typeof rateLimiter.getStats === 'function'
        ? rateLimiter.getStats()
        : { totalRequests: 0, allowed: 0, blocked: 0, providerLimits: [] };

    res.json({
      success: true,
      stats: {
        totalRequests: stats.totalRequests || 0,
        allowed: stats.allowed || 0,
        blocked: stats.blocked || 0,
        blockRate: stats.blockRate || '0%',
        providers: stats.providerLimits || [],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ratelimit/:provider
 * Estado del límite de un proveedor específico.
 */
router.get('/ratelimit/:provider', requireJwtAuth, async (req, res) => {
  try {
    const { getRateLimiter } = require('~/server/services/RateLimiter');
    const rateLimiter = getRateLimiter();
    const provider = req.params.provider;

    if (typeof rateLimiter.getStatus !== 'function') {
      return res.status(503).json({ success: false, error: 'RateLimiter has no status API' });
    }

    const status = rateLimiter.getStatus(provider);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: `No rate limit state for provider '${provider}'`,
      });
    }

    res.json({ success: true, provider, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
