/**
 * WhoogleAdapter — Self-hosted web search adapter (MIT/ISC, no API key).
 *
 * Wraps the WhoogleProvider from SearchRuntime, exposing a clean search
 * interface for the agent's WebSearch tool. Whoogle is a privacy-respecting
 * metasearch that aggregates Google results without tracking and without
 * content censorship. Runs as a self-hosted Docker container.
 *
 * License: MIT/ISC (Whoogle upstream)
 */

const { getSearchRuntime } = require('~/server/services/SearchRuntime');

let _runtime = null;

/**
 * Get the SearchRuntime instance (singleton).
 * @returns {object}
 */
function getRuntime() {
  if (!_runtime) {
    _runtime = getSearchRuntime({
      defaultProvider: 'whoogle',
      whoogleUrl: process.env.WHOOGLE_URL,
      maxResults: 10,
    });
  }
  return _runtime;
}

/**
 * Search the web using Whoogle (or fallback providers).
 * @param {string} query
 * @param {object} [opts]
 * @param {number} [opts.maxResults=8]
 * @returns {Promise<{results: Array, total: number, provider: string}>}
 */
async function search(query, opts = {}) {
  if (!query || typeof query !== 'string') {
    return { results: [], total: 0, provider: 'whoogle' };
  }
  const runtime = getRuntime();
  const maxResults = opts.maxResults || 8;
  try {
    const result = await runtime.search(query, {
      provider: 'whoogle',
      maxResults,
    });
    return {
      results: result.results || [],
      total: result.total || 0,
      provider: result.provider || 'whoogle',
    };
  } catch (error) {
    return {
      results: [],
      total: 0,
      provider: 'whoogle',
      error: error.message,
    };
  }
}

/**
 * Check if Whoogle is configured (WHOOGLE_URL env var set).
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(process.env.WHOOGLE_URL);
}

module.exports = {
  search,
  isConfigured,
  getRuntime,
};
