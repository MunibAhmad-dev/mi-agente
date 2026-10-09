'use strict';

/**
 * Face 25 — ComplexityRouter (plan §9).
 *
 * Classes: QUICK < STANDARD < DEEP < FORENSIC / EXPERIMENTAL.
 * Each class carries configurable source budgets and engine flags.
 */

const { config } = require('../core/config');

const MODES = {
  QUICK: {
    budget: () => config.BUDGET_SIMPLE,
    rounds: 1,
    adversarial: false,
    perspectives: 2,
    verify: false,
    experiment: false,
  },
  STANDARD: {
    budget: () => config.BUDGET_MODERATE,
    rounds: 2,
    adversarial: false,
    perspectives: 4,
    verify: true,
    experiment: false,
  },
  DEEP: {
    budget: () => config.BUDGET_COMPLEX,
    rounds: 3,
    adversarial: true,
    perspectives: 6,
    verify: true,
    experiment: false,
  },
  FORENSIC: {
    budget: () => Math.max(config.BUDGET_COMPLEX, 40),
    rounds: 4,
    adversarial: true,
    perspectives: 8,
    verify: true,
    experiment: false,
  },
  EXPERIMENTAL: {
    budget: () => config.BUDGET_COMPLEX,
    rounds: 3,
    adversarial: true,
    perspectives: 5,
    verify: true,
    experiment: true,
  },
};

function pickMode(profile) {
  if (profile.experiment_requirement === 'required') return 'EXPERIMENTAL';
  // fact-check / high-verification questions are forensic by nature:
  // they demand dependency graph + primary evidence + adversarial search.
  if (profile.verification_requirement === 'high' && profile.complexity >= 0.4) return 'FORENSIC';
  if (profile.complexity >= 0.7) return 'DEEP';
  if (profile.complexity >= 0.4) return 'STANDARD';
  return 'QUICK';
}

function describe(mode) {
  const m = MODES[mode];
  if (!m) throw new Error(`unknown mode: ${mode}`);
  return {
    mode,
    source_budget: m.budget(),
    max_rounds: m.rounds,
    adversarial: m.adversarial,
    max_perspectives: m.perspectives,
    verification: m.verify,
    experimentation: m.experiment,
  };
}

/** Routing table used by tests and dashboard. */
function routingTable(profile) {
  const mode = pickMode(profile);
  return { mode, ...describe(mode) };
}

module.exports = { MODES, pickMode, describe, routingTable };
