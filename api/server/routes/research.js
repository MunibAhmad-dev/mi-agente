/**
 * Autonomous Research API — Face 10
 * Mounted at /api/research
 *
 * POST /api/research/query             — run ResearchEngine query (Face 10/21 façade)
 * GET  /api/research/status            — service health + stats
 * POST /api/research/deep              — run full deepResearch pipeline
 * POST /api/research/decompose         — decompose question into sub-queries only
 * GET  /api/research/knowledge         — list user's persistent knowledge graph
 * POST /api/research/knowledge/entity  — add an entity to user's knowledge graph
 * DELETE /api/research/knowledge/entity/:id — remove entity from knowledge graph
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const { getResearchEngine } = require('~/server/services/Research/ResearchEngine');
const {
  deepResearch,
  decomposeQuestion,
  questionKeywords,
  DEFAULT_MAX_SUBQUERIES,
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_EVIDENCE,
} = require('~/server/services/AgentArchitect');
const { KnowledgeEngine } = require('~/server/services/Harness/cognitive/knowledge/KnowledgeEngine');

router.use(requireJwtAuth);

// ─── Face 10/21 — ResearchEngine façade ──────────────────────────────────────

/**
 * POST /api/research/query
 * body: { text, context? }
 * Runs the ResearchEngine façade. Returns structured result with answer, sources,
 * claims and confidence. Falls back gracefully when ResearchOS is unavailable.
 */
router.post('/query', async (req, res) => {
  const { text, context } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }
  try {
    const engine = getResearchEngine();
    const result = await engine.query(text, context || {});
    res.json(result);
  } catch (err) {
    // Should never reach here (engine is non-throwing), but guard just in case.
    res.status(500).json({ error: err.message, answer: null, sources: [], claims: [], confidence: 0, fallback: true });
  }
});

/**
 * GET /api/research/status
 * Returns ResearchEngine health + stats.
 */
router.get('/status', (req, res) => {
  try {
    const engine = getResearchEngine();
    const stats = engine.getStats();
    res.json({ status: 'ok', ...stats });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * Research depth levels — control how many sub-queries and sources are fetched.
 * Each level multiplies cost roughly 2×, so expose the choice to callers.
 */
const RESEARCH_LEVELS = {
  quick:    { maxSubQueries: 1, maxSources: 3,  maxEvidence: 2 },
  standard: { maxSubQueries: DEFAULT_MAX_SUBQUERIES, maxSources: DEFAULT_MAX_SOURCES, maxEvidence: DEFAULT_MAX_EVIDENCE },
  deep:     { maxSubQueries: 8, maxSources: 15, maxEvidence: 8 },
};

/** Token budget per level (characters of evidence fed to the LLM synthesizer). */
const TOKEN_BUDGETS = { quick: 4000, standard: 12000, deep: 32000 };

/**
 * POST /api/research/deep
 * body: { question, level?, maxSubQueries?, maxSources?, maxEvidence? }
 * `level` = "quick" | "standard" (default) | "deep"
 */
router.post('/deep', async (req, res) => {
  const { question, level = 'standard', maxSubQueries, maxSources, maxEvidence } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required' });
  }
  if (!RESEARCH_LEVELS[level]) {
    return res.status(400).json({ error: `level must be one of: ${Object.keys(RESEARCH_LEVELS).join(', ')}` });
  }

  const levelCfg = RESEARCH_LEVELS[level];
  const tokenBudget = TOKEN_BUDGETS[level];

  try {
    const result = await deepResearch(question, {
      maxSubQueries: maxSubQueries ?? levelCfg.maxSubQueries,
      maxSources:    maxSources    ?? levelCfg.maxSources,
      maxEvidence:   maxEvidence   ?? levelCfg.maxEvidence,
      tokenBudget,
    });
    res.json({ ...result, level, tokenBudget });
  } catch (err) {
    console.error('[research] deepResearch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/research/decompose
 * body: { question, max? }
 * Fast, sync — no network calls.
 */
router.post('/decompose', (req, res) => {
  const { question, max } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required' });
  }
  try {
    const subQueries = decomposeQuestion(question, max ?? DEFAULT_MAX_SUBQUERIES);
    const keywords = questionKeywords(question);
    res.json({ subQueries, keywords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Knowledge Graph routes ────────────────────────────────────────────────

/**
 * GET /api/research/knowledge
 * Returns the user's persistent knowledge graph (entities + relations).
 */
router.get('/knowledge', async (req, res) => {
  try {
    const engine = await KnowledgeEngine.restore(req.user?.id, 'research');
    res.json({
      entities: engine.getAllEntities(),
      relations: engine.relations,
      stats: engine.getStats(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/research/knowledge/entity
 * body: { name, type?, content?, confidence?, source? }
 */
router.post('/knowledge/entity', async (req, res) => {
  const { name, type, content, confidence, source } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const engine = await KnowledgeEngine.restore(req.user?.id, 'research');
    const entity = await engine.addEntity({ name, type, content, confidence, source });
    res.json({ entity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/research/knowledge/entity/:id
 */
router.delete('/knowledge/entity/:id', async (req, res) => {
  try {
    const engine = await KnowledgeEngine.restore(req.user?.id, 'research');
    if (!engine.entities.has(req.params.id)) {
      return res.status(404).json({ error: 'Entity not found' });
    }
    engine.entities.delete(req.params.id);
    await engine.persist();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
