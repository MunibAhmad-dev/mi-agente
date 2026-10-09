const mongoose = require('mongoose');
const multer = require('multer');
const express = require('express');
const { sleep } = require('@librechat/agents');
const {
  isEnabled,
  deleteAgentCheckpoints,
  resolveImportMaxFileSize,
  restoreTenantContextFromReq,
  deleteAllSharedLinksWithCleanup,
  deleteConvoSharedLinksWithCleanup,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const {
  createImportLimiters,
  validateConvoAccess,
  createForkLimiters,
  configMiddleware,
} = require('~/server/middleware');
const { forkConversation, duplicateConversation } = require('~/server/utils/import/fork');
const { storage, importFileFilter } = require('~/server/routes/files/multer');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { importConversations } = require('~/server/utils/import');
const getLogStores = require('~/cache/getLogStores');
const db = require('~/models');

const assistantClients = {
  [EModelEndpoint.azureAssistants]: require('~/server/services/Endpoints/azureAssistants'),
  [EModelEndpoint.assistants]: require('~/server/services/Endpoints/assistants'),
};

const router = express.Router();
router.use(requireJwtAuth);

/* ------------------------------------------------------------------ */
/* PAPELERA 30 DÍAS (FASE 26)                                         */
/* ------------------------------------------------------------------ */
/* Al borrar un chat se guarda una copia (conversación + mensajes) en */
/* la colección `deletedconversations` (API cruda de mongoose, sin    */
/* tocar el schema upstream). Un TTL la elimina a los 30 días.        */
/*   GET    /api/convos/trash                → lista la papelera      */
/*   POST   /api/convos/trash/:id/restore    → restaurar un chat      */
/*   DELETE /api/convos/trash/:id            → borrar definitivamente */
/*   DELETE /api/convos/trash                → vaciar la papelera     */
const TRASH_TTL_DAYS = 30;
const TRASH_COLLECTION = 'deletedconversations';

function trashCollection() {
  return mongoose.connection.collection(TRASH_COLLECTION);
}

async function ensureTrashIndexes() {
  try {
    const col = trashCollection();
    await col.createIndex({ deletedAt: 1 }, { expireAfterSeconds: TRASH_TTL_DAYS * 24 * 3600 });
    await col.createIndex({ user: 1, deletedAt: -1 });
  } catch (error) {
    logger.error('[trash] no se pudieron crear índices de la papelera', error);
  }
}

/** Guarda una copia de las conversaciones + mensajes antes del borrado real. */
async function snapshotToTrash(user, filter) {
  try {
    const Conversation = mongoose.model('Conversation');
    const Message = mongoose.model('Message');
    const convos = await Conversation.find({ ...filter, user }).lean();
    if (!convos.length) {
      return;
    }
    const col = trashCollection();
    for (const convo of convos) {
      const messages = await Message.find({
        conversationId: convo.conversationId,
        user,
      }).lean();
      const now = new Date();
      await col.updateOne(
        { conversationId: convo.conversationId, user },
        {
          $set: {
            user,
            conversationId: convo.conversationId,
            title: convo.title || 'New Chat',
            endpoint: convo.endpoint || null,
            model: convo.model || null,
            createdAt: convo.createdAt || now,
            deletedAt: now,
            expiresAt: new Date(now.getTime() + TRASH_TTL_DAYS * 24 * 3600 * 1000),
            conversation: convo,
            messages,
          },
        },
        { upsert: true },
      );
    }
  } catch (error) {
    logger.error('[trash] no se pudo guardar la copia en la papelera', error);
  }
}

// Índices TTL: se crean cuando la conexión de mongoose está lista (y luego de
// forma perezosa en la primera consulta a la papelera, por si el api se recarga
// en caliente con la DB aún reconectando).
let _trashIndexEnsured = false;
async function ensureTrashIndexOnce() {
  if (_trashIndexEnsured) {
    return;
  }
  _trashIndexEnsured = true;
  await ensureTrashIndexes();
}
setTimeout(() => {
  ensureTrashIndexOnce().catch(() => {
    _trashIndexEnsured = false;
  });
}, 5000);

const isValidProjectFilter = (projectId) =>
  !projectId || projectId === 'unassigned' || /^[a-f\d]{24}$/i.test(projectId);

router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 25;
  const cursor = req.query.cursor;
  const isArchived = isEnabled(req.query.isArchived);
  const search = req.query.search ? decodeURIComponent(req.query.search) : undefined;
  const sortBy = req.query.sortBy || 'updatedAt';
  const sortDirection = req.query.sortDirection || 'desc';
  const projectId = Array.isArray(req.query.projectId)
    ? req.query.projectId[0]
    : req.query.projectId;

  if (!isValidProjectFilter(projectId)) {
    return res.status(400).json({ error: 'projectId must be a valid project id or unassigned' });
  }

  let tags;
  if (req.query.tags) {
    tags = Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags];
  }

  try {
    const result = await db.getConvosByCursor(req.user.id, {
      cursor,
      limit,
      isArchived,
      tags,
      search,
      sortBy,
      sortDirection,
      projectId,
    });
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error fetching conversations', error);
    res.status(500).json({ error: 'Error fetching conversations' });
  }
});

