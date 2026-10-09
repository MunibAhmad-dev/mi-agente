'use strict';

/**
 * Face 30 — OrientationClassifier (spec 19A.1, 19A.5, 19A.13).
 *
 * MULTI-SIGNAL classification only. PROHIBITED heuristics (single keyword →
 * ideology; feminism mention → LEFT) are structurally impossible here: every
 * signal family contributes a small, capped weight, and a confident verdict
 * requires ≥2 independent signal families.
 *
 * Output: { orientation, confidence, evidence[] } — UNKNOWN when evidence is
 * insufficient. Orientation is CONTEXT, never truth (19A.14).
 */

const { normalize } = require('../core/text');

const SIGNAL_FAMILIES = {
  terminology: {
    weight: 0.8,
    terms: {
      left: ['comrade', 'solidarity', 'mutual aid', 'class struggle', 'seize the means', 'late capitalism'],
      right: ['woke ideology', 'globalist', 'cultural marxism', 'law and order', 'traditional family', 'sovereign borders'],
      center: ['bipartisan', 'balanced approach', 'fiscal responsibility'],
    },
  },
  framing: {
    weight: 0.9,
    patterns: {
      left: ['systemic oppression', 'wealth inequality', 'corporate greed', 'workers rights', 'derechos laborales'],
      right: ['government overreach', 'personal responsibility', 'free market', 'overregulation', 'libertad economica'],
      center: ['both sides', 'on the one hand', 'experts disagree'],
    },
  },
  endorsements: {
    weight: 1.0,
    patterns: {
      left: ['we endorse', 'support the party', 'vote for', 'endorse the candidate'],
      explicit: true,
    },
  },
  topic_selection: {
    weight: 0.5,
    patterns: {
      left: ['climate justice', 'housing as a right'],
      right: ['border security', 'voter fraud'],
      center: ['budget analysis'],
    },
  },
};

const LABELS = ['left', 'center-left', 'center', 'center-right', 'right', 'libertarian', 'socialist', 'green', 'conservative', 'progressive', 'nationalist', 'religious', 'populist', 'mixed', 'unknown'];

/**
 * @param {object} doc { text, publisher, author, historical: {orientations:[]} }
 * @returns { orientation, confidence, evidence[], signals_detected }
 */
function classify(doc) {
  const n = ' ' + normalize(doc.text || '') + ' ';
  const scores = { left: 0, right: 0, center: 0 };
  const evidence = [];
  const familiesActive = new Set();

  for (const [family, def] of Object.entries(SIGNAL_FAMILIES)) {
    const terms = def.terms || def.patterns;
    let famScore = 0;
    const famEvidence = [];
    for (const [label, words] of Object.entries(terms)) {
      if (label === 'explicit') continue;
      const hits = (words || []).filter((w) => n.includes(w));
      if (hits.length) {
        famScore += (label === 'center' ? 0 : label === 'left' ? 1 : -1) * Math.min(2, hits.length);
        famEvidence.push({ family, label, hits: hits.slice(0, 3) });
      }
    }
    if (famEvidence.length) {
      familiesActive.add(family);
      const capped = Math.max(-2, Math.min(2, famScore));
      scores.left += labelPositive('left') ? capped * def.weight * 0.5 : 0;
      scores.right += labelPositive('right') ? -capped * def.weight * 0.5 : 0;
      evidence.push(...famEvidence);
    }
  }

  // historical editorial behavior (publisher track record)
  if (doc.historical && Array.isArray(doc.historical.orientations) && doc.historical.orientations.length >= 3) {
    familiesActive.add('historical');
    const counts = {};
    for (const o of doc.historical.orientations) counts[o] = (counts[o] || 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (dominant[1] / doc.historical.orientations.length >= 0.7) {
      if (dominant[0] === 'left') scores.left += 2.5;
      else if (dominant[0] === 'right') scores.right += 2.5;
      else scores.center += 2;
      evidence.push({ family: 'historical', label: dominant[0], hits: [`${dominant[1]} of ${doc.historical.orientations.length} prior items`] });
    }
  }

  const total = scores.left + scores.right + scores.center;
  let orientation = 'unknown';
  let confidence = 0.1;

  const strongest = Math.max(scores.left, scores.right);
  const centerShare = total ? scores.center / total : 0;

  if (familiesActive.size >= 2 && strongest >= 1.2 && centerShare < 0.5) {
    const magnitude = Math.abs(scores.left - scores.right);
    const raw = Math.min(0.92, 0.45 + magnitude * 0.12 + (familiesActive.size - 2) * 0.08);
    confidence = Math.round(raw * 100) / 100;
    orientation = scores.left > scores.right ? 'left' : 'right';
    if (magnitude >= 2.5) orientation += '-lean-strong';
  } else if (familiesActive.size >= 2 && centerShare >= 0.5 && total > 0) {
    orientation = 'center';
    confidence = 0.6;
  } else {
    orientation = familiesActive.size ? 'unknown' : 'unknown';
    confidence = familiesActive.size >= 1 ? 0.3 : 0.1;
  }

  return {
    orientation,
    confidence,
    evidence,
    signals_detected: [...familiesActive],
    insufficient_evidence: familiesActive.size < 2,
  };
}

function labelPositive() { return true; } // positive axis weight helper

module.exports = { classify, LABELS };
