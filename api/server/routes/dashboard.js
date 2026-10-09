/**
 * Dashboard API Routes
 * =====================
 * /api/v1/dashboard/*
 *
 * Specialized endpoints for the dashboard UI.
 * Shares engines with social routes for consistent data.
 */

const express = require('express');
const router = express.Router();

// Share engines with social routes
let engines = null;
async function getEngines() {
  if (engines) return engines;
  try {
    // Import the same getEngines from social routes
    const socialRouter = require('./social');
    // Trigger initialization by calling a social endpoint
    // Instead, we'll lazily initialize here too
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
    const { getMetricsService } = require('../services/SocialIntelligence/metrics/MetricsService');

    const registry = getConnectorRegistry();

    const evidence = new EvidenceEngine();
    const signals = new SignalEngine(evidence);
    const normalization = new NormalizationEngine();
    const dedup = new DedupEngine();
    const intent = new IntentParser();
    const search = new SearchPlanEngine(normalization, dedup, signals, evidence);
    const audience = new AudienceEngine();
    const opportunity = new OpportunityEngine(signals, evidence);
    const sqlite = getSQLiteStore();
    const metrics = getMetricsService();

    engines = { registry, evidence, signals, normalization, dedup, intent, search, audience, opportunity, SI, sqlite, metrics };
    return engines;
  } catch (err) {
    console.error('[Dashboard Routes] Init failed:', err.message);
    return null;
  }
}

// ─── DASHBOARD OVERVIEW ──────────────────────────────────

router.get('/overview', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.json({ overview: { error: 'Not initialized' }, timestamp: new Date().toISOString() });

    const manifests = e.registry.getManifests();
    const healthy = e.registry.getHealthy();
    const signalSummary = e.signals.getSignalSummary();
    const segmentSummary = e.audience.getSegmentSummary();
    const oppSummary = e.opportunity.getOpportunitySummary();
    const persisted = e.sqlite ? e.sqlite.getStats() : null;
    const metricsData = e.metrics ? e.metrics.getMetrics() : null;

    res.json({
      overview: {
        connectors: { total: manifests.length, healthy: healthy.length, unhealthy: manifests.length - healthy.length },
        signals: { total: signalSummary.totalSignals, byType: signalSummary.byType || {} },
        evidence: { total: e.evidence.getAllEvidence().length },
        segments: { total: segmentSummary.totalSegments || 0, totalAccounts: segmentSummary.totalAccounts || 0, totalContents: segmentSummary.totalContents || 0 },
        opportunities: { total: oppSummary.totalOpportunities || 0, avgScore: oppSummary.avgScore || 0, topTypes: oppSummary.topTypes || [] },
        persisted: persisted || { contents: 0, signals: 0, evidence: 0, segments: 0, opportunities: 0 },
        performance: metricsData ? {
          totalRequests: metricsData.requests.total,
          errorRate: metricsData.requests.errorRate,
          avgResponseTime: metricsData.requests.avgResponseTime,
          memoryMB: Math.round(metricsData.memory.rss / 1024 / 1024),
        } : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD CHARTS DATA ───────────────────────────────

router.get('/charts/signals-by-type', async (req, res) => {
  try {
    const e = await getEngines();
    const summary = e ? e.signals.getSignalSummary() : { byType: {}, totalSignals: 0 };
    const chartData = Object.entries(summary.byType).map(([type, count]) => ({
      name: type.replace(/_/g, ' '),
      value: count,
      type,
    }));
    res.json({ data: chartData, total: summary.totalSignals });
  } catch (err) {
    res.json({ data: [], total: 0 });
  }
});

router.get('/charts/signals-over-time', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e || !e.sqlite) return res.json({ data: [], labels: [] });

    const log = e.sqlite.getIngestLog(100);
    const chartData = log.map(entry => ({
      time: entry.createdAt,
      query: entry.query,
      contents: entry.contentsFound,
      signals: entry.signalsFound,
      duration: entry.durationMs,
    }));
    res.json({ data: chartData, labels: chartData.map(d => d.time) });
  } catch (err) {
    res.json({ data: [], labels: [] });
  }
});

router.get('/charts/sources-distribution', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e || !e.sqlite) return res.json({ data: [] });

    const stats = e.sqlite.getStats();
    const chartData = Object.entries(stats.signalTypes).map(([type, count]) => ({
      name: type,
      value: count,
    }));
    res.json({ data: chartData });
  } catch (err) {
    res.json({ data: [] });
  }
});

