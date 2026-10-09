'use strict';

/**
 * core/config.js — central, overridable configuration. Every threshold that
 * the master specification marks as "configurable" lives here. Env vars win,
 * then user options, then defaults.
 */

function envNum(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const DEFAULTS = {
  // ResourceGovernor ceilings (plan §10)
  MAX_RAM_MB: envNum('RESEARCH_OS_MAX_RAM_MB', 4096),
  MAX_VRAM_MB: envNum('RESEARCH_OS_MAX_VRAM_MB', 8192),
  MAX_DISK_MB: envNum('RESEARCH_OS_MAX_DISK_MB', 10240),
  MAX_RUNTIME_MS: envNum('RESEARCH_OS_MAX_RUNTIME_MS', 30 * 60 * 1000),
  MAX_PAGES: envNum('RESEARCH_OS_MAX_PAGES', 200),
  MAX_SOURCES: envNum('RESEARCH_OS_MAX_SOURCES', 60),
  MAX_TOKENS: envNum('RESEARCH_OS_MAX_TOKENS', 400000),
  MAX_EXPERIMENTS: envNum('RESEARCH_OS_MAX_EXPERIMENTS', 4),
  MAX_CONCURRENT_JOBS: envNum('RESEARCH_OS_MAX_CONCURRENT_JOBS', 4),
  MAX_COST_USD: envNum('RESEARCH_OS_MAX_COST_USD', 5),

  // ComplexityRouter (plan §9) — source budgets per class
  BUDGET_SIMPLE: envNum('RESEARCH_OS_BUDGET_SIMPLE', 5),
  BUDGET_MODERATE: envNum('RESEARCH_OS_BUDGET_MODERATE', 30),
  BUDGET_COMPLEX: envNum('RESEARCH_OS_BUDGET_COMPLEX', 60),

  // StopEngine thresholds (plan §30)
  STOP_MIN_CONFIDENCE: envNum('RESEARCH_OS_STOP_CONFIDENCE', 0.75),
  STOP_MIN_INDEPENDENCE: envNum('RESEARCH_OS_STOP_INDEPENDENCE', 0.6),
  STOP_MIN_PRIMARY: envNum('RESEARCH_OS_STOP_PRIMARY', 0.4),
  STOP_MAX_ROUNDS: envNum('RESEARCH_OS_STOP_MAX_ROUNDS', 5),

  // Devil's advocate (plan §33)
  CHALLENGE_THRESHOLD: envNum('RESEARCH_OS_CHALLENGE_THRESHOLD', 0.8),

  // Clarification (plan §7)
  CLARIFY_AMBIGUITY_THRESHOLD: envNum('RESEARCH_OS_CLARIFY_THRESHOLD', 0.55),

  // Cascade (plan §11)
  HTTP_TIMEOUT_MS: envNum('RESEARCH_OS_HTTP_TIMEOUT_MS', 12000),
  MAX_HTML_BYTES: envNum('RESEARCH_OS_MAX_HTML_BYTES', 3 * 1024 * 1024),

  // Dedup / dependency (plan §23, §41)
  DUPLICATE_SHINGLE_SIM: envNum('RESEARCH_OS_DUP_SHINGLE_SIM', 0.85),
  SAME_WORDING_SIM: envNum('RESEARCH_OS_SAME_WORDING_SIM', 0.7),
  NEAR_DUP_JACCARD: envNum('RESEARCH_OS_NEAR_DUP_JACCARD', 0.6),

  // Retrieval (plan §35)
  RAG_TOPK: envNum('RESEARCH_OS_RAG_TOPK', 8),

  // Sandbox (plan §51)
  SANDBOX_TIMEOUT_MS: envNum('RESEARCH_OS_SANDBOX_TIMEOUT_MS', 5000),
  SANDBOX_MAX_OUTPUT: envNum('RESEARCH_OS_SANDBOX_MAX_OUTPUT', 100000),

  // Freshness half-lives in days per knowledge class (plan §42)
  FRESHNESS_DAYS: {
    STATIC: 3650,
    SLOW_CHANGING: 365,
    DYNAMIC: 30,
    VERY_DYNAMIC: 7,
    BREAKING: 2,
  },
};

const config = { ...DEFAULTS };

function set(overrides = {}) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) config[k] = v;
  }
  return config;
}

function get() {
  return config;
}

function reset() {
  for (const k of Object.keys(config)) delete config[k];
  Object.assign(config, DEFAULTS);
}

module.exports = { config, set, get, reset };
