'use strict';

/**
 * Face 34/56 — ModelRouter (plan §56, §57).
 *
 * Separates roles: planner, search, extractor, embedding, reranker, research,
 * verifier, synthesis, experiment. Each role resolves to a model config
 * honoring quality/latency/ram/vram/context/cost/task and LOCAL-FIRST +
 * CHEAPEST-SUFFICIENT rules. Adapter point for Ollama/LM Studio/APIs: this
 * module returns the ROUTING DECISION; execution stays in provider adapters.
 */

const { config } = require('../core/config');

const CATALOG = {
  // local-first small models for cheap tasks
  'local-small': { local: true, ram_mb: 2000, vram_mb: 2000, quality: 0.5, latency_ms: 1500, context: 8192, cost_per_1k: 0 },
  'local-mid': { local: true, ram_mb: 6000, vram_mb: 6000, quality: 0.7, latency_ms: 4000, context: 32768, cost_per_1k: 0 },
  'local-large': { local: true, ram_mb: 16000, vram_mb: 16000, quality: 0.85, latency_ms: 12000, context: 32768, cost_per_1k: 0 },
  'remote-small': { local: false, ram_mb: 0, vram_mb: 0, quality: 0.6, latency_ms: 800, context: 16384, cost_per_1k: 0.001 },
  'remote-large': { local: false, ram_mb: 0, vram_mb: 0, quality: 0.92, latency_ms: 3000, context: 200000, cost_per_1k: 0.01 },
  'embedding-local': { local: true, ram_mb: 1000, vram_mb: 1000, quality: 0.7, latency_ms: 300, context: 8192, cost_per_1k: 0 },
};

const ROLE_DEFAULTS = {
  planner: 'local-mid',
  search: 'local-small',
  extractor: 'local-small',
  embedding: 'embedding-local',
  reranker: 'local-small',
  research: 'local-mid',
  verifier: 'local-mid',
  synthesis: 'local-mid',
  experiment: 'local-large',
};

/**
 * @param {string} role
 * @param {object} opts { prefer_remote, quality_floor, max_latency_ms, vram_available_mb }
 */
function route(role, opts = {}) {
  const preferred = opts.override || process.env[`RESEARCH_OS_MODEL_${role.toUpperCase()}`] || ROLE_DEFAULTS[role];
  const model = CATALOG[preferred] || CATALOG['local-small'];

  if (opts.vram_available_mb && model.vram_mb > opts.vram_available_mb) {
    // degrade to smaller model (cheapest sufficient)
    const fallback = model === CATALOG['local-large'] ? 'local-mid' : 'local-small';
    return { role, model_id: fallback, ...CATALOG[fallback], degraded_reason: 'vram_ceiling' };
  }
  if (opts.quality_floor && model.quality < opts.quality_floor && !opts.allow_cost) {
    return { role, model_id: 'remote-large', ...CATALOG['remote-large'], degraded_reason: 'quality_floor' };
  }
  return { role, model_id: preferred, ...model };
}

function routeAll(opts = {}) {
  const out = {};
  for (const role of Object.keys(ROLE_DEFAULTS)) out[role] = route(role, opts);
  return out;
}

module.exports = { route, routeAll, CATALOG, ROLE_DEFAULTS };
