/**
 * TokenCounter — Token counting for context budget management.
 *
 * Uses gpt-tokenizer (MIT, pure-JS) as the primary tokenizer with a
 * lightweight character-based fallback when the package is not installed.
 * Supports o200k_base (GPT-4o/GPT-5) and cl100k_base (GPT-4/3.5) encodings.
 *
 * License: MIT (gpt-tokenizer)
 */

let _tokenizer = null;
let _tokenizerReady = false;
let _initAttempted = false;

/**
 * Try to load gpt-tokenizer. If unavailable, use heuristic fallback.
 * @returns {boolean}
 */
function tryLoadTokenizer() {
  if (_initAttempted) return _tokenizerReady;
  _initAttempted = true;
  try {
    _tokenizer = require('gpt-tokenizer');
    _tokenizerReady = true;
  } catch {
    _tokenizerReady = false;
  }
  return _tokenizerReady;
}

/**
 * Heuristic token count (~4 chars per token) when tokenizer is unavailable.
 * @param {string} text
 * @returns {number}
 */
function heuristicCount(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Count tokens in a text string.
 * @param {string} text
 * @param {string} [model='gpt-4o']
 * @returns {number}
 */
function countTokens(text, model = 'gpt-4o') {
  if (!text || typeof text !== 'string') return 0;
  if (!tryLoadTokenizer()) return heuristicCount(text);
  try {
    const { encode } = _tokenizer;
    return encode(text, model).length;
  } catch {
    return heuristicCount(text);
  }
}

/**
 * Count tokens for a chat message array (includes role overhead).
 * Each message: ~4 tokens overhead (role marker, separators) + content tokens.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} [model='gpt-4o']
 * @returns {number}
 */
function countMessageTokens(messages, model = 'gpt-4o') {
  if (!Array.isArray(messages)) return 0;
  let total = 2; // priming tokens for the reply
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const content =
      typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
    total += 4; // role + separators
    total += countTokens(content, model);
    if (msg.name) total += countTokens(msg.name, model);
  }
  return total;
}

/**
 * Trim messages to fit within a token budget.
 * Preserves the system prompt; drops oldest user/assistant turns first.
 * @param {Array} messages
 * @param {number} maxTokens
 * @param {string} [model]
 * @returns {Array}
 */
function trimToBudget(messages, maxTokens, model = 'gpt-4o') {
  if (!Array.isArray(messages)) return [];
  const system = messages.filter((m) => m && m.role === 'system');
  const others = messages.filter((m) => m && m.role !== 'system');
  while (countMessageTokens([...system, ...others], model) > maxTokens && others.length > 0) {
    others.shift();
  }
  return [...system, ...others];
}

module.exports = {
  tryLoadTokenizer,
  countTokens,
  countMessageTokens,
  trimToBudget,
};
