/**
 * Social Intelligence API Routes
 * ================================
 * /api/v1/social/*
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../services/SocialIntelligence/validation/schemas');

// Lazy-load engines (initialized on first request)
let engines = null;
let initializing = null;

async function getEngines() {
  if (engines) return engines;
  if (initializing) return initializing;
  initializing = (async () => {
    try {
      const SI = require('../services/SocialIntelligence');
      const NormalizationEngine = require('../services/SocialIntelligence/normalization/NormalizationEngine');
      const EvidenceEngine = require('../services/SocialIntelligence/evidence/EvidenceEngine');
      const SignalEngine = require('../services/SocialIntelligence/signals/SignalEngine');
      const DedupEngine = require('../services/SocialIntelligence/dedup/DedupEngine');
      const IntentParser = require('../services/SocialIntelligence/intent/IntentParser');
      const SearchPlanEngine = require('../services/SocialIntelligence/search/SearchPlanEngine');
      const AudienceEngine = require('../services/SocialIntelligence/audience/AudienceEngine');
      const OpportunityEngine = require('../services/SocialIntelligence/opportunity/OpportunityEngine');
      const { getConnectorRegistry } = require('../services/SocialIntelligence/connectors/base/ConnectorRegistry');
      const { getSQLiteStore } = require('../services/SocialIntelligence/persistence/SQLiteStore');

      // Initialize connectors
      const BlueskyConnector = require('../services/SocialIntelligence/connectors/bluesky/BlueskyConnector');
      const RedditConnector = require('../services/SocialIntelligence/connectors/reddit/RedditConnector');
      const RSSConnector = require('../services/SocialIntelligence/connectors/rss/RSSConnector');
      const HackerNewsConnector = require('../services/SocialIntelligence/connectors/hackernews/HackerNewsConnector');
      const MastodonConnector = require('../services/SocialIntelligence/connectors/mastodon/MastodonConnector');
      const YouTubeConnector = require('../services/SocialIntelligence/connectors/youtube/YouTubeConnector');
      const GitHubSocialConnector = require('../services/SocialIntelligence/connectors/github/GitHubSocialConnector');

      const registry = getConnectorRegistry();
      registry.register(new BlueskyConnector());
      registry.register(new RedditConnector());
      registry.register(new RSSConnector());
      registry.register(new HackerNewsConnector());
      registry.register(new MastodonConnector());
      registry.register(new YouTubeConnector());
      registry.register(new GitHubSocialConnector());

      const evidence = new EvidenceEngine();
      const signals = new SignalEngine(evidence);
      const normalization = new NormalizationEngine();
      const dedup = new DedupEngine();
      const intent = new IntentParser();
      const search = new SearchPlanEngine(normalization, dedup, signals, evidence);
      const audience = new AudienceEngine();
      const opportunity = new OpportunityEngine(signals, evidence);

      const sqlite = getSQLiteStore();

      engines = { registry, evidence, signals, normalization, dedup, intent, search, audience, opportunity, SI, sqlite };

      // Initialize all connectors (wait for completion)
      const results = await registry.initializeAll();
      const healthy = results.filter((r) => r.status === 'ok').length;
      console.log(`[Social Routes] ${healthy}/${results.length} connectors initialized`);

      return engines;
    } catch (err) {
      console.error('[Social Routes] Failed to initialize engines:', err.message);
      initializing = null;
      return null;
    }
  })();
  return initializing;
}

// ─── SEARCH ────────────────────────────────────────────────────

router.post('/search', validate('search'), async (req, res) => {
  try {
    const { query, sources, timeRange, maxResults } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Social intelligence not initialized' });

    const plan = e.intent.createSearchPlan(query);
    if (sources) plan.sources = sources;
    if (timeRange) plan.timeRange = timeRange;
    if (maxResults) plan.maxResults = maxResults;

    const results = await e.search.executeSearchPlan(plan);
    res.json({ query, plan: { objective: plan.objective, sources: plan.sources }, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intent', validate('intent'), async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const intent = e.intent.parse(query);
    const plan = e.intent.createSearchPlan(query);
    res.json({ intent, plan });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CONNECTORS ────────────────────────────────────────────────

router.get('/connectors', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const manifests = e.registry.getManifests();
    res.json({ connectors: manifests });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/connectors/health', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const health = await e.registry.getHealthStatus();
    res.json({ health });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/connectors/:id/search', async (req, res) => {
  try {
    const { id } = req.params;
    const { query, maxResults } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const connector = e.registry.get(id);
    if (!connector) return res.status(404).json({ error: `Connector ${id} not found` });
    const results = await connector.search(query, { maxResults: maxResults || 25 });
    res.json({ source: id, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SIGNALS ───────────────────────────────────────────────────

router.get('/signals', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const { type } = req.query;
    const signals = type ? e.signals.getSignalsByType(type) : e.signals.getAllSignals();
    res.json({ signals, summary: e.signals.getSignalSummary() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── EVIDENCE ──────────────────────────────────────────────────

router.get('/evidence', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const evidence = e.evidence.getAllEvidence();
    res.json({ evidence, count: evidence.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/evidence/:id', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const ev = e.evidence.getEvidence(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Evidence not found' });
    res.json(ev);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AUDIENCE ──────────────────────────────────────────────────

router.get('/audience/segments', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const segments = e.audience.getAllSegments();
    res.json({ segments, summary: e.audience.getSegmentSummary() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── OPPORTUNITIES ─────────────────────────────────────────────

router.get('/opportunities', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const opportunities = e.opportunity.getAllOpportunities();
    res.json({ opportunities, summary: e.opportunity.getOpportunitySummary() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/opportunities/:id', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    const opp = e.opportunity.getOpportunity(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
    res.json(opp);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── INGEST (Full pipeline) ────────────────────────────────────

router.post('/ingest', validate('search'), async (req, res) => {
  try {
    const { query, sources, timeRange, maxResults } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });

    // 1. Parse intent
    const plan = e.intent.createSearchPlan(query);
    if (sources) plan.sources = sources;
    if (timeRange) plan.timeRange = timeRange;
    if (maxResults) plan.maxResults = maxResults;

    // 2. Search + Normalize + Dedup + Signals + Evidence
    const searchResults = await e.search.executeSearchPlan(plan);

    // 3. Segment audience
    const segments = e.audience.segmentAudience(searchResults.contents, searchResults.signals);

    // 4. Detect opportunities
    const opportunities = e.opportunity.detectOpportunities(searchResults.signals, searchResults.contents);

    // 5. Persist to SQLite
    const startTime = Date.now();
    if (e.sqlite) {
      try {
        e.sqlite.saveContents(searchResults.contents);
        e.sqlite.saveSignals(searchResults.signals);
        e.sqlite.saveEvidence(searchResults.evidence);
        e.sqlite.saveSegments(segments);
        e.sqlite.saveOpportunities(opportunities);
        e.sqlite.logIngest(query, plan.sources, searchResults.contents.length, searchResults.signals.length, Date.now() - startTime);
      } catch (persistErr) {
        console.error('[Ingest] Persistence error:', persistErr.message);
      }
    }

    res.json({
      query,
      intent: plan.intent,
      search: searchResults.stats,
      contents: searchResults.contents.length,
      signals: searchResults.signals.length,
      evidence: searchResults.evidence.length,
      segments: segments.length,
      opportunities: opportunities.length,
      data: {
        contents: searchResults.contents.slice(0, 20),
        signals: searchResults.signals.slice(0, 20),
        segments,
        opportunities,
        sources: searchResults.sources,
        errors: searchResults.errors,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PERSISTED DATA ─────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });
    if (!e.sqlite) return res.json({ error: 'SQLite not available' });
    res.json(e.sqlite.getStats());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/persisted/contents', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e || !e.sqlite) return res.status(503).json({ error: 'Not available' });
    const limit = parseInt(req.query.limit || '100', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const contents = e.sqlite.getContents(limit, offset);
    res.json({ contents, count: e.sqlite.countContents() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/persisted/signals', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e || !e.sqlite) return res.status(503).json({ error: 'Not available' });
    const limit = parseInt(req.query.limit || '100', 10);
    const signals = e.sqlite.getSignals(limit);
    res.json({ signals, count: e.sqlite.countSignals() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/persisted/log', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e || !e.sqlite) return res.status(503).json({ error: 'Not available' });
    const log = e.sqlite.getIngestLog(20);
    res.json({ log });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── WORKER STATUS ──────────────────────────────────────────────

router.get('/worker', async (req, res) => {
  try {
    const e = await getEngines();
    const persisted = e && e.sqlite ? e.sqlite.getStats() : null;
    res.json({
      enabled: process.env.WORKER_ENABLED === 'true',
      interval: parseInt(process.env.WORKER_INTERVAL_MS || '21600000', 10),
      queries: (process.env.WORKER_DEFAULT_QUERIES || '').split(',').filter(Boolean),
      sources: (process.env.WORKER_DEFAULT_SOURCES || 'hackernews,github,rss').split(',').filter(Boolean),
      recentIngests: persisted ? persisted.recentIngests : [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TRIGGER MANUAL INGESTION ────────────────────────────────

router.post('/worker/run', async (req, res) => {
  try {
    const { query, sources, maxResults } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    const e = await getEngines();
    if (!e) return res.status(503).json({ error: 'Not initialized' });

    const plan = e.intent.createSearchPlan(query);
    if (sources) plan.sources = sources;
    if (maxResults) plan.maxResults = maxResults;

    const start = Date.now();
    const results = await e.search.executeSearchPlan(plan);
    const segments = e.audience.segmentAudience(results.contents, results.signals);
    const opps = e.opportunity.detectOpportunities(results.signals, results.contents);

    // Persist
    if (e.sqlite) {
      e.sqlite.saveContents(results.contents);
      e.sqlite.saveSignals(results.signals);
      e.sqlite.saveEvidence(results.evidence);
      e.sqlite.saveSegments(segments);
      e.sqlite.saveOpportunities(opps);
      e.sqlite.logIngest(query, plan.sources, results.contents.length, results.signals.length, Date.now() - start);
    }

    res.json({
      query,
      contents: results.contents.length,
      signals: results.signals.length,
      evidence: results.evidence.length,
      segments: segments.length,
      opportunities: opps.length,
      duration: Date.now() - start,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── STATUS ────────────────────────────────────────────────────

router.get('/status', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.json({ status: 'not_initialized', connectors: [] });
    const manifests = e.registry.getManifests();
    const healthy = e.registry.getHealthy();
    const persisted = e.sqlite ? e.sqlite.getStats() : null;
    res.json({
      status: 'ok',
      connectors: manifests.length,
      healthyConnectors: healthy.length,
      signals: e.signals.getAllSignals().length,
      evidence: e.evidence.getAllEvidence().length,
      segments: e.audience.getAllSegments().length,
      opportunities: e.opportunity.getAllOpportunities().length,
      persisted: persisted || { contents: 0, signals: 0, evidence: 0 },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
