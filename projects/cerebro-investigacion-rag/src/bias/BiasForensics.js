'use strict';

/**
 * Face 30 — BiasForensics (spec 19A.8–19A.12, 19A.22, 19A.25).
 *
 * Article-level bias, FramingProfile, omission classification, claim-level
 * bias, and the final SOURCE INFORMATION PROFILE. Hard rule enforced here:
 * BIAS ≠ FALSE — bias metrics are risk indicators and NEVER feed the
 * factuality path (Face 29 never reads these fields).
 */

const { uid, nowIso } = require('../core/ids');
const { normalize, sentences } = require('../core/text');
const { collection } = require('../core/store');

const ARTICLES = () => collection('article_bias');
const PROFILES = () => collection('source_information_profiles');

const LOADED_LANGUAGE = ['regime', 'propaganda', 'shills', 'stooges', 'corrupt elites', 'fanatics', 'extremists', 'puppets', 'puppet regime', 'radical', 'extremista'];
const EMOTIONAL = ['outrageous', 'devastating', 'shocking', 'horrific', 'heartbreaking', 'scandal', 'disaster', 'escandaloso', 'terrible', 'brutal'];
const SENSATIONAL = ['you won', 'shocking truth', 'what they hide', 'they don\'t want', 'exposed', 'bombshell', 'breaking:', 'úLTIMA HORA'];
const COUNTERARG_MARKERS = ['however', 'critics say', 'on the other hand', 'skeptics', 'opponents argue', 'sin embargo', 'por otro lado', 'no obstante'];
const BALANCE_MARKERS = ['according to', 'data show', 'study found', 'experts', 'según', 'estudios', 'datos'];

/** Article-level bias metrics, 0-100 each. Independent per article. */
function analyzeArticle(doc) {
  const text = doc.content || doc.text || '';
  const n = ' ' + normalize(text) + ' ';
  const sents = sentences(text);

  const loadedHits = LOADED_LANGUAGE.filter((w) => n.includes(w));
  const emotionalHits = EMOTIONAL.filter((w) => n.includes(w));
  const sensHits = SENSATIONAL.filter((w) => n.includes(w));
  const counterHits = COUNTERARG_MARKERS.filter((w) => n.includes(w));
  const balanceHits = BALANCE_MARKERS.filter((w) => n.includes(w));

  const emotionalDensity = sents.length ? (emotionalHits.length + sensHits.length) / sents.length : 0;
  const framing_bias = Math.min(100, Math.round(framingScore(n) * 100));
  const language_bias = Math.min(100, Math.round((loadedHits.length * 20 + emotionalDensity * 100) / 2));
  const selection_bias = Math.min(100, Math.round(Math.max(0, 60 - balanceHits.length * 15)));
  const emotional_bias = Math.min(100, Math.round(emotionalDensity * 220));
  const counterarg_penalty = counterHits.length ? 0 : 40;
  const omission_risk = Math.min(100, counterarg_penalty + (balanceHits.length ? 0 : 20));
  const claim_bias_placeholder = null; // filled per-claim below

  const overall = Math.round((framing_bias + language_bias + selection_bias + emotional_bias + omission_risk) / 5);

  return {
    article_bias_id: uid('ab'),
    doc_id: doc.id,
    metrics: {
      framing_bias,
      language_bias,
      selection_bias,
      omission_risk,
      emotional_bias,
      counterarguments_present: counterHits.length > 0,
      balance_signals: balanceHits.length,
    },
    loaded_hits: loadedHits.slice(0, 5),
    emotional_hits: emotionalHits.slice(0, 5),
    overall_bias: overall,
    note: 'BIAS ≠ FALSE: these are risk indicators, not truth scores',
    created_at: nowIso(),
  };
}

function framingScore(n) {
  // strong one-sided emphasis markers
  const oneSided = ['only', 'always', 'never', 'every', 'all', 'solamente', 'siempre', 'todos'];
  const hits = oneSided.filter((w) => new RegExp(`\\b${w}\\b`).test(n)).length;
  return Math.min(1, hits * 0.15);
}

/**
 * FramingProfile (19A.8) + omission classification (19A.9).
 * omissions require comparison against other docs.
 */