/* ------------------------------------------------------------------ */
/* PAPELERA — rutas (van ANTES de /:conversationId para no chocar)     */
/* ------------------------------------------------------------------ */

/** GET /api/convos/trash — lista los chats borrados (30 días). */
router.get('/trash', async (req, res) => {
  try {
    ensureTrashIndexOnce().catch(() => null);
    const items = await trashCollection()
      .find({ user: req.user.id })
      .project({
        conversationId: 1,
        title: 1,
        endpoint: 1,
        model: 1,
        createdAt: 1,
        deletedAt: 1,
        expiresAt: 1,
      })
      .sort({ deletedAt: -1 })
      .limit(200)
      .toArray();
    res.status(200).json({ trash: items, retainedForDays: TRASH_TTL_DAYS });
  } catch (error) {
    logger.error('Error fetching trash', error);
    res.status(500).json({ error: 'Error fetching trash' });
  }
});

/** POST /api/convos/trash/:conversationId/restore — restaura un chat borrado. */
router.post('/trash/:conversationId/restore', async (req, res) => {
  const { conversationId } = req.params;
  try {
    const item = await trashCollection().findOne({ conversationId, user: req.user.id });
    if (!item) {
      return res.status(404).json({ error: 'No se encontró el chat en la papelera' });
    }
    const Conversation = mongoose.model('Conversation');
    const Message = mongoose.model('Message');
    const convo = item.conversation || {};
    // Reinsertar la conversación (si ya existe, se conserva la actual).
    await Conversation.collection.updateOne(
      { conversationId, user: req.user.id },
      { $setOnInsert: convo },
      { upsert: true },
    );
    // Reinsertar los mensajes que ya no existan.
    const messages = Array.isArray(item.messages) ? item.messages : [];
    if (messages.length > 0) {
      const existing = await Message.find({ conversationId, user: req.user.id })
        .select('messageId')
        .lean();
      const existingIds = new Set(existing.map((m) => m.messageId));
      const toRestore = messages.filter((m) => !existingIds.has(m.messageId));
      if (toRestore.length > 0) {
        await Message.collection.insertMany(toRestore, { ordered: false });
      }
    }
    await trashCollection().deleteOne({ conversationId, user: req.user.id });
    res.status(200).json({ success: true, conversationId, title: item.title });
  } catch (error) {
    logger.error('Error restoring conversation', error);
    res.status(500).json({ error: 'Error restoring conversation' });
  }
});

/** DELETE /api/convos/trash/:conversationId — borra definitivamente (sin papelera). */
router.delete('/trash/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  try {
    const result = await trashCollection().deleteOne({ conversationId, user: req.user.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'No se encontró el chat en la papelera' });
    }
    // Si la conversación original sigue existiendo (borrado incompleto), purgarla.
    await db.deleteConvos(req.user.id, { conversationId }).catch(() => null);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error purging conversation', error);
    res.status(500).json({ error: 'Error purging conversation' });
  }
});

/** DELETE /api/convos/trash — vacía la papelera por completo. */
router.delete('/trash', async (req, res) => {
  try {
    const result = await trashCollection().deleteMany({ user: req.user.id });
    res.status(200).json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    logger.error('Error emptying trash', error);
    res.status(500).json({ error: 'Error emptying trash' });
  }
});

router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convo = await db.getConvo(req.user.id, conversationId);

  if (convo) {
    res.status(200).json(convo);
  } else {
    res.status(404).end();
  }
});

