'use strict';

/**
 * Gen B Universal Agent — Batch F (knowledge deepening)
 * Phases 13, 15, 16, 30 — deepened implementations
 *
 * Mounted at: /api/agent/knowledge
 */

const express = require('express');
const router  = express.Router();

const { EvidenceEngine }   = require('~/server/services/CognitiveBehavior/EvidenceEngine');
const { MemorySystem }     = require('~/server/services/CognitiveBehavior/MemorySystem');
const { FailureMemory, FAILURE_CATEGORIES } = require('~/server/services/CognitiveBehavior/FailureMemory');
const { TokenOptimization, TASK_BUDGETS }   = require('~/server/services/CognitiveBehavior/TokenOptimization');

// Shared instances per process
const evidenceEngine = new EvidenceEngine();
const memorySystem   = new MemorySystem();
const failureMemory  = new FailureMemory();
const tokenOpt       = new TokenOptimization();

// ── Phase 13: Evidence Engine ──────────────────────────────────────────────

router.post('/evidence/extract-claims', (req, res) => {
  try {
    const { text } = req.body;
    const claims = evidenceEngine.extractClaims(text || '');
    return res.json({ claims, count: claims.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/evidence/sources', (req, res) => {
  try {
    const source = evidenceEngine.registerSource(req.body);
    return res.json({ source });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/evidence/claims', async (req, res) => {
  try {
    const claim = await evidenceEngine.addClaim(req.body);
    return res.json({ claim });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/evidence/items', (req, res) => {
  try {
    const ev = evidenceEngine.addEvidence(req.body);
    return res.json({ evidence: ev });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/evidence/link', (req, res) => {
  try {
    const { claimId, evidenceId } = req.body;
    const result = evidenceEngine.linkEvidence(claimId, evidenceId);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/evidence/chain/:claimId', (req, res) => {
  try {
    const chain = evidenceEngine.buildEvidenceChain(req.params.claimId);
    return res.json(chain);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/evidence/confidence/:claimId', (req, res) => {
  try {
    const confidence = evidenceEngine.computeConfidence(req.params.claimId);
    return res.json({ claimId: req.params.claimId, confidence });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/evidence/search', (req, res) => {
  try {
    const { q, limit, status } = req.query;
    const results = evidenceEngine.searchClaims(q, { limit: Number(limit) || 10, statusFilter: status });
    return res.json({ results, count: results.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/evidence/stats', (req, res) => {
  return res.json(evidenceEngine.getStats());
});

// ── Phase 15: Memory System ────────────────────────────────────────────────

router.post('/memory/events', (req, res) => {
  try {
    const { event, context } = req.body;
    const entry = memorySystem.recordEvent(event, context || {});
    return res.json({ entry });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/memory/facts', (req, res) => {
  try {
    const { content, category, opts } = req.body;
    const fact = memorySystem.storeFact(content, category || 'general', opts || {});
    return res.json({ fact });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/memory/learn', (req, res) => {
  try {
    const { task, steps, opts } = req.body;
    const result = memorySystem.learnFromSuccess(task, steps || [], opts || {});
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/memory/recall', (req, res) => {
  try {
    const { q, limit, layers } = req.query;
    const layerArr = layers ? layers.split(',') : undefined;
    const results  = memorySystem.recall(q || '', { limit: Number(limit) || 10, layers: layerArr });
    return res.json({ results, count: results.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/memory/episodic/recent', (req, res) => {
  try {
    const { n, sessionId } = req.query;
    const events = memorySystem.episodic.getRecent(Number(n) || 10, { sessionId });
    return res.json({ events, count: events.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/memory/semantic/categories', (req, res) => {
  try {
    const categories = memorySystem.semantic.listCategories();
    return res.json({ categories });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/memory/procedural/best', (req, res) => {
  try {
    const { task } = req.query;
    const pattern = memorySystem.procedural.getBestPattern(task || '');
    return res.json({ pattern });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/memory/stats', (req, res) => {
  return res.json(memorySystem.getStats());
});

// ── Phase 16: Failure Memory ───────────────────────────────────────────────

router.post('/failures/record', (req, res) => {
  try {
    const failure = failureMemory.record(req.body);
    return res.json({ failure });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/failures/categorize', (req, res) => {
  try {
    const category = failureMemory.categorize(req.body);
    return res.json({ category });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/failures/warn', (req, res) => {
  try {
    const { task, category, tool, limit } = req.query;
    const result = failureMemory.preTaskWarning(task || '', { category, tool, limit: Number(limit) || 5 });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/failures/:id/learn-pattern', (req, res) => {
  try {
    const pattern = failureMemory.learnPattern(req.params.id, req.body);
    return res.json({ pattern });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/failures/:id/recovery', (req, res) => {
  try {
    const { recovery, prevention } = req.body;
    const result = failureMemory.recordRecovery(req.params.id, recovery, prevention);
    return res.json({ result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/failures/recurring', (req, res) => {
  try {
    const { min } = req.query;
    const failures = failureMemory.getRecurring(Number(min) || 2);
    return res.json({ failures, count: failures.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/failures/categories', (req, res) => {
  return res.json({ categories: Object.values(FAILURE_CATEGORIES) });
});

router.get('/failures/stats', (req, res) => {
  return res.json(failureMemory.getStats());
});

// ── Phase 30: Token Optimization ──────────────────────────────────────────

router.post('/tokens/init-session', (req, res) => {
  try {
    const { sessionId, limit, tier } = req.body;
    const session = tokenOpt.initSession(sessionId, { limit, tier });
    return res.json({ session: { id: session.id, limit: session.limit, used: session.used } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/tokens/allocate', (req, res) => {
  try {
    const { taskType, sessionId } = req.body;
    const allocation = tokenOpt.allocate(taskType || 'default', sessionId);
    return res.json(allocation);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/tokens/track', (req, res) => {
  try {
    const { sessionId, tokensUsed, meta } = req.body;
    const result = tokenOpt.track(sessionId, Number(tokensUsed) || 0, meta || {});
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/tokens/enforce', (req, res) => {
  try {
    const { request, sessionId, taskType, allowTruncate } = req.body;
    const result = tokenOpt.enforce(request || {}, { sessionId, taskType, allowTruncate });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/tokens/usage/:sessionId', (req, res) => {
  try {
    const usage = tokenOpt.getUsage(req.params.sessionId);
    if (!usage) return res.status(404).json({ error: 'Session not found' });
    return res.json(usage);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/tokens/reset/:sessionId', (req, res) => {
  try {
    const session = tokenOpt.resetSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json({ reset: true, sessionId: req.params.sessionId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/tokens/task-budgets', (req, res) => {
  return res.json({ budgets: TASK_BUDGETS });
});

router.get('/tokens/stats', (req, res) => {
  return res.json(tokenOpt.getStats());
});

// ── Health ─────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  return res.json({
    status: 'ok',
    phases: {
      13: { name: 'EvidenceEngine',   claims: evidenceEngine.getStats().claims },
      15: { name: 'MemorySystem',     episodic: memorySystem.episodic.size(), semantic: memorySystem.semantic.size(), procedural: memorySystem.procedural.size() },
      16: { name: 'FailureMemory',    total: failureMemory.getStats().total },
      30: { name: 'TokenOptimization', sessions: tokenOpt.getStats().sessions },
    },
  });
});

module.exports = router;
