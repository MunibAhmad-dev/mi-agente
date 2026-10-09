/**
 * Vision API Routes — FASE 31/35.
 * Visión por computadora conectada a TODOS los LLM: modelos locales (Ollama)
 * y proveedores externos configurados (OpenAI, Anthropic, Google, OpenRouter,
 * LiteLLM…) cuando el modelo es multimodal.
 *
 *   GET  /api/vision/status  → modelos de visión disponibles (locales + externos)
 *   POST /api/vision/analyze → analizar imagen { image(base64), task, model, prompt, provider }
 */
const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');
const { listAllVisionModels, analyzeImage } = require('~/server/services/Vision/VisionService');

/** GET /api/vision/status — estado de los modelos de visión (locales + proveedores). */
router.get('/status', requireJwtAuth, async (req, res) => {
  try {
    const endpoints = req.config?.endpoints || null;
    const result = await listAllVisionModels(endpoints);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** POST /api/vision/analyze — analiza una imagen con el modelo elegido. */
router.post('/analyze', requireJwtAuth, async (req, res) => {
  try {
    const { image, task, model, prompt, provider } = req.body || {};
    const endpoints = req.config?.endpoints || null;
    const result = await analyzeImage(
      image,
      { task, model, prompt, provider },
      endpoints,
      (params) => db.getUserKey({ userId: req.user.id, name: params.name }).catch(() => null),
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
