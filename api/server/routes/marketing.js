/**
 * Marketing (AI-CMO) API Routes
 * ================================
 * /api/v1/marketing/*
 */

const express = require('express');
const router = express.Router();

let engines = null;
function getEngines() {
  if (engines) return engines;
  try {
    const StrategyEngine = require('../services/SocialIntelligence/aimarketing/strategy/StrategyEngine');
    const ContentEngine = require('../services/SocialIntelligence/aimarketing/content/ContentEngine');
    const CampaignEngine = require('../services/SocialIntelligence/aimarketing/campaign/CampaignEngine');
    engines = { strategy: new StrategyEngine(), content: new ContentEngine(), campaign: new CampaignEngine() };
    return engines;
  } catch (err) { console.error('[Marketing Routes] Init failed:', err.message); return null; }
}

// ─── STRATEGIES ────────────────────────────────────────────────

router.post('/strategy', async (req, res) => {
  try {
    const { objective, audience, opportunities, signals, constraints } = req.body;
    const e = getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const strategy = e.strategy.generateStrategy({ objective, audience, opportunities: opportunities || [], signals: signals || [], constraints });
    res.json(strategy);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/strategies', async (req, res) => {
  try {
    const e = getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    res.json({ strategies: e.strategy.getAllStrategies() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CONTENT ───────────────────────────────────────────────────

router.post('/content/plan', async (req, res) => {
  try {
    const { strategyId } = req.body;
    const e = getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const strategy = e.strategy.getStrategy(strategyId);
    if (!strategy) return res.status(404).json({ error: 'Strategy not found' });
    const plan = e.content.generateContentPlan(strategy);
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/content/plans', async (req, res) => {
  try {
    const e = getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    res.json({ plans: e.content.getAllContentPlans(), calendar: e.content.getCalendar() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CAMPAIGNS ─────────────────────────────────────────────────

router.post('/campaign', async (req, res) => {
  try {
    const { name, objective, audience, channels, budget, content, startDate, endDate } = req.body;
    const e = getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const campaign = e.campaign.createCampaign({ name, objective, audience, channels, budget, content, startDate, endDate });
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/campaigns', async (req, res) => {
  try {
    const e = getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    res.json({ campaigns: e.campaign.getAllCampaigns(), summary: e.campaign.getCampaignSummary() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/campaign/:id', async (req, res) => {
  try {
    const e = getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const updated = e.campaign.updateCampaign(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Campaign not found' });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── FULL PIPELINE ─────────────────────────────────────────────

router.post('/pipeline', async (req, res) => {
  try {
    const { objective, query, sources, timeRange, maxResults, constraints } = req.body;
    const e = getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });

    // Import social engines
    const SocialEngines = require('../services/SocialIntelligence/intent/IntentParser');
    const SearchPlanEngine = require('../services/SocialIntelligence/search/SearchPlanEngine');
    const NormalizationEngine = require('../services/SocialIntelligence/normalization/NormalizationEngine');
    const DedupEngine = require('../services/SocialIntelligence/dedup/DedupEngine');
    const EvidenceEngine = require('../services/SocialIntelligence/evidence/EvidenceEngine');
    const SignalEngine = require('../services/SocialIntelligence/signals/SignalEngine');
    const AudienceEngine = require('../services/SocialIntelligence/audience/AudienceEngine');
    const OpportunityEngine = require('../services/SocialIntelligence/opportunity/OpportunityEngine');

    const evidence = new EvidenceEngine();
    const signalEngine = new SignalEngine(evidence);
    const search = new SearchPlanEngine(new NormalizationEngine(), new DedupEngine(), signalEngine, evidence);
    const intent = new SocialEngines();
    const audience = new AudienceEngine();
    const oppEngine = new OpportunityEngine(signalEngine, evidence);

    // 1. Parse intent
    const plan = intent.createSearchPlan(query || objective);
    if (sources) plan.sources = sources;
    if (timeRange) plan.timeRange = timeRange;
    if (maxResults) plan.maxResults = maxResults;

    // 2. Search
    const searchResults = await search.executeSearchPlan(plan);

    // 3. Segment audience
    const segments = audience.segmentAudience(searchResults.contents, searchResults.signals);

    // 4. Detect opportunities
    const opportunities = oppEngine.detectOpportunities(searchResults.signals, searchResults.contents);

    // 5. Generate strategy
    const strategy = e.strategy.generateStrategy({
      objective: objective || query,
      audience: { segments },
      opportunities,
      signals: searchResults.signals,
      constraints,
    });

    // 6. Generate content plan
    const contentPlan = e.content.generateContentPlan(strategy);

    res.json({
      pipeline: 'complete',
      steps: ['intent', 'search', 'normalize', 'dedup', 'signals', 'evidence', 'audience', 'opportunities', 'strategy', 'content'],
      results: {
        intent: plan.intent,
        search: searchResults.stats,
        segments: segments.length,
        opportunities: opportunities.length,
        strategy: { id: strategy.id, name: strategy.name, recommendations: strategy.recommendations },
        contentPlan: { id: contentPlan.id, items: contentPlan.items.length },
      },
      data: {
        contents: searchResults.contents.slice(0, 10),
        signals: searchResults.signals.slice(0, 10),
        segments,
        opportunities,
        strategy,
        contentPlan,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
