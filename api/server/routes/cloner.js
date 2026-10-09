/**
 * Website Cloning routes — Face 18.
 *
 * POST /api/cloner/clone              — clone a website URL → editable scaffold
 * POST /api/cloner/analyze            — analyze structure without full clone
 * POST /api/cloner/full-analysis      — multi-agent pipeline: repair + forensics + visual QA
 * POST /api/cloner/design-forensics   — extract design tokens from HTML/CSS
 * POST /api/cloner/auto-repair        — detect and fix issues in cloned HTML
 * POST /api/cloner/visual-qa          — pixel-diff two images (original vs clone)
 * GET  /api/cloner/history            — recent clone operations (in-memory, last 50)
 * DELETE /api/cloner/history          — clear clone history
 */
const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

// In-process clone history — persists across requests within the same server session
const _cloneHistory = [];
const HISTORY_MAX = 50;

function addToHistory(entry) {
  _cloneHistory.unshift({ ...entry, cloned_at: new Date().toISOString() });
  if (_cloneHistory.length > HISTORY_MAX) _cloneHistory.pop();
}

/** GET /api/cloner/health — reports capability and setup status */
router.get('/health', (req, res) => {
  let playwrightReady = false;
  try { require('playwright'); playwrightReady = true; } catch { /* not installed */ }
  res.json({
    ok: true,
    service: 'website-cloner',
    playwrightReady,
    note: playwrightReady
      ? 'All 6 cloning endpoints available.'
      : 'Playwright not installed. Run: npx playwright install chromium\nAll endpoint logic is complete; Playwright is required for browser-based cloning and visual QA.',
    endpoints: ['/clone', '/analyze', '/full-analysis', '/design-forensics', '/auto-repair', '/visual-qa'],
  });
});

/** GET /api/cloner/history — memory of past clone operations */
router.get('/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, HISTORY_MAX);
  res.json({ items: _cloneHistory.slice(0, limit), total: _cloneHistory.length });
});

/** DELETE /api/cloner/history — clear history */
router.delete('/history', (req, res) => {
  _cloneHistory.length = 0;
  res.json({ cleared: true });
});

/** POST /api/cloner/clone */
router.post('/clone', async (req, res) => {
  try {
    const { url, timeoutMs, waitForNetworkIdle } = req.body;
    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'Valid http/https url required' });
    }
    const { cloneWebsite } = require('~/server/services/WebsiteCloner/WebsiteClonerService');
    const result = await cloneWebsite(url, { timeoutMs, waitForNetworkIdle });
    const payload = {
      url: result.url,
      title: result.title,
      structure: result.structure,
      assetCount: result.assetUrls.length,
      scaffold: result.scaffold,
    };
    addToHistory({ url: result.url, title: result.title, assetCount: result.assetUrls.length, type: 'clone' });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/cloner/analyze — lightweight: fetch HTML, analyze structure */
router.post('/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'Valid http/https url required' });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let html = '';
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mi-agente/1.0)' },
      });
      html = await r.text();
    } finally {
      clearTimeout(timer);
    }
    const { analyzeStructure } = require('~/server/services/WebsiteCloner/WebsiteClonerService');
    const structure = analyzeStructure(html);
    addToHistory({ url, title: structure.headings?.[0]?.text || url, type: 'analyze' });
    res.json({ url, structure, htmlLength: html.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/cloner/full-analysis — multi-agent pipeline: repair + forensics + visual QA */
router.post('/full-analysis', async (req, res) => {
  try {
    const { url, html, baseUrl } = req.body;
    if (!url && !html) return res.status(400).json({ error: 'url or html required' });
    const { getWebClonerSupervisor } = require('~/server/services/WebCloner/WebClonerSupervisor');
    const supervisor = getWebClonerSupervisor();
    const report = await supervisor.fullAnalysis({ url, html, baseUrl: baseUrl || url });
    addToHistory({ type: 'full-analysis', url: url || null, score: report.score });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/cloner/design-forensics — extract design tokens + DNA from HTML/CSS */
router.post('/design-forensics', (req, res) => {
  try {
    const { html, css } = req.body;
    if (!html && !css) return res.status(400).json({ error: 'html or css required' });
    const { getDesignForensicsAgent } = require('~/server/services/WebCloner/agents/DesignForensicsAgent');
    const agent = getDesignForensicsAgent();
    const report = agent.analyze(html || '', css || '');
    const summary = agent.summarize(report);
    addToHistory({ type: 'design-forensics', summary });
    res.json({ report, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/cloner/auto-repair — detect and repair common issues in cloned HTML */
router.post('/auto-repair', (req, res) => {
  try {
    const { html, baseUrl } = req.body;
    if (!html) return res.status(400).json({ error: 'html required' });
    const { getAutoRepairAgent } = require('~/server/services/WebCloner/agents/AutoRepairAgent');
    const agent = getAutoRepairAgent();
    const result = agent.repair(html, { baseUrl });
    addToHistory({ type: 'auto-repair', repairsApplied: result.repairs.length, score: result.score });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/cloner/visual-qa — pixel-diff two local image paths or analyze HTML for risks */
router.post('/visual-qa', async (req, res) => {
  try {
    const { originalPath, reconstructionPath, html } = req.body;
    const { getVisualQAAgent } = require('~/server/services/WebCloner/agents/VisualQAAgent');
    const agent = getVisualQAAgent();

    // If paths provided, do pixel comparison; otherwise do HTML risk analysis
    if (originalPath && reconstructionPath) {
      const result = await agent.compare(originalPath, reconstructionPath);
      addToHistory({ type: 'visual-qa', score: result.score?.overall });
      return res.json(result);
    }
    if (html) {
      const analysis = agent.analyzeHTML(html);
      return res.json(analysis);
    }
    res.status(400).json({ error: 'originalPath+reconstructionPath or html required' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
