'use strict';

/**
 * universalAgentBatchA.js — REST API for Gen B reasoning-quality phases.
 * Mounted at /api/agent/reasoning
 *
 * Endpoints:
 *   POST /contradiction              — ContradictionDetector.detect(text)
 *   POST /knowledge-gaps             — KnowledgeGapDetector.detect(text)
 *   POST /self-audit                 — SelfAudit.audit(response, prompt, contract)
 *   POST /self-reflect               — SelfReflection.reflect + store for session
 *   POST /self-reflect/session/:id   — SelfReflection.getSessionInsights
 *   POST /counterfactual             — CounterfactualChecker.check(decision, context)
 *   POST /calibrate                  — ConfidenceCalibration.calibrate(stated, actual)
 *   GET  /calibration                — ConfidenceCalibration.getCalibration()
 *   POST /uncertainty                — UncertaintyQuantifier.quantify(text)
 *   POST /fact-check                 — FactChecker.check(claim)
 *   POST /fact-check/all             — FactChecker.checkAll(text)
 *   GET  /status                     — stats from all 8 components (no auth)
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

// ─── Lazy loaders ─────────────────────────────────────────────────────────────

function getContradiction() {
  return require('~/server/services/CognitiveBehavior/ContradictionDetector').getContradictionDetector();
}
function getKnowledgeGap() {
  return require('~/server/services/CognitiveBehavior/KnowledgeGapDetector').getKnowledgeGapDetector();
}
function getSelfAuditSvc() {
  return require('~/server/services/CognitiveBehavior/SelfAudit').getSelfAudit();
}
function getSelfReflectionSvc() {
  return require('~/server/services/CognitiveBehavior/SelfReflection').getSelfReflection();
}
function getCounterfactual() {
  return require('~/server/services/CognitiveBehavior/CounterfactualChecker').getCounterfactualChecker();
}
function getCalibration() {
  return require('~/server/services/CognitiveBehavior/ConfidenceCalibration').getConfidenceCalibration();
}
function getUncertainty() {
  return require('~/server/services/CognitiveBehavior/UncertaintyQuantifier').getUncertaintyQuantifier();
}
function getFactCheckerSvc() {
  return require('~/server/services/CognitiveBehavior/FactChecker').getFactChecker();
}

// ─── Status (no auth) ────────────────────────────────────────────────────────

/**
 * GET /status
 * Returns stats from all 8 components — no authentication required.
 */
router.get('/status', (req, res) => {
  try {
    const stats = {
      contradictionDetector: getContradiction().getStats(),
      knowledgeGapDetector: getKnowledgeGap().getStats(),
      selfAudit: getSelfAuditSvc().getStats(),
      selfReflection: getSelfReflectionSvc().getStats(),
      counterfactualChecker: getCounterfactual().getStats(),
      confidenceCalibration: getCalibration().getStats(),
      uncertaintyQuantifier: getUncertainty().getStats(),
      factChecker: getFactCheckerSvc().getStats(),
    };
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── ContradictionDetector ────────────────────────────────────────────────────

/**
 * POST /contradiction
 * Body: { text: string }
 * Returns: { hasContradictions, contradictions, score }
 */
router.post('/contradiction', requireJwtAuth, (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text (string) is required' });
    }
    const result = getContradiction().detect(text);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── KnowledgeGapDetector ─────────────────────────────────────────────────────

/**
 * POST /knowledge-gaps
 * Body: { text: string }
 * Returns: { gaps, overallConfidence }
 */
router.post('/knowledge-gaps', requireJwtAuth, (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text (string) is required' });
    }
    const result = getKnowledgeGap().detect(text);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── SelfAudit ────────────────────────────────────────────────────────────────

/**
 * POST /self-audit
 * Body: { response: string, prompt?: string, contract?: object }
 * Returns: { passed, issues, score }
 */
router.post('/self-audit', requireJwtAuth, (req, res) => {
  try {
    const { response, prompt, contract } = req.body || {};
    if (!response || typeof response !== 'string') {
      return res.status(400).json({ ok: false, error: 'response (string) is required' });
    }
    const result = getSelfAuditSvc().audit(response, prompt || '', contract || null);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── SelfReflection ────────────────────────────────────────────────────────────

/**
 * POST /self-reflect
 * Body: { prompt: string, response: string, quality?: number, sessionId?: string }
 * Returns: { insights, improvements, rating }
 */
router.post('/self-reflect', requireJwtAuth, (req, res) => {
  try {
    const { prompt, response, quality, sessionId } = req.body || {};
    if (!response || typeof response !== 'string') {
      return res.status(400).json({ ok: false, error: 'response (string) is required' });
    }
    const svc = getSelfReflectionSvc();
    let result;
    if (sessionId) {
      result = svc.reflectAndStore(sessionId, prompt || '', response, quality != null ? quality : null);
    } else {
      result = svc.reflect(prompt || '', response, quality != null ? quality : null);
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /self-reflect/session/:sessionId
 * No body required.
 * Returns: insights array for the session
 */
router.post('/self-reflect/session/:sessionId', requireJwtAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'sessionId param is required' });
    }
    const insights = getSelfReflectionSvc().getSessionInsights(sessionId);
    res.json({ ok: true, sessionId, insights });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── CounterfactualChecker ────────────────────────────────────────────────────

/**
 * POST /counterfactual
 * Body: { decision: string, context?: string }
 * Returns: { counterfactuals, riskScore }
 */
router.post('/counterfactual', requireJwtAuth, (req, res) => {
  try {
    const { decision, context } = req.body || {};
    if (!decision || typeof decision !== 'string') {
      return res.status(400).json({ ok: false, error: 'decision (string) is required' });
    }
    const result = getCounterfactual().check(decision, context || '');
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── ConfidenceCalibration ────────────────────────────────────────────────────

/**
 * POST /calibrate
 * Body: { statedConfidence: number, actualOutcome: number }
 * Returns: { recorded, sampleCount }
 */
router.post('/calibrate', requireJwtAuth, (req, res) => {
  try {
    const { statedConfidence, actualOutcome } = req.body || {};
    if (statedConfidence == null || actualOutcome == null) {
      return res.status(400).json({ ok: false, error: 'statedConfidence and actualOutcome are required' });
    }
    const result = getCalibration().calibrate(statedConfidence, actualOutcome);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /calibration
 * Returns: { bias, calibrationError, reliability, sampleCount }
 */
router.get('/calibration', requireJwtAuth, (req, res) => {
  try {
    const result = getCalibration().getCalibration();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── UncertaintyQuantifier ────────────────────────────────────────────────────

/**
 * POST /uncertainty
 * Body: { text: string }
 * Returns: { uncertaintyLevel, score, signals, recommendation }
 */
router.post('/uncertainty', requireJwtAuth, (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text (string) is required' });
    }
    const result = getUncertainty().quantify(text);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── FactChecker ──────────────────────────────────────────────────────────────

/**
 * POST /fact-check
 * Body: { claim: string }
 * Returns: { verified, matchedFact, confidence, verdict }
 */
router.post('/fact-check', requireJwtAuth, (req, res) => {
  try {
    const { claim } = req.body || {};
    if (!claim || typeof claim !== 'string') {
      return res.status(400).json({ ok: false, error: 'claim (string) is required' });
    }
    const result = getFactCheckerSvc().check(claim);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /fact-check/all
 * Body: { text: string }
 * Returns: { results, overallTrustScore }
 */
router.post('/fact-check/all', requireJwtAuth, (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text (string) is required' });
    }
    const result = getFactCheckerSvc().checkAll(text);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
