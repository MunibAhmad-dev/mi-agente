'use strict';

/**
 * ContradictionDetector — Gen B reasoning quality.
 * Detects internal contradictions in a piece of text using regex + sentence comparison.
 *
 * Contradiction types:
 *   logical   — claim A states X, a later claim states not-X
 *   temporal  — impossible timeline (e.g. event A after B but also before B)
 *   numerical — same quantity mentioned with inconsistent values
 */

// Negation words that flip the polarity of a sentence
const NEGATION_WORDS = ['not', "n't", 'never', 'no', 'neither', 'nor', 'without', 'cannot', "can't", 'impossible'];

// Absolute words that are easy to contradict
const ABSOLUTE_WORDS = ['always', 'never', 'all', 'none', 'every', 'no one', 'everybody', 'nobody'];

function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

function normalizeSentence(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function hasNegation(sentence) {
  const n = normalizeSentence(sentence);
  return NEGATION_WORDS.some((word) => {
    const re = new RegExp(`\\b${word.replace(/'/g, "'")}\\b`);
    return re.test(n);
  });
}

function extractKeyWords(sentence) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'this', 'that', 'these',
    'those', 'it', 'its', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
    'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
    'again', 'further', 'then', 'once', 'and', 'but', 'or', 'so', 'yet',
    'both', 'either', 'neither', 'not',
  ]);
  return normalizeSentence(sentence)
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));
}

function sentenceSimilarity(s1, s2) {
  const kw1 = new Set(extractKeyWords(s1));
  const kw2 = extractKeyWords(s2);
  if (kw1.size === 0 || kw2.length === 0) return 0;
  const common = kw2.filter((w) => kw1.has(w)).length;
  return common / Math.max(kw1.size, kw2.length);
}

function extractNumbers(text) {
  return (text.match(/\b\d+(?:\.\d+)?(?:\s*(?:percent|%|million|billion|thousand|k|m|b))?\b/gi) || [])
    .map((n) => parseFloat(n));
}

function detectLogicalContradictions(sentences) {
  const contradictions = [];
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      const sim = sentenceSimilarity(sentences[i], sentences[j]);
      if (sim >= 0.4) {
        const negI = hasNegation(sentences[i]);
        const negJ = hasNegation(sentences[j]);
        if (negI !== negJ) {
          contradictions.push({
            claim1: sentences[i].substring(0, 120),
            claim2: sentences[j].substring(0, 120),
            type: 'logical',
          });
        }
      }
    }
  }
  return contradictions;
}

function detectTemporalContradictions(text) {
  const contradictions = [];
  // Look for before/after references to same events
  const beforeAfterRe = /(\w[\w\s]{2,30})\s+(?:before|prior to)\s+(\w[\w\s]{2,30})/gi;
  const afterBeforeRe = /(\w[\w\s]{2,30})\s+(?:after|following)\s+(\w[\w\s]{2,30})/gi;

  const beforePairs = [];
  let m;
  while ((m = beforeAfterRe.exec(text)) !== null) {
    beforePairs.push({ a: normalizeSentence(m[1]), b: normalizeSentence(m[2]) });
  }
  while ((m = afterBeforeRe.exec(text)) !== null) {
    // "A after B" means B before A
    beforePairs.push({ a: normalizeSentence(m[2]), b: normalizeSentence(m[1]) });
  }

  for (let i = 0; i < beforePairs.length; i++) {
    for (let j = i + 1; j < beforePairs.length; j++) {
      const p1 = beforePairs[i];
      const p2 = beforePairs[j];
      // Detect A before B AND B before A (cycle)
      if (
        sentenceSimilarity(p1.a, p2.b) > 0.5 &&
        sentenceSimilarity(p1.b, p2.a) > 0.5
      ) {
        contradictions.push({
          claim1: `"${p1.a}" occurs before "${p1.b}"`,
          claim2: `"${p2.a}" occurs before "${p2.b}"`,
          type: 'temporal',
        });
      }
    }
  }
  return contradictions;
}

function detectNumericalContradictions(sentences) {
  const contradictions = [];
  // Find sentences that share keywords and have different numbers
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      const sim = sentenceSimilarity(sentences[i], sentences[j]);
      if (sim >= 0.35) {
        const nums1 = extractNumbers(sentences[i]);
        const nums2 = extractNumbers(sentences[j]);
        if (nums1.length > 0 && nums2.length > 0) {
          // Same context but different numbers → potential contradiction
          const overlappingNums = nums1.filter((n) => nums2.includes(n));
          if (overlappingNums.length === 0 && nums1.length === nums2.length) {
            contradictions.push({
              claim1: sentences[i].substring(0, 120),
              claim2: sentences[j].substring(0, 120),
              type: 'numerical',
            });
          }
        }
      }
    }
  }
  return contradictions;
}

class ContradictionDetector {
  constructor() {
    this.stats = { checks: 0, contradictionsFound: 0 };
  }

  /**
   * Detect internal contradictions in the given text.
   * @param {string} text
   * @returns {{ hasContradictions: boolean, contradictions: Array<{claim1,claim2,type}>, score: number }}
   */
  detect(text) {
    try {
      if (!text || typeof text !== 'string') {
        return { hasContradictions: false, contradictions: [], score: 0 };
      }

      this.stats.checks++;
      const sentences = splitSentences(text);

      if (sentences.length < 2) {
        return { hasContradictions: false, contradictions: [], score: 0 };
      }

      const logical = detectLogicalContradictions(sentences);
      const temporal = detectTemporalContradictions(text);
      const numerical = detectNumericalContradictions(sentences);

      const all = [...logical, ...temporal, ...numerical];

      // Deduplicate
      const unique = [];
      const seen = new Set();
      for (const c of all) {
        const key = `${c.type}:${c.claim1.substring(0, 40)}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(c);
        }
      }

      if (unique.length > 0) this.stats.contradictionsFound++;

      const maxPossible = Math.max(1, sentences.length * (sentences.length - 1) / 2);
      const score = Math.min(1, unique.length / maxPossible * 10);

      return {
        hasContradictions: unique.length > 0,
        contradictions: unique,
        score: Math.round(score * 100) / 100,
      };
    } catch (err) {
      return { hasContradictions: false, contradictions: [], score: 0, error: err.message };
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getContradictionDetector() {
  if (!_instance) _instance = new ContradictionDetector();
  return _instance;
}

module.exports = { ContradictionDetector, getContradictionDetector };
