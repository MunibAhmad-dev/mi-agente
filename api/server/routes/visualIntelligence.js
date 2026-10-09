'use strict';

/**
 * Visual Intelligence API — Face 9: Visual Intelligence & Visual Software Engineering.
 *
 *   GET  /api/visual-intelligence/status         → capability report
 *   POST /api/visual-intelligence/analyze-html   → DOM + accessibility + UI audit from HTML
 *   POST /api/visual-intelligence/audit-page     → full page audit (screenshot + analysis)
 *   POST /api/visual-intelligence/screenshot     → screenshot only
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

let _engine = null;
function getEngine() {
  if (!_engine) {
    try {
      const { VisualIntelligenceEngine } = require('~/server/services/Harness/VisualIntelligence/VisualIntelligenceEngine');
      _engine = new VisualIntelligenceEngine({});
    } catch (e) {
      _engine = {
        getStatus: () => ({ playwright: false, puppeteer: false, sharp: false, capabilities: { screenshot: false, domAnalysis: false, accessibility: false, uiEvaluation: false, visualRegression: false }, error: e.message }),
        analyzeDOM: () => ({ issues: [], stats: {}, score: 0, error: 'Engine unavailable' }),
        checkAccessibility: () => ({ passed: [], failed: [], score: 0, error: 'Engine unavailable' }),
        evaluateUI: () => ({ patterns: [], antiPatterns: [], score: 0, error: 'Engine unavailable' }),
        auditHTML: () => ({ dom: {}, accessibility: {}, ui: {}, overallScore: 0, error: 'Engine unavailable' }),
        takeScreenshot: async () => ({ success: false, error: 'Engine unavailable' }),
        auditPage: async () => ({ error: 'Engine unavailable' }),
      };
    }
  }
  return _engine;
}

/** GET /status */
router.get('/status', (req, res) => {
  res.json(getEngine().getStatus());
});

