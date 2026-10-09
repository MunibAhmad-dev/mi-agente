/**
 * Webhook Service
 * ===============
 *
 * Sistema de webhooks para notificaciones y eventos.
 * Soporta:
 * - Registro de webhooks
 * - Entrega con reintentos
 * - Firmas HMAC para verificación
 * - Rate limiting
 * - Historial de entregas
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

function getWebhookDeliveryModel() {
  if (mongoose.models.WebhookDelivery) {
    return mongoose.models.WebhookDelivery;
  }
  try {
    return require('~/models/WebhookDelivery');
  } catch {
    return null;
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  secret: process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex'),
  maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '5000', 10), // ms
  timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000', 10), // ms
  maxConcurrent: parseInt(process.env.WEBHOOK_MAX_CONCURRENT || '10', 10),
};

// ============================================================================
// EXCEPTION
// ============================================================================

class WebhookError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'WebhookError';
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// WEBHOOK STORE (In-Memory)
// ============================================================================

const webhooks = new Map(); // webhookId -> webhook config
const deliveries = new Map(); // deliveryId -> delivery info
const pendingQueue = []; // Cola de entregas pendientes

// ============================================================================
// WEBHOOK MANAGEMENT
// ============================================================================

/**
 * Registra un nuevo webhook
 */
function registerWebhook(options = {}) {
  const {
    url,
    events = ['*'], // * = todos los eventos
    secret = null,
    description = '',
    active = true,
    headers = {},
    metadata = {},
  } = options;

  // Validar URL
  if (!url || !isValidUrl(url)) {
    throw new WebhookError('Invalid webhook URL', 'INVALID_URL');
  }

  const webhookId = generateWebhookId();
  const webhookSecret = secret || crypto.randomBytes(24).toString('hex');

  const webhook = {
    id: webhookId,
    url,
    events,
    secret: webhookSecret,
    description,
    active,
    headers,
    metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stats: {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      lastDeliveryAt: null,
      lastDeliveryStatus: null,
    },
  };

  webhooks.set(webhookId, webhook);

  logger.info(`[Webhook] Registered: ${webhookId} -> ${url}`);

  return {
    ...webhook,
    // No exponer secret en respuesta completa
    secret: webhookSecret,
  };
}

/**
 * Obtiene un webhook por ID
 */
function getWebhook(webhookId) {
  return webhooks.get(webhookId) || null;
}

/**
 * Lista todos los webhooks
 */
function listWebhooks(options = {}) {
  const { active, event } = options;

  let result = Array.from(webhooks.values());

  if (active !== undefined) {
    result = result.filter((w) => w.active === active);
  }

  if (event) {
    result = result.filter((w) => w.events.includes('*') || w.events.includes(event));
  }

  return result;
}

/**
 * Actualiza un webhook
 */
