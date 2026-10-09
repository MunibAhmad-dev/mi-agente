'use strict';

/**
 * CitationGenerator — Gen B output phase.
 * Generates citations for claims made in a response, maintains a source registry,
 * and annotates text with inline citation markers.
 *
 * Claim types: fact, opinion, statistic, quote
 * Citation formats: apa, mla, inline
 */

// Patterns to detect claim types
const CLAIM_PATTERNS = [
  // Statistics: numbers with % or measurement units
  { type: 'statistic', pattern: /\b\d+(?:\.\d+)?(?:\s*%|\s*percent|\s*million|\s*billion|\s*thousand)\b/i, needsCitation: true },
  // Quotes: text in quotation marks
  { type: 'quote', pattern: /[""][^""]{10,}[""]|"[^"]{10,}"/g, needsCitation: true },
  // Opinions: hedged or belief language
  { type: 'opinion', pattern: /\b(?:I think|I believe|in my opinion|arguably|some argue|many believe)\b/i, needsCitation: false },
  // Facts: assertive language about specific claims
  { type: 'fact', pattern: /\b(?:studies show|research indicates|according to|data shows|evidence suggests|scientists found)\b/i, needsCitation: true },
];

function splitSentences(text) {
  if (!text) return [];
  return text
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

function formatApa(source) {
  const { author, date, title, url } = source;
  const yr = date ? ` (${date})` : '';
  const au = author || 'Unknown Author';
  const ttl = title ? `. ${title}` : '';
  const ref = url ? `. Retrieved from ${url}` : '';
  return `${au}${yr}${ttl}${ref}`;
}

function formatMla(source) {
  const { author, date, title, url } = source;
  const au = author || 'Unknown Author';
  const ttl = title ? `"${title}"` : '"Untitled"';
  const yr = date ? ` ${date}` : '';
  const ref = url ? `. Web. <${url}>` : '';
  return `${au}. ${ttl}${yr}${ref}.`;
}

function formatInline(source) {
  const { author, date } = source;
  const au = author ? author.split(' ').pop() : 'Unknown';
  const yr = date || 'n.d.';
  return `(${au}, ${yr})`;
}

class CitationGenerator {
  constructor() {
    this.stats = { claimsExtracted: 0, citationsGenerated: 0, annotated: 0 };
    // sessionId → [{ url, title, author, date, id }]
    this._sources = new Map();
    this._globalSources = [];
  }

  /**
   * Extract claims from text.
   * @param {string} text
   * @returns {{ claims: Array<{ text, type, needsCitation }> }}
   */
  extractClaims(text) {
    try {
      if (!text || typeof text !== 'string') return { claims: [] };
      const sentences = splitSentences(text);
      const claims = [];
      const seen = new Set();

      for (const sentence of sentences) {
        let matched = false;
        for (const { type, pattern, needsCitation } of CLAIM_PATTERNS) {
          if (pattern.test(sentence)) {
            const key = sentence.substring(0, 60);
            if (!seen.has(key)) {
              seen.add(key);
              claims.push({ text: sentence.substring(0, 200), type, needsCitation });
              matched = true;
              break; // first matched type wins
            }
          }
        }
        // Unlabelled sentences default to fact if they contain assertive language
        if (!matched && /\bis\b|\bare\b|\bwas\b|\bwere\b/.test(sentence)) {
          const key = sentence.substring(0, 60);
          if (!seen.has(key)) {
            seen.add(key);
            claims.push({ text: sentence.substring(0, 200), type: 'fact', needsCitation: false });
          }
        }
      }

      this.stats.claimsExtracted += claims.length;
      return { claims };
    } catch (err) {
      return { claims: [], error: err.message };
    }
  }

  /**
   * Generate a formatted citation for a claim + source.
   * @param {{ text, type }} claim
   * @param {{ url?, title?, author?, date? }} source
   * @param {'apa'|'mla'|'inline'} [format]
   * @returns {{ citation: string, format: string }}
   */
  generateCitation(claim, source, format = 'apa') {
    try {
      if (!source) return { citation: '[No source]', format };
      this.stats.citationsGenerated++;
      let citation;
      if (format === 'mla') citation = formatMla(source);
      else if (format === 'inline') citation = formatInline(source);
      else citation = formatApa(source);
      return { citation, format };
    } catch (err) {
      return { citation: '[Citation error]', format, error: err.message };
    }
  }

  /**
   * Add a source to the session registry.
   * @param {string} url
   * @param {string} title
   * @param {string} author
   * @param {string} date
   * @param {string} [sessionId]
   */
  addSource(url, title, author, date, sessionId = '__global__') {
    try {
      if (!this._sources.has(sessionId)) {
        this._sources.set(sessionId, []);
      }
      const sources = this._sources.get(sessionId);
      const id = sources.length + 1;
      sources.push({ id, url: url || '', title: title || '', author: author || '', date: date || '' });
    } catch (_) {
      // non-throwing
    }
  }

  /**
   * Annotate text with inline citation markers based on provided sources.
   * @param {string} text
   * @param {Array<{ url?, title?, author?, date? }>} sources
   * @returns {string}
   */
  annotate(text, sources) {
    try {
      if (!text || !Array.isArray(sources) || sources.length === 0) return text;
      const sentences = splitSentences(text);
      let result = text;

      // For each sentence that contains a fact/stat claim, append a citation marker
      let sourceIdx = 0;
      for (const sentence of sentences) {
        const needsCite = CLAIM_PATTERNS.filter((p) => p.needsCitation).some((p) => p.pattern.test(sentence));
        if (needsCite && sourceIdx < sources.length) {
          const marker = ` [${sourceIdx + 1}]`;
          // Replace first occurrence of sentence (up to 100 chars) in result
          const safe = sentence.substring(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          result = result.replace(new RegExp(safe), (m) => m + marker);
          sourceIdx++;
        }
      }

      this.stats.annotated++;
      return result;
    } catch (err) {
      return text;
    }
  }

  /**
   * Format a bibliography for a session.
   * @param {string} sessionId
   * @param {'apa'|'mla'|'inline'} [format]
   * @returns {string}
   */
  formatBibliography(sessionId = '__global__', format = 'apa') {
    try {
      const sources = this._sources.get(sessionId) || [];
      if (sources.length === 0) return 'No sources recorded for this session.';
      return sources
        .map((s, i) => {
          let citation;
          if (format === 'mla') citation = formatMla(s);
          else if (format === 'inline') citation = formatInline(s);
          else citation = formatApa(s);
          return `[${i + 1}] ${citation}`;
        })
        .join('\n');
    } catch (err) {
      return `Bibliography error: ${err.message}`;
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getCitationGenerator() {
  if (!_instance) _instance = new CitationGenerator();
  return _instance;
}

module.exports = { CitationGenerator, getCitationGenerator };
