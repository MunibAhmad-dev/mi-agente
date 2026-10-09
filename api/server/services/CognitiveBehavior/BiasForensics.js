'use strict';

/**
 * BiasForensics — Gen B / Face 30 (deepened to 32 subpoints).
 *
 * Comprehensive ideological bias detection engine. Covers all 32 auditable
 * subpoints of the bias spec (19A.7 – 19A.26+).
 *
 * HARD RULE: BIAS ≠ FALSE.
 * Bias metrics are risk indicators only. They are NEVER fed to factuality
 * pipelines or used to judge the truth value of a claim.
 *
 * Subpoint map (numbered for traceability):
 *  1.  Loaded language detection
 *  2.  Emotional language detection
 *  3.  Sensationalism detection
 *  4.  Counterargument presence
 *  5.  Balance signal detection
 *  6.  Framing score (one-sided absolute language)
 *  7.  Language bias score (composite)
 *  8.  Selection bias score
 *  9.  Omission risk score
 * 10.  Emotional bias score
 * 11.  Overall bias score (composite of 6–10)
 * 12.  Framing profile — emphasis entities
 * 13.  Framing profile — statistical figures
 * 14.  Framing profile — terminology classification (progressive/conservative/commercial/corporate)
 * 15.  Framing profile — hidden assumption detection
 * 16.  Framing profile — counterargument label
 * 17.  Framing profile — emotional intensity
 * 18.  Cross-source omission analysis
 * 19.  Claim-level bias scoring
 * 20.  Source Information Profile (orientation, editorial bias, reliability — separated from factuality)
 * 21.  Headline vs body tone divergence
 * 22.  Quote attribution bias (who gets quoted and how often)
 * 23.  Passive voice overuse (agency obscuration)
 * 24.  Source concentration risk
 * 25.  False balance detection (equal weight to unequal claims)
 * 26.  Temporal bias (all evidence from the same era/event)
 * 27.  Geographic/cultural framing bias
 * 28.  Propaganda pattern detection
 * 29.  Confirmation bias indicator (only evidence supports one conclusion)
 * 30.  Weasel word detection ("some say", "many believe" without attribution)
 * 31.  Dehumanization language detection
 * 32.  Bias label classification (LOW / MEDIUM / HIGH / VERY_HIGH)
 */

// ── Lexicons ──────────────────────────────────────────────────────────────

const LOADED_LANGUAGE = [
  'regime', 'propaganda', 'shills', 'stooges', 'corrupt elites', 'fanatics',
  'extremists', 'puppets', 'puppet regime', 'radical', 'extremista',
  'traitor', 'traitors', 'puppet masters', 'deep state', 'globalist',
];

const EMOTIONAL = [
  'outrageous', 'devastating', 'shocking', 'horrific', 'heartbreaking',
  'scandal', 'disaster', 'escandaloso', 'terrible', 'brutal',
  'catastrophic', 'alarming', 'terrifying', 'explosive', 'bombshell',
];

const SENSATIONAL = [
  'you won', 'shocking truth', 'what they hide', 'they don\'t want',
  'exposed', 'bombshell', 'breaking:', 'última hora', 'must see',
  'you won\'t believe', 'secret revealed', 'hidden truth',
];

const COUNTERARG_MARKERS = [
  'however', 'critics say', 'on the other hand', 'skeptics',
  'opponents argue', 'sin embargo', 'por otro lado', 'no obstante',
  'despite', 'although', 'nevertheless', 'some disagree',
];

const BALANCE_MARKERS = [
  'according to', 'data show', 'study found', 'experts', 'según',
  'estudios', 'datos', 'research indicates', 'statistics show',
  'surveys suggest', 'peer-reviewed',
];

const ONE_SIDED_WORDS = [
  'only', 'always', 'never', 'every', 'all', 'solamente', 'siempre',
  'todos', 'none', 'no one', 'everyone', 'absolutely', 'completely',
];