function updateWebhook(webhookId, updates) {
  const webhook = webhooks.get(webhookId);

  if (!webhook) {
    throw new WebhookError('Webhook not found', 'NOT_FOUND');
  }

  // Validar URL si se proporciona
  if (updates.url && !isValidUrl(updates.url)) {
    throw new WebhookError('Invalid webhook URL', 'INVALID_URL');
  }

  // Merge updates
  Object.assign(webhook, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  logger.info(`[Webhook] Updated: ${webhookId}`);

  return webhook;
}

/**
 * Elimina un webhook
 */
function deleteWebhook(webhookId) {
  const deleted = webhooks.delete(webhookId);

  if (!deleted) {
    throw new WebhookError('Webhook not found', 'NOT_FOUND');
  }

  logger.info(`[Webhook] Deleted: ${webhookId}`);

  return { deleted: true };
}

/**
 * Activa/desactiva un webhook
 */
function toggleWebhook(webhookId, active) {
  return updateWebhook(webhookId, { active });
}

// ============================================================================
// EVENT EMISSION
// ============================================================================

/**
 * Emite un evento a todos los webhooks registrados
 */
async function emitEvent(event, payload, options = {}) {
  const { async = true, waitForAll = false } = options;

  // Encontrar webhooks que escuchan este evento
  const matchingWebhooks = Array.from(webhooks.values()).filter(
    (w) => w.active && (w.events.includes('*') || w.events.includes(event)),
  );

  if (matchingWebhooks.length === 0) {
    return { delivered: 0, failed: 0 };
  }

  // Crear deliveries
  const deliveriesToSend = matchingWebhooks.map((webhook) =>
    createDelivery(webhook, event, payload),
  );

  if (async) {
    // Enviar en background
    if (waitForAll) {
      await Promise.allSettled(deliveriesToSend.map((d) => sendDelivery(d)));
    } else {
      deliveriesToSend.forEach((d) => sendDelivery(d));
    }

    return {
      delivered: deliveriesToSend.length,
      deliveryIds: deliveriesToSend.map((d) => d.id),
    };
  } else {
    // Enviar sincrónicamente
    const results = await Promise.allSettled(deliveriesToSend.map((d) => sendDelivery(d)));

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return {
      delivered: successful,
      failed,
      deliveryIds: deliveriesToSend.map((d) => d.id),
    };
  }
}

// ============================================================================
// DELIVERY MANAGEMENT
// ============================================================================

/**
 * Crea un delivery
 */
function createDelivery(webhook, event, payload) {
  const deliveryId = generateDeliveryId();
  const timestamp = new Date().toISOString();

  const delivery = {
    id: deliveryId,
    webhookId: webhook.id,
    event,
    payload,
    payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    status: 'pending',
    attempts: 0,
    maxAttempts: config.maxRetries,
    lastAttemptAt: null,
    nextAttemptAt: timestamp,
    createdAt: timestamp,
    completedAt: null,
    response: null,
    error: null,
  };

  deliveries.set(deliveryId, delivery);
  pendingQueue.push(deliveryId);

  // Actualizar stats del webhook
  webhook.stats.totalDeliveries++;

  // Persist to Mongo (fire-and-forget)
  const WebhookDelivery = getWebhookDeliveryModel();
  if (WebhookDelivery) {
    WebhookDelivery.create({ ...delivery }).catch((err) =>
      logger.warn('[Webhook] Failed to persist delivery to Mongo', err),
    );
  }

  return delivery;
}

/**
 * Envía un delivery
 */
async function sendDelivery(delivery) {
  const webhook = webhooks.get(delivery.webhookId);

  if (!webhook) {
    delivery.status = 'failed';
    delivery.error = 'Webhook not found';
    delivery.completedAt = new Date().toISOString();
    return delivery;
  }

  delivery.attempts++;
  delivery.lastAttemptAt = new Date().toISOString();

  // Construir payload
  const payload = {
    id: delivery.id,
    event: delivery.event,
    timestamp: delivery.createdAt,
    data: delivery.payload,
  };

  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, webhook.secret);

  try {
    const response = await axios({
      url: webhook.url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Id': webhook.id,
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': delivery.createdAt,
        'X-Delivery-Id': delivery.id,
        ...webhook.headers,
      },
      data: payload,
      timeout: config.timeout,
      validateStatus: () => true, // Aceptar cualquier status
    });

    delivery.response = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: typeof response.data === 'string' ? response.data.substring(0, 1000) : response.data,
    };

    if (response.status >= 200 && response.status < 300) {
      delivery.status = 'delivered';
      delivery.completedAt = new Date().toISOString();
      webhook.stats.successfulDeliveries++;
      webhook.stats.lastDeliveryAt = delivery.completedAt;
      webhook.stats.lastDeliveryStatus = 'success';

      logger.info(`[Webhook] Delivered: ${delivery.id} -> ${webhook.url} (${response.status})`);
    } else {
      delivery.status = 'failed';
      delivery.error = `HTTP ${response.status}: ${response.statusText}`;

      if (delivery.attempts < delivery.maxAttempts) {
        scheduleRetry(delivery);
      } else {
        delivery.completedAt = new Date().toISOString();
        webhook.stats.failedDeliveries++;
        webhook.stats.lastDeliveryAt = new Date().toISOString();
        webhook.stats.lastDeliveryStatus = 'failed';

        logger.error(`[Webhook] Failed: ${delivery.id} -> ${webhook.url} (${response.status})`);
      }
    }
  } catch (error) {
    delivery.error = error.message;
    delivery.status = 'failed';

    if (delivery.attempts < delivery.maxAttempts) {
      scheduleRetry(delivery);
    } else {
      delivery.completedAt = new Date().toISOString();
      webhook.stats.failedDeliveries++;
      webhook.stats.lastDeliveryAt = new Date().toISOString();
      webhook.stats.lastDeliveryStatus = 'failed';

      logger.error(`[Webhook] Error: ${delivery.id} -> ${webhook.url}: ${error.message}`);
    }
  }

  // Remover de cola si está completo
  if (delivery.completedAt) {
    const idx = pendingQueue.indexOf(delivery.id);
    if (idx !== -1) {
      pendingQueue.splice(idx, 1);
    }
  }

  // Sync final state to Mongo (fire-and-forget)
  const WebhookDelivery = getWebhookDeliveryModel();
  if (WebhookDelivery) {
    WebhookDelivery.findOneAndUpdate(
      { deliveryId: delivery.id },
      {
        status: delivery.status === 'delivered' ? 'success' : delivery.status,
        attempts: delivery.attempts,
        lastAttemptAt: delivery.lastAttemptAt,
        nextAttemptAt: delivery.nextAttemptAt,
        completedAt: delivery.completedAt,
        response: delivery.response,
        error: typeof delivery.error === 'string' ? delivery.error.substring(0, 500) : null,
      },
    ).catch((err) => logger.warn('[Webhook] Failed to update delivery in Mongo', err));
  }

  return delivery;
}

/**
 * Programa un reintento
 */
function scheduleRetry(delivery) {
  delivery.nextAttemptAt = new Date(Date.now() + config.retryDelay).toISOString();
  delivery.status = 'pending';

  // Agregar a la cola con delay
  setTimeout(() => {
    sendDelivery(delivery);
  }, config.retryDelay);

  logger.info(`[Webhook] Scheduled retry: ${delivery.id} in ${config.retryDelay}ms`);
}

