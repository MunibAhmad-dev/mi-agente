'use strict';

/**
 * Webhook API routes — mounts WebhookService CRUD + delivery management.
 *
 *   GET    /api/webhooks              list webhooks
 *   POST   /api/webhooks              register a webhook
 *   GET    /api/webhooks/events       list available event types
 *   POST   /api/webhooks/emit         emit an event to matching webhooks
 *   GET    /api/webhooks/deliveries   list deliveries
 *   GET    /api/webhooks/:id          get one webhook
 *   PUT    /api/webhooks/:id          update webhook
 *   DELETE /api/webhooks/:id          delete webhook
 *   PATCH  /api/webhooks/:id/toggle   activate / deactivate
 *   GET    /api/webhooks/:id/stats    delivery stats
 *   GET    /api/webhooks/deliveries/:did      get one delivery
 *   POST   /api/webhooks/deliveries/:did/retry retry a delivery
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const {
  registerWebhook,
  getWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  toggleWebhook,
  emitEvent,
  getDelivery,
  listDeliveries,
  retryDelivery,
  getWebhookStats,
  getAvailableEvents,
  WebhookError,
} = require('~/server/services/Webhook/WebhookService');

const router = express.Router();
router.use(requireJwtAuth);
const requireAdmin = requireCapability(SystemCapabilities.ACCESS_ADMIN);

function handleError(res, err) {
  if (err instanceof WebhookError) {
    const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'ALREADY_DELIVERED' ? 409 : 400;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  return res.status(500).json({ error: err.message || 'Internal error' });
}

// ── Static paths first (before /:id) ──────────────────────────────────────

router.get('/events', (req, res) => {
  res.json({ events: getAvailableEvents() });
});

router.post('/emit', requireAdmin, async (req, res) => {
  try {
    const { event, payload, async: asyncMode = true, waitForAll = false } = req.body;
    if (!event) return res.status(400).json({ error: '"event" is required' });
    const result = await emitEvent(event, payload || {}, { async: asyncMode, waitForAll });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/deliveries', requireAdmin, (req, res) => {
  const { webhookId, status, limit } = req.query;
  res.json({ deliveries: listDeliveries({ webhookId, status, limit: limit ? Number(limit) : 100 }) });
});

// ── List / create ──────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { active, event } = req.query;
  const filter = {};
  if (active !== undefined) filter.active = active === 'true';
  if (event) filter.event = event;
  res.json({ webhooks: listWebhooks(filter) });
});

router.post('/', requireAdmin, (req, res) => {
  try {
    const webhook = registerWebhook(req.body);
    res.status(201).json(webhook);
  } catch (err) {
    handleError(res, err);
  }
});

// ── Delivery sub-resources ────────────────────────────────────────────────

router.get('/deliveries/:did', requireAdmin, (req, res) => {
  const delivery = getDelivery(req.params.did);
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
  res.json(delivery);
});

router.post('/deliveries/:did/retry', requireAdmin, async (req, res) => {
  try {
    const delivery = await retryDelivery(req.params.did);
    res.json(delivery);
  } catch (err) {
    handleError(res, err);
  }
});

// ── Single webhook CRUD ────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const webhook = getWebhook(req.params.id);
  if (!webhook) return res.status(404).json({ error: 'Webhook not found' });
  res.json(webhook);
});

router.put('/:id', requireAdmin, (req, res) => {
  try {
    res.json(updateWebhook(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/:id', requireAdmin, (req, res) => {
  try {
    res.json(deleteWebhook(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/:id/toggle', requireAdmin, (req, res) => {
  try {
    const { active } = req.body;
    if (typeof active !== 'boolean')
      return res.status(400).json({ error: '"active" (boolean) is required' });
    res.json(toggleWebhook(req.params.id, active));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:id/stats', requireAdmin, (req, res) => {
  try {
    res.json(getWebhookStats(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
