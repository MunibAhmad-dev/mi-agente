/**
 * Context Manager API Routes
 * =========================
 * Rutas para gestionar contexto de conversaciones
 *
 * Endpoints:
 * - POST /api/context/create - Crea un contexto
 * - GET /api/context/:conversationId - Obtiene contexto
 * - DELETE /api/context/:conversationId - Elimina contexto
 * - POST /api/context/:conversationId/messages - Agrega mensaje
 * - GET /api/context/:conversationId/messages - Obtiene mensajes
 * - POST /api/context/:conversationId/messages/last - Actualiza último mensaje
 * - GET /api/context/:conversationId/stats - Estadísticas
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const { logger } = require('@librechat/data-schemas');
const { getContextManagerService, WINDOWING_STRATEGY } = require('../services/ContextManager');

/**
 * GET /api/context/health
 * Estado del servicio
 */
router.get('/health', requireJwtAuth, async (req, res) => {
  try {
    const contextManager = getContextManagerService();
    const contexts = contextManager.listContexts();
    res.json({ status: 'ok', activeContexts: contexts.length });
  } catch (error) {
    logger.error('[ContextManager] Health check failed', error);
    res.status(503).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/context/create
 * Crea un nuevo contexto
 */
router.post('/create', requireJwtAuth, async (req, res) => {
  const { conversationId, maxTokens, strategy, preserveSystem, preserveLastN, summarizer } =
    req.body;

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  try {
    const contextManager = getContextManagerService();

    // Check if context already exists
    let context = contextManager.getContext(conversationId);
    if (context) {
      return res.json({ exists: true, context: contextManager.getStats(conversationId) });
    }

    // Create new context
    context = contextManager.createContext(conversationId, {
      maxTokens: maxTokens || 8192,
      strategy: strategy || WINDOWING_STRATEGY.SLIDING,
      preserveSystem: preserveSystem !== false,
      preserveLastN: preserveLastN || 2,
    });

    res.json({ created: true, context: contextManager.getStats(conversationId) });
  } catch (error) {
    logger.error('[ContextManager] Create context failed', error);
    res.status(500).json({ error: 'Failed to create context' });
  }
});

/**
 * GET /api/context/:conversationId
 * Obtiene un contexto
 */
router.get('/:conversationId', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const contextManager = getContextManagerService();
    const context = contextManager.getFullContext(conversationId);
    if (!context) {
      return res.status(404).json({ error: 'Context not found' });
    }
    res.json(context);
  } catch (error) {
    logger.error('[ContextManager] Get context failed', error);
    res.status(500).json({ error: 'Failed to get context' });
  }
});

/**
 * DELETE /api/context/:conversationId
 * Elimina un contexto
 */
router.delete('/:conversationId', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const contextManager = getContextManagerService();
    contextManager.deleteContext(conversationId);
    res.json({ success: true });
  } catch (error) {
    logger.error('[ContextManager] Delete context failed', error);
    res.status(500).json({ error: 'Failed to delete context' });
  }
});

/**
 * POST /api/context/:conversationId/messages
 * Agrega un mensaje al contexto
 */
router.post('/:conversationId/messages', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;
  const { message, tokens } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const contextManager = getContextManagerService();
    const context = contextManager.addMessage(conversationId, message, tokens);
    res.json({ success: true, stats: contextManager.getStats(conversationId) });
  } catch (error) {
    logger.error('[ContextManager] Add message failed', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

/**
 * GET /api/context/:conversationId/messages
 * Obtiene mensajes del contexto
 */
router.get('/:conversationId/messages', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const contextManager = getContextManagerService();
    const messages = contextManager.getMessages(conversationId);
    res.json({ messages, count: messages.length });
  } catch (error) {
    logger.error('[ContextManager] Get messages failed', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/context/:conversationId/messages/last
 * Actualiza el último mensaje
 */
router.post('/:conversationId/messages/last', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;
  const { update } = req.body;

  if (!update) {
    return res.status(400).json({ error: 'update is required' });
  }

  try {
    const contextManager = getContextManagerService();
    const updated = contextManager.updateLastMessage(conversationId, update);
    if (!updated) {
      return res.status(404).json({ error: 'No messages to update' });
    }
    res.json({ success: true, message: updated });
  } catch (error) {
    logger.error('[ContextManager] Update last message failed', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

/**
 * GET /api/context/:conversationId/stats
 * Estadísticas del contexto
 */
router.get('/:conversationId/stats', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const contextManager = getContextManagerService();
    const stats = contextManager.getStats(conversationId);
    if (!stats) {
      return res.status(404).json({ error: 'Context not found' });
    }
    res.json(stats);
  } catch (error) {
    logger.error('[ContextManager] Get stats failed', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * POST /api/context/:conversationId/persist
 * Persiste el contexto en Redis
 */
router.post('/:conversationId/persist', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const contextManager = getContextManagerService();
    await contextManager.persist(conversationId);
    res.json({ success: true });
  } catch (error) {
    logger.error('[ContextManager] Persist context failed', error);
    res.status(500).json({ error: 'Failed to persist context' });
  }
});

/**
 * POST /api/context/:conversationId/load
 * Carga el contexto desde Redis
 */
router.post('/:conversationId/load', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const contextManager = getContextManagerService();
    const context = await contextManager.load(conversationId);
    if (!context) {
      return res.status(404).json({ error: 'No persisted context found' });
    }
    res.json({ loaded: true, stats: contextManager.getStats(conversationId) });
  } catch (error) {
    logger.error('[ContextManager] Load context failed', error);
    res.status(500).json({ error: 'Failed to load context' });
  }
});

/**
 * POST /api/context/cleanup
 * Limpia contextos inactivos
 */
router.post('/cleanup', requireJwtAuth, async (req, res) => {
  const { maxAgeMs = 3600000 } = req.body; // 1 hora por defecto

  try {
    const contextManager = getContextManagerService();
    const cleaned = contextManager.cleanupInactiveContexts(parseInt(maxAgeMs));
    res.json({ success: true, cleanedContexts: cleaned });
  } catch (error) {
    logger.error('[ContextManager] Cleanup failed', error);
    res.status(500).json({ error: 'Failed to cleanup contexts' });
  }
});

module.exports = router;
