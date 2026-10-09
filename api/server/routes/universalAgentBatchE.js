'use strict';

/**
 * universalAgentBatchE — Gen B Phases 35, 44, 46
 * Mounted at: /api/agent/advanced
 *
 * Endpoints:
 *   POST /mea/evaluate               — MinimumEffectiveAction.evaluate(action, goal, opts)
 *   POST /mea/choose                 — MinimumEffectiveAction.choose(actions[], goal)
 *   POST /mea/check                  — MinimumEffectiveAction.shouldBlock(action)
 *   POST /mea/suggest                — MinimumEffectiveAction.suggestAlternative(action)
 *
 *   POST /mat/run                    — ModelAgnosticTesting.runSuite(suiteId, response, ctx)
 *   POST /mat/run-inline             — ModelAgnosticTesting.runInline(response, tests, ctx)
 *   POST /mat/compare                — ModelAgnosticTesting.compare(suiteId, responses[])
 *   POST /mat/suite                  — ModelAgnosticTesting.defineSuite(suiteId, tests, meta)
 *   POST /mat/matcher                — ModelAgnosticTesting.registerMatcher(name, fn-src)
 *   GET  /mat/suites                 — list builtin suites
 *   GET  /mat/matchers               — ModelAgnosticTesting.listMatchers()
 *   GET  /mat/history                — ModelAgnosticTesting.getHistory()
 *
 *   POST /audit/run                  — FinalAuditLoop.runAudit(opts)
 *   GET  /audit/last                 — FinalAuditLoop.getLastAudit()
 *   GET  /audit/history              — FinalAuditLoop.getHistory(limit)
 *   GET  /audit/summary              — FinalAuditLoop.summarize()
 *   POST /audit/start                — FinalAuditLoop.start(intervalMs)
 *   POST /audit/stop                 — FinalAuditLoop.stop()
 *
 *   GET  /status                     — stats from all 3 components (no auth)
 */

const express = require('express');
const router  = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

// ── Lazy loaders ──────────────────────────────────────────────────────────────

function getMEA() {
  return require('~/server/services/CognitiveBehavior/MinimumEffectiveAction').getMinimumEffectiveAction();
}
function getMAT() {
  return require('~/server/services/CognitiveBehavior/ModelAgnosticTesting').getModelAgnosticTesting();
}
function getFAL() {
  return require('~/server/services/CognitiveBehavior/FinalAuditLoop').getFinalAuditLoop();
}

// ── Minimum Effective Action ──────────────────────────────────────────────────

router.post('/mea/evaluate', requireJwtAuth, (req, res) => {
  try {
    const { action, goal, alternatives } = req.body;
    if (!action || !goal) return res.status(400).json({ error: 'action and goal required' });
    return res.json(getMEA().evaluate(action, goal, { alternatives: alternatives || [] }));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/mea/choose', requireJwtAuth, (req, res) => {
  try {
    const { actions, goal } = req.body;
    if (!Array.isArray(actions) || !goal) return res.status(400).json({ error: 'actions[] and goal required' });
    return res.json(getMEA().choose(actions, goal));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/mea/check', requireJwtAuth, (req, res) => {
  try {
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'action required' });
    return res.json(getMEA().shouldBlock(action));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/mea/suggest', requireJwtAuth, (req, res) => {
  try {
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'action required' });
    return res.json({ suggestion: getMEA().suggestAlternative(action) });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── Model-Agnostic Testing ────────────────────────────────────────────────────

router.post('/mat/run', requireJwtAuth, async (req, res) => {
  try {
    const { suiteId, response, context } = req.body;
    if (!suiteId || !response) return res.status(400).json({ error: 'suiteId and response required' });
    return res.json(getMAT().runSuite(suiteId, response, context || {}));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/mat/run-inline', requireJwtAuth, async (req, res) => {
  try {
    const { response, tests, context } = req.body;
    if (!response || !Array.isArray(tests)) return res.status(400).json({ error: 'response and tests[] required' });
    return res.json(getMAT().runInline(response, tests, context || {}));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/mat/compare', requireJwtAuth, async (req, res) => {
  try {
    const { suiteId, responses } = req.body;
    if (!suiteId || !Array.isArray(responses)) return res.status(400).json({ error: 'suiteId and responses[] required' });
    return res.json(getMAT().compare(suiteId, responses));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/mat/suite', requireJwtAuth, (req, res) => {
  try {
    const { suiteId, tests, meta } = req.body;
    if (!suiteId || !Array.isArray(tests)) return res.status(400).json({ error: 'suiteId and tests[] required' });
    return res.json(getMAT().defineSuite(suiteId, tests, meta || {}));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/mat/matcher', requireJwtAuth, (req, res) => {
  // Registering a custom matcher from source string is intentionally restricted:
  // only allow pre-declared named functions (no eval of arbitrary code).
  return res.status(403).json({ error: 'Custom matcher registration via API is disabled for security. Use registerMatcher() in server code.' });
});

router.get('/mat/suites', requireJwtAuth, (req, res) => {
  try {
    return res.json(getMAT().getBuiltinSuites());
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/mat/matchers', requireJwtAuth, (req, res) => {
  try {
    return res.json({ matchers: getMAT().listMatchers() });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/mat/history', requireJwtAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    return res.json(getMAT().getHistory(limit));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── Final Audit Loop ──────────────────────────────────────────────────────────

router.post('/audit/run', requireJwtAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const report = await getFAL().runAudit({ triggeredBy: 'manual', sessionId });
    return res.json(report);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/audit/last', requireJwtAuth, (req, res) => {
  try {
    const last = getFAL().getLastAudit();
    if (!last) return res.status(404).json({ error: 'No audit has been run yet' });
    return res.json(last);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/audit/history', requireJwtAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    return res.json(getFAL().getHistory(limit));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/audit/summary', requireJwtAuth, (req, res) => {
  try {
    return res.json({ summary: getFAL().summarize() });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/audit/start', requireJwtAuth, (req, res) => {
  try {
    const intervalMs = parseInt(req.body.intervalMs, 10) || 3_600_000;
    return res.json(getFAL().start(intervalMs));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/audit/stop', requireJwtAuth, (req, res) => {
  try {
    return res.json(getFAL().stop());
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── Status (no auth) ──────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  try {
    return res.json({
      minimumEffectiveAction: getMEA().getStats(),
      modelAgnosticTesting:   getMAT().getStats(),
      finalAuditLoop:         getFAL().getStats(),
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;
