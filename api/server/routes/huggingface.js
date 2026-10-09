/**
 * HuggingFace API Routes
 * ======================
 *
 * Rutas API para integrar con HuggingFace.
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const hfService = require('../services/HuggingFace/HuggingFaceService');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// MIDDLEWARE
// ============================================================================

const requireHFToken = (req, res, next) => {
  if (!hfService.config.isConfigured()) {
    return res.status(503).json({
      error: 'HuggingFace API token not configured',
      hint: 'Set HUGGINGFACE_API_TOKEN environment variable',
    });
  }
  next();
};

// ============================================================================
// MODELS ENDPOINTS
// ============================================================================

/**
 * GET /api/huggingface/models
 * Busca modelos en HuggingFace
 */
router.get('/models', requireJwtAuth, async (req, res) => {
  try {
    const { q, filter, sort, direction, limit, offset } = req.query;

    const result = await hfService.searchModels({
      query: q || '',
      filter,
      sort: sort || 'downloads',
      direction: parseInt(direction) || -1,
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0,
    });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Search models failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/huggingface/models/trending
 * Obtiene modelos trending/populares
 */
router.get('/models/trending', requireJwtAuth, async (req, res) => {
  try {
    const { limit } = req.query;
    const result = await hfService.getTrendingModels({
      limit: Math.min(parseInt(limit) || 20, 50),
    });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Trending models failed:', error);
    res.status(500).json({ error: 'Failed to get trending models' });
  }
});

/**
 * GET /api/huggingface/models/presets
 * Obtiene modelos predefinidos por tarea
 */
router.get('/models/presets', requireJwtAuth, async (req, res) => {
  try {
    const { task } = req.query;

    if (task) {
      return res.json({
        task,
        models: hfService.getPresetModels(task),
      });
    }

    res.json(hfService.getAllPresetModels());
  } catch (error) {
    logger.error('[HuggingFace] Presets failed:', error);
    res.status(500).json({ error: 'Failed to get presets' });
  }
});

/**
 * GET /api/huggingface/models/:modelId
 * Obtiene detalles de un modelo
 */
router.get('/models/{*modelId}', requireJwtAuth, async (req, res) => {
  try {
    const { modelId } = req.params;
    const modelIdStr = Array.isArray(modelId) ? modelId.join('/') : modelId;
    const result = await hfService.getModelDetails(decodeURIComponent(modelIdStr));

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Model details failed:', error);
    res.status(500).json({ error: 'Failed to get model details' });
  }
});

// ============================================================================
// INFERENCE ENDPOINTS
// ============================================================================

/**
 * POST /api/huggingface/inference
 * Realiza inferencia en un modelo
 */
router.post('/inference', requireJwtAuth, requireHFToken, async (req, res) => {
  try {
    const { modelId, inputs, options } = req.body;

    if (!modelId || !inputs) {
      return res.status(400).json({ error: 'modelId and inputs are required' });
    }

    const result = await hfService.runInference(modelId, inputs, options || {});

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Inference failed:', error);
    res.status(500).json({ error: 'Inference failed' });
  }
});

/**
 * POST /api/huggingface/inference/nlp
 * Inferencia para NLP
 */
router.post('/inference/nlp', requireJwtAuth, requireHFToken, async (req, res) => {
  try {
    const { modelId, text, options } = req.body;

    if (!modelId || !text) {
      return res.status(400).json({ error: 'modelId and text are required' });
    }

    const result = await hfService.runNLP(modelId, text, options || {});

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] NLP inference failed:', error);
    res.status(500).json({ error: 'NLP inference failed' });
  }
});

/**
 * POST /api/huggingface/inference/vision
 * Inferencia para visión
 */
router.post('/inference/vision', requireJwtAuth, requireHFToken, async (req, res) => {
  try {
    const { modelId, image, options } = req.body;

    if (!modelId || !image) {
      return res.status(400).json({ error: 'modelId and image are required' });
    }

    const result = await hfService.runVision(modelId, image, options || {});

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Vision inference failed:', error);
    res.status(500).json({ error: 'Vision inference failed' });
  }
});

// ============================================================================
// DATASETS ENDPOINTS
// ============================================================================

/**
 * GET /api/huggingface/datasets
 * Busca datasets
 */
router.get('/datasets', requireJwtAuth, async (req, res) => {
  try {
    const { q, filter, sort, direction, limit, offset } = req.query;

    const result = await hfService.searchDatasets({
      query: q || '',
      filter,
      sort: sort || 'downloads',
      direction: parseInt(direction) || -1,
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0,
    });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Search datasets failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/huggingface/datasets/:datasetId
 * Obtiene detalles de un dataset
 */
router.get('/datasets/:datasetId', requireJwtAuth, async (req, res) => {
  try {
    const { datasetId } = req.params;
    const result = await hfService.getDatasetDetails(decodeURIComponent(datasetId));

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Dataset details failed:', error);
    res.status(500).json({ error: 'Failed to get dataset details' });
  }
});

/**
 * GET /api/huggingface/datasets/:datasetId/files
 * Obtiene archivos de un dataset
 */
router.get('/datasets/:datasetId/files', requireJwtAuth, async (req, res) => {
  try {
    const { datasetId } = req.params;
    const { revision } = req.query;

    const result = await hfService.getDatasetFiles(
      decodeURIComponent(datasetId),
      revision || 'main',
    );

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Dataset files failed:', error);
    res.status(500).json({ error: 'Failed to get dataset files' });
  }
});

// ============================================================================
// SPACES ENDPOINTS
// ============================================================================

/**
 * GET /api/huggingface/spaces
 * Busca Spaces
 */
router.get('/spaces', requireJwtAuth, async (req, res) => {
  try {
    const { q, filter, sort, direction, limit } = req.query;

    const result = await hfService.searchSpaces({
      query: q || '',
      filter,
      sort: sort || 'downloads',
      direction: parseInt(direction) || -1,
      limit: Math.min(parseInt(limit) || 20, 50),
    });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Search spaces failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/huggingface/spaces/:spaceId
 * Obtiene detalles de un Space
 */
router.get('/spaces/:spaceId', requireJwtAuth, async (req, res) => {
  try {
    const { spaceId } = req.params;
    const result = await hfService.getSpaceDetails(decodeURIComponent(spaceId));

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('[HuggingFace] Space details failed:', error);
    res.status(500).json({ error: 'Failed to get space details' });
  }
});

// ============================================================================
// STATUS ENDPOINT
// ============================================================================

/**
 * GET /api/huggingface/status
 * Verifica estado de la API
 */
router.get('/status', requireJwtAuth, async (req, res) => {
  const isConfigured = hfService.config.isConfigured();

  res.json({
    configured: isConfigured,
    hasToken: !!hfService.config.apiToken,
    tokenPrefix: hfService.config.apiToken ? `***${hfService.config.apiToken.slice(-4)}` : null,
    timeout: hfService.config.timeout,
    maxRetries: hfService.config.maxRetries,
  });
});

module.exports = router;
