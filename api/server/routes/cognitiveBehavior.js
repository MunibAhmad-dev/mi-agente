'use strict';

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

let _cb = null;
function getCB() {
  if (!_cb) _cb = require('~/server/services/CognitiveBehavior');
  return _cb;
}

let _gate = null;
function getLearningGate() {
  if (!_gate) {
    try { _gate = require('~/server/services/Learning/LearningEvaluationGate').getLearningEvaluationGate(); } catch { _gate = null; }
  }
  return _gate;
}

let _promptIR = null;
function getPromptIR() {
  if (!_promptIR) {
    try { _promptIR = require('~/server/services/CognitiveBehavior/PromptIR').getPromptIR(); } catch { _promptIR = null; }
  }
  return _promptIR;
}

let _responseQualityGate = null;
function getResponseQualityGate() {
  if (!_responseQualityGate) {
    try { _responseQualityGate = require('~/server/services/CognitiveBehavior/ResponseQualityGate').getResponseQualityGate(); } catch { _responseQualityGate = null; }
  }
  return _responseQualityGate;
}

// GET /api/cognitive/health
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'CognitiveBehavior' }));

// POST /api/cognitive/understand — parse a question into a structured profile
router.post('/understand', requireJwtAuth, (req, res) => {
  try {
    const { text } = req.body;
    const { QuestionUnderstanding } = getCB();
    const profile = QuestionUnderstanding.understand(text || '');
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cognitive/contract — build an answer contract from a question profile
router.post('/contract', requireJwtAuth, (req, res) => {
  try {
    const { text, opts } = req.body;
    const { QuestionUnderstanding, AnswerContract } = getCB();
    const profile = QuestionUnderstanding.understand(text || '');
    const contract = AnswerContract.buildContract(profile, opts || {});
    res.json(contract);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cognitive/contract/score — score a response against a contract
router.post('/contract/score', requireJwtAuth, (req, res) => {
  try {
    const { response, contract } = req.body;
    const { AnswerContract } = getCB();
    const result = AnswerContract.scoreAlignment(response || '', contract || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cognitive/personalities — list personalities
router.get('/personalities', requireJwtAuth, (req, res) => {
  const { PersonalityLayer } = getCB();
  res.json(PersonalityLayer.listPersonalities());
});

// POST /api/cognitive/personalities — register custom personality
router.post('/personalities', requireJwtAuth, (req, res) => {
  try {
    const { PersonalityLayer } = getCB();
    res.json(PersonalityLayer.registerPersonality(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/cognitive/behaviors — list behavior packs
router.get('/behaviors', requireJwtAuth, (req, res) => {
  const { BehaviorRegistry } = getCB();
  res.json(BehaviorRegistry.list());
});

// POST /api/cognitive/behaviors/:id/activate — activate a behavior pack
router.post('/behaviors/:id/activate', requireJwtAuth, (req, res) => {
  try {
    const { BehaviorRegistry } = getCB();
    res.json(BehaviorRegistry.activate(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/cognitive/behaviors/:id/deactivate
router.post('/behaviors/:id/deactivate', requireJwtAuth, (req, res) => {
  try {
    const { BehaviorRegistry } = getCB();
    res.json(BehaviorRegistry.deactivate(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/cognitive/modes — list mode prompts
router.get('/modes', requireJwtAuth, (req, res) => {
  const { ModePrompts } = getCB();
  res.json(ModePrompts.listModes());
});

// GET /api/cognitive/modes/:id/prompt — get system prompt for a mode
router.get('/modes/:id/prompt', requireJwtAuth, (req, res) => {
  const { ModePrompts } = getCB();
  const prompt = ModePrompts.getSystemPrompt(req.params.id);
  res.json({ mode: req.params.id, system_prompt: prompt });
});

// GET /api/cognitive/verbosity/:sessionId — get current verbosity level
router.get('/verbosity/:sessionId', requireJwtAuth, (req, res) => {
  const { AdaptiveVerbosity } = getCB();
  res.json(AdaptiveVerbosity.getAdaptiveVerbosity().getStats(req.params.sessionId));
});

// POST /api/cognitive/verbosity/:sessionId — set verbosity level
router.post('/verbosity/:sessionId', requireJwtAuth, (req, res) => {
  try {
    const { AdaptiveVerbosity } = getCB();
    res.json(AdaptiveVerbosity.getAdaptiveVerbosity().setLevel(req.params.sessionId, req.body.level));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/cognitive/cache/stats — semantic cache stats
router.get('/cache/stats', requireJwtAuth, (req, res) => {
  const { SemanticCache } = getCB();
  res.json(SemanticCache.getSemanticCache().getStats());
});

// DELETE /api/cognitive/cache — clear semantic cache
router.delete('/cache', requireJwtAuth, (req, res) => {
  const { SemanticCache } = getCB();
  res.json(SemanticCache.getSemanticCache().clear());
});

// ── Face 16 + 17: Full pipeline scoring — prompt → contract → alignment score → learning gate ──
// POST /api/cognitive/score-pipeline
// Body: { prompt, response, model_id, baseline_score? }
// Returns: { profile, contract, alignment, gate_result }
router.post('/score-pipeline', requireJwtAuth, (req, res) => {
  try {
    const { prompt, response, model_id = 'unknown', baseline_score = 0.5 } = req.body;
    if (!prompt || !response) return res.status(400).json({ error: 'prompt and response are required' });

    const { QuestionUnderstanding, AnswerContract } = getCB();
    const profile = QuestionUnderstanding.understand(prompt);
    const contract = AnswerContract.buildContract(profile);
    const alignment = AnswerContract.scoreAlignment(response, contract);

    // F16: feed into learning gate as a quality gate comparison
    const gate = getLearningGate();
    let gate_result = null;
    if (gate) {
      gate_result = gate.gate({
        model_id,
        baseline_score,
        new_score: alignment.score / 100,
        metric: 'alignment',
      });
    }

    res.json({ profile, contract, alignment, gate_result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Face 17: PromptIR endpoints ───────────────────────────────────────────────

// POST /api/cognitive/prompt-ir/improve — improve/refine a raw prompt
router.post('/prompt-ir/improve', requireJwtAuth, (req, res) => {
  try {
    const { text, context } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const pir = getPromptIR();
    if (!pir) return res.status(503).json({ error: 'PromptIR not available' });
    res.json(pir.improve(text, context || {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cognitive/prompt-ir/score — score a prompt's clarity
router.post('/prompt-ir/score', requireJwtAuth, (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const pir = getPromptIR();
    if (!pir) return res.status(503).json({ error: 'PromptIR not available' });
    res.json({ score: pir.score(text), isClear: pir.isClear(text) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Face 17: ResponseQualityGate endpoints ────────────────────────────────────

// POST /api/cognitive/quality-gate/gate — score a response against a contract
router.post('/quality-gate/gate', requireJwtAuth, (req, res) => {
  try {
    const { response, contract, verbosityLevel, prompt } = req.body;
    if (!response) return res.status(400).json({ error: 'response is required' });
    const rqg = getResponseQualityGate();
    if (!rqg) return res.status(503).json({ error: 'ResponseQualityGate not available' });
    res.json(rqg.gate(response, contract || {}, { verbosityLevel, prompt }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/cognitive/quality-gate/stats — ResponseQualityGate scoring statistics
router.get('/quality-gate/stats', requireJwtAuth, (req, res) => {
  try {
    const rqg = getResponseQualityGate();
    if (!rqg) return res.status(503).json({ error: 'ResponseQualityGate not available' });
    res.json(rqg.getStats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/cognitive/learning/history — learning gate evaluation history
router.get('/learning/history', requireJwtAuth, (req, res) => {
  try {
    const gate = getLearningGate();
    if (!gate) return res.json({ evaluations: [], stats: null });
    const limit = parseInt(req.query.limit) || 50;
    res.json({ evaluations: gate.getHistory(null, limit), stats: gate.getStats() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cognitive/learning/evaluate — full before/after evaluation
router.post('/learning/evaluate', requireJwtAuth, (req, res) => {
  try {
    const { model_id, before, after, metadata } = req.body;
    if (!model_id || !before || !after) return res.status(400).json({ error: 'model_id, before, and after are required' });
    const gate = getLearningGate();
    if (!gate) return res.status(503).json({ error: 'Learning gate unavailable' });
    res.json(gate.evaluate({ model_id, before, after, metadata: metadata || {} }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Face 16: Self-Improvement Loop + FeedbackAdapter ─────────────────────────

let _feedbackAdapter = null;
function getFeedbackAdapterSvc() {
  if (!_feedbackAdapter) {
    try { _feedbackAdapter = require('~/server/services/Learning/FeedbackAdapter').getFeedbackAdapter(); } catch { _feedbackAdapter = null; }
  }
  return _feedbackAdapter;
}

let _selfImprovementLoop = null;
function getSelfImprovementLoopSvc() {
  if (!_selfImprovementLoop) {
    try { _selfImprovementLoop = require('~/server/services/Learning/SelfImprovementLoop').getSelfImprovementLoop(); } catch { _selfImprovementLoop = null; }
  }
  return _selfImprovementLoop;
}

// GET /api/cognitive/behavior/self-improvement/status
router.get('/behavior/self-improvement/status', requireJwtAuth, (req, res) => {
  try {
    const loop = getSelfImprovementLoopSvc();
    if (!loop) return res.status(503).json({ error: 'SelfImprovementLoop not available' });
    res.json(loop.getStatus());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cognitive/behavior/self-improvement/run — trigger one cycle immediately
router.post('/behavior/self-improvement/run', requireJwtAuth, (req, res) => {
  try {
    const loop = getSelfImprovementLoopSvc();
    if (!loop) return res.status(503).json({ error: 'SelfImprovementLoop not available' });
    const result = loop.runOnce();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/cognitive/behavior/feedback/stats — FeedbackAdapter statistics
router.get('/behavior/feedback/stats', requireJwtAuth, (req, res) => {
  try {
    const adapter = getFeedbackAdapterSvc();
    if (!adapter) return res.status(503).json({ error: 'FeedbackAdapter not available' });
    res.json(adapter.getStats());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
