'use strict';

/**
 * universalAgentBatchD.js — REST API for Gen B runtime & output phases.
 * Mounted at /api/agent/runtime
 *
 * Endpoints:
 *   POST  /estimate                             — ResourceEstimator.estimate
 *   POST  /fallback/execute                     — FallbackChain.execute
 *   GET   /fallback/chains                      — FallbackChain.getBuiltinChains
 *   POST  /tools/select                         — ToolSelectionEngine.select
 *   GET   /tools                                — ToolSelectionEngine.getRegistered
 *   POST  /tools                                — ToolSelectionEngine.registerTool
 *   POST  /format                               — OutputFormatter.format
 *   POST  /format/detect                        — OutputFormatter.detect
 *   POST  /citations/extract                    — CitationGenerator.extractClaims
 *   POST  /citations/annotate                   — CitationGenerator.annotate
 *   POST  /interruption/:taskId/checkpoint      — InterruptionHandler.checkpoint
 *   POST  /interruption/:taskId/interrupt       — InterruptionHandler.interrupt
 *   POST  /interruption/:interruptId/resume     — InterruptionHandler.resume
 *   GET   /providers                            — ProviderAbstraction.listProviders
 *   GET   /providers/best                       — ProviderAbstraction.getBestProvider
 *   POST  /sentiment                            — SentimentAnalyzer.analyze
 *   GET   /sentiment/:sessionId/mood            — SentimentAnalyzer.getSessionMood
 *   GET   /status                               — All stats
 */

const express = require('express');
const router = express.Router();

// ─── Lazy loaders ─────────────────────────────────────────────────────────────

function getEstimator() {
  return require('~/server/services/CognitiveBehavior/ResourceEstimator').getResourceEstimator();
}
function getFallback() {
  return require('~/server/services/CognitiveBehavior/FallbackChain').getFallbackChain();
}
function getToolEngine() {
  return require('~/server/services/CognitiveBehavior/ToolSelectionEngine').getToolSelectionEngine();
}
function getFormatter() {
  return require('~/server/services/CognitiveBehavior/OutputFormatter').getOutputFormatter();
}
function getCitations() {
  return require('~/server/services/CognitiveBehavior/CitationGenerator').getCitationGenerator();
}
function getInterruptions() {
  return require('~/server/services/CognitiveBehavior/InterruptionHandler').getInterruptionHandler();
}
function getProviders() {
  return require('~/server/services/CognitiveBehavior/ProviderAbstraction').getProviderAbstraction();
}
function getSentiment() {
  return require('~/server/services/CognitiveBehavior/SentimentAnalyzer').getSentimentAnalyzer();
}

// ─── ResourceEstimator ────────────────────────────────────────────────────────

/**
 * POST /estimate
 * Body: { text, modelId, options? }
 */