const PROPAGANDA_PATTERNS = [
  { label: 'bandwagon',    re: /\b(everyone|everybody|all agree|majority believe|most people think)\b/i },
  { label: 'fear_appeal',  re: /\b(threat|danger|risk to|end of|destroy|crisis|emergency|alarm)\b/i },
  { label: 'false_dilemma',re: /\b(either .* or|you('re)? with us or|no middle ground|only two options)\b/i },
  { label: 'ad_hominem',   re: /\b(stupid|idiot|moron|liar|corrupt|criminal|fraud)\b/i },
  { label: 'glittering_generality', re: /\b(freedom|liberty|justice|democracy|values|integrity|honor)\b/i },
  { label: 'name_calling', re: /\b(nazi|fascist|communist|terrorist|extremist|radical)\b/i },
];

const DEHUMANIZATION = [
  'animals', 'vermin', 'parasites', 'cockroaches', 'insects', 'beasts',
  'savages', 'barbarians', 'subhuman', 'infestation', 'plague',
  'rats', 'snakes', 'wolves', 'predators',
];

const WEASEL_WORDS = [
  'some say', 'many believe', 'experts claim', 'it is said',
  'some people think', 'it is widely believed', 'many feel',
  'sources suggest', 'it is thought', 'reportedly', 'allegedly',
  'apparently', 'supposedly', 'se dice', 'dicen que',
];

const PASSIVE_VOICE_RE = /\b(was|were|is|are|be|been|being)\s+\w+ed\b/gi;

const GEOGRAPHIC_MARKERS = {
  western:   /\b(western|occidental|euroamerican|nato|transatlantic)\b/i,
  eastern:   /\b(eastern|orient|asian|asiatic|far east)\b/i,
  local:     /\b(local|regional|community|neighborhood|municipal)\b/i,
  global:    /\b(global|worldwide|international|universal|planetary)\b/i,
};

// ── Utility ────────────────────────────────────────────────────────────────

function norm(text) {
  return ' ' + (text || '').toLowerCase().replace(/[''""]/g, "'") + ' ';
}

function sentences(text) {
  return (text || '').split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
}

function wordCount(text) {
  return (text || '').split(/\s+/).filter(Boolean).length;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// ── BiasForensics class ────────────────────────────────────────────────────

class BiasForensics {
  constructor(config = {}) {
    this.config = config;
    this.stats  = { analyzed: 0, claimsScored: 0, profilesBuilt: 0 };
  }

  // ── Core article analysis (subpoints 1–11) ─────────────────────────────

  /**
   * Full article-level bias analysis covering subpoints 1–11 + 21–32.
   * @param {{ id?, content, text?, headline?, sources?, publishedAt?, author? }} doc
   * @returns {ArticleBiasReport}
   */
  analyzeArticle(doc) {
    const text  = doc.content || doc.text || '';
    const n     = norm(text);
    const sents = sentences(text);
    const wc    = wordCount(text);

    // 1. Loaded language
    const loadedHits = LOADED_LANGUAGE.filter(w => n.includes(w));

    // 2. Emotional language
    const emotionalHits = EMOTIONAL.filter(w => n.includes(w));

    // 3. Sensationalism
    const sensHits = SENSATIONAL.filter(w => n.includes(w));

    // 4. Counterarguments
    const counterHits = COUNTERARG_MARKERS.filter(w => n.includes(w));

    // 5. Balance signals
    const balanceHits = BALANCE_MARKERS.filter(w => n.includes(w));

    // 6. Framing score
    const framingHits = ONE_SIDED_WORDS.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
    const framing_bias = clamp(Math.round(framingHits.length * 12), 0, 100);

    // 7. Language bias
    const emotionalDensity = sents.length ? (emotionalHits.length + sensHits.length) / sents.length : 0;
    const language_bias = clamp(Math.round((loadedHits.length * 20 + emotionalDensity * 100) / 2), 0, 100);

    // 8. Selection bias
    const selection_bias = clamp(Math.round(Math.max(0, 60 - balanceHits.length * 15)), 0, 100);

    // 9. Omission risk
    const counterarg_penalty = counterHits.length ? 0 : 40;
    const omission_risk = clamp(counterarg_penalty + (balanceHits.length ? 0 : 20), 0, 100);

    // 10. Emotional bias
    const emotional_bias = clamp(Math.round(emotionalDensity * 220), 0, 100);

    // 11. Overall composite
    const overall_bias = Math.round((framing_bias + language_bias + selection_bias + omission_risk + emotional_bias) / 5);

    // 21. Headline vs body divergence
    const headlineDivergence = doc.headline ? this._headlineDivergence(doc.headline, text) : null;

    // 22. Quote attribution
    const quoteAttribution = this._quoteAttribution(text);

    // 23. Passive voice overuse
    const passiveVoice = this._passiveVoice(text, sents);

    // 24. Source concentration
    const sourceConcentration = this._sourceConcentration(doc.sources || []);

    // 25. False balance
    const falseBalance = this._falseBalance(text, sents, balanceHits, counterHits);

    // 26. Temporal bias
    const temporalBias = this._temporalBias(doc.publishedAt, doc.sources || []);

    // 27. Geographic framing
    const geographicFraming = this._geographicFraming(n);

    // 28. Propaganda patterns
    const propagandaPatterns = this._propagandaPatterns(text);

    // 29. Confirmation bias
    const confirmationBias = this._confirmationBias(balanceHits, counterHits, loadedHits);

    // 30. Weasel words
    const weaselWords = WEASEL_WORDS.filter(w => n.includes(w));

    // 31. Dehumanization
    const dehumanizationHits = DEHUMANIZATION.filter(w => n.includes(w));

    // 32. Bias label
    const biasLabel = this._biasLabel(overall_bias);

    this.stats.analyzed++;

    return {
      doc_id:  doc.id || null,
      metrics: {
        // subpoints 6–11
        framing_bias,
        language_bias,
        selection_bias,
        omission_risk,
        emotional_bias,
        overall_bias,
        counterarguments_present: counterHits.length > 0,
        balance_signals:          balanceHits.length,
      },
      // subpoints 1–3 (raw hits)
      loaded_hits:      loadedHits.slice(0, 5),
      emotional_hits:   emotionalHits.slice(0, 5),
      sensational_hits: sensHits.slice(0, 3),
      // subpoints 21–32
      headline_divergence:  headlineDivergence,
      quote_attribution:    quoteAttribution,
      passive_voice:        passiveVoice,
      source_concentration: sourceConcentration,
      false_balance:        falseBalance,
      temporal_bias:        temporalBias,
      geographic_framing:   geographicFraming,
      propaganda_patterns:  propagandaPatterns,
      confirmation_bias:    confirmationBias,
      weasel_words:         weaselWords.slice(0, 5),
      dehumanization_hits:  dehumanizationHits.slice(0, 5),
      bias_label:           biasLabel,
      note: 'BIAS ≠ FALSE: these are risk indicators, never truth scores',
    };
  }

  // ── Framing profile (subpoints 12–18) ─────────────────────────────────

  /**
   * Detailed framing profile for a document, with optional cross-source
   * omission analysis.
   * @param {{ id?, content, text?, headline? }} doc
   * @param {object[]} [otherDocs]  Other docs in the same collection
   */
  framingProfile(doc, otherDocs = []) {
    const text  = doc.content || doc.text || '';
    const sents = sentences(text);

    // 12. Emphasis entities
    const emphasis = this._detectEmphasis(text);

    // 13. Statistical figures (included in emphasis)

    // 14. Terminology classification
    const terminology = this._detectTerminology(text);

    // 15. Hidden assumptions
    const assumptions = sents
      .filter(s => /\b(obviously|clearly|of course|evidentemente|por supuesto|undeniably|needless to say)\b/i.test(s))
      .slice(0, 5);

    // 16. Counterarguments
    const counterarguments = /\b(however|critics|sin embargo|opponents|skeptics)\b/i.test(text) ? 'present' : 'absent';

    // 17. Emotional intensity
    const article = this.analyzeArticle(doc);
    const emotional_intensity = article.metrics.emotional_bias;

    // 18. Cross-source omission analysis
    const omissions = this._crossSourceOmissions(doc, otherDocs);

    return {
      doc_id: doc.id || null,
      emphasis,
      omissions:       omissions.slice(0, 10),
      terminology,
      assumptions,
      counterarguments,
      emotional_intensity,
    };
  }

  // ── Claim-level bias (subpoint 19) ────────────────────────────────────

  /**
   * Score the bias risk of a single claim.
   * @param {{ id, text, modality? }} claim
   * @param {object} [articleMetrics]  From analyzeArticle().metrics
   */
  claimBias(claim, articleMetrics) {
    const n = norm(claim.text);
    let bias = Math.round(articleMetrics ? articleMetrics.overall_bias * 0.3 : 15);

    if (LOADED_LANGUAGE.some(w => n.includes(w)))             bias += 35;
    if (EMOTIONAL.some(w => n.includes(w)))                   bias += 25;
    if (/\b(always|never|all|none|every)\b/i.test(n))         bias += 20;
    if (/\b(according to|según|data|study|estudio)\b/.test(n)) bias -= 15;
    if (claim.modality && claim.modality !== 'assertive')      bias -= 10;
    if (WEASEL_WORDS.some(w => n.includes(w)))                 bias += 10;

    this.stats.claimsScored++;
    return {
      claim_id:   claim.id,
      claim_bias: clamp(bias, 0, 100),
      bias_label: this._biasLabel(clamp(bias, 0, 100)),
      note:       'claim-level bias ≠ claim truth',
    };
  }

  // ── Source Information Profile (subpoint 20) ──────────────────────────

  /**
   * Build a Source Information Profile. Bias and reliability are stored
   * separately and never merged into a factuality score.
   * @param {{ id, name, politicalOrientation?, editorialBias?, reliability?, credibility? }} source
   */
  sourceInformationProfile(source) {
    if (!source || !source.id) return null;

    this.stats.profilesBuilt++;
    return {
      source_id:            source.id,
      source_name:          source.name || 'Unknown',
      political_orientation: source.politicalOrientation || null,
      editorial_bias:        source.editorialBias       || null,
      source_reliability:    source.reliability         || source.credibility || null,
      factual_confidence:    null,  // ONLY from Evidence (Face 29) — never from bias
      separation_note:       'orientation/bias stored and displayed separately from reliability and factuality (19A.21, 19A.26)',
    };
  }

  // ── Batch analysis ─────────────────────────────────────────────────────

  /**
   * Analyze a collection of documents, returning per-doc reports plus
   * cross-collection summary.
   * @param {object[]} docs
   * @returns {{ reports: object[], summary: object }}
   */
  analyzeCollection(docs) {
    const reports = docs.map(doc => this.analyzeArticle(doc));
    const avgBias = reports.length
      ? Math.round(reports.reduce((s, r) => s + r.metrics.overall_bias, 0) / reports.length)
      : 0;
    const highBias = reports.filter(r => r.metrics.overall_bias >= 60).length;

    return {
      reports,
      summary: {
        docCount:   docs.length,
        avgBias,
        highBias,
        biasLabel:  this._biasLabel(avgBias),
        note: 'BIAS ≠ FALSE',
      },
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  // 21. Headline vs body tone divergence
  _headlineDivergence(headline, body) {
    const hEm = EMOTIONAL.filter(w => norm(headline).includes(w)).length;
    const bEm = body ? EMOTIONAL.filter(w => norm(body).includes(w)).length : 0;
    const bSents = sentences(body).length || 1;
    const bodyDensity = bEm / bSents;
    const headlineDensity = hEm;   // headline is short — raw count
    const divergence = Math.abs(headlineDensity - bodyDensity * 5);
    return {
      headline_emotional_hits: hEm,
      body_emotional_density:  Math.round(bodyDensity * 100) / 100,
      divergence_score:        Math.round(clamp(divergence * 20, 0, 100)),
      high_divergence:         divergence > 2,
    };
  }

  // 22. Quote attribution
  _quoteAttribution(text) {
    const quotes = (text.match(/"[^"]{10,150}"/g) || []);
    const attributed = quotes.filter(q => /"[^"]+"\s+(said|says|stated|according|told|explained)/i.test(q + text));
    const unattributed = quotes.length - attributed.length;
    return {
      total_quotes:       quotes.length,
      attributed_quotes:  attributed.length,
      unattributed_quotes: unattributed,
      attribution_rate:   quotes.length ? Math.round(attributed.length / quotes.length * 100) : null,
    };
  }

  // 23. Passive voice overuse
  _passiveVoice(text, sents) {
    const matches = (text.match(PASSIVE_VOICE_RE) || []).length;
    const rate    = sents.length ? matches / sents.length : 0;
    return {
      passive_count: matches,
      passive_rate:  Math.round(rate * 100) / 100,
      overuse:       rate > 0.3,
    };
  }

  // 24. Source concentration
  _sourceConcentration(sources) {
    if (!sources.length) return { sources: 0, risk: 'unknown' };
    const types = {};
    for (const s of sources) types[s.type || 'unknown'] = (types[s.type || 'unknown'] || 0) + 1;
    const maxCount = Math.max(...Object.values(types));
    const concentration = maxCount / sources.length;
    return {
      sourceCount:   sources.length,
      typeBreakdown: types,
      concentration: Math.round(concentration * 100) / 100,
      risk:          concentration > 0.8 ? 'high' : concentration > 0.5 ? 'medium' : 'low',
    };
  }

  // 25. False balance
  _falseBalance(text, sents, balanceHits, counterHits) {
    const hasData      = balanceHits.length > 0;
    const hasCounter   = counterHits.length > 0;
    const bothSidesRe  = /\b(on one hand|on the other hand|both sides|proponents.*opponents|supporters.*critics)\b/i;
    const hasBothSides = bothSidesRe.test(text);
    // False balance: claims both sides are presented equally when evidence strongly favors one
    const suspectPhrases = ['some scientists believe', 'experts disagree', 'the debate continues', 'both sides have valid points'];
    const suspectHits = suspectPhrases.filter(p => norm(text).includes(p));
    return {
      has_data_balance:     hasData,
      has_counterarguments: hasCounter,
      both_sides_framing:   hasBothSides,
      suspect_phrases:      suspectHits,
      risk: suspectHits.length > 0 ? 'medium' : 'low',
    };
  }

  // 26. Temporal bias
  _temporalBias(publishedAt, sources) {
    if (!publishedAt && !sources.length) return { detectable: false };
    const dates = sources.map(s => s.publishedAt || s.date).filter(Boolean);
    if (!dates.length && publishedAt) dates.push(publishedAt);
    if (!dates.length) return { detectable: false };
    const timestamps = dates.map(d => new Date(d).getTime()).filter(t => !isNaN(t));
    if (!timestamps.length) return { detectable: false };
    const spread = (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24);
    return {
      detectable:     true,
      sourceDateSpan: Math.round(spread),
      risk:           spread < 7 ? 'high' : spread < 90 ? 'medium' : 'low',
      note:           spread < 7 ? 'All sources from a very narrow time window' : null,
    };
  }

  // 27. Geographic framing
  _geographicFraming(n) {
    const detected = {};
    for (const [label, re] of Object.entries(GEOGRAPHIC_MARKERS)) {
      if (re.test(n)) detected[label] = true;
    }
    const keys = Object.keys(detected);
    return {
      detected_frames:  keys,
      dominant_frame:   keys.length === 1 ? keys[0] : keys.length > 1 ? 'mixed' : 'none',
      single_perspective: keys.length === 1,
    };
  }

  // 28. Propaganda patterns
  _propagandaPatterns(text) {
    const detected = [];
    for (const { label, re } of PROPAGANDA_PATTERNS) {
      const match = re.exec(text);
      if (match) detected.push({ label, example: match[0] });
    }
    return detected;
  }

  // 29. Confirmation bias
  _confirmationBias(balanceHits, counterHits, loadedHits) {
    const score = loadedHits.length * 10 - balanceHits.length * 8 - counterHits.length * 8;
    const clamped = clamp(score, 0, 100);
    return {
      score:   clamped,
      risk:    clamped > 40 ? 'high' : clamped > 20 ? 'medium' : 'low',
      factors: { loaded: loadedHits.length, balance: balanceHits.length, counter: counterHits.length },
    };
  }

  // 30–31 are handled inline in analyzeArticle (weaselWords, dehumanizationHits)

  // 32. Bias label
  _biasLabel(score) {
    if (score >= 75) return 'VERY_HIGH';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
  }

  _detectEmphasis(text) {
    const out = [];
    const headline = (text.split(/\n|\.\s/)[0] || '');
    const capitalized = headline.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+\b/g) || [];
    if (capitalized.length) out.push({ what: 'lead_entities', items: capitalized.slice(0, 3) });
    const nums = (text.match(/\b\d+([.,]\d+)?%?\b/g) || []).slice(0, 5);
    if (nums.length) out.push({ what: 'figures', items: nums });
    return out;
  }

  _detectTerminology(text) {
    const n = norm(text);
    return {
      progressive_terms:  ['climate justice', 'systemic', 'equity', 'intersectional'].filter(t => n.includes(t)),
      conservative_terms: ['law and order', 'traditional values', 'free market', 'family values'].filter(t => n.includes(t)),
      commercial_terms:   ['best price', 'buy now', 'discount', 'offer', 'deal'].filter(t => n.includes(t)),
      corporate_terms:    ['innovative', 'leading provider', 'industry leader', 'solution'].filter(t => n.includes(t)),
    };
  }

  _crossSourceOmissions(doc, otherDocs) {
    const omissions = [];
    if (!otherDocs.length) return omissions;
    const others = otherDocs.filter(d => d.id !== doc.id);
    if (!others.length) return omissions;
    const entityCounts = new Map();
    for (const d of others) {
      const seen = new Set((d.content || '').match(/\b[A-Z][a-zA-Z]{4,}\b/g) || []);
      for (const e of seen) entityCounts.set(e, (entityCounts.get(e) || 0) + 1);
    }
    const present = new Set((doc.content || '').match(/\b[A-Z][a-zA-Z]{4,}\b/g) || []);
    for (const [entity, count] of entityCounts) {
      if (!present.has(entity) && count >= Math.max(1, others.length * 0.5)) {
        omissions.push({
          entity,
          classification: count >= others.length ? 'IMPORTANT_CONTEXT' : 'POSSIBLY_RELEVANT',
          present_in: count,
        });
      }
    }
    return omissions;
  }

  // ── Stats ──────────────────────────────────────────────────────────────

  getStats() {
    return { ...this.stats, subpointsImplemented: 32 };
  }
}

let _instance = null;
function getBiasForensics(config) {
  if (!_instance) _instance = new BiasForensics(config || {});
  return _instance;
}

module.exports = { BiasForensics, getBiasForensics };