/** POST /analyze-html — analyze raw HTML (no browser needed) */
router.post('/analyze-html', (req, res) => {
  try {
    const { html } = req.body || {};
    if (!html) return res.status(400).json({ error: 'html field required' });
    const result = getEngine().auditHTML(html);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /audit-page — full page audit via browser automation */
router.post('/audit-page', async (req, res) => {
  try {
    const { url, screenshot = true, width, height, fullPage } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url field required' });
    const result = await getEngine().auditPage(url, { screenshot, width, height, fullPage });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /screenshot — take a screenshot only */
router.post('/screenshot', async (req, res) => {
  try {
    const { url, width, height, format, fullPage } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url field required' });
    const result = await getEngine().takeScreenshot(url, { width, height, format, fullPage });
    res.json({ ok: result.success, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ─── Face 9: Image-based Visual Intelligence services ────────────────────────

let _imageServices = null;
function getImageServices() {
  if (!_imageServices) {
    try {
      _imageServices = require('~/server/services/VisualIntelligence');
    } catch (e) {
      _imageServices = null;
    }
  }
  return _imageServices;
}

/** POST /api/visual-intelligence/image/bounding-boxes — extract bounding boxes */
router.post('/image/bounding-boxes', async (req, res) => {
  try {
    const svc = getImageServices();
    if (!svc) return res.status(503).json({ error: 'VisualIntelligence image services not available' });
    const { base64, mimeType, prompt, provider, url } = req.body;
    const fn = url ? svc.BoundingBoxExtractor.extractBoundingBoxesFromUrl : svc.BoundingBoxExtractor.extractBoundingBoxes;
    const result = await fn(url ? { url, prompt, provider } : { base64, mimeType, prompt, provider });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/visual-intelligence/image/qa — visual question answering */
router.post('/image/qa', async (req, res) => {
  try {
    const svc = getImageServices();
    if (!svc) return res.status(503).json({ error: 'VisualIntelligence image services not available' });
    const { base64, mimeType, question, provider, url } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });
    const result = url ? await svc.VisualQAAgent.askUrl({ url, question, provider }) : await svc.VisualQAAgent.ask({ base64, mimeType, question, provider });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/visual-intelligence/regression/baselines — list baselines */
router.get('/regression/baselines', (req, res) => {
  const svc = getImageServices();
  if (!svc) return res.status(503).json({ error: 'Services not available' });
  res.json(svc.VisualRegression.getVisualRegression().listBaselines());
});

/** POST /api/visual-intelligence/regression/baseline/:key — set baseline */
router.post('/regression/baseline/:key', (req, res) => {
  try {
    const svc = getImageServices();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    const result = svc.VisualRegression.getVisualRegression().setBaseline(req.params.key, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /api/visual-intelligence/regression/compare/:key — compare against baseline */
router.post('/regression/compare/:key', (req, res) => {
  try {
    const svc = getImageServices();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    const result = svc.VisualRegression.getVisualRegression().compare(req.params.key, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** GET /api/visual-intelligence/resolution/stats — resolution test harness stats */
router.get('/resolution/stats', (req, res) => {
  const svc = getImageServices();
  if (!svc) return res.status(503).json({ error: 'Services not available' });
  const harness = svc.ResolutionTestHarness.getResolutionTestHarness();
  res.json({ resolutions: harness.resolutions, runs: harness.listRuns() });
});

/** POST /api/visual-intelligence/qa/run — run full visual QA agent */
router.post('/qa/run', async (req, res) => {
  try {
    const { getVisualQAAgent } = require('~/server/services/VisualIntelligence/VisualQAAgent');
    const agent = getVisualQAAgent();
    const result = await agent.run(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** GET /api/visual-intelligence/qa/reports — list recent QA reports */
router.get('/qa/reports', (req, res) => {
  try {
    const { getVisualQAAgent } = require('~/server/services/VisualIntelligence/VisualQAAgent');
    const agent = getVisualQAAgent();
    res.json(agent.getReports());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/visual-intelligence/bounding-boxes — extract bounding boxes */
router.post('/bounding-boxes', async (req, res) => {
  try {
    const { getBoundingBoxExtractor } = require('~/server/services/VisualIntelligence/BoundingBoxExtractor');
    const extractor = getBoundingBoxExtractor();
    const result = await extractor.extract(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /api/visual-intelligence/multi-resolution — test at multiple breakpoints */
router.post('/multi-resolution', async (req, res) => {
  try {
    const { getMultiResolutionTester } = require('~/server/services/VisualIntelligence/MultiResolutionTester');
    const tester = getMultiResolutionTester();
    const result = await tester.run(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /api/visual-intelligence/regression/v2/baseline — capture baseline */
router.post('/regression/v2/baseline', (req, res) => {
  try {
    const { getVisualRegressionSystem } = require('~/server/services/VisualIntelligence/VisualRegressionSystem');
    const vrs = getVisualRegressionSystem();
    const result = vrs.captureBaseline(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /api/visual-intelligence/regression/v2/compare — compare against baseline */
router.post('/regression/v2/compare', async (req, res) => {
  try {
    const { getVisualRegressionSystem } = require('~/server/services/VisualIntelligence/VisualRegressionSystem');
    const vrs = getVisualRegressionSystem();
    const result = await vrs.compare(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** GET /api/visual-intelligence/regression/v2/baselines — list all baselines */
router.get('/regression/v2/baselines', (req, res) => {
  try {
    const { getVisualRegressionSystem } = require('~/server/services/VisualIntelligence/VisualRegressionSystem');
    const vrs = getVisualRegressionSystem();
    res.json({ baselines: vrs.listBaselines(), stats: vrs.getStats() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─── Face 9: Unified Visual Pipeline (UVR → Diagnosis → History) ─────────────

let _uvr = null;
function getUVR() {
  if (!_uvr) {
    try { _uvr = require('~/server/services/VisualIntelligence/UnifiedVisualRepresentation').getUnifiedVisualRepresentation(); } catch { _uvr = null; }
  }
  return _uvr;
}

let _diag = null;
function getDiag() {
  if (!_diag) {
    try { _diag = require('~/server/services/VisualIntelligence/VisualDiagnosisAgent').getVisualDiagnosisAgent(); } catch { _diag = null; }
  }
  return _diag;
}

let _history = null;
function getHistory() {
  if (!_history) {
    try { _history = require('~/server/services/VisualIntelligence/VisualHistory').getVisualHistory(); } catch { _history = null; }
  }
  return _history;
}

/**
 * POST /api/visual-intelligence/pipeline/analyze
 * Full pipeline: HTML (or URL page audit) → UVR → Diagnosis
 * Body: { html?, url?, key? }
 */
router.post('/pipeline/analyze', async (req, res) => {
  try {
    const { html, url, key, recordHistory = true } = req.body || {};
    if (!html && !url) return res.status(400).json({ error: 'html or url required' });

    const engine = getEngine();
    const uvr    = getUVR();
    const diag   = getDiag();
    if (!uvr || !diag) return res.status(503).json({ error: 'Visual pipeline components not available' });

    let domResult = {}, a11yResult = {}, uiResult = {}, screenshotInfo = {};

    if (html) {
      const audit = engine.auditHTML(html);
      domResult  = { issues: audit.dom?.issues || [], stats: audit.dom?.stats || {}, score: audit.dom?.score ?? null };
      a11yResult = audit.accessibility || {};
      uiResult   = audit.ui || {};
    } else {
      const [dom, a11y, ui] = await Promise.allSettled([
        Promise.resolve(engine.analyzeDOM(url)),
        Promise.resolve(engine.checkAccessibility(url)),
        Promise.resolve(engine.evaluateUI(url)),
      ]);
      domResult  = dom.status === 'fulfilled' ? dom.value : {};
      a11yResult = a11y.status === 'fulfilled' ? a11y.value : {};
      uiResult   = ui.status === 'fulfilled' ? ui.value : {};
      screenshotInfo = { url };
    }

    const unified   = uvr.build({ dom: domResult, a11y: a11yResult, ui: uiResult, screenshot: screenshotInfo });
    const diagnosis = diag.diagnose(unified);
    const summary   = uvr.summarize(unified);

    if (recordHistory && key) {
      const hist = getHistory();
      if (hist) hist.record(key, unified, diagnosis);
    }

    res.json({ ok: true, key: key || null, unified, diagnosis, summary });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/visual-intelligence/pipeline/diagnose
 * Diagnose a pre-built UVR (passed in body).
 */
router.post('/pipeline/diagnose', (req, res) => {
  try {
    const { uvr } = req.body || {};
    if (!uvr) return res.status(400).json({ error: 'uvr is required' });
    const diag = getDiag();
    if (!diag) return res.status(503).json({ error: 'VisualDiagnosisAgent not available' });
    res.json({ ok: true, ...diag.diagnose(uvr) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/visual-intelligence/history — list all tracked keys
 */
router.get('/history', (req, res) => {
  const hist = getHistory();
  if (!hist) return res.status(503).json({ error: 'VisualHistory not available' });
  res.json({ keys: hist.listKeys(), stats: hist.getStats() });
});

/**
 * GET /api/visual-intelligence/history/:key — get snapshots for a key
 * Query: ?limit=N (default 20)
 */
router.get('/history/:key', (req, res) => {
  const hist = getHistory();
  if (!hist) return res.status(503).json({ error: 'VisualHistory not available' });
  const key   = req.params.key;
  const limit = parseInt(req.query.limit) || 20;
  res.json({
    key,
    history: hist.getHistory(key, limit),
    trend:   hist.getTrend(key),
  });
});

/**
 * DELETE /api/visual-intelligence/history/:key — clear history for a key
 */
router.delete('/history/:key', (req, res) => {
  const hist = getHistory();
  if (!hist) return res.status(503).json({ error: 'VisualHistory not available' });
  res.json(hist.clear(req.params.key));
});

module.exports = router;
