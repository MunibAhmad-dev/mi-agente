/**
 * Harness API routes — exposes the HarnessEngine so the UI (or any client)
 * can scaffold sessions, inject context, checkpoint/resume, register goals,
 * and inspect the harness state.
 *
 * Mounted at /api/harness (see api/server/index.js).
 */

const express = require('express');
const router = express.Router();

const { requireJwtAuth } = require('~/server/middleware');
const HarnessEngine = require('~/server/services/AgentRuntime/HarnessEngine');
const { getHarnessManager } = require('~/server/services/Harness');

let _policy = null;
let _eventSourcing = null;

function getPolicy() {
  if (!_policy) {
    try { _policy = require('~/server/services/PolicyEngine'); } catch { _policy = null; }
  }
  return _policy;
}

function getEventSourcing() {
  if (!_eventSourcing) {
    try { _eventSourcing = require('~/server/services/Harness/cognitive/EventSourcing').getEventSourcing(); } catch { _eventSourcing = null; }
  }
  return _eventSourcing;
}

async function enforcePolicy(req, res, action, resource = {}) {
  const policy = getPolicy();
  const userId = req.user?.id || req.user?._id?.toString() || 'anonymous';
  // For destructive/shell actions, fail-secure: deny when PolicyEngine unavailable.
  const DESTRUCTIVE_ACTIONS = ['harness:run-command', ...EXTENDED_DESTRUCTIVE];
  if (!policy) {
    if (DESTRUCTIVE_ACTIONS.includes(action)) {
      res.status(403).json({ error: `Policy denied: PolicyEngine unavailable — action '${action}' requires explicit policy authorization` });
      return false;
    }
    return true; // non-destructive actions allowed without PolicyEngine
  }
  try {
    const allowed = await policy.isAllowed({ principal: { id: userId }, action, resource });
    if (!allowed) {
      res.status(403).json({ error: `Policy denied: action '${action}' is not permitted` });
      return false;
    }
  } catch {
    // On error in PolicyEngine, fail-secure for destructive actions
    if (DESTRUCTIVE_ACTIONS.includes(action)) {
      res.status(403).json({ error: `Policy error: action '${action}' denied due to policy evaluation failure` });
      return false;
    }
  }
  return true;
}

router.use(requireJwtAuth);

/**
 * POST /api/harness/scaffold
 * Create or resume a session and scaffold the agent.
 * body: { agentId, model, agentSpec, availableTools, userTask, resumeSessionId }
 */
