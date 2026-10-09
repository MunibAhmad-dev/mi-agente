'use strict';

/**
 * Model Discovery Routes
 * =====================
 * GET  /api/models/discover         — probe all free providers, return status + models
 * GET  /api/models/discover/:id     — probe a single provider by id
 * GET  /api/models/free-providers   — list known free providers (no probing)
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { discoverAll, FREE_PROVIDERS } = require('~/server/services/ModelDiscovery/ModelDiscoveryService');

const router = express.Router();

/** List all known free providers with metadata (no network calls). */
router.get('/free-providers', requireJwtAuth, (_req, res) => {
  const providers = FREE_PROVIDERS.map(({ id, label, requiresKey, envKey, signupUrl, knownModels, chatUrl }) => ({
    id,
    label,
    requiresKey,
    configured: requiresKey ? !!process.env[envKey] : true,
    envKey: envKey || null,
    signupUrl,
    knownModels,
    chatUrl,
  }));
  res.json({ providers });
});

/** Probe all providers (or a filtered subset via ?providers=groq,ollama). */
router.get('/discover', requireJwtAuth, async (req, res) => {
  try {
    const filter = req.query.providers
      ? req.query.providers.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const results = await discoverAll(filter);
    const reachable = results.filter((r) => r.reachable);
    const unreachable = results.filter((r) => !r.reachable);
    res.json({ results, summary: { total: results.length, reachable: reachable.length, unreachable: unreachable.length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Probe a single provider by id. */
router.get('/discover/:id', requireJwtAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const provider = FREE_PROVIDERS.find((p) => p.id === id);
    if (!provider) {
      return res.status(404).json({ error: `Unknown provider: ${id}` });
    }
    const results = await discoverAll([id]);
    res.json(results[0] || { error: 'No result' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
