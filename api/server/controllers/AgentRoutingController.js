/**
 * AgentRoutingController — GET/PUT de la preferencia de routing de un agente
 * (FASE 23). Solo el propietario del agente puede leer/modificar su routing.
 */

const db = require('~/models');
const AgentRoutingPreference = require('~/models/AgentRoutingPreference');
const { DEFAULTS } = require('~/server/services/AgentRouting');

const MAX_MODEL_LEN = 120;

function sanitize(body = {}) {
  return {
    mode: body.mode === 'auto' ? 'auto' : 'manual',
    tiers: {
      small: String(body.tiers?.small || '').slice(0, MAX_MODEL_LEN),
      medium: String(body.tiers?.medium || '').slice(0, MAX_MODEL_LEN),
      large: String(body.tiers?.large || '').slice(0, MAX_MODEL_LEN),
    },
  };
}

const EMPTY_METRICS = {
  total: 0,
  byTier: {},
  fallbacks: 0,
  lastRoutedModel: null,
  lastTier: null,
  lastAt: null,
};

async function getRoutingController(req, res) {
  try {
    const { agentId } = req.params;
    const agent = await db.getAgent({ id: agentId });
    if (!agent || String(agent.author ?? agent.user) !== String(req.user.id)) {
      return res.status(404).json({ success: false, error: 'Agente no encontrado' });
    }
    const doc = await AgentRoutingPreference.findOne({ agentId }).lean();
    const routing = doc
      ? {
          mode: doc.mode,
          tiers: doc.tiers || DEFAULTS.tiers,
          metrics: doc.metrics ? normalizeMetrics(doc.metrics) : EMPTY_METRICS,
        }
      : { mode: 'manual', tiers: { ...DEFAULTS.tiers }, metrics: { ...EMPTY_METRICS } };
    res.json({ success: true, routing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/** Normaliza métricas de Mongo (Map → objeto plano). */
function normalizeMetrics(metrics = {}) {
  const byTier = {};
  const raw = metrics.byTier || {};
  for (const key of Object.keys(raw)) {
    byTier[key] = raw[key];
  }
  return {
    total: metrics.total || 0,
    byTier,
    fallbacks: metrics.fallbacks || 0,
    lastRoutedModel: metrics.lastRoutedModel || null,
    lastTier: metrics.lastTier || null,
    lastAt: metrics.lastAt || null,
  };
}

async function putRoutingController(req, res) {
  try {
    const { agentId } = req.params;
    const agent = await db.getAgent({ id: agentId });
    if (!agent || String(agent.author ?? agent.user) !== String(req.user.id)) {
      return res.status(404).json({ success: false, error: 'Agente no encontrado' });
    }
    const routing = sanitize(req.body || {});
    // FASE 25: resetMetrics=true reinicia los contadores sin tocar la config.
    const update = { $set: { agentId, userId: req.user.id, ...routing } };
    if (req.body?.resetMetrics === true) {
      update.$set.metrics = EMPTY_METRICS;
    }
    await AgentRoutingPreference.updateOne({ agentId }, update, { upsert: true });
    const doc = await AgentRoutingPreference.findOne({ agentId }).lean();
    const out = {
      mode: doc?.mode ?? routing.mode,
      tiers: doc?.tiers || routing.tiers,
      metrics: doc?.metrics ? normalizeMetrics(doc.metrics) : { ...EMPTY_METRICS },
    };
    res.json({ success: true, routing: out });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { getRoutingController, putRoutingController };
