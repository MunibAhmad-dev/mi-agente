/**
 * RAG API Routes
 * ==============
 * Rutas para integrar RAG Service con LibreChat
 *
 * Endpoints:
 * - POST /api/rag/index - Indexa documentos
 * - GET /api/rag/search - Busca documentos
 * - GET /api/rag/collections - Lista colecciones
 * - DELETE /api/rag/documents/:id - Elimina documento
 * - DELETE /api/rag/collections/:name - Elimina colección
 * - GET /api/rag/enrich - Enriquecer prompt
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const { logger } = require('@librechat/data-schemas');
const { getRAGService } = require('../services/RAG');

/**
 * GET /api/rag/health
 * Estado del servicio RAG
 */
router.get('/health', requireJwtAuth, async (req, res) => {
  try {
    const ragService = await getRAGService();
    const stats = ragService.getStats();
    res.json({ status: 'ok', ...stats });
  } catch (error) {
    logger.error('[RAG] Health check failed', error);
    res.status(503).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/rag/index
 * Indexa documentos
 */
router.post('/index', requireJwtAuth, async (req, res) => {
  const { collection, documents } = req.body;

  if (!collection) {
    return res.status(400).json({ error: 'collection is required' });
  }

  if (!documents || !Array.isArray(documents)) {
    return res.status(400).json({ error: 'documents array is required' });
  }

  try {
    const ragService = await getRAGService();
    const result = await ragService.indexDocuments(collection, documents);
    res.json(result);
  } catch (error) {
    logger.error('[RAG] Index failed', error);
    res.status(500).json({ error: 'Indexing failed' });
  }
});

/**
 * POST /api/rag/documents
 * Indexa un documento individual
 */
router.post('/documents', requireJwtAuth, async (req, res) => {
  const { collection, id, content, metadata } = req.body;

  if (!collection || !id || !content) {
    return res.status(400).json({ error: 'collection, id, and content are required' });
  }

  try {
    const ragService = await getRAGService();
    const result = await ragService.indexDocument(collection, { id, content, metadata });
    res.json({ success: true, indexed: result.indexed });
  } catch (error) {
    logger.error('[RAG] Index document failed', error);
    res.status(500).json({ error: 'Indexing failed' });
  }
});

/**
 * GET /api/rag/search
 * Busca documentos similares
 */
router.get('/search', requireJwtAuth, async (req, res) => {
  const { q, collection, topK = 5, minSimilarity = 0.1 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'q (query) is required' });
  }

  try {
    const ragService = await getRAGService();
    const results = await ragService.search(q, {
      collection: collection || null,
      topK: parseInt(topK),
      minSimilarity: parseFloat(minSimilarity),
    });
    res.json({ results });
  } catch (error) {
    logger.error('[RAG] Search failed', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/rag/enrich
 * Enriquecer prompt con contexto RAG
 */
router.get('/enrich', requireJwtAuth, async (req, res) => {
  const { q, collection, topK = 3 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'q (query) is required' });
  }

  try {
    const ragService = await getRAGService();
    const enriched = await ragService.enrichPrompt(q, {
      collection: collection || null,
      topK: parseInt(topK),
    });
    res.json(enriched);
  } catch (error) {
    logger.error('[RAG] Enrich failed', error);
    res.status(500).json({ error: 'Enrichment failed' });
  }
});

/**
 * GET /api/rag/collections
 * Lista todas las colecciones
 */
router.get('/collections', requireJwtAuth, async (req, res) => {
  try {
    const ragService = await getRAGService();
    const collections = ragService.listCollections();
    res.json({ collections });
  } catch (error) {
    logger.error('[RAG] List collections failed', error);
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

/**
 * GET /api/rag/collections/:name
 * Estadísticas de una colección
 */
router.get('/collections/:name', requireJwtAuth, async (req, res) => {
  const { name } = req.params;

  try {
    const ragService = await getRAGService();
    const stats = ragService.getCollectionStats(name);
    if (!stats) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    res.json(stats);
  } catch (error) {
    logger.error('[RAG] Get collection stats failed', error);
    res.status(500).json({ error: 'Failed to get collection stats' });
  }
});

/**
 * DELETE /api/rag/collections/:name
 * Elimina una colección completa
 */
router.delete('/collections/:name', requireJwtAuth, async (req, res) => {
  const { name } = req.params;

  try {
    const ragService = await getRAGService();
    const deleted = await ragService.deleteCollection(name);
    res.json({ success: deleted });
  } catch (error) {
    logger.error('[RAG] Delete collection failed', error);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

/**
 * GET /api/rag/documents/:id
 * Obtiene información de un documento
 */
router.get('/documents/:id', requireJwtAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const ragService = await getRAGService();
    const doc = ragService.getDocument(id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);
  } catch (error) {
    logger.error('[RAG] Get document failed', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

/**
 * DELETE /api/rag/documents/:id
 * Elimina un documento
 */
router.delete('/documents/:id', requireJwtAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const ragService = await getRAGService();
    const deleted = await ragService.deleteDocument(id);
    res.json({ success: deleted });
  } catch (error) {
    logger.error('[RAG] Delete document failed', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * GET /api/rag/stats
 * Estadísticas globales del servicio
 */
router.get('/stats', requireJwtAuth, async (req, res) => {
  try {
    const ragService = await getRAGService();
    const stats = ragService.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('[RAG] Get stats failed', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
