/**
 * HarnessAPI — Express router exposing harness functionality via REST API.
 *
 * Endpoints:
 *   POST /harness/run              — Run a task through the harness
 *   POST /harness/deep-search      — Run deep research
 *   POST /harness/orchestrate       — Orchestrate across specialist agents
 *   GET  /harness/status            — Full system status
 *   GET  /harness/health            — Health check all providers
 *   GET  /harness/tools             — List available tools
 *   GET  /harness/providers         — Provider health + stats
 *   GET  /harness/costs             — Cost tracking data
 *   GET  /harness/memory            — Memory stats
 *   GET  /harness/observability     — Metrics + traces + events
 *   POST /harness/verify            — Run verification on files
 *   POST /harness/audit             — Run forensic audit
 *   GET  /harness/connectors        — List registered connectors
 *   POST /harness/connector/:id/:action — Execute connector action
 *   POST /harness/task/cancel/:id   — Cancel a running task
 *   GET  /harness/task/:id          — Get task status
 *
 * Usage:
 *   const { createHarnessAPI } = require('./HarnessAPI');
 *   app.use(createHarnessAPI(harnessManager));
 */

const logger = {
  info: (...args) => console.info('[HarnessAPI]', ...args),
};

/**
 * Create Express router for harness endpoints.
 *
 * @param {HarnessManager} harness - The HarnessManager instance
 * @returns {Function} Express router
 */
function createHarnessAPI(harness) {
  // Use dynamic require to avoid hard dependency on express
  let express;
  try {
    express = require('express');
  } catch {
    // Return a minimal router-like object if express is not available
    logger.info('[HarnessAPI] Express not available — returning stub router');
    return (req, res, next) => next();
  }

  const router = express.Router();
  const activeTasks = new Map();

  // Auth middleware (optional — checks x-api-key header)
  const authMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && harness.security) {
      const valid = harness.security.getApiKey('harness');
      if (valid && apiKey !== valid) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
    }
    next();
  };

  router.use(authMiddleware);

  // ============================================================
  // CORE TASK EXECUTION
  // ============================================================

  /**
   * POST /harness/run — Execute a task through the harness.
   */
  router.post('/run', async (req, res) => {
    try {
      const { task, provider, model, messages, tools, context } = req.body;
      if (!task) return res.status(400).json({ error: 'task is required' });

      const traceId = harness.observability?.startTrace('api_run');

      const result = await harness.run({
        task, provider, model, messages, tools, context,
      });

      harness.observability?.endTrace(traceId, result.success ? 'completed' : 'failed');

      res.json({
        success: result.success,
        sessionId: result.sessionId,
        content: result.content,
        iterations: result.iterations,
        toolCalls: result.toolCalls?.length || 0,
        latency: result.latency,
        error: result.error || null,
      });
    } catch (error) {
      harness.observability?.recordError(error, { source: 'api_run' });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /harness/deep-search — Run deep research.
   */
  router.post('/deep-search', async (req, res) => {
    try {
      const { query, provider, model } = req.body;
      if (!query) return res.status(400).json({ error: 'query is required' });

      const traceId = harness.observability?.startTrace('api_deep_search');
      const result = await harness.deepResearch({ query, provider, model });
      harness.observability?.endTrace(traceId, result.success ? 'completed' : 'failed');

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /harness/orchestrate — Orchestrate across specialist agents.
   */
  router.post('/orchestrate', async (req, res) => {
    try {
      const { task, provider, model } = req.body;
      if (!task) return res.status(400).json({ error: 'task is required' });

      const traceId = harness.observability?.startTrace('api_orchestrate');
      const result = await harness.orchestrateTask({ task, provider, model });
      harness.observability?.endTrace(traceId, result.success ? 'completed' : 'failed');

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // STATUS & MONITORING
  // ============================================================

  /**
   * GET /harness/status — Full system status.
   */
  router.get('/status', (req, res) => {
    try {
      const status = harness.getFullStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /harness/health — Quick health check.
   */
  router.get('/health', (req, res) => {
    try {
      const health = harness.providerOrchestrator?.getHealthStatus() || {};
      const toolStats = harness.toolAdapter?.getStats() || {};
      res.json({
        healthy: Object.values(health).some(h => h.state === 'healthy'),
        providers: health,
        tools: toolStats.totalCalls || 0,
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /harness/tools — List available tools.
   */
  router.get('/tools', (req, res) => {
    try {
      const tools = harness.toolAdapter?.getToolIds() || [];
      const definitions = harness.toolAdapter?.getToolDefinitions() || [];
      res.json({ count: tools.length, tools, definitions });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /harness/providers — Provider health and stats.
   */
  router.get('/providers', (req, res) => {
    try {
      const health = harness.providerOrchestrator?.getHealthStatus() || {};
      const costs = harness.costTracker?.getCostComparison() || {};
      res.json({ health, costs, available: harness.modelPlugin?.getProviderIds() || [] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /harness/costs — Cost tracking data.
   */
  router.get('/costs', (req, res) => {
    try {
      const data = harness.costTracker?.export() || { totals: {}, byProvider: {}, byModel: {} };
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /harness/memory — Memory stats.
   */
  router.get('/memory', (req, res) => {
    try {
      const stats = harness.memoryManager?.getStats() || {};
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /harness/observability — Metrics, events, traces.
   */
  router.get('/observability', (req, res) => {
    try {
      const data = harness.observability?.exportDashboard() || {};
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // VERIFICATION & AUDIT
  // ============================================================

  /**
   * POST /harness/verify — Run verification on files.
   */
  router.post('/verify', async (req, res) => {
    try {
      const { files } = req.body;
      if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'files array required' });

      const report = await harness.verificationAgent?.quickVerify(files);
      res.json(report || { verdict: 'SKIP', message: 'VerificationAgent not available' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /harness/audit — Run forensic audit.
   */
  router.post('/audit', async (req, res) => {
    try {
      const report = await harness.runAudit();
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // CONNECTORS
  // ============================================================

  /**
   * GET /harness/connectors — List registered connectors.
   */
  router.get('/connectors', (req, res) => {
    try {
      const connectors = harness.connectorManager?.listAll() || [];
      res.json({ connectors, count: connectors.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /harness/connector/:id/:action — Execute connector action.
   */
  router.post('/connector/:id/:action', async (req, res) => {
    try {
      const { id, action } = req.params;
      const params = req.body;
      const result = await harness.connectorManager?.execute(id, action, params);
      res.json(result || { error: 'ConnectorManager not available' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // TASK MANAGEMENT
  // ============================================================

  /**
   * POST /harness/task/cancel/:id — Cancel a running task.
   */
  router.post('/task/cancel/:id', (req, res) => {
    try {
      harness.cancel(req.params.id);
      res.json({ success: true, sessionId: req.params.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /harness/task/:id — Get task status.
   */
  router.get('/task/:id', (req, res) => {
    try {
      const session = harness.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Task not found' });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createHarnessAPI };
