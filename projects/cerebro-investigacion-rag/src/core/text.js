'use strict';

/**
 * core/text.js — shared text utilities used by claim extraction, dependency
 * detection, bias analysis and retrieval. Pure functions, no dependencies.
 */

const STOPWORDS = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by ' +
  'can did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just ' +
  'me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them ' +
  'then there these they this those through to too under until up very was we were what when where which while who whom why will with you your ' +
  'yours el la los las un una unos unas y o de del al en que se lo su por para con como mas pero sus ya fue son ser esta este esto ellos').split(/\s+/));

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return normalize(s).split(' ').filter(Boolean);
}

function contentWords(s) {
  return tokens(s).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Split prose into sentences (multilingual punctuation aware). */
function sentences(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const parts = t.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"“\d])/u);
  const out = [];
  for (const p of parts) {
    const s = p.trim();
    if (s.length >= 15) out.push(s);
    else if (out.length) out[out.length - 1] += ' ' + s;
    else out.push(s);
  }
  return out;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** 5-word shingles for near-duplicate detection (same_wording signals). */
function shingles(s, k = 5) {
  const t = tokens(s);
  const out = new Set();
  for (let i = 0; i + k <= t.length; i += 1) out.add(t.slice(i, i + k).join(' '));
  return out;
}

function shingleSimilarity(a, b) {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / Math.min(A.size, B.size);
}

function truncate(s, n = 160) {
  const t = String(s || '').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

module.exports = {
  STOPWORDS,
  normalize,
  tokens,
  contentWords,
  sentences,
  jaccard,
  shingles,
  shingleSimilarity,
  truncate,
  clamp01,
};
