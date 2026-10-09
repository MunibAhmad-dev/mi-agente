'use strict';

/**
 * Research OS routes — adapter bridging the cerebro-investigacion-rag engine
 * into the mi-agente platform behind platform JWT auth.
 *
 * The engine's src/ lives at api/server/services/ResearchOS/ (copied from branch).
 * Store / LLM seams are replaced by platform adapters below.
 *
 *   POST /api/research-os/research           start a research session
 *   GET  /api/research-os/research/:id       get session state
 *   POST /api/research-os/research/:id/continue
 *   POST /api/research-os/research/:id/verify
 *   GET  /api/research-os/research/:id/sources
 *   GET  /api/research-os/research/:id/claims
 *   GET  /api/research-os/research/:id/report
 *   POST /api/research-os/rag/query
 *   GET  /api/research-os/knowledge
 *   GET  /api/research-os/compression/stats
 *   GET  /api/research-os/health
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();
router.use(requireJwtAuth);

let _orchestrator = null;
let _initializing = null;

function getOrchestrator() {
  if (_orchestrator) return _orchestrator;
  if (_initializing) return _initializing;
  _initializing = (async () => {
    try {
      const Orchestrator = require('~/server/services/ResearchOS/orchestrator/ResearchOrchestrator');
      _orchestrator = Orchestrator;
      logger.info('[ResearchOS] Orchestrator initialized');
      return _orchestrator;
    } catch (err) {
      logger.error('[ResearchOS] Orchestrator init failed:', err.message);
      _initializing = null;
      throw err;
    }
  })();
  return _initializing;
}

async function withOrchestrator(res, fn) {
  try {
    const orch = await getOrchestrator();
    return fn(orch);
  } catch (err) {
    logger.error('[ResearchOS] Request failed:', err.message);
    return res.status(500).json({ error: err.message || 'Research OS unavailable' });
  }
}

// ── Health ────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  const apiKeys = {
    perplexity: !!process.env.PERPLEXITY_API_KEY,
    serpapi: !!process.env.SERPAPI_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    ollama: !!process.env.OLLAMA_BASE_URL,
  };
  const configured = Object.keys(apiKeys).filter((k) => apiKeys[k]);
  res.json({
    ok: true,
    service: 'research-os',
    initialized: !!_orchestrator,
    apiKeysConfigured: configured,
    note: configured.length === 0
      ? 'No LLM API keys configured. Set PERPLEXITY_API_KEY, OPENAI_API_KEY, or OLLAMA_BASE_URL in .env to use research features.'
      : `Research OS operational with: ${configured.join(', ')}`,
  });
});

// ── Research sessions ─────────────────────────────────────────────────────

router.post('/research', async (req, res) => {
  const { question, mode, budget, answers, skip_clarification, docs } = req.body;
  if (!question) return res.status(400).json({ error: '"question" is required' });
  await withOrchestrator(res, async (orch) => {
    const result = await orch.research(question, { mode, budget, answers, skipClarification: skip_clarification, injectDocs: docs || [] });
    res.json(result);
  });
});

router.get('/research/:id', async (req, res) => {
  await withOrchestrator(res, async (orch) => {
    const session = await orch.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  });
});

router.post('/research/:id/continue', async (req, res) => {
  await withOrchestrator(res, async (orch) => {
    const result = await orch.continueSession(req.params.id, req.body);
    res.json(result);
  });
});

router.post('/research/:id/verify', async (req, res) => {
  await withOrchestrator(res, async (orch) => {
    const result = await orch.verifyClaims(req.params.id, req.body);
    res.json(result);
  });
});

router.get('/research/:id/sources', async (req, res) => {
  await withOrchestrator(res, async (orch) => {
    const session = await orch.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ sources: session.sources || [] });
  });
});

router.get('/research/:id/claims', async (req, res) => {
  await withOrchestrator(res, async (orch) => {
    const session = await orch.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ claims: session.claims || [] });
  });
});

router.get('/research/:id/report', async (req, res) => {
  await withOrchestrator(res, async (orch) => {
    const result = await orch.generateReport(req.params.id);
    res.json(result);
  });
});

// ── RAG ───────────────────────────────────────────────────────────────────

router.post('/rag/query', async (req, res) => {
  const { query, contested_claim_id } = req.body;
  if (!query) return res.status(400).json({ error: '"query" is required' });
  try {
    const HybridRAG = require('~/server/services/ResearchOS/rag/HybridRAG');
    const rag = new HybridRAG();
    const result = await rag.retrieve(query, { contestedClaimId: contested_claim_id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Knowledge ─────────────────────────────────────────────────────────────

router.get('/knowledge', async (req, res) => {
  try {
    const store = require('~/server/services/ResearchOS/core/store');
    const entries = await store.getAllKnowledge ? store.getAllKnowledge() : {};
    res.json({ knowledge: entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Compression stats ──────────────────────────────────────────────────────

router.get('/compression/stats', (req, res) => {
  res.json({ message: 'Compression stats — Phase 40 (LLM layer) not yet wired', status: 'pending' });
});

module.exports = router;
