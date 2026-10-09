'use strict';

/**
 * Agent Economy routes — Face 18: Token Ledger & Metered Capabilities.
 *
 * GET  /api/economy/balance           — caller's current token balance
 * POST /api/economy/credit            — add tokens (admin)
 * POST /api/economy/debit             — deduct tokens (admin)
 * GET  /api/economy/transactions      — recent transaction log for caller
 * GET  /api/economy/stats             — global ledger stats (admin)
 * POST /api/economy/charge/:capability — charge cost for a named capability
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');

const router = express.Router();
router.use(requireJwtAuth);

const requireAdmin = requireCapability(SystemCapabilities.ACCESS_ADMIN);

let _economy = null;
function getEconomy() {
  if (!_economy) {
    const { getEconomy: get } = require('~/server/services/AgentEconomy/AgentEconomy');
    _economy = get();
  }
  return _economy;
}

function getUserId(req) {
  return req.user?.id || req.user?._id?.toString() || 'anonymous';
}

/** GET /api/economy/balance */
router.get('/balance', (req, res) => {
  try {
    const balance = getEconomy().balance(getUserId(req));
    res.json({ balance, userId: getUserId(req) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/economy/credit — admin only; body: { userId, amount, reason? } */
router.post('/credit', requireAdmin, (req, res) => {
  try {
    const { userId, amount, reason } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (typeof amount !== 'number') return res.status(400).json({ error: 'amount must be a number' });
    const tx = getEconomy().credit(userId, amount, reason);
    res.json({ success: true, transaction: tx });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** POST /api/economy/debit — admin only; body: { userId, amount, reason? } */
router.post('/debit', requireAdmin, (req, res) => {
  try {
    const { userId, amount, reason } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (typeof amount !== 'number') return res.status(400).json({ error: 'amount must be a number' });
    const tx = getEconomy().debit(userId, amount, reason);
    res.json({ success: true, transaction: tx });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** GET /api/economy/transactions — caller's own transaction history; query: { limit? } */
router.get('/transactions', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const transactions = getEconomy().getTransactions(getUserId(req), limit);
    res.json({ transactions, count: transactions.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/economy/stats — global stats (admin) */
router.get('/stats', requireAdmin, (req, res) => {
  try {
    res.json(getEconomy().getStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/economy/charge/:capability
 * Deduct the registered cost for a named capability from the caller's balance.
 * Returns null transaction if the capability is free (no cost registered).
 */
router.post('/charge/:capability', (req, res) => {
  try {
    const tx = getEconomy().chargeCapability(getUserId(req), req.params.capability);
    res.json({ success: true, charged: !!tx, transaction: tx });
  } catch (e) {
    res.status(402).json({ error: e.message });
  }
});

module.exports = router;
