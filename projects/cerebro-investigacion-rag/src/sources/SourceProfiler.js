'use strict';

/**
 * Face 28 — SourceProfiler (plan §18).
 *
 * Builds SourceProfile records: publisher, type, authority, independence,
 * originality, ownership signals, freshness. Orientation/bias metrics are
 * filled by the Face 30 BiasForensics analyzers (kept as separate fields —
 * never mixed into authority or reliability).
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');
const { truncate } = require('../core/text');

const PROFILES = () => collection('source_profiles');
const SOURCES = () => collection('sources');

const TYPE_HINTS = [
  { type: 'academic', test: (u, h) => /arxiv\.org|doi\.org|\.edu|ac\.uk|scholar|jstor|springer|nature\.com|sciencedirect/.test(u) },
  { type: 'github', test: (u) => /github\.com|gitlab\.com/.test(u) },
  { type: 'wiki', test: (u) => /wikipedia\.org|fandom\.com|wikia\.com|wiki\//.test(u) },
  { type: 'reddit', test: (u) => /reddit\.com/.test(u) },
  { type: 'forum', test: (u) => /forum|foro|board|community/.test(u) },
  { type: 'news', test: (u, h) => /news|noticias|elpais|elmundo|bbc|cnn|reuters|apnews|guardian|bloomberg|nytimes|lemonde/.test(u) },
  { type: 'manufacturer', test: (u, h) => /nvidia|amd|intel|apple|tesla|openai|anthropic|google|meta\.com|microsoft/.test(u) },
  { type: 'documentation', test: (u) => /docs?\.|documentation|readthedocs|developer\.mozilla/.test(u) },
  { type: 'video', test: (u) => /youtube\.com|youtu\.be|vimeo/.test(u) },
  { type: 'social', test: (u) => /twitter\.com|x\.com|facebook\.com|instagram|tiktok/.test(u) },
  { type: 'blog', test: (u) => /blog|medium\.com|substack\.com/.test(u) },
];

function classifyType(url, host) {
  for (const { type, test } of TYPE_HINTS) {
    try { if (test(url || '', host || '')) return type; } catch { /* keep looking */ }
  }
  return 'web';
}

/** Authority heuristics per source type (0-1). Editable per domain policy. */
function authorityFor(type, signals = {}) {
  const base = {
    academic: 0.85, documentation: 0.8, manufacturer: 0.75, github: 0.7,
    news: 0.6, wiki: 0.5, reddit: 0.35, forum: 0.35, social: 0.3,
    video: 0.4, blog: 0.4, web: 0.45,
  }[type] || 0.45;
  let a = base;
  if (signals.has_primary_data) a += 0.1;
  if (signals.cited_by_wiki) a += 0.05;
  if (signals.copied_from) a -= 0.25; // derivative copies lose authority
  return Math.max(0.05, Math.min(0.98, a));
}

/**
 * Create or update a source profile.
 * @param {object} input { url, publisher, author, fetched_via, published_at }
 */
async function profile(input) {
  const url = input.url || '';
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { host = url; }
  const type = classifyType(url, host);
  const source = await SOURCES().insert({
    source_id: input.source_id || uid('src'),
    canonical_url: url,
    host,
    publisher: input.publisher || host,
    author: input.author || null,
    type,
    fetched_via: input.fetched_via || 'http',
    access_status: input.access_status || 'OK',
    published_at: input.published_at || null,
  });

  const prof = {
    profile_id: uid('spf'),
    source_id: source.source_id,
    publisher: source.publisher,
    author: source.author,
    type,
    authority: authorityFor(type, input.signals || {}),
    historical_accuracy: null,        // learned across sessions (Face 37)
    editorial_orientation: null,      // { label, confidence, evidence[] } — Face 30
    orientation_confidence: null,
    bias: null,                       // { score, confidence, signals[] } — Face 30
    bias_confidence: null,
    citation_quality: null,
    correction_history: [],
    originality: input.signals && input.signals.copied_from ? 'derivative' : 'unknown',
    independence: null,               // set by DependencyAnalyzer
    ownership: null,
    funding: null,
    conflicts_of_interest: [],
    freshness: input.published_at ? new Date(input.published_at) : null,
    notes: [],
  };
  await PROFILES().insert(prof);
  return { source, profile: prof };
}

async function attachOrientation(sourceId, orientationResult) {
  const found = (await PROFILES().find((p) => p.source_id === sourceId))[0];
  if (!found) return null;
  return PROFILES().update(found._id, {
    editorial_orientation: orientationResult.orientation,
    orientation_confidence: orientationResult.confidence,
    bias: orientationResult.bias,
    bias_confidence: orientationResult.bias_confidence,
  });
}

async function forSource(sourceId) {
  return (await PROFILES().find((p) => p.source_id === sourceId))[0] || null;
}

module.exports = { profile, attachOrientation, forSource, classifyType, authorityFor };
