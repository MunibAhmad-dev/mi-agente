'use strict';

/**
 * Social Marketing Intelligence routes — adapter bridging the
 * social-marketing-intelligence branch into the mi-agente platform.
 *
 *   /api/social-intelligence/social/*    → social signal queries
 *   /api/social-intelligence/marketing/* → AI-CMO marketing strategy
 *   /api/social-intelligence/health      → readiness check
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();
router.use(requireJwtAuth);

// Health
router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'social-marketing-intelligence' });
});

// ── Social signal routes (lazy-load the branch router) ────────────────────

let _socialRouter = null;
function getSocialRouter() {
  if (_socialRouter) return _socialRouter;
  try {
    const socialRoute = require('~/server/services/SocialIntelligence/../../../routes/social-routes/social');
    _socialRouter = socialRoute;
  } catch {
    // Build inline minimal router that wraps the SocialIntelligence service
    const sub = express.Router();
    sub.get('/status', (req, res) => res.json({ status: 'Social Intelligence loaded', platform: 'mi-agente' }));

    sub.post('/search', async (req, res) => {
      try {
        const SI = require('~/server/services/SocialIntelligence');
        const result = await SI.search(req.body.query, req.body.options || {});
        res.json(result);
      } catch (err) {
        logger.error('[SocialIntel] search error:', err.message);
        res.status(500).json({ error: err.message });
      }
    });

    sub.get('/signals', async (req, res) => {
      try {
        const SI = require('~/server/services/SocialIntelligence');
        const result = await SI.getSignals(req.query);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    sub.get('/graph', async (req, res) => {
      try {
        const { SocialGraph } = require('~/server/services/SocialIntelligence/graph/SocialGraph');
        const graph = new SocialGraph();
        res.json(await graph.getSummary());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    _socialRouter = sub;
  }
  return _socialRouter;
}

// ── Marketing routes (AI-CMO) ─────────────────────────────────────────────

let _marketingEngines = null;
function getMarketingEngines() {
  if (_marketingEngines) return _marketingEngines;
  try {
    const StrategyEngine = require('~/server/services/SocialIntelligence/aimarketing/strategy/StrategyEngine');
    const ContentEngine = require('~/server/services/SocialIntelligence/aimarketing/content/ContentEngine');
    const CampaignEngine = require('~/server/services/SocialIntelligence/aimarketing/campaign/CampaignEngine');
    _marketingEngines = {
      strategy: new StrategyEngine(),
      content: new ContentEngine(),
      campaign: new CampaignEngine(),
    };
  } catch (err) {
    logger.error('[SocialIntel] Marketing engines init failed:', err.message);
  }
  return _marketingEngines;
}

router.post('/marketing/strategy', async (req, res) => {
  try {
    const e = getMarketingEngines();
    if (!e) return res.status(503).json({ error: 'Marketing engines not available' });
    const result = e.strategy.generateStrategy(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/marketing/content', async (req, res) => {
  try {
    const e = getMarketingEngines();
    if (!e) return res.status(503).json({ error: 'Marketing engines not available' });
    const result = e.content.generate(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/marketing/campaign', async (req, res) => {
  try {
    const e = getMarketingEngines();
    if (!e) return res.status(503).json({ error: 'Marketing engines not available' });
    const result = e.campaign.plan(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Mount social sub-router ────────────────────────────────────────────────

router.use('/social', (req, res, next) => {
  try {
    getSocialRouter()(req, res, next);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
