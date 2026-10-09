/**
 * agent-runtime routes — expone los servicios de las Fases 5-15 al frontend.
 *
 * POST /api/agent-runtime/firewall/check        → AgentFirewall.check (F9)
 * GET  /api/agent-runtime/memory                → MemoryService.recall (F10)
 * POST /api/agent-runtime/memory                 → MemoryService.remember (F10)
 * DELETE /api/agent-runtime/memory/:id          → MemoryService.forget (F10)
 * GET  /api/agent-runtime/memory/stats          → MemoryService.stats (F10)
 * POST /api/agent-runtime/subagents/dispatch     → SubagentService.dispatch (F11)
 * GET  /api/agent-runtime/subagents/roles        → SubagentService.listRoles (F11)
 * POST /api/agent-runtime/subagents/authorize    → SubagentService.authorizeAction (F11)
 * POST /api/agent-runtime/observability/start    → ObservabilityService.startTrace (F13)
 * POST /api/agent-runtime/observability/:id/step → ObservabilityService.recordStep (F13)
 * POST /api/agent-runtime/observability/:id/end  → ObservabilityService.endTrace (F13)
 * GET  /api/agent-runtime/observability/:id      → ObservabilityService.getTrace (F13)
 * GET  /api/agent-runtime/observability          → ObservabilityService.listTraces (F13)
 * POST /api/agent-runtime/observability/:id/replay → ObservabilityService.replay (F13)
 * GET  /api/agent-runtime/observability/:a/compare/:b → compareTraces (F13)
 * POST /api/agent-runtime/evaluation/cases       → EvaluationService.addBenchmarkCase (F14)
 * GET  /api/agent-runtime/evaluation/cases        → EvaluationService.listCases (F14)
 * POST /api/agent-runtime/evaluation/results     → EvaluationService.recordResult (F14)
 * GET  /api/agent-runtime/evaluation/compare      → EvaluationService.compare (F14)
 * GET  /api/agent-runtime/evaluation/score/:cfg   → EvaluationService.score (F14)
 * GET  /api/agent-runtime/optimization/recommend  → OptimizationService.recommend (F15)
 * POST /api/agent-runtime/optimization/apply       → OptimizationService.apply (F15)
 * POST /api/agent-runtime/optimization/validate    → OptimizationService.validate (F15)
 *
 * Reglas:
 *   - Todas requieren JWT (requireJwtAuth).
 *   - El contexto de usuario (req.user.id) se pasa como userId a los servicios
 *     que lo aceptan, para que la memoria y las trazas sean por usuario.
 *   - Los servicios son singletons a nivel de proceso: se instancian una vez
 *     y se comparten. En una futura fase se pueden persistir en SQLite.
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

const { check: firewallCheck } = require('~/server/services/Security/agentFirewall');
const { MemoryService, MemoryType } = require('~/server/services/Memory/memoryService');
const { SubagentService } = require('~/server/services/Subagents/subagentService');
const { ObservabilityService } = require('~/server/services/Observability/observabilityService');
const { EvaluationService } = require('~/server/services/Evaluation/evaluationService');
const { OptimizationService } = require('~/server/services/Optimization/optimizationService');

// --- Singletons a nivel de proceso (compartidos entre requests) ---
const memoryService = new MemoryService();
const subagentService = new SubagentService({ memoryService });
const observabilityService = new ObservabilityService();
const evaluationService = new EvaluationService({ observability: observabilityService });
const optimizationService = new OptimizationService({ observability: observabilityService });

// =====================================================================
// F9 — Agent Firewall
// =====================================================================
router.post('/firewall/check', requireJwtAuth, (req, res) => {
  const { action, policy, filePath, command, tool } = req.body || {};
  if (!action) {
    return res.status(400).json({ success: false, error: 'action is required' });
  }
  const result = firewallCheck({ action, policy, filePath, command, tool });
  res.json({ success: true, ...result });
});

// =====================================================================
// F10 — Memory
// =====================================================================
router.get('/memory', requireJwtAuth, (req, res) => {
  const { query, layer, topK } = req.query;
  const entries = memoryService.recall({
    query: query || undefined,
    layer: layer || undefined,
    userId: req.user.id,
    topK: topK ? parseInt(topK, 10) : 10,
  });
  res.json({ success: true, entries });
});

router.post('/memory', requireJwtAuth, (req, res) => {
  const { layer, type, content, projectId, tags, importance } = req.body || {};
  if (!layer || !content) {
    return res.status(400).json({ success: false, error: 'layer and content are required' });
  }
  const entry = memoryService.remember({
    layer,
    type: type || MemoryType.FACT,
    content,
    projectId,
    userId: req.user.id,
    tags: tags || [],
    importance: importance ?? 0.5,
  });
  res.json({ success: true, entry });
});

router.delete('/memory/:id', requireJwtAuth, (req, res) => {
  const deleted = memoryService.forget(req.params.id);
  res.json({ success: deleted });
});

router.get('/memory/stats', requireJwtAuth, (req, res) => {
  res.json({ success: true, stats: memoryService.stats() });
});

// =====================================================================
// F11 — Subagents
// =====================================================================
router.get('/subagents/roles', requireJwtAuth, (req, res) => {
  res.json({ success: true, roles: subagentService.listRoles() });
});

router.post('/subagents/dispatch', requireJwtAuth, (req, res) => {
  const { role, task, projectId, extraContext } = req.body || {};
  if (!role || !task) {
    return res.status(400).json({ success: false, error: 'role and task are required' });
  }
  try {
    const descriptor = subagentService.dispatch({
      role,
      task,
      projectId,
      userId: req.user.id,
      extraContext,
    });
    res.json({ success: true, descriptor });
  } catch (error) {
    res.status(200).json({ success: false, error: error.message });
  }
});

router.post('/subagents/authorize', requireJwtAuth, (req, res) => {
  const { role, action, filePath, command, tool } = req.body || {};
  if (!role || !action) {
    return res.status(400).json({ success: false, error: 'role and action are required' });
  }
  const result = subagentService.authorizeAction(role, { action, filePath, command, tool });
  res.json({ success: true, ...result });
});

// =====================================================================
// F13 — Observability
// =====================================================================
router.post('/observability/start', requireJwtAuth, (req, res) => {
  const { task, modelId, input, metadata } = req.body || {};
  if (!task) {
    return res.status(400).json({ success: false, error: 'task is required' });
  }
  const traceId = observabilityService.startTrace({
    task,
    modelId,
    input,
    metadata: { ...metadata, userId: req.user.id },
  });
  res.json({ success: true, traceId });
});

router.post('/observability/:id/step', requireJwtAuth, (req, res) => {
  try {
    observabilityService.recordStep(req.params.id, req.body || {});
    res.json({ success: true });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

router.post('/observability/:id/end', requireJwtAuth, (req, res) => {
  const trace = observabilityService.endTrace(req.params.id, req.body?.status);
  if (!trace) {
    return res.status(404).json({ success: false, error: 'trace not found' });
  }
  res.json({ success: true, trace });
});

router.get('/observability/:id', requireJwtAuth, (req, res) => {
  const trace = observabilityService.getTrace(req.params.id);
  if (!trace) {
    return res.status(404).json({ success: false, error: 'trace not found' });
  }
  res.json({ success: true, ...trace });
});

router.get('/observability', requireJwtAuth, (req, res) => {
  const { status, modelId } = req.query;
  const traces = observabilityService.listTraces({
    status: status || undefined,
    modelId: modelId || undefined,
  });
  res.json({ success: true, traces });
});

router.post('/observability/:id/replay', requireJwtAuth, (req, res) => {
  try {
    const replay = observabilityService.replay(req.params.id, req.body?.modelId);
    res.json({
      success: true,
      replay: {
        traceId: replay.replayTraceId,
        modelId: req.body?.modelId,
        task: replay.task,
        replayOf: req.params.id,
      },
    });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

router.get('/observability/:a/compare/:b', requireJwtAuth, (req, res) => {
  try {
    const comparison = observabilityService.compareTraces(req.params.a, req.params.b);
    res.json({ success: true, comparison });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// =====================================================================
// F14 — Evaluation
// =====================================================================
router.post('/evaluation/cases', requireJwtAuth, (req, res) => {
  try {
    const c = evaluationService.addBenchmarkCase(req.body || {});
    res.json({ success: true, case: c });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/evaluation/cases', requireJwtAuth, (req, res) => {
  const { level } = req.query;
  const cases = evaluationService.listCases({ level: level ? parseInt(level, 10) : undefined });
  res.json({ success: true, cases });
});

router.post('/evaluation/results', requireJwtAuth, (req, res) => {
  try {
    const result = evaluationService.recordResult(req.body || {});
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/evaluation/compare', requireJwtAuth, (req, res) => {
  const { caseId } = req.query;
  const comparison = evaluationService.compare({ caseId: caseId || undefined });
  res.json({ success: true, comparison });
});

router.get('/evaluation/score/:cfg', requireJwtAuth, (req, res) => {
  const score = evaluationService.score(
    req.params.cfg,
    req.query.caseId ? { caseId: req.query.caseId } : {},
  );
  if (score === null) {
    return res.status(404).json({ success: false, error: 'no data for configuration' });
  }
  res.json({ success: true, configuration: req.params.cfg, score });
});

// =====================================================================
// F15 — Optimization
// =====================================================================
router.get('/optimization/recommend', requireJwtAuth, (req, res) => {
  const recommendation = optimizationService.recommend();
  res.json({ success: true, recommendation });
});

router.post('/optimization/apply', requireJwtAuth, (req, res) => {
  const config = req.body || {};
  const applied = optimizationService.apply(config);
  res.json({ success: true, config: applied });
});

router.post('/optimization/validate', requireJwtAuth, (req, res) => {
  const config = req.body || {};
  const validation = optimizationService.validate(config);
  res.json({ success: true, ...validation });
});

module.exports = router;
module.exports.singletons = {
  memoryService,
  subagentService,
  observabilityService,
  evaluationService,
  optimizationService,
};
