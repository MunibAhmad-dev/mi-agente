const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  planTask,
  applyPlan,
  discoverCapabilities,
  routePlanModels,
  deepResearchHandler,
} = require('~/server/controllers/agents/architect');
const { runAutonomousResearch } = require('~/server/services/AgentArchitect/autonomousResearch');

const router = express.Router();

const researchLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many research requests, please wait before trying again.' },
});

/**
 * @route POST /agents/architect/plan
 * @desc Generates a proposed multi-agent plan for a natural-language task.
 *       Does not create any agent; purely advisory output for the client to
 *       render (auto mode) or let the user edit (manual mode).
 * @access Private (requireJwtAuth applied by parent router)
 */
router.post('/plan', planTask);

/**
 * @route POST /agents/architect/apply
 * @desc Creates the agents described by a (possibly user-edited) plan, using
 *       the same creation/update handlers and ACL checks as manual agent
 *       creation.
 * @access Private (requireJwtAuth applied by parent router)
 */
router.post('/apply', applyPlan);

/**
 * @route POST /agents/architect/discover
 * @desc FASE 3 — Capability Discovery: por cada agente del plan, descubre y
 *       asigna tools/skills/MCP disponibles según su rol, sin duplicados.
 * @access Private (requireJwtAuth applied by parent router)
 */
router.post('/discover', discoverCapabilities);

/**
 * @route POST /agents/architect/models
 * @desc FASE 4 — Model Router: elige por agente el modelo real (local Ollama
 *       primero) según las capacidades que el Capability Discovery detectó.
 * @access Private (requireJwtAuth applied by parent router)
 */
router.post('/models', routePlanModels);

/**
 * @route POST /agents/architect/research
 * @desc FASE 6 — Deep Research: descompone la pregunta en sub-búsquedas,
 *       recolecta fuentes con el motor universal, verifica factualmente y
 *       responde con citas [1][2] numeradas contra la lista de fuentes.
 * @access Private (requireJwtAuth applied by parent router)
 */
router.post('/research', researchLimiter, deepResearchHandler);

/**
 * @route POST /agents/architect/autonomous
 * @desc Face 10 — Autonomous Research Loop: confidence check → plan → search
 *       → verify → hypothesis → skill creation. Returns structured result.
 * @body { question, skipIfConfident?, createSkill?, maxSubQuestions? }
 */
router.post('/autonomous', researchLimiter, async (req, res) => {
  try {
    const { question, skipIfConfident, createSkill, maxSubQuestions } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question (string) is required' });
    }
    const result = await runAutonomousResearch(question, {
      userId: req.user?.id,
      skipIfConfident: skipIfConfident !== false,
      createSkill: createSkill !== false,
      maxSubQuestions: Number(maxSubQuestions) || 4,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