router.get('/gen_title/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${conversationId}`;
  let title = await titleCache.get(key);

  if (!title) {
    // Exponential backoff: 500ms, 1s, 2s, 4s, 8s (total ~15.5s max wait)
    const delays = [500, 1000, 2000, 4000, 8000];
    for (const delay of delays) {
      await sleep(delay);
      title = await titleCache.get(key);
      if (title) {
        break;
      }
    }
  }

  if (title) {
    await titleCache.delete(key);
    res.status(200).json({ title });
  } else {
    res.status(404).json({
      message: "Title not found or method not implemented for the conversation's endpoint",
    });
  }
});

router.delete('/', configMiddleware, async (req, res) => {
  let filter = {};
  const { conversationId, source, thread_id, endpoint } = req.body?.arg ?? {};

  // Prevent deletion of all conversations
  if (!conversationId && !source && !thread_id && !endpoint) {
    return res.status(400).json({
      error: 'no parameters provided',
    });
  }

  if (conversationId) {
    filter = { conversationId };
  } else if (source === 'button') {
    return res.status(200).send('No conversationId provided');
  }

  if (
    typeof endpoint !== 'undefined' &&
    Object.prototype.propertyIsEnumerable.call(assistantClients, endpoint)
  ) {
    /** @type {{ openai: OpenAI }} */
    const { openai } = await assistantClients[endpoint].initializeClient({ req, res });
    try {
      const response = await openai.beta.threads.delete(thread_id);
      logger.debug('Deleted OpenAI thread:', response);
    } catch (error) {
      logger.error('Error deleting OpenAI thread:', error);
    }
  }

  try {
    // FASE 26: antes de borrar de verdad, guardar copia en la papelera (30 días).
    await snapshotToTrash(req.user.id, filter);
    const dbResponse = await db.deleteConvos(req.user.id, filter);
    // HITL: prune the deleted conversations' durable checkpoints — a paused run's
    // checkpoint would otherwise persist until the Mongo TTL. Never throws.
    await deleteAgentCheckpoints(
      dbResponse.conversationIds,
      req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer,
    );
    if (filter.conversationId) {
      await db.deleteToolCalls(req.user.id, filter.conversationId);
      await deleteConvoSharedLinksWithCleanup(req.user.id, filter.conversationId);
    }
    res.status(201).json({ ...dbResponse, trash: { retainedForDays: TRASH_TTL_DAYS } });
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send('Error clearing conversations');
  }
});

router.delete('/all', configMiddleware, async (req, res) => {
  try {
    // FASE 26: copia de respaldo en la papelera antes del borrado masivo.
    await snapshotToTrash(req.user.id, {});
    const dbResponse = await db.deleteConvos(req.user.id, {});
    // HITL: prune ALL the deleted conversations' durable checkpoints in one bulk pass.
    await deleteAgentCheckpoints(
      dbResponse.conversationIds,
      req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer,
    );
    await db.deleteToolCalls(req.user.id);
    await deleteAllSharedLinksWithCleanup(req.user.id);
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send('Error clearing conversations');
  }
});

/**
 * Archives or unarchives a conversation.
 * @route POST /archive
 * @param {string} req.body.arg.conversationId - The conversation ID to archive/unarchive.
 * @param {boolean} req.body.arg.isArchived - Whether to archive (true) or unarchive (false).
 * @returns {object} 200 - The updated conversation object.
 */
router.post('/archive', validateConvoAccess, async (req, res) => {
  const { conversationId, isArchived } = req.body?.arg ?? {};

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  if (typeof isArchived !== 'boolean') {
    return res.status(400).json({ error: 'isArchived must be a boolean' });
  }

  try {
    const dbResponse = await db.saveConvo(
      {
        userId: req?.user?.id,
        isTemporary: req?.body?.isTemporary,
        interfaceConfig: req?.config?.interfaceConfig,
      },
      { conversationId, isArchived },
      { context: `POST /api/convos/archive ${conversationId}` },
    );
    res.status(200).json(dbResponse);
  } catch (error) {
    logger.error('Error archiving conversation', error);
    res.status(500).send('Error archiving conversation');
  }
});

