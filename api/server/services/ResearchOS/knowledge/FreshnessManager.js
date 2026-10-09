'use strict';

/**
 * Face 36 — FreshnessManager (plan §42).
 *
 * Knowledge classes STATIC / SLOW_CHANGING / DYNAMIC / VERY_DYNAMIC /
 * BREAKING with half-lives from config. Provides freshness_score 0-1 and
 * expiry computation. Answers "is this knowledge still trustworthy by age?"
 */

const { config } = require('../core/config');
const { nowIso } = require('../core/ids');

const CLASSES = Object.keys(config.FRESHNESS_DAYS);

function classify(text, publishedAt) {
  const t = String(text || '').toLowerCase();
  if (/\b(breaking|última hora|just announced|recién)\b/.test(t)) return 'BREAKING';
  if (/\b(today|hoy|this morning|price|stock|weather)\b/.test(t)) return 'VERY_DYNAMIC';
  if (/\b(version|release|benchmark|market|news)\b/.test(t)) return 'DYNAMIC';
  if (/\b(history|historia|theorem|teorema|foundation|fundamento)\b/.test(t)) return 'STATIC';
  return 'SLOW_CHANGING';
}

function freshnessScore(knowledgeClass, publishedAt, at = Date.now()) {
  const days = config.FRESHNESS_DAYS[knowledgeClass] || 365;
  if (!publishedAt) return 0.5; // unknown age — never pretend freshness
  const ageDays = (at - Date.parse(publishedAt)) / 86400000;
  if (ageDays <= 0) return 1;
  return Math.max(0, Math.round(Math.exp(-ageDays / days) * 100) / 100);
}

function expiresAt(knowledgeClass, publishedAt) {
  const days = config.FRESHNESS_DAYS[knowledgeClass] || 365;
  const base = publishedAt ? Date.parse(publishedAt) : Date.now();
  return new Date(base + days * 86400000).toISOString();
}

function assess(text, publishedAt) {
  const knowledgeClass = classify(text, publishedAt);
  return {
    knowledge_class: knowledgeClass,
    freshness_score: freshnessScore(knowledgeClass, publishedAt),
    verified_at: nowIso(),
    expires_at: expiresAt(knowledgeClass, publishedAt),
  };
}

module.exports = { classify, freshnessScore, expiresAt, assess, CLASSES };
