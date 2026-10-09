/**
 * Executive Loop API — Face 8
 * Mounted at /api/executive-loop
 *
 * POST /api/executive-loop/run       — start the loop for a message
 * GET  /api/executive-loop/stream/:id — SSE stream of loop events
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const { run, subscribe, loadSession } = require('~/server/services/ExecutiveLoop/ExecutiveLoop');
const { classifyAsync } = require('~/server/services/ExecutiveLoop/IntentClassifier');

let _loopLLMRouter = null;
function getLoopLLMRouter() {
  if (!_loopLLMRouter) {
    try {
      const { UniversalLLMRouter } = require('~/server/services/Harness/cognitive/llm/UniversalLLMRouter');
      _loopLLMRouter = new UniversalLLMRouter({});
    } catch {
      _loopLLMRouter = null;
    }
  }
  return _loopLLMRouter;
}

router.use(requireJwtAuth);

/**
 * POST /api/executive-loop/run
 * body: { message: string }
 * Returns: { sessionId } — use to open the SSE stream
 */
router.post('/run', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const sessionId = crypto.randomUUID();

  // Start the loop async — don't await, client subscribes via SSE
  run(sessionId, message, req.user?.id).catch((err) => {
    console.error('[executive-loop] run error:', err.message);
  });

  res.json({ sessionId });
});

/**
 * GET /api/executive-loop/stream/:sessionId
 * Server-Sent Events stream — one event per loop phase.
 *
 * Each event: data: <JSON>\n\n
 * Event format: { phase, ...fields }
 */
router.get('/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const send = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {}
  };

  const unsubscribe = subscribe(sessionId, send);

  // Send keepalive every 15 s so the connection doesn't time out
  const keepalive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 15000);

  req.on('close', () => {
    clearInterval(keepalive);
    unsubscribe();
  });
});

/**
 * GET /api/executive-loop/history
 * List recent in-memory loop sessions — id, status (running/done), event count.
 * Useful for the UI to show past runs without storing to a database.
 */
router.get('/history', (req, res) => {
  const { sessions } = require('~/server/services/ExecutiveLoop/ExecutiveLoop');
  const history = [];
  for (const [sessionId, session] of sessions.entries()) {
    const lastEvent = session.events[session.events.length - 1] ?? null;
    history.push({
      sessionId,
      status: session.done ? 'done' : 'running',
      eventCount: session.events.length,
      phase: lastEvent?.phase ?? null,
      quality: lastEvent?.quality ?? null,
    });
  }
  res.json({ sessions: history, total: history.length });
});

/**
 * POST /api/executive-loop/classify
 * Quick classify only — no SSE, returns intent synchronously.
 * body: { message: string }
 */
router.post('/classify', async (req, res) => {
  try {
    const { decide } = require('~/server/services/ExecutiveLoop/Director');
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const classification = await classifyAsync(message, getLoopLLMRouter());
    const direction = decide(classification, message);
    res.json({ classification, direction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/executive-loop/session/:sessionId
 * Load a persisted session snapshot from MongoDB (restart recovery).
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const snapshot = await loadSession(req.params.sessionId);
    if (!snapshot) return res.status(404).json({ error: 'Session not found or not persisted' });
    res.json({ sessionId: req.params.sessionId, snapshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/executive-loop/chat
 * Chat-compatible endpoint: routes a message through the ExecutiveLoop and
 * returns the final result (synchronous, no SSE). Suitable for wiring in
 * places where the LibreChat chat pipeline is not available.
 *
 * body: { message: string, userId?: string }
 * response: { sessionId, intent, direction, steps, goal, quality }
 */
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }
  const sessionId = `chat_${crypto.randomUUID()}`;
  try {
    const result = await run(sessionId, message, req.user?.id);
    const avgQuality = result.steps
      ? result.steps.reduce((s, st) => s + (st.quality || 0), 0) / (result.steps.length || 1)
      : 0;
    res.json({ sessionId, ...result, quality: +avgQuality.toFixed(2) });
  } catch (err) {
    res.status(500).json({ error: err.message, sessionId });
  }
});

/** GET /api/executive-loop/decisions — decision ledger records */
router.get('/decisions', (req, res) => {
  try {
    const { getDecisionLedger } = require('~/server/services/ExecutiveLoop/DecisionLedger');
    const dl = getDecisionLedger();
    const { userId, sessionId, intent, riskLevel, limit } = req.query;
    res.json(dl.getRecords({ userId, sessionId, intent, riskLevel, limit: limit ? parseInt(limit) : 50 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/executive-loop/decisions/stats — aggregate stats */
router.get('/decisions/stats', (req, res) => {
  try {
    const { getDecisionLedger } = require('~/server/services/ExecutiveLoop/DecisionLedger');
    const dl = getDecisionLedger();
    res.json(dl.getStats(req.query.userId || null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/executive-loop/judge — multi-model judge for a proposed action */
router.post('/judge', async (req, res) => {
  const { action, intent, riskLevel, context, models } = req.body;
  if (!action) return res.status(400).json({ error: 'action is required' });
  try {
    const { getMultiModelJudge } = require('~/server/services/ExecutiveLoop/MultiModelJudge');
    const judge = getMultiModelJudge();
    const result = await judge.judge({ action, intent, riskLevel, context, models });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/executive-loop/judge/history — judgement history */
router.get('/judge/history', (req, res) => {
  try {
    const { getMultiModelJudge } = require('~/server/services/ExecutiveLoop/MultiModelJudge');
    const judge = getMultiModelJudge();
    res.json(judge.getHistory(parseInt(req.query.limit) || 20));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/executive-loop/council — AI council deliberation */
router.post('/council', async (req, res) => {
  const { question, options, context, mode, minConsensus } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });
  try {
    const { getAICouncil } = require('~/server/services/Research/AICouncil');
    const council = getAICouncil();
    const result = await council.convene({ question, options, context, mode, minConsensus });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
