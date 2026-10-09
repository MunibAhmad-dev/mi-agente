'use strict';

/**
 * Face 25 — ResourceGovernor (plan §10).
 *
 * Before each operation: estimate cpu/ram/vram/disk/tokens/network/runtime/cost.
 * Ceiling checks against configurable MAX_*. Strategy: CHEAPEST SUFFICIENT
 * METHOD. Accounts real usage per session for the final cost report (§111).
 */

const { config } = require('../core/config');
const { uid } = require('../core/ids');

const SESSIONS = new Map(); // session_id -> usage accumulators

function _session(sessionId) {
  if (!SESSIONS.has(sessionId)) {
    SESSIONS.set(sessionId, {
      tokens: 0, pages: 0, sources: 0, experiments: 0,
      ram_peak_mb: 0, vram_peak_mb: 0, disk_mb: 0,
      network_mb: 0, runtime_ms: 0, cost_usd: 0, jobs: 0,
    });
  }
  return SESSIONS.get(sessionId);
}

/** Rough estimates; intentionally conservative (never invent optimism). */
function estimate(plan) {
  const kind = plan.kind || 'search';
  const est = {
    kind,
    estimated_cpu: 0.1,
    estimated_ram_mb: 50,
    estimated_vram_mb: 0,
    estimated_disk_mb: 1,
    estimated_tokens: 0,
    estimated_network_mb: 0.5,
    estimated_runtime_ms: 2000,
    estimated_cost_usd: 0,
  };
  switch (kind) {
    case 'search':
      est.estimated_tokens = 200 * (plan.queries || 1);
      est.estimated_network_mb = 0.2 * (plan.queries || 1);
      est.estimated_runtime_ms = 1500 * (plan.queries || 1);
      break;
    case 'fetch':
      est.estimated_ram_mb = 120;
      est.estimated_network_mb = 1.5;
      est.estimated_disk_mb = 0.5;
      est.estimated_runtime_ms = 5000;
      break;
    case 'browser':
      est.estimated_ram_mb = 900;
      est.estimated_network_mb = 4;
      est.estimated_runtime_ms = 15000;
      break;
    case 'llm_call':
      est.estimated_tokens = plan.tokens || 2000;
      est.estimated_vram_mb = plan.vram_mb || (plan.local ? 2000 : 0);
      est.estimated_runtime_ms = plan.local ? 20000 : 6000;
      est.estimated_cost_usd = plan.local ? 0 : ((plan.tokens || 2000) / 1000) * 0.004;
      break;
    case 'experiment':
      est.estimated_ram_mb = plan.ram_mb || 2048;
      est.estimated_vram_mb = plan.vram_mb || 0;
      est.estimated_disk_mb = plan.disk_mb || 500;
      est.estimated_runtime_ms = plan.runtime_ms || 600000;
      est.estimated_cpu = 1.0;
      break;
    default:
      break;
  }
  return est;
}

/** Admit a plan: checks ceilings with already-accrued usage. Downgrades when over. */
function admit(sessionId, plan) {
  const s = _session(sessionId);
  const est = estimate(plan);
  const over = [];
  const after = {
    ram_mb: s.ram_peak_mb === 0 ? est.estimated_ram_mb : Math.max(s.ram_peak_mb, est.estimated_ram_mb),
    vram_mb: Math.max(s.vram_peak_mb, est.estimated_vram_mb),
    disk_mb: s.disk_mb + est.estimated_disk_mb,
    tokens: s.tokens + est.estimated_tokens,
    runtime_ms: s.runtime_ms + est.estimated_runtime_ms,
    cost_usd: s.cost_usd + est.estimated_cost_usd,
  };
  if (after.ram_mb > config.MAX_RAM_MB) over.push('MAX_RAM');
  if (after.vram_mb > config.MAX_VRAM_MB) over.push('MAX_VRAM');
  if (after.disk_mb > config.MAX_DISK_MB) over.push('MAX_DISK');
  if (after.tokens > config.MAX_TOKENS) over.push('MAX_TOKENS');
  if (after.runtime_ms > config.MAX_RUNTIME_MS) over.push('MAX_RUNTIME');
  if (after.cost_usd > config.MAX_COST_USD) over.push('MAX_COST');
  if (plan.kind === 'fetch' && s.pages >= config.MAX_PAGES) over.push('MAX_PAGES');
  if (plan.kind === 'search' && s.sources >= config.MAX_SOURCES) over.push('MAX_SOURCES');
  if (plan.kind === 'experiment' && s.experiments >= config.MAX_EXPERIMENTS) over.push('MAX_EXPERIMENTS');

  const admitted = over.length === 0;
  let downgrade = null;
  if (!admitted && plan.kind === 'browser') downgrade = 'http'; // cheapest sufficient method
  if (!admitted && plan.kind === 'experiment') downgrade = 'skip_experiment';
  return { admitted, violations: over, estimate: est, downgrade };
}

/** Charge real measured usage after an operation. */
function charge(sessionId, usage = {}) {
  const s = _session(sessionId);
  for (const k of ['tokens', 'pages', 'sources', 'experiments', 'network_mb', 'disk_mb', 'runtime_ms', 'cost_usd']) {
    if (usage[k]) s[k] += usage[k];
  }
  if (usage.ram_mb) s.ram_peak_mb = Math.max(s.ram_peak_mb, usage.ram_mb);
  if (usage.vram_mb) s.vram_peak_mb = Math.max(s.vram_peak_mb, usage.vram_mb);
  return { ...s };
}

function report(sessionId) {
  return { session_id: sessionId, ..._session(sessionId) };
}

function reset() { SESSIONS.clear(); }

module.exports = { estimate, admit, charge, report, reset };
