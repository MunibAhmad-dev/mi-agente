'use strict';

/**
 * Face 24 — ResearchProfile builder (plan §8).
 *
 * finalizes a profile: intent fields + clarification outcomes + mode +
 * budget allocation. Stored in the `research_profiles` collection.
 */

const { collection } = require('../core/store');
const { assess, apply } = require('./ClarificationEngine');

const PROFILES = () => collection('research_profiles');

/**
 * @param {object} intent - IntentAnalyzer output
 * @param {object} [opts] - { answers, mode, budget, skipClarification, deadline }
 */
async function create(question, opts = {}) {
  const { analyze } = require('./IntentAnalyzer');
  const profile = analyze(question, opts);

  const assessment = assess(profile, { skipClarification: opts.skipClarification });
  apply(profile, assessment, opts.answers || {});

  const { pickMode } = require('../router/ComplexityRouter');
  const mode = opts.mode || pickMode(profile);
  profile.mode = mode; // QUICK | STANDARD | DEEP | FORENSIC | EXPERIMENTAL
  profile.budget = opts.budget || profile.budget;

  const rec = await PROFILES().insert(profile);
  return { profile: rec, assessment };
}

function get(id) { return PROFILES().get(id); }

function update(id, patch) { return PROFILES().update(id, patch); }

module.exports = { create, get, update, collection: PROFILES };
