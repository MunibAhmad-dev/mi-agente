/**
 * CompressionService — Context compression using Headroom (Apache-2.0).
 *
 * Sits between the agent and the LLM, compressing tool outputs, logs, RAG
 * chunks, source code, and conversation history before they reach the model.
 * 60-95% fewer tokens with the same answers.
 *
 * Architecture:
 *   - Primary: headroom-ai npm package (Apache-2.0, TypeScript native)
 *   - Fallback: heuristic compression (truncate + dedup) when not installed
 *   - Modes: proxy, library, MCP server
 *
 * License: Apache-2.0 (Headroom)
 */

const TokenCounter = require('./TokenCounter');

let _headroom = null;
let _ready = false;
let _attempted = false;

/**
 * Try to load headroom-ai. If unavailable, use heuristic fallback.
 * @returns {boolean}
 */
function tryLoadHeadroom() {
  if (_attempted) return _ready;
  _attempted = true;
  try {
    _headroom = require('headroom-ai');
    _ready = true;
  } catch {
    _ready = false;
  }
  return _ready;
}

/**
 * Heuristic compression fallback:
 *   - Remove excessive whitespace
 *   - Dedup consecutive identical lines
 *   - Truncate to maxTokens if needed
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string}
 */
function heuristicCompress(text, maxTokens = 4000) {
  if (!text || typeof text !== 'string') return '';
  let compressed = text;
  compressed = compressed.replace(/\n{3,}/g, '\n\n');
  compressed = compressed.replace(/[ \t]+/g, ' ');
  const lines = compressed.split('\n');
  const deduped = [];
  let prev = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== prev) {
      deduped.push(line);
      prev = trimmed;
    }
  }
  compressed = deduped.join('\n');
  const currentTokens = TokenCounter.countTokens(compressed);
  if (currentTokens > maxTokens) {
    const ratio = maxTokens / currentTokens;
    const cutIndex = Math.floor(compressed.length * ratio);
    compressed = compressed.slice(0, cutIndex) + '\n[...truncated...]';
  }
  return compressed;
}

/**
 * Compress text content before sending to LLM.
 * @param {string} text - Raw content (logs, tool output, code, etc.)
 * @param {object} [opts]
 * @param {number} [opts.maxTokens=4000] - Target max tokens after compression
 * @param {string} [opts.contentType='text'] - 'text'|'code'|'json'|'log'
 * @returns {Promise<{compressed: string, originalTokens: number, compressedTokens: number, ratio: number}>}
 */
async function compress(text, opts = {}) {
  const maxTokens = opts.maxTokens || 4000;
  const originalTokens = TokenCounter.countTokens(text || '');

  if (!tryLoadHeadroom() || !text) {
    const compressed = heuristicCompress(text, maxTokens);
    const compressedTokens = TokenCounter.countTokens(compressed);
    return {
      compressed,
      originalTokens,
      compressedTokens,
      ratio: originalTokens > 0 ? compressedTokens / originalTokens : 0,
      source: 'heuristic',
    };
  }

  try {
    const result = await _headroom.compress(text, {
      max_tokens: maxTokens,
      content_type: opts.contentType || 'text',
    });
    const compressedTokens = TokenCounter.countTokens(result);
    return {
      compressed: result,
      originalTokens,
      compressedTokens,
      ratio: originalTokens > 0 ? compressedTokens / originalTokens : 0,
      source: 'headroom',
    };
  } catch {
    const compressed = heuristicCompress(text, maxTokens);
    const compressedTokens = TokenCounter.countTokens(compressed);
    return {
      compressed,
      originalTokens,
      compressedTokens,
      ratio: originalTokens > 0 ? compressedTokens / originalTokens : 0,
      source: 'heuristic',
    };
  }
}

/**
 * Compress a batch of tool outputs at once.
 * @param {Array<string>} outputs
 * @param {object} [opts]
 * @returns {Promise<Array>}
 */
async function compressBatch(outputs, opts = {}) {
  if (!Array.isArray(outputs)) return [];
  return Promise.all(outputs.map((o) => compress(o, opts)));
}

/**
 * Decompress (if Headroom CCR reversible compression was used).
 * @param {string} compressed
 * @returns {Promise<string|null>}
 */
async function decompress(compressed) {
  if (!tryLoadHeadroom() || !compressed) return null;
  try {
    return await _headroom.decompress(compressed);
  } catch {
    return null;
  }
}

module.exports = {
  tryLoadHeadroom,
  compress,
  compressBatch,
  decompress,
  heuristicCompress,
};
