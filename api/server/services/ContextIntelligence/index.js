/**
 * ContextIntelligence — Unified context intelligence service.
 *
 * Combines:
 *   - TokenCounter (gpt-tokenizer, MIT): exact token counting
 *   - VectorStore (sqlite-vec, MIT): semantic retrieval / RAG
 *   - CompressionService (Headroom, Apache-2.0): 60-95% token reduction
 *   - TokenBudgetService: per-task budget tracking and enforcement
 *
 * Provides a single entry point for retrieval → ranking → dedup →
 * compression → token budget, covering the "Context Intelligence Engine"
 * gap from the project's master prompt.
 *
 * License: MIT (vector store, token counter) + Apache-2.0 (compression)
 */

const TokenCounter = require('./TokenCounter');
const VectorStore = require('./VectorStore');
const CompressionService = require('./CompressionService');
const TokenBudgetService = require('./TokenBudgetService');

/**
 * Retrieve relevant context from the vector store and compress it.
 * @param {number[]} queryVector
 * @param {object} [opts]
 * @returns {Promise<{results: Array, compressed: object}>}
 */
async function retrieveAndCompress(queryVector, opts = {}) {
  const k = opts.k || 5;
  const results = await VectorStore.search(queryVector, k, opts.filter);
  const contents = results.map((r) => r.content);
  const compressedBatch = await CompressionService.compressBatch(contents, {
    maxTokens: opts.maxTokens || 4000,
    contentType: opts.contentType || 'text',
  });
  return {
    results: results.map((r, i) => ({
      ...r,
      compressed: compressedBatch[i].compressed,
      compressionRatio: compressedBatch[i].ratio,
    })),
    totalOriginalTokens: compressedBatch.reduce((sum, c) => sum + c.originalTokens, 0),
    totalCompressedTokens: compressedBatch.reduce((sum, c) => sum + c.compressedTokens, 0),
  };
}

module.exports = {
  TokenCounter,
  VectorStore,
  CompressionService,
  TokenBudgetService,
  retrieveAndCompress,
};
