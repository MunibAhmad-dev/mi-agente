const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

// Lazy-load to avoid requiring the service on startup if WebLLM isn't used
function getModels() {
  try {
    const { WEBLLM_MODELS } = require('~/server/services/Harness/cognitive/llm/WebLLMManager');
    return WEBLLM_MODELS;
  } catch {
    return {};
  }
}

/**
 * GET /api/webllm/config
 * Returns the list of available WebLLM models and browser requirements.
 */
router.get('/config', requireJwtAuth, (req, res) => {
  const models = getModels();
  const modelList = Object.entries(models).map(([id, info]) => ({ id, ...info }));
  res.json({
    models: modelList,
    requirements: {
      webgpu: true,
      minVramGb: 4,
      note: 'Models run locally in the browser via WebGPU. No server inference needed.',
    },
  });
});

module.exports = router;