router.post('/pin', validateConvoAccess, async (req, res) => {
  const { conversationId, pinned } = req.body?.arg ?? {};

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  if (pinned === undefined) {
    return res.status(400).json({ error: 'pinned is required' });
  }

  if (typeof pinned !== 'boolean') {
    return res.status(400).json({ error: 'pinned must be a boolean' });
  }

  try {
    const dbResponse = await db.saveConvo(
      { userId: req.user.id },
      { conversationId, pinned },
      { context: `POST /api/convos/pin ${conversationId}` },
    );
    res.status(200).json(dbResponse);
  } catch (error) {
    logger.error('Error pinning conversation', error);
    res.status(500).send('Error pinning conversation');
  }
});

/** Maximum allowed length for conversation titles */
const MAX_CONVO_TITLE_LENGTH = 1024;

/**
 * Updates a conversation's title.
 * @route POST /update
 * @param {string} req.body.arg.conversationId - The conversation ID to update.
 * @param {string} req.body.arg.title - The new title for the conversation.
 * @returns {object} 201 - The updated conversation object.
 */
router.post('/update', validateConvoAccess, async (req, res) => {
  const { conversationId, title } = req.body?.arg ?? {};

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  if (title === undefined) {
    return res.status(400).json({ error: 'title is required' });
  }

  if (typeof title !== 'string') {
    return res.status(400).json({ error: 'title must be a string' });
  }

  const sanitizedTitle = title.trim().slice(0, MAX_CONVO_TITLE_LENGTH);

  try {
    const dbResponse = await db.saveConvo(
      {
        userId: req?.user?.id,
        isTemporary: req?.body?.isTemporary,
        interfaceConfig: req?.config?.interfaceConfig,
      },
      { conversationId, title: sanitizedTitle },
      { context: `POST /api/convos/update ${conversationId}` },
    );
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error updating conversation', error);
    res.status(500).send('Error updating conversation');
  }
});

const { importIpLimiter, importUserLimiter } = createImportLimiters();
/** Fork and duplicate share one rate-limit budget (same "clone" operation class) */
const { forkIpLimiter, forkUserLimiter } = createForkLimiters();
const importMaxFileSize = resolveImportMaxFileSize();
const upload = multer({
  storage,
  fileFilter: importFileFilter,
  limits: { fileSize: importMaxFileSize },
});
const uploadSingle = upload.single('file');

function handleUpload(req, res, next) {
  uploadSingle(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'File exceeds the maximum allowed size' });
    }
    if (err) {
      return next(err);
    }
    next();
  });
}

/**
 * Imports a conversation from a JSON file and saves it to the database.
 * @route POST /import
 * @param {Express.Multer.File} req.file - The JSON file to import.
 * @returns {object} 201 - success response - application/json
 */
router.post(
  '/import',
  importIpLimiter,
  importUserLimiter,
  configMiddleware,
  handleUpload,
  restoreTenantContextFromReq,
  async (req, res) => {
    try {
      /* TODO: optimize to return imported conversations and add manually */
      await importConversations({
        filepath: req.file.path,
        requestUserId: req.user.id,
        userRole: req.user.role,
        interfaceConfig: req.config?.interfaceConfig,
      });
      res.status(201).json({ message: 'Conversation(s) imported successfully' });
    } catch (error) {
      logger.error('Error processing file', error);
      res.status(500).send('Error processing file');
    }
  },
);

/**
 * POST /fork
 * This route handles forking a conversation based on the TForkConvoRequest and responds with TForkConvoResponse.
 * @route POST /fork
 * @param {express.Request<{}, TForkConvoResponse, TForkConvoRequest>} req - Express request object.
 * @param {express.Response<TForkConvoResponse>} res - Express response object.
 * @returns {Promise<void>} - The response after forking the conversation.
 */
router.post('/fork', forkIpLimiter, forkUserLimiter, async (req, res) => {
  try {
    /** @type {TForkConvoRequest} */
    const { conversationId, messageId, option, splitAtTarget, latestMessageId } = req.body;
    const result = await forkConversation({
      requestUserId: req.user.id,
      originalConvoId: conversationId,
      targetMessageId: messageId,
      latestMessageId,
      records: true,
      splitAtTarget,
      option,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error forking conversation:', error);
    res.status(500).send('Error forking conversation');
  }
});

router.post('/duplicate', forkIpLimiter, forkUserLimiter, async (req, res) => {
  const { conversationId, title } = req.body;

  try {
    const result = await duplicateConversation({
      userId: req.user.id,
      conversationId,
      title,
    });
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error duplicating conversation:', error);
    res.status(500).send('Error duplicating conversation');
  }
});

module.exports = router;