function framingProfile(doc, otherDocs = []) {
  const text = doc.content || doc.text || '';
  const sents = sentences(text);
  const emphasis = detectEmphasis(text);
  const terminology = detectTerminology(text);
  const assumptions = sents.filter((s) => /\b(obviously|clearly|of course|evidentemente|por supuesto)\b/i.test(s)).slice(0, 5);

  // Omissions: entities prominent in other docs but absent here.
  const omissions = [];
  if (otherDocs.length) {
    const others = otherDocs.filter((d) => d.id !== doc.id);
    const entityCounts = new Map();
    for (const d of others) {
      const seen = new Set((d.content || '').match(/\b[A-Z][a-zA-Z]{4,}\b/g) || []);
      for (const e of seen) entityCounts.set(e, (entityCounts.get(e) || 0) + 1);
    }
    const present = new Set((text.match(/\b[A-Z][a-zA-Z]{4,}\b/g) || []));
    for (const [entity, count] of entityCounts) {
      if (!present.has(entity) && count >= Math.max(1, others.length * 0.5)) {
        omissions.push({ entity, classification: count >= others.length ? 'IMPORTANT_CONTEXT' : 'POSSIBLY_RELEVANT', present_in: count });
      }
    }
  }

  return {
    framing_profile_id: uid('frm'),
    doc_id: doc.id,
    emphasis,
    omissions: omissions.slice(0, 10),
    terminology,
    assumptions,
    counterarguments: /\b(however|critics|sin embargo)\b/i.test(text) ? 'present' : 'absent',
    emotional_intensity: analyzeArticle(doc).metrics.emotional_bias,
    created_at: nowIso(),
  };
}

function detectEmphasis(text) {
  const out = [];
  const headline = (text.split(/\n|\.\s/)[0] || '');
  const capitalized = headline.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+\b/g) || [];
  if (capitalized.length) out.push({ what: 'lead_entities', items: capitalized.slice(0, 3) });
  const nums = (text.match(/\b\d+([.,]\d+)?%?\b/g) || []).slice(0, 5);
  if (nums.length) out.push({ what: 'figures', items: nums });
  return out;
}

function detectTerminology(text) {
  const n = ' ' + normalize(text) + ' ';
  return {
    progressive_terms: ['climate justice', 'systemic', 'equity'].filter((t) => n.includes(t)),
    conservative_terms: ['law and order', 'traditional values', 'free market'].filter((t) => n.includes(t)),
    fan_terms: ['canon', 'headcanon', 'best girl', 'best waifu', 'ship'].filter((t) => n.includes(t)),
    commercial_terms: ['best price', 'buy now', 'discount', 'offer', 'deal'].filter((t) => n.includes(t)),
    corporate_terms: ['innovative', 'leading provider', 'industry leader', 'solution'].filter((t) => n.includes(t)),
  };
}

/** Claim-level bias (19A.7): each claim scored independently. */
function claimBias(claim, articleMetrics) {
  const n = ' ' + normalize(claim.text) + ' ';
  let bias = Math.round(articleMetrics ? articleMetrics.overall_bias * 0.3 : 15);
  if (LOADED_LANGUAGE.some((w) => n.includes(w))) bias += 35;
  if (EMOTIONAL.some((w) => n.includes(w))) bias += 25;
  if (/\b(always|never|all|none|every)\b/i.test(n)) bias += 20;
  if (/\b(according to|según|data|study|estudio)\b/.test(n)) bias -= 15;
  if (claim.modality && claim.modality !== 'assertive') bias -= 10; // hedged = less framing
  return {
    claim_id: claim.id,
    claim_bias: Math.max(0, Math.min(100, bias)),
    note: 'claim-level bias ≠ claim truth',
  };
}

/** SOURCE INFORMATION PROFILE (19A.22) — all metrics kept separately. */
async function sourceInformationProfile(sourceId) {
  const { forSource } = require('../sources/SourceProfiler');
  const profile = await forSource(sourceId);
  if (!profile) return null;
  const rec = await PROFILES().insert({
    profile_id: uid('sip'),
    source_id: sourceId,
    political_orientation: profile.editorial_orientation,
    orientation_confidence: profile.orientation_confidence,
    editorial_bias: profile.bias,
    bias_confidence: profile.bias_confidence,
    source_reliability: profile.authority,
    factual_confidence: null, // ONLY from evidence (Face 29), never from bias
    separation_note: 'orientation/bias stored and displayed separately from reliability and factuality (19A.21, 19A.26)',
    created_at: nowIso(),
  });
  return rec;
}

module.exports = { analyzeArticle, framingProfile, claimBias, sourceInformationProfile, framingScore };
