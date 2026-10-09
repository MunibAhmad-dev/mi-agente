/**
 * universalSearch.js — Rutas del Motor de búsqueda universal (FASE 34).
 *
 *   GET /api/universal-search?q=…        → búsqueda multi-fuente + fuentes
 *   GET /api/universal-search/verify?claim=… → verificación factual
 *   GET /api/universal-search/sources     → catálogo de fuentes (perfiles)
 *
 * Todo el tráfico va autenticado (JWT) y los resultados se cachean 5 min.
 */
const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const {
  universalSearch,
  verifyClaim,
  synthesizeAnswer,
  getSourceProfile,
  SOURCE_PROFILES,
} = require('~/server/services/UniversalSearch/UniversalSearchService');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/', async function (req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ success: false, error: 'Parámetro "q" requerido' });
  }
  try {
    const result = await universalSearch(q);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ success: false, error: error.message });
  }
});

router.get('/verify', async function (req, res) {
  const claim = String(req.query.claim || '').trim();
  if (!claim) {
    return res.status(400).json({ success: false, error: 'Parámetro "claim" requerido' });
  }
  try {
    const result = await verifyClaim(claim);
    // FASE 38: con `synthesize=1` el LLM local redacta una respuesta corta
    // citando las fuentes. Si el LLM no está disponible, `answer` queda null
    // y el cliente usa la evidencia tal cual (nunca se inventa).
    if (String(req.query.synthesize || '') === '1') {
      result.answer = await synthesizeAnswer(claim, result);
    }
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ success: false, error: error.message });
  }
});

router.get('/sources', async function (_req, res) {
  return res.json({
    success: true,
    total: SOURCE_PROFILES.length,
    sources: SOURCE_PROFILES.map((s) => ({
      domain: s.matched || s.domain,
      name: s.name,
      type: s.type,
      authority: s.authority,
      reliability: s.reliability,
    })),
  });
});

module.exports = router;