router.post('/estimate', (req, res) => {
  try {
    const { text, modelId, options } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = getEstimator().estimate(text, modelId, options || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── FallbackChain ────────────────────────────────────────────────────────────

/**
 * POST /fallback/execute
 * Body: { chainId, input, context? }
 */
router.post('/fallback/execute', async (req, res) => {
  try {
    const { chainId, input, context } = req.body || {};
    if (!chainId) return res.status(400).json({ error: 'chainId is required' });
    const result = await getFallback().execute(chainId, input, context || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /fallback/chains
 */
router.get('/fallback/chains', (req, res) => {
  try {
    const chains = getFallback().getBuiltinChains();
    return res.json(chains);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ToolSelectionEngine ──────────────────────────────────────────────────────

/**
 * POST /tools/select
 * Body: { task, availableTools?, context? }
 */
router.post('/tools/select', (req, res) => {
  try {
    const { task, availableTools, context } = req.body || {};
    if (!task) return res.status(400).json({ error: 'task is required' });
    const result = getToolEngine().select(task, availableTools, context || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /tools
 */
router.get('/tools', (req, res) => {
  try {
    const tools = getToolEngine().getRegistered();
    return res.json({ tools });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /tools
 * Body: tool object { name, description, capabilities, ... }
 */
router.post('/tools', (req, res) => {
  try {
    const tool = req.body;
    if (!tool || !tool.name) return res.status(400).json({ error: 'tool.name is required' });
    getToolEngine().registerTool(tool);
    return res.json({ registered: true, name: tool.name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── OutputFormatter ──────────────────────────────────────────────────────────

/**
 * POST /format
 * Body: { text, opts: { platform?, contentType?, maxLength? } }
 */
router.post('/format', (req, res) => {
  try {
    const { text, opts } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = getFormatter().format(text, opts || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /format/detect
 * Body: { text }
 */
router.post('/format/detect', (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = getFormatter().detect(text);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── CitationGenerator ────────────────────────────────────────────────────────

/**
 * POST /citations/extract
 * Body: { text }
 */
router.post('/citations/extract', (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = getCitations().extractClaims(text);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /citations/annotate
 * Body: { text, sources: [{ url, title, author, date }] }
 */
router.post('/citations/annotate', (req, res) => {
  try {
    const { text, sources } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const annotated = getCitations().annotate(text, sources || []);
    return res.json({ annotated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── InterruptionHandler ──────────────────────────────────────────────────────

/**
 * POST /interruption/:taskId/checkpoint
 * Body: { state }
 */
router.post('/interruption/:taskId/checkpoint', (req, res) => {
  try {
    const { taskId } = req.params;
    const { state } = req.body || {};
    getInterruptions().checkpoint(taskId, state);
    return res.json({ saved: true, taskId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /interruption/:taskId/interrupt
 * Body: { reason? }
 */
router.post('/interruption/:taskId/interrupt', (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body || {};
    const result = getInterruptions().interrupt(taskId, reason);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /interruption/:interruptId/resume
 */
router.post('/interruption/:interruptId/resume', (req, res) => {
  try {
    const { interruptId } = req.params;
    const result = getInterruptions().resume(interruptId);
    if (!result) return res.status(404).json({ error: 'Interruption not found or not resumable' });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ProviderAbstraction ──────────────────────────────────────────────────────

/**
 * GET /providers
 */
router.get('/providers', (req, res) => {
  try {
    const providers = getProviders().listProviders();
    return res.json({ providers });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /providers/best
 * Query: maxCost, minQuality, maxLatency, capabilities (comma-separated)
 */
router.get('/providers/best', (req, res) => {
  try {
    const { maxCost, minQuality, maxLatency, capabilities } = req.query;
    const requirements = {};
    if (maxCost !== undefined) requirements.maxCost = parseFloat(maxCost);
    if (minQuality !== undefined) requirements.minQuality = parseFloat(minQuality);
    if (maxLatency !== undefined) requirements.maxLatency = parseInt(maxLatency, 10);
    if (capabilities) requirements.capabilities = capabilities.split(',').map((c) => c.trim()).filter(Boolean);
    const result = getProviders().getBestProvider(requirements);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── SentimentAnalyzer ────────────────────────────────────────────────────────

/**
 * POST /sentiment
 * Body: { text, sessionId? }
 */
router.post('/sentiment', (req, res) => {
  try {
    const { text, sessionId } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const analyzer = getSentiment();
    const result = analyzer.analyze(text);
    // Optionally record to session mood
    if (sessionId) {
      analyzer.getSessionMood(sessionId, result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /sentiment/:sessionId/mood
 */
router.get('/sentiment/:sessionId/mood', (req, res) => {
  try {
    const { sessionId } = req.params;
    const mood = getSentiment().getSessionMood(sessionId);
    return res.json(mood);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * GET /status
 */
router.get('/status', (req, res) => {
  try {
    return res.json({
      status: 'ok',
      components: {
        ResourceEstimator: getEstimator().getStats(),
        FallbackChain: getFallback().getStats(),
        ToolSelectionEngine: getToolEngine().getStats(),
        OutputFormatter: getFormatter().getStats(),
        CitationGenerator: getCitations().getStats(),
        InterruptionHandler: getInterruptions().getStats(),
        ProviderAbstraction: getProviders().getStats(),
        SentimentAnalyzer: getSentiment().getStats(),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