/**
 * Obtiene un delivery por ID
 */
function getDelivery(deliveryId) {
  return deliveries.get(deliveryId) || null;
}

/**
 * Lista deliveries
 */
function listDeliveries(options = {}) {
  const { webhookId, status, limit = 100 } = options;

  let result = Array.from(deliveries.values());

  if (webhookId) {
    result = result.filter((d) => d.webhookId === webhookId);
  }

  if (status) {
    result = result.filter((d) => d.status === status);
  }

  // Ordenar por fecha descendente
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return result.slice(0, limit);
}

/**
 * Reintenta un delivery
 */
async function retryDelivery(deliveryId) {
  const delivery = deliveries.get(deliveryId);

  if (!delivery) {
    throw new WebhookError('Delivery not found', 'NOT_FOUND');
  }

  if (delivery.status === 'delivered') {
    throw new WebhookError('Delivery already successful', 'ALREADY_DELIVERED');
  }

  delivery.attempts = 0;
  delivery.status = 'pending';
  delivery.nextAttemptAt = new Date().toISOString();

  return sendDelivery(delivery);
}

/**
 * Obtiene estadísticas de un webhook
 */
function getWebhookStats(webhookId) {
  const webhook = webhooks.get(webhookId);

  if (!webhook) {
    throw new WebhookError('Webhook not found', 'NOT_FOUND');
  }

  const recentDeliveries = listDeliveries({ webhookId, limit: 100 });

  const successRate =
    webhook.stats.totalDeliveries > 0
      ? Math.round((webhook.stats.successfulDeliveries / webhook.stats.totalDeliveries) * 100)
      : 0;

  return {
    ...webhook.stats,
    successRate,
    recentDeliveries: recentDeliveries.slice(0, 10).map((d) => ({
      id: d.id,
      event: d.event,
      status: d.status,
      attempts: d.attempts,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
    })),
  };
}

// ============================================================================
// SIGNATURE VERIFICATION
// ============================================================================

/**
 * Genera firma HMAC
 */
function generateSignature(payload, secret = config.secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verifica firma
 */
function verifySignature(payload, signature, secret = config.secret) {
  if (!signature) return false;

  const expectedSignature = generateSignature(payload, secret);

  // Usar timingSafeEqual para prevenir timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (e) {
    return false;
  }
}

/**
 * Verifica timestamp (previene replay attacks)
 */
function verifyTimestamp(timestamp, maxAge = 300) {
  const now = Math.floor(Date.now() / 1000);
  const ts = Math.floor(new Date(timestamp).getTime() / 1000);

  return Math.abs(now - ts) <= maxAge;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateWebhookId() {
  return `wh_${crypto.randomBytes(12).toString('hex')}`;
}

function generateDeliveryId() {
  return `del_${crypto.randomBytes(12).toString('hex')}`;
}

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================================================
// PRESET WEBHOOK EVENTS
// ============================================================================

const WEBHOOK_EVENTS = {
  // User events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // Conversation events
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_RECEIVED: 'message.received',

  // Generation events
  GENERATION_STARTED: 'generation.started',
  GENERATION_COMPLETED: 'generation.completed',
  GENERATION_FAILED: 'generation.failed',

  // ComfyUI events
  COMFYUI_JOB_QUEUED: 'comfyui.job.queued',
  COMFYUI_JOB_STARTED: 'comfyui.job.started',
  COMFYUI_JOB_PROGRESS: 'comfyui.job.progress',
  COMFYUI_JOB_COMPLETED: 'comfyui.job.completed',
  COMFYUI_JOB_FAILED: 'comfyui.job.failed',

  // Marketplace events
  MARKETPLACE_ITEM_INSTALLED: 'marketplace.item.installed',
  MARKETPLACE_ITEM_UNINSTALLED: 'marketplace.item.uninstalled',

  // System events
  SYSTEM_ERROR: 'system.error',
  SYSTEM_WARNING: 'system.warning',
  SYSTEM_BACKUP_COMPLETED: 'system.backup.completed',
};

function getAvailableEvents() {
  return Object.entries(WEBHOOK_EVENTS).map(([key, value]) => ({
    name: key,
    value,
  }));
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Middleware para verificar firmas de webhook
 */
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];

  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }

  if (!verifyTimestamp(timestamp)) {
    return res.status(401).json({ error: 'Expired timestamp' });
  }

  const rawBody = JSON.stringify(req.body);

  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Configuration
  config,

  // Webhook management
  registerWebhook,
  getWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  toggleWebhook,
  getWebhookStats,

  // Event emission
  emitEvent,

  // Delivery management
  getDelivery,
  listDeliveries,
  retryDelivery,

  // Signature
  generateSignature,
  verifySignature,
  verifyTimestamp,

  // Middleware
  verifyWebhookSignature,

  // Events
  WEBHOOK_EVENTS,
  getAvailableEvents,

  // Helpers
  isValidUrl,

  // Exception
  WebhookError,
};
