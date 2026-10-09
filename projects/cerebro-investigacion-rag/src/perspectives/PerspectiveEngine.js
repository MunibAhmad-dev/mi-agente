'use strict';

/**
 * Face 31 — PerspectiveEngine (plan §26).
 *
 * Adaptive perspective sets per domain. Not all perspectives are used every
 * time: the orchestrator requests the set for a profile's domain and mode.
 * Perspective sets include opposing editorial perspectives for politics/news
 * and non-political bias types elsewhere (19A.25).
 */

const PERSPECTIVES = {
  news: ['local', 'international', 'left', 'center', 'right', 'government', 'opposition', 'academic', 'legal', 'economic', 'primary'],
  politics: ['left', 'center-left', 'center', 'center-right', 'right', 'academic', 'legal', 'primary', 'international'],
  ai: ['paper', 'developer', 'manufacturer', 'benchmark', 'github', 'community', 'critic', 'practitioner'],
  programming: ['documentation', 'github', 'stack_overflow', 'community', 'practitioner'],
  hardware: ['manufacturer', 'technical_documentation', 'independent_benchmark', 'community', 'reviewer'],
  electronics: ['manufacturer', 'datasheet', 'community', 'academic'],
  science: ['paper', 'replication', 'review', 'critic', 'practitioner'],
  math: ['paper', 'textbook', 'proof_verification', 'community'],
  engineering: ['academic', 'practitioner', 'standard_body', 'manufacturer'],
  ceramics: ['academic', 'historical', 'museum', 'master_practitioner', 'technical', 'community'],
  art: ['academic', 'historical', 'museum', 'critic', 'community'],
  history: ['academic', 'primary_document', 'historiographic', 'local', 'international'],
  anime: ['official', 'original_source', 'episode', 'database', 'wiki', 'fan', 'community', 'interview'],
  fiction: ['original_source', 'database', 'wiki', 'fan', 'community'],
  games: ['developer', 'patch_notes', 'community', 'critic', 'speedrun'],
  movies: ['official', 'critic', 'audience', 'database', 'academic'],
  economy: ['official_statistics', 'academic', 'market', 'left', 'center', 'right', 'international'],
  products: ['manufacturer', 'reviewer', 'community', 'comparison_site'],
  general: ['web', 'community', 'academic', 'primary'],
};

/** Bias types to consider per domain (19A.25 — not only political). */
const BIAS_TYPES = {
  anime: ['fan_bias', 'official_bias'],
  products: ['commercial_bias', 'corporate_bias'],
  news: ['partisan_bias', 'national_bias', 'corporate_bias'],
  politics: ['partisan_bias', 'ideological_bias'],
  academic: ['institutional_bias', 'methodological_limits'],
  general: ['commercial_bias', 'community_bias', 'institutional_bias'],
};

/**
 * @param {object} profile — ResearchProfile
 * @returns { perspectives: string[], bias_types: string[] }
 */
function forProfile(profile, mode = 'STANDARD') {
  const base = PERSPECTIVES[profile.domain] || PERSPECTIVES.general;
  const cap = { QUICK: 2, STANDARD: 4, DEEP: 6, FORENSIC: 8, EXPERIMENTAL: 5 }[mode] || 4;
  let perspectives = base.slice(0, Math.max(2, cap));
  // FORENSIC always includes opposing perspectives + primary
  if (mode === 'FORENSIC') {
    for (const p of ['left', 'right', 'primary']) {
      if (base.includes(p) && !perspectives.includes(p)) perspectives.push(p);
    }
  }
  return {
    perspectives,
    bias_types: BIAS_TYPES[profile.domain] || BIAS_TYPES.general,
    full_set: base,
  };
}

/** Generate a targeted query for a perspective (multi-perspective search). */
function queryFor(perspective, question) {
  const modifiers = {
    left: 'site:theguardian.com OR site:eldiario.es OR "progressive perspective"',
    right: 'site:nypost.com OR site:abc.es OR "conservative perspective"',
    center: 'site:reuters.com OR site:apnews.com',
    primary: 'official statement OR press release OR primary document',
    academic: 'site:arxiv.org OR site:.edu OR study',
    community: 'reddit OR forum',
    manufacturer: 'official site documentation',
    database: 'database OR wiki list',
  };
  const mod = modifiers[perspective] || '';
  return mod ? `${question} ${mod}` : question;
}

module.exports = { forProfile, queryFor, PERSPECTIVES, BIAS_TYPES };
