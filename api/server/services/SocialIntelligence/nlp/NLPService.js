/**
 * NLPService — Lightweight NLP for text analysis
 * ================================================
 * Tokenization, stemming, stop words, keyword extraction.
 * Pure JavaScript, no external dependencies.
 */

const { createLogger } = require('../logger');

const logger = createLogger('NLPService');

// Stop words in English and Spanish
const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about',
  'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them', 'their',
  'we', 'our', 'you', 'your', 'i', 'me', 'my', 'mine', 'not', 'no', 'nor', 'but',
  'and', 'or', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'also', 'more',
  'some', 'any', 'all', 'each', 'every', 'both', 'few', 'many', 'much', 'such',
  'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how', 'here', 'there',
  // Spanish
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'es', 'son', 'está', 'están',
  'fue', 'era', 'ser', 'estar', 'haber', 'hacer', 'decir', 'ir', 'venir', 'poner',
  'qué', 'cómo', 'dónde', 'cuándo', 'cuál', 'quién', 'por qué', 'para qué',
  'de', 'en', 'a', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia',
  'yo', 'tú', 'él', 'ella', 'nosotros', 'ellos', 'ellas', 'les', 'me', 'te',
  'se', 'lo', 'la', 'le', 'nos', 'mi', 'tu', 'su', 'nuestro', 'vuestra',
  'y', 'o', 'ni', 'pero', 'sino', 'como', 'si', 'entonces', 'también',
]);

// Simple stemmer (Porter-like for English)
const SUFFIXES = [
  ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
  ['izer', 'ize'], ['ously', 'ous'], ['iveness', 'ive'], ['fulness', 'ful'],
  ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'],
  ['ness', ''], ['ment', ''], ['able', ''], ['ible', ''], ['tion', 't'],
  ['sion', 's'], ['ies', 'i'], ['ing', ''], ['ful', ''], ['ous', ''],
  ['ive', ''], ['ble', ''], ['al', ''], ['ly', ''], ['er', ''], ['ed', ''],
  ['s', ''],
];

class NLPService {
  /**
   * Tokenize text into words.
   * @param {string} text
   * @returns {string[]}
   */
  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-záéíóúñü0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  /**
   * Remove stop words.
   * @param {string[]} tokens
   * @returns {string[]}
   */
  removeStopWords(tokens) {
    return tokens.filter((t) => !STOP_WORDS.has(t));
  }

  /**
   * Stem a word.
   * @param {string} word
   * @returns {string}
   */
  stem(word) {
    if (!word || word.length < 3) return word;
    for (const [suffix, replacement] of SUFFIXES) {
      if (word.endsWith(suffix) && word.length - suffix.length + replacement.length >= 3) {
        return word.slice(0, -suffix.length) + replacement;
      }
    }
    return word;
  }

  /**
   * Extract keywords from text.
   * @param {string} text
   * @param {number} [maxKeywords=10]
   * @returns {string[]}
   */
  extractKeywords(text, maxKeywords = 10) {
    const tokens = this.tokenize(text);
    const filtered = this.removeStopWords(tokens);
    const freq = {};
    for (const token of filtered) {
      const stemmed = this.stem(token);
      freq[stemmed] = (freq[stemmed] || 0) + 1;
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  /**
   * Calculate text similarity using Jaccard index.
   * @param {string} a
   * @param {string} b
   * @returns {number} 0-1
   */
  similarity(a, b) {
    const tokensA = new Set(this.tokenize(a));
    const tokensB = new Set(this.tokenize(b));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }
    const union = tokensA.size + tokensB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Extract n-grams from text.
   * @param {string} text
   * @param {number} n
   * @returns {string[]}
   */
  ngrams(text, n = 2) {
    const tokens = this.tokenize(text);
    const result = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      result.push(tokens.slice(i, i + n).join(' '));
    }
    return result;
  }

  /**
   * Simple sentiment scoring.
   * @param {string} text
   * @returns {number} -1 to 1
   */
  sentiment(text) {
    const tokens = this.tokenize(text);
    const positive = ['good', 'great', 'awesome', 'excellent', 'amazing', 'love', 'best', 'perfect', 'fantastic', 'wonderful', 'nice', 'helpful', 'useful', 'brilliant', 'superb', 'outstanding', 'magnificent', 'bueno', 'genial', 'excelente', 'perfecto', 'increíble', 'fantástico', 'mejor', 'útil', 'bonito', 'hermoso'];
    const negative = ['bad', 'terrible', 'awful', 'worst', 'hate', 'poor', 'horrible', 'useless', 'broken', 'disappointing', 'slow', 'buggy', 'frustrating', 'annoying', 'stupid', 'ugly', 'malo', 'terrible', 'horrible', 'peor', 'odio', 'roto', 'lento', 'inútil', 'feo', 'molesto'];
    let pos = 0, neg = 0;
    for (const t of tokens) {
      if (positive.includes(t)) pos++;
      if (negative.includes(t)) neg++;
    }
    if (pos === 0 && neg === 0) return 0;
    return Math.round(((pos - neg) / (pos + neg)) * 100) / 100;
  }

  /**
   * Count word frequency.
   * @param {string} text
   * @returns {object}
   */
  wordFrequency(text) {
    const tokens = this.tokenize(text);
    const freq = {};
    for (const t of tokens) {
      freq[t] = (freq[t] || 0) + 1;
    }
    return freq;
  }
}

module.exports = NLPService;
