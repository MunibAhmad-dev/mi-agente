'use strict';

/**
 * universalAgentBatchB — Gen B Safety & Autonomy Routes
 * Mounted at: /api/agent/safety
 */

const express = require('express');
const router = express.Router();

const { getReversibleExecution } = require('../services/CognitiveBehavior/ReversibleExecution');
const { getRiskAwareAutonomy } = require('../services/CognitiveBehavior/RiskAwareAutonomy');
const { getUserCorrectionLearning } = require('../services/CognitiveBehavior/UserCorrectionLearning');
const { getBehaviorBenchmark } = require('../services/CognitiveBehavior/BehaviorBenchmark');
const { getRegressionBenchmark } = require('../services/CognitiveBehavior/RegressionBenchmark');
const { getScopeGuardian } = require('../services/CognitiveBehavior/ScopeGuardian');
const { getHandoffProtocol } = require('../services/CognitiveBehavior/HandoffProtocol');
const { getResponseControlSystem } = require('../services/CognitiveBehavior/ResponseControlSystem');
const { getAuditTrailWriter } = require('../services/CognitiveBehavior/AuditTrailWriter');

// ─── ReversibleExecution ─────────────────────────────────────────────────────

router.post('/reversible/register', (req, res) => {
  try {
    const { actionId, action, context } = req.body || {};
    // undoFn cannot be serialised over HTTP — caller can supply an undoType hint
    // We register without a real undoFn (server-side callers use the module directly)
    const result = getReversibleExecution().register(actionId, action, null, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reversible/:actionId/undo', async (req, res) => {
  try {
    const { actionId } = req.params;
    const result = await getReversibleExecution().undo(actionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reversible/history', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const result = getReversibleExecution().getHistory(limit);
    res.json({ history: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reversible/pending', (req, res) => {
  try {
    const result = getReversibleExecution().getPendingUndo();
    res.json({ pending: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RiskAwareAutonomy ────────────────────────────────────────────────────────

router.post('/autonomy/assess', (req, res) => {
  try {
    const { task, context } = req.body || {};
    const result = getRiskAwareAutonomy().assessAndAdjust(task, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/autonomy/base-level', (req, res) => {
  try {
    const { level } = req.body || {};
    const result = getRiskAwareAutonomy().setBaseLevel(level);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/autonomy/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = getRiskAwareAutonomy().getLevel(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UserCorrectionLearning ───────────────────────────────────────────────────

router.post('/correction', (req, res) => {
  try {
    const { sessionId, originalResponse, correction, context } = req.body || {};
    const result = getUserCorrectionLearning().recordCorrection(sessionId, originalResponse, correction, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/correction/:sessionId/patterns', (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = getUserCorrectionLearning().getPatterns(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/correction/:sessionId/apply', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { response } = req.body || {};
    const result = getUserCorrectionLearning().applyLearning(sessionId, response);
    res.json({ amended: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/correction/:sessionId/export', (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = getUserCorrectionLearning().exportLearning(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BehaviorBenchmark ────────────────────────────────────────────────────────

router.post('/benchmark/run', (req, res) => {
  try {
    const { benchmarkId, response, context } = req.body || {};
    const result = getBehaviorBenchmark().run(benchmarkId, response, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/benchmark/builtin', (req, res) => {
  try {
    const result = getBehaviorBenchmark().getBuiltinBenchmarks();
    res.json({ benchmarks: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/benchmark/define', (req, res) => {
  try {
    const { benchmarkId, criteria } = req.body || {};
    const result = getBehaviorBenchmark().define(benchmarkId, criteria);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/benchmark/compare', (req, res) => {
  try {
    const { benchmarkId, score1, score2 } = req.body || {};
    const result = getBehaviorBenchmark().compare(benchmarkId, score1, score2);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RegressionBenchmark ──────────────────────────────────────────────────────

router.post('/regression/record', (req, res) => {
  try {
    const { sessionId, metric, value } = req.body || {};
    const result = getRegressionBenchmark().record(sessionId, metric, value);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/regression/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = getRegressionBenchmark().getReport(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/regression/detect', (req, res) => {
  try {
    const { sessionId, metric, windowSize } = req.body || {};
    const result = getRegressionBenchmark().detectRegression(sessionId, metric, windowSize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ScopeGuardian ────────────────────────────────────────────────────────────

router.post('/scope/define', (req, res) => {
  try {
    const { taskId, objective, constraints } = req.body || {};
    const result = getScopeGuardian().defineScope(taskId, objective, constraints);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scope/:taskId/check', (req, res) => {
  try {
    const { taskId } = req.params;
    const { proposedAction } = req.body || {};
    const result = getScopeGuardian().checkInScope(taskId, proposedAction);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scope/:taskId/monitor', (req, res) => {
  try {
    const { taskId } = req.params;
    const { progressUpdate } = req.body || {};
    const result = getScopeGuardian().monitor(taskId, progressUpdate);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HandoffProtocol ──────────────────────────────────────────────────────────

router.post('/handoff/initiate', (req, res) => {
  try {
    const { fromSession, toSession, context, reason } = req.body || {};
    const result = getHandoffProtocol().initiate(fromSession, toSession, context, reason);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/handoff/:handoffId/complete', (req, res) => {
  try {
    const { handoffId } = req.params;
    const { receivingAgent } = req.body || {};
    const result = getHandoffProtocol().complete(handoffId, receivingAgent);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/handoff/:handoffId', (req, res) => {
  try {
    const { handoffId } = req.params;
    const result = getHandoffProtocol().getState(handoffId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/handoff', (req, res) => {
  try {
    const result = getHandoffProtocol().listPending();
    res.json({ pending: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ResponseControlSystem ────────────────────────────────────────────────────

router.post('/control/params', (req, res) => {
  try {
    const { sessionId, context } = req.body || {};
    const result = getResponseControlSystem().getParams(sessionId, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/control/:sessionId/profile', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { profile } = req.body || {};
    const result = getResponseControlSystem().setProfile(sessionId, profile);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/control/:sessionId/adapt', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { feedback } = req.body || {};
    const result = getResponseControlSystem().adapt(sessionId, feedback);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/control/profiles', (req, res) => {
  try {
    const result = getResponseControlSystem().getProfiles();
    res.json({ profiles: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AuditTrailWriter ─────────────────────────────────────────────────────────

router.post('/audit/log', (req, res) => {
  try {
    const event = req.body || {};
    const result = getAuditTrailWriter().log(event);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/audit/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const filters = {
      type: req.query.type,
      userId: req.query.userId,
      since: req.query.since,
      until: req.query.until,
      limit: req.query.limit,
    };
    const result = getAuditTrailWriter().getTrail(sessionId, filters);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/audit/:sessionId/export', (req, res) => {
  try {
    const { sessionId } = req.params;
    const format = req.query.format || 'json';
    const result = getAuditTrailWriter().export(sessionId, format);
    if (format === 'text') {
      res.type('text/plain').send(result);
    } else {
      res.type('application/json').send(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Status / Health ──────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  try {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      components: {
        reversibleExecution: getReversibleExecution().getStats(),
        riskAwareAutonomy: getRiskAwareAutonomy().getStats(),
        userCorrectionLearning: getUserCorrectionLearning().getStats(),
        behaviorBenchmark: getBehaviorBenchmark().getStats(),
        regressionBenchmark: getRegressionBenchmark().getStats(),
        scopeGuardian: getScopeGuardian().getStats(),
        handoffProtocol: getHandoffProtocol().getStats(),
        responseControlSystem: getResponseControlSystem().getStats(),
        auditTrailWriter: getAuditTrailWriter().getStats(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