router.post('/scaffold', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    const session = HarnessEngine.createSession({
      agentId: req.body.agentId,
      model: req.body.model,
      userId,
    });
    let resumed = false;
    if (req.body.resumeSessionId) {
      const loaded = await HarnessEngine.resume(req.body.resumeSessionId, userId);
      if (loaded) {
        Object.assign(session, loaded);
        resumed = true;
      }
    }
    const { systemPrompt, tools, subagents } = await HarnessEngine.scaffold(session, {
      agentSpec: req.body.agentSpec,
      availableTools: req.body.availableTools,
      userTask: req.body.userTask,
    });
    res.json({ session, systemPrompt, tools, subagents, resumed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/pre-llm
 * Inject reminders and compact context before the next LLM call.
 * body: { session, message }
 */
router.post('/pre-llm', async (req, res) => {
  try {
    const result = await HarnessEngine.preLLMCall(req.body.session, req.body.message);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/post-tool
 * Normalize a tool result and update conversation state.
 * body: { session, toolCall, result }
 */
router.post('/post-tool', (req, res) => {
  try {
    const normalized = HarnessEngine.postToolCall(
      req.body.session,
      req.body.toolCall,
      req.body.result,
    );
    res.json({ result: normalized });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/should-stop
 * Evaluate whether the agent loop should stop.
 * body: { session }
 */
router.post('/should-stop', (req, res) => {
  try {
    const result = HarnessEngine.shouldStop(req.body.session);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/run-command
 * Run a shell command through the sandbox.
 * body: { session, command, cwd, timeout }
 */
router.post('/run-command', async (req, res) => {
  const userId = req.user?.id || req.user?._id?.toString();
  try {
    const allowed = await enforcePolicy(req, res, 'harness:run-command', { command: req.body.command });
    if (!allowed) {
      // Audit denied command (Phase 19 — EventSourcing)
      try { getEventSourcing()?.logSecurity(userId, req.body.session?.id, 'run_command_denied', { command: String(req.body.command || '').slice(0, 200) }); } catch {}
      return;
    }
    // Audit permitted command execution (Phase 19)
    try { getEventSourcing()?.logAction(userId, req.body.session?.id, 'run_command', { command: String(req.body.command || '').slice(0, 200) }); } catch {}

    const result = await HarnessEngine.runCommand(req.body.session, req.body.command, {
      cwd: req.body.cwd,
      timeout: req.body.timeout,
    });
    res.json(result);
  } catch (e) {
    try { getEventSourcing()?.logError(userId, req.body.session?.id, 'run_command_error', { error: e.message }); } catch {}
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/checkpoint
 * Persist the current session.
 * body: { session }
 */
router.post('/checkpoint', async (req, res) => {
  try {
    const result = await HarnessEngine.checkpoint(req.body.session);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/resume
 * Resume a checkpointed session.
 * body: { sessionId }
 */
router.post('/resume', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    const session = await HarnessEngine.resume(req.body.sessionId, userId);
    res.json({ session, found: session !== null });
  } catch (e) {
    const status = e.message.includes('Access denied') ? 403 : 500;
    res.status(status).json({ error: e.message });
  }
});

/**
 * GET /api/harness/checkpoints
 * List checkpoints belonging to the authenticated user only.
 */
router.get('/checkpoints', (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    const list = HarnessEngine.Checkpoint.list(userId);
    res.json({ checkpoints: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/audit-trail
 * Query the EventSourcing audit trail for the authenticated user.
 * Query params: ?limit=100&type=action&since=<ISO>
 */
router.get('/audit-trail', (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    const es = getEventSourcing();
    if (!es) return res.json({ events: [] });
    const events = es.query({
      userId,
      type: req.query.type,
      severity: req.query.severity,
      since: req.query.since,
      limit: Math.min(parseInt(req.query.limit || '100', 10), 500),
    });
    res.json({ events, stats: es.getStats() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/long-horizon-plans
 * List long-horizon execution plans for the authenticated user.
 */
router.get('/long-horizon-plans', (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    const { getLongHorizonExecution } = require('~/server/services/Harness/cognitive/LongHorizonExecution');
    const lhe = getLongHorizonExecution();
    const plans = lhe.listPlans(userId);
    res.json({ plans, activePlan: plans.find((p) => p.status === 'active') || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/long-horizon-plans
 * Create a new long-horizon execution plan.
 * body: { goal, phases? }
 */
router.post('/long-horizon-plans', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    const { getLongHorizonExecution } = require('~/server/services/Harness/cognitive/LongHorizonExecution');
    const lhe = getLongHorizonExecution();
    const plan = lhe.createPlan({ goal: req.body.goal, userId, phases: req.body.phases || null });
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/decision-log
 * Query the DecisionLog for structured per-decision records (FASE 15).
 * Query params: ?limit=50&intent=code_task&riskMin=5&sessionId=<id>
 */
router.get('/decision-log', (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    const { getDecisionLog } = require('~/server/services/ExecutiveLoop/DecisionLog');
    const dl = getDecisionLog();
    const entries = dl.query({
      userId,
      intent: req.query.intent,
      sessionId: req.query.sessionId,
      riskMin: req.query.riskMin ? parseFloat(req.query.riskMin) : undefined,
      limit: Math.min(parseInt(req.query.limit || '50', 10), 200),
    });
    res.json({ entries, stats: dl.getStats() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/goal
 * Register a long-running goal.
 * body: { session, description }
 */
router.post('/goal', async (req, res) => {
  try {
    const goal = await HarnessEngine.registerGoal(req.body.session, req.body.description);
    res.json(goal);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/goals
 * List all goals.
 */
router.get('/goals', (req, res) => {
  try {
    const list = HarnessEngine.GoalWorkflow.list();
    res.json({ goals: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/worktree
 * Isolate a subagent in its own git worktree.
 * body: { session, subagent }
 */
router.post('/worktree', async (req, res) => {
  const userId = req.user?.id || req.user?._id?.toString();
  try {
    const allowed = await enforcePolicy(req, res, 'harness:worktree', { path: req.body.subagent?.path || '.' });
    if (!allowed) {
      try { getEventSourcing()?.logSecurity(userId, req.body.session?.id, 'worktree_denied', { subagent: req.body.subagent?.id }); } catch {}
      return;
    }
    const result = await HarnessEngine.isolateSubagent(req.body.session, req.body.subagent);
    try { getEventSourcing()?.logAction(userId, req.body.session?.id, 'worktree_created', { subagent: req.body.subagent?.id }); } catch {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/manager-status
 * Live status from the HarnessManager singleton — all subsystems.
 * f14-1: Wire HarnessManager to dashboard. f14-2: CognitiveEngine memory layers.
 */
router.get('/manager-status', (req, res) => {
  try {
    const harness = getHarnessManager();
    if (!harness) {
      return res.json({ available: false, message: 'HarnessManager not initialized' });
    }
    const status = harness.getFullStatus();
    res.json({ available: true, ...status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/status
 * Report whether the harness engine is enabled and what components are available.
 */
router.get('/status', (req, res) => {
  res.json({
    enabled: HarnessEngine.enabled(),
    sandbox: HarnessEngine.SandboxRunner.detectSandbox(),
    components: [
      'SystemPromptBuilder',
      'ToolRegistry',
      'SubagentRegistry',
      'InjectionPoints',
      'ReminderQueue',
      'CompactionManager',
      'ConversationState',
      'StopConditions',
      'ToolEnforcement',
      'SandboxRunner',
      'Checkpoint',
      'GoalWorkflow',
      'WorktreeIsolation',
      'KnowledgeAuditEngine',
      'DedupEngine',
      'FastCompressor',
      'WebToRAGPipeline',
      'IssueToPRAutomation',
      'ComputerUseBridge',
      'DiffApprovalService',
      'HeadlessSDK',
    ],
  });
});

// ---------------------------------------------------------------------------
// RAG enhancements: knowledge audit, dedup, compression, web-to-RAG
// ---------------------------------------------------------------------------

const KnowledgeAuditEngine = require('~/server/services/RAG/KnowledgeAuditEngine');
const DedupEngine = require('~/server/services/RAG/DedupEngine');
const FastCompressor = require('~/server/services/ContextIntelligence/FastCompressor');
const WebToRAGPipeline = require('~/server/services/RAG/WebToRAGPipeline');

/**
 * POST /api/harness/rag/audit
 * Audit what knowledge the system has vs. what's missing for a task.
 * body: { task, collections }
 */
router.post('/rag/audit', async (req, res) => {
  try {
    const result = await KnowledgeAuditEngine.audit(req.body.task, {
      collections: req.body.collections,
    });
    res.json({ ...result, report: KnowledgeAuditEngine.formatReport(result) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/rag/dedup-check
 * Check if a document would be a duplicate before indexing.
 * body: { content, collection, threshold }
 */
router.post('/rag/dedup-check', async (req, res) => {
  try {
    const result = await DedupEngine.shouldIndex(req.body.content, {
      collection: req.body.collection,
      threshold: req.body.threshold,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/rag/compress
 * Compress text content (fast, content-type aware).
 * body: { text, maxTokens, contentType }
 */
router.post('/rag/compress', async (req, res) => {
  try {
    const result = await FastCompressor.compress(req.body.text, {
      maxTokens: req.body.maxTokens,
      contentType: req.body.contentType,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/rag/compress-benchmark
 * Benchmark compression on a sample.
 * body: { text }
 */
router.post('/rag/compress-benchmark', async (req, res) => {
  try {
    const result = await FastCompressor.benchmark(req.body.text);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/rag/ingest-web
 * Search the web and ingest results into RAG.
 * body: { query, collection, maxResults, compress, dedup }
 */
router.post('/rag/ingest-web', async (req, res) => {
  const userId = req.user?.id || req.user?._id?.toString();
  try {
    const allowed = await enforcePolicy(req, res, 'harness:ingest-web', { query: req.body.query, url: req.body.url });
    if (!allowed) {
      try { getEventSourcing()?.logSecurity(userId, null, 'ingest_web_denied', { query: req.body.query }); } catch {}
      return;
    }
    const result = await WebToRAGPipeline.ingestFromWeb(req.body.query, {
      collection: req.body.collection,
      maxResults: req.body.maxResults,
      compress: req.body.compress,
      dedup: req.body.dedup,
    });
    try { getEventSourcing()?.logAction(userId, null, 'ingest_web', { query: req.body.query, results: result?.added }); } catch {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/rag/auto-ingest
 * Audit knowledge, auto-search the web for missing topics, ingest into RAG.
 * body: { task, minCoverage, maxTopics }
 */
router.post('/rag/auto-ingest', async (req, res) => {
  try {
    const result = await WebToRAGPipeline.autoIngestMissing(req.body.task, {
      minCoverage: req.body.minCoverage,
      maxTopics: req.body.maxTopics,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Parity features: diff approval, issue→PR, computer-use
// ---------------------------------------------------------------------------

const DiffApprovalService = require('~/server/services/AgentRuntime/DiffApprovalService');
const IssueToPRAutomation = require('~/server/services/AgentRuntime/IssueToPRAutomation');
const ComputerUseBridge = require('~/server/services/AgentRuntime/ComputerUseBridge');

/**
 * POST /api/harness/diff/propose
 * Propose a file change as a diff for approval.
 * body: { toolName, filePath, oldContent, newContent, description }
 */
router.post('/diff/propose', (req, res) => {
  try {
    const result = DiffApprovalService.propose(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/diff/:id/approve
 */
router.post('/diff/:id/approve', (req, res) => {
  try {
    const result = DiffApprovalService.approve(req.params.id, { decidedBy: req.body?.decidedBy });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/diff/:id/reject
 */
router.post('/diff/:id/reject', (req, res) => {
  try {
    const result = DiffApprovalService.reject(req.params.id, {
      decidedBy: req.body?.decidedBy,
      reason: req.body?.reason,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/diff/:id/apply
 * Apply an approved diff to the filesystem.
 */
router.post('/diff/:id/apply', async (req, res) => {
  const userId = req.user?.id || req.user?._id?.toString();
  try {
    const pending = DiffApprovalService.listPending().find(p => p.id === req.params.id);
    const allowed = await enforcePolicy(req, res, 'harness:apply-diff', { filePath: pending?.filePath || '' });
    if (!allowed) {
      try { getEventSourcing()?.logSecurity(userId, null, 'apply_diff_denied', { diffId: req.params.id }); } catch {}
      return;
    }
    const result = DiffApprovalService.apply(req.params.id);
    try { getEventSourcing()?.logAction(userId, null, 'apply_diff', { diffId: req.params.id, filePath: pending?.filePath }); } catch {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/diff/pending
 * List all pending diff proposals.
 */
router.get('/diff/pending', (req, res) => {
  try {
    res.json({ proposals: DiffApprovalService.listPending() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/issue-to-pr
 * Process a GitHub issue: branch, implement, push, open PR.
 * body: { issueRef, commitMessage, prTitle, prBody }
 */
router.post('/issue-to-pr', async (req, res) => {
  const userId = req.user?.id || req.user?._id?.toString();
  try {
    const allowed = await enforcePolicy(req, res, 'harness:issue-to-pr', { repo: req.body.issueRef?.repo || 'github.com' });
    if (!allowed) {
      try { getEventSourcing()?.logSecurity(userId, null, 'issue_to_pr_denied', { issueRef: req.body.issueRef }); } catch {}
      return;
    }
    const result = await IssueToPRAutomation.processIssue(req.body.issueRef, {
      commitMessage: req.body.commitMessage,
      prTitle: req.body.prTitle,
      prBody: req.body.prBody,
    });
    try { getEventSourcing()?.logAction(userId, null, 'issue_to_pr', { issueRef: req.body.issueRef }); } catch {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/computer-use/status
 * Check if computer-use (screen control) is available.
 */
router.get('/computer-use/status', (req, res) => {
  res.json({ available: ComputerUseBridge.available() });
});

/**
 * POST /api/harness/computer-use/screenshot
 */
router.post('/computer-use/screenshot', async (req, res) => {
  try {
    const result = await ComputerUseBridge.screenshot();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/computer-use/click
 * body: { x, y, button }
 */
router.post('/computer-use/click', async (req, res) => {
  try {
    const result = await ComputerUseBridge.click(req.body.x, req.body.y, req.body.button);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/harness/computer-use/type
 * body: { text }
 */
router.post('/computer-use/type', async (req, res) => {
  try {
    const result = await ComputerUseBridge.type(req.body.text);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Face 14: Harness SSE event stream + circuit breaker ──────────────────────

const _harnessSessionBus = new (require('events').EventEmitter)();
_harnessSessionBus.setMaxListeners(200);

// ── PolicyEngine: additional destructive-action definitions ─────────────────
// harness:run-command is in DESTRUCTIVE_ACTIONS above; these extend coverage.
const EXTENDED_DESTRUCTIVE = [
  'harness:apply-diff',    // writes files
  'harness:issue-to-pr',   // pushes code + opens PR
  'harness:worktree',      // creates git worktree (filesystem write)
  'harness:ingest-web',    // fetches external URLs, writes to RAG
];

// ── Tiny in-process circuit breaker keyed by sessionId ────────────────────
const _circuitBreakers = new Map(); // sessionId → { failures, openUntil }
const CB_THRESHOLD = 5;
const CB_OPEN_MS = 30_000;

function getCircuitBreaker(sessionId) {
  if (!_circuitBreakers.has(sessionId)) {
    _circuitBreakers.set(sessionId, { failures: 0, openUntil: 0 });
  }
  return _circuitBreakers.get(sessionId);
}

function circuitIsOpen(sessionId) {
  const cb = getCircuitBreaker(sessionId);
  return Date.now() < cb.openUntil;
}

function recordFailure(sessionId) {
  const cb = getCircuitBreaker(sessionId);
  cb.failures++;
  if (cb.failures >= CB_THRESHOLD) {
    cb.openUntil = Date.now() + CB_OPEN_MS;
    _harnessSessionBus.emit(`cb:open:${sessionId}`, { sessionId, openUntil: cb.openUntil });
  }
}

function recordSuccess(sessionId) {
  const cb = getCircuitBreaker(sessionId);
  cb.failures = 0;
  cb.openUntil = 0;
}

/**
 * GET /api/harness/sessions/:sessionId/events
 * SSE stream of events for a harness session.
 * The caller pushes events by POST /api/harness/sessions/:sessionId/emit
 * (or the server-side harness emits them internally).
 */
router.get('/sessions/:sessionId/events', (req, res) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch {}
  };

  // Forward circuit-breaker open events
  const cbHandler = (payload) => send({ type: 'circuit_breaker', ...payload });
  _harnessSessionBus.on(`cb:open:${sessionId}`, cbHandler);

  // Forward session events
  const evtHandler = (payload) => send(payload);
  _harnessSessionBus.on(`session:${sessionId}`, evtHandler);

  // Keepalive ping every 20 s
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20_000);

  req.on('close', () => {
    clearInterval(ping);
    _harnessSessionBus.off(`cb:open:${sessionId}`, cbHandler);
    _harnessSessionBus.off(`session:${sessionId}`, evtHandler);
  });
});

/**
 * POST /api/harness/sessions/:sessionId/emit
 * Push an event into the SSE stream for a session (for testing / server-push).
 * body: { type, payload }
 */
router.post('/sessions/:sessionId/emit', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type = 'event', payload } = req.body || {};
    _harnessSessionBus.emit(`session:${sessionId}`, { type, payload, ts: Date.now() });
    res.json({ emitted: true, sessionId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/harness/sessions/:sessionId/circuit-breaker
 * Get the circuit breaker state for a session.
 */
router.get('/sessions/:sessionId/circuit-breaker', (req, res) => {
  const cb = getCircuitBreaker(req.params.sessionId);
  res.json({
    sessionId: req.params.sessionId,
    failures: cb.failures,
    open: circuitIsOpen(req.params.sessionId),
    openUntil: cb.openUntil || null,
    threshold: CB_THRESHOLD,
  });
});

/**
 * POST /api/harness/sessions/:sessionId/circuit-breaker/reset
 * Manually reset the circuit breaker for a session.
 */
router.post('/sessions/:sessionId/circuit-breaker/reset', requireJwtAuth, (req, res) => {
  recordSuccess(req.params.sessionId);
  _circuitBreakers.delete(req.params.sessionId);
  res.json({ reset: true, sessionId: req.params.sessionId });
});

/**
 * POST /api/harness/tools/invoke
 * Live tool invocation via DSHToolAdapter — proves tools are not just registered but executable.
 * body: { tool: "read_file", args: { path: "package.json" } }
 * Returns the tool result directly.
 *
 * Demo: curl -X POST http://localhost:3080/api/harness/tools/invoke \
 *   -H "Authorization: Bearer <token>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"tool":"read_file","args":{"path":"package.json"}}'
 */
router.post('/tools/invoke', requireJwtAuth, async (req, res) => {
  const { tool, args } = req.body || {};
  if (!tool || typeof tool !== 'string') {
    return res.status(400).json({ error: 'tool name required (string)' });
  }
  const hm = getHarnessManager();
  if (!hm || !hm.toolAdapter) {
    return res.status(503).json({ error: 'HarnessManager not initialized — set HARNESS_ENGINE_ENABLED=true in .env' });
  }
  const userId = req.user?.id || req.user?._id?.toString() || 'anonymous';
  try {
    const result = await hm.toolAdapter.execute(tool, args || {}, { userId });
    return res.json({ tool, args, result, invokedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ tool, error: e.message });
  }
});

/**
 * GET /api/harness/tools/list
 * Returns all registered tool IDs — proves tools are registered.
 */
router.get('/tools/list', requireJwtAuth, (req, res) => {
  const hm = getHarnessManager();
  if (!hm || !hm.toolAdapter) {
    return res.status(503).json({ error: 'HarnessManager not initialized — set HARNESS_ENGINE_ENABLED=true in .env' });
  }
  const tools = hm.toolAdapter.getToolIds?.() || [];
  return res.json({ count: tools.length, tools });
});

module.exports = router;
