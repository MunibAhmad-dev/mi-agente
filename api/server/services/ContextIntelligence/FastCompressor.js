/**
 * FastCompressor — maximum compression, efficient and fast for any LLM.
 * Content-type aware: code keeps structure, logs get aggressive dedup,
 * prose gets semantic compression (remove filler, keep entities).
 *
 * Architecture:
 *   - Layer 1: Structural dedup (remove duplicate lines/blocks)
 *   - Layer 2: Content-type specific compression
 *   - Layer 3: Token budget enforcement (truncate to maxTokens)
 *   - Layer 4: Delegate to Headroom (Apache-2.0) if installed, for LLM-grade
 *
 * Target: 60-90% reduction, <50ms for 10KB (no external calls).
 * Zero mandatory dependencies.
 */

const TokenCounter = require('./TokenCounter');

/**
 * Detect content type from text + optional hint.
 * @param {string} text
 * @param {string} hint
 * @returns {string} 'code'|'json'|'log'|'markdown'|'prose'
 */
function detectType(text, hint) {
  if (hint && hint !== 'text') {
    return hint;
  }
  if (!text) return 'prose';
  const sample = text.slice(0, 500);
  if (/^\s*[{[]/.test(sample) && /["\w]+":/.test(sample)) return 'json';
  if (/^(function|const|class|import|def|if|for|while|return)\s/m.test(sample)) return 'code';
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/m.test(sample)) return 'log';
  if (/^#{1,6}\s/m.test(sample)) return 'markdown';
  return 'prose';
}

/**
 * Layer 1: structural dedup. Remove exact duplicate lines and blocks.
 * @param {string} text
 * @returns {string}
 */
function structuralDedup(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = line.trim();
    if (key && seen.has(key) && !/^[{}\s]*$/.test(key)) {
      continue;
    }
    seen.add(key);
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Compress JSON: remove whitespace, keep structure.
 * @param {string} text
 * @returns {string}
 */
function compressJson(text) {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 0);
  } catch {
    return text.replace(/\s+/g, ' ').trim();
  }
}

/**
 * Compress code: keep structure but remove comments + blank lines.
 * Conservative: only strips line comments and trailing whitespace.
 * @param {string} text
 * @returns {string}
 */
function compressCode(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => {
      const t = l.trim();
      // keep block-structure lines
      if (/^[{}[\]();,]*$/.test(t)) return true;
      // strip single-line comments (but not URLs with //)
      if (/^\s*(\/\/|#)/.test(l) && !/:\/\//.test(l)) return false;
      if (t === '') return false;
      return true;
    })
    .join('\n');
}

/**
 * Compress logs: aggressive. Keep timestamps + message, drop stack frames
 * from node_modules, dedup consecutive identical messages.
 * @param {string} text
 * @returns {string}
 */
function compressLog(text) {
  const lines = text.split('\n');
  const out = [];
  let prevMsg = null;
  for (const line of lines) {
    const m = line.match(/^\S+\s+(.*)$/);
    const msg = m ? m[1].trim() : line.trim();
    if (msg === prevMsg) continue;
    if (/node_modules/.test(line) && /at\s/.test(line)) continue;
    out.push(line);
    prevMsg = msg;
  }
  return out.join('\n');
}

/**
 * Compress markdown: remove redundant formatting.
 * @param {string} text
 * @returns {string}
 */
function compressMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Compress prose: remove filler words, keep entities and key terms.
 * Conservative: doesn't change meaning, just removes noise.
 * @param {string} text
 * @returns {string}
 */
const FILLER_WORDS = new Set([
  'very',
  'really',
  'quite',
  'rather',
  'somewhat',
  'fairly',
  'pretty',
  'just',
  'simply',
  'actually',
  'basically',
  'essentially',
  'literally',
  'obviously',
  'clearly',
  'indeed',
  'certainly',
  'definitely',
  'absolutely',
  'in order to',
  'due to the fact that',
  'in spite of',
  'with regard to',
  'it should be noted that',
  'it is important to note that',
]);

function compressProse(text) {
  let out = text;
  for (const filler of FILLER_WORDS) {
    out = out.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
  }
  out = out
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
  return out;
}

/**
 * Compress text with content-type awareness.
 * @param {string} text
 * @param {object} opts { maxTokens, contentType, useHeadroom }
 * @returns {Promise<{compressed: string, originalTokens: number, compressedTokens: number, ratio: number, source: string}>}
 */
async function compress(text, opts = {}) {
  if (!text || typeof text !== 'string') {
    return { compressed: '', originalTokens: 0, compressedTokens: 0, ratio: 0, source: 'none' };
  }

  const maxTokens = opts.maxTokens || 4000;
  const originalTokens = TokenCounter.countTokens(text);
  const type = detectType(text, opts.contentType);

  // Layer 1: structural
  let compressed = structuralDedup(text);

  // Layer 2: type-specific
  switch (type) {
    case 'json':
      compressed = compressJson(compressed);
      break;
    case 'code':
      compressed = compressCode(compressed);
      break;
    case 'log':
      compressed = compressLog(compressed);
      break;
    case 'markdown':
      compressed = compressMarkdown(compressed);
      break;
    default:
      compressed = compressProse(compressed);
  }

  // Layer 3: token budget
  let currentTokens = TokenCounter.countTokens(compressed);
  if (currentTokens > maxTokens) {
    const ratio = maxTokens / currentTokens;
    const cutIndex = Math.floor(compressed.length * ratio);
    compressed = compressed.slice(0, cutIndex) + '\n[...truncated...]';
    currentTokens = TokenCounter.countTokens(compressed);
  }

  // Layer 4: delegate to Headroom if installed and enabled
  if (opts.useHeadroom !== false && currentTokens > 500) {
    try {
      const CompressionService = require('./CompressionService');
      const headroomResult = await CompressionService.compress(compressed, {
        maxTokens,
        contentType: type,
      });
      if (headroomResult.source === 'headroom' && headroomResult.compressedTokens < currentTokens) {
        return {
          compressed: headroomResult.compressed,
          originalTokens,
          compressedTokens: headroomResult.compressedTokens,
          ratio: headroomResult.ratio,
          source: 'headroom+fast',
          contentType: type,
        };
      }
    } catch {
      // headroom unavailable, keep fast result
    }
  }

  return {
    compressed,
    originalTokens,
    compressedTokens: currentTokens,
    ratio: originalTokens > 0 ? currentTokens / originalTokens : 0,
    source: 'fast',
    contentType: type,
  };
}

/**
 * Compress a batch of texts.
 * @param {string[]} texts
 * @param {object} opts
 * @returns {Promise<object[]>}
 */
async function compressBatch(texts, opts = {}) {
  if (!Array.isArray(texts)) return [];
  return Promise.all(texts.map((t) => compress(t, opts)));
}

/**
 * Benchmark compression on a sample. Returns timing + ratio.
 * @param {string} text
 * @returns {Promise<object>}
 */
async function benchmark(text) {
  const start = Date.now();
  const result = await compress(text, { useHeadroom: false });
  const elapsedMs = Date.now() - start;
  return {
    ...result,
    elapsedMs,
    reductionPct: result.originalTokens > 0 ? Math.round((1 - result.ratio) * 100) : 0,
    inputBytes: text.length,
  };
}

module.exports = {
  detectType,
  structuralDedup,
  compress,
  compressBatch,
  benchmark,
};