router.get('/charts/opportunities-by-type', async (req, res) => {
  try {
    const e = await getEngines();
    const oppSummary = e ? e.opportunity.getOpportunitySummary() : { topTypes: [] };
    const chartData = (oppSummary.topTypes || []).map(t => ({
      name: t.type || t,
      value: t.count || 1,
    }));
    res.json({ data: chartData });
  } catch (err) {
    res.json({ data: [] });
  }
});

// ─── DASHBOARD ACTIVITY FEED ─────────────────────────────

router.get('/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const e = await getEngines();
    if (!e) return res.json({ activity: [] });

    const activities = [];

    // Recent ingest logs
    if (e.sqlite) {
      const log = e.sqlite.getIngestLog(limit);
      for (const entry of log) {
        activities.push({
          type: 'ingest',
          time: entry.createdAt,
          message: `Scanned "${entry.query}" — ${entry.contentsFound} contents, ${entry.signalsFound} signals`,
          details: { query: entry.query, duration: entry.durationMs },
        });
      }
    }

    // Recent signals
    const recentSignals = e.signals.getAllSignals().slice(0, limit);
    for (const sig of recentSignals) {
      activities.push({
        type: 'signal',
        time: sig.createdAt || new Date().toISOString(),
        message: `Detected ${sig.type} signal (confidence: ${Math.round((sig.confidence || 0) * 100)}%)`,
        details: { signalId: sig.id, source: sig.source },
      });
    }

    // Sort by time
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({ activity: activities.slice(0, limit) });
  } catch (err) {
    res.json({ activity: [] });
  }
});

// ─── DASHBOARD CONNECTORS STATUS ─────────────────────────

router.get('/connectors', async (req, res) => {
  try {
    const e = await getEngines();
    if (!e) return res.json({ connectors: [], total: 0 });

    const manifests = e.registry.getManifests();
    const connectors = manifests.map((m) => ({
      id: m.id,
      name: m.name,
      source: m.source,
      version: m.version,
      status: e.registry.getHealthy().some(h => h.id === m.id) ? 'healthy' : 'unregistered',
      capabilities: m.capabilities,
      platform_limits: m.platform_limits,
      license: m.license,
    }));

    res.json({ connectors, total: connectors.length, healthy: connectors.filter(c => c.status === 'healthy').length });
  } catch (err) {
    res.json({ connectors: [], total: 0 });
  }
});

// ─── DASHBOARD SYSTEM INFO ───────────────────────────────

router.get('/system', async (req, res) => {
  const e = await getEngines();
  const persisted = e && e.sqlite ? e.sqlite.getStats() : null;
  const metricsData = e && e.metrics ? e.metrics.getMetrics() : null;

  res.json({
    name: 'Social Marketing Intelligence',
    version: '1.0.0',
    description: 'AI-CMO OS + Universal Social Intelligence & Audience Discovery Engine',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    env: process.env.NODE_ENV || 'development',
    persisted: persisted ? {
      totalContents: persisted.contents,
      totalSignals: persisted.signals,
      totalEvidence: persisted.evidence,
      totalSegments: persisted.segments,
      totalOpportunities: persisted.opportunities,
    } : null,
    performance: metricsData ? {
      totalRequests: metricsData.requests.total,
      avgResponseTime: metricsData.requests.avgResponseTime,
      errorRate: metricsData.requests.errorRate,
    } : null,
    features: {
      connectors: true,
      signals: true,
      evidence: true,
      audience: true,
      opportunities: true,
      strategy: true,
      content: true,
      campaigns: true,
      dashboard: true,
      persistence: true,
      metrics: true,
    },
  });
});

module.exports = router;
