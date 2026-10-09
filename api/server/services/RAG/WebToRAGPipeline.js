/**
 * WebToRAGPipeline — ingests web search results into RAG for permanent
 * knowledge storage. When the KnowledgeAuditEngine reports missing knowledge,
 * this pipeline searches the web, extracts content, deduplicates, compresses,
 * and indexes it into RAG with source attribution.
 *
 * Flow: SearchRuntime.search → extract content → DedupEngine.shouldIndex →
 *       FastCompressor.compress → RAGService.indexDocument
 *
 * Inspired by:
 *   - Corrective RAG (CRAG): trigger web search when retrieval is weak
 *   - Crawl4AI / Firecrawl: LLM-oriented web crawling
 *   - Agentic RAG router pattern (Lyzr)
 *
 * Zero dependencies: uses existing SearchRuntime, RAGService, DedupEngine,
 * FastCompressor.
 */

const KnowledgeAuditEngine = require('./KnowledgeAuditEngine');
const DedupEngine = require('./DedupEngine');

let _searchRuntime = null;
let _ragService = null;
let _fastCompressor = null;

function searchRuntime() {
  if (!_searchRuntime) {
    try {
      _searchRuntime = require('../SearchRuntime');
    } catch {
      try {
        _searchRuntime = require('../SearchRuntime/SearchRuntime');
      } catch {
        _searchRuntime = null;
      }
    }
  }
  return _searchRuntime;
}

function ragService() {
  if (!_ragService) {
    try {
      const { getRAGService } = require('./RAGService');
      _ragService = { getRAGService };
    } catch {
      _ragService = null;
    }
  }
  return _ragService;
}

function fastCompressor() {
  if (!_fastCompressor) {
    try {
      _fastCompressor = require('../ContextIntelligence/FastCompressor');
    } catch {
      _fastCompressor = null;
    }
  }
  return _fastCompressor;
}

/**
 * Extract clean text content from a search result.
 * @param {object} result { title, url, snippet, content }
 * @returns {string}
 */
function extractContent(result) {
  if (!result) return '';
  const parts = [];
  if (result.title) parts.push(`# ${result.title}`);
  if (result.url) parts.push(`Source: ${result.url}`);
  if (result.content && result.content.length > 100) {
    parts.push(result.content);
  } else if (result.snippet) {
    parts.push(result.snippet);
  }
  return parts.join('\n\n');
}

/**
 * Search the web and ingest results into RAG.
 * @param {string} query
 * @param {object} opts { collection, topK, maxResults, compress, dedup }
 * @returns {Promise<{indexed: number, skipped: number, sources: object[], errors: string[]}>}
 */
async function ingestFromWeb(query, opts = {}) {
  const collection = opts.collection || 'web-knowledge';
  const maxResults = opts.maxResults || 5;
  const errors = [];
  const sources = [];
  let indexed = 0;
  let skipped = 0;

  // Step 1: search the web
  const sr = searchRuntime();
  if (!sr) {
    return { indexed: 0, skipped: 0, sources: [], errors: ['SearchRuntime unavailable'] };
  }

  let searchResults = [];
  try {
    const runtime = typeof sr.createSearchRuntime === 'function' ? sr.createSearchRuntime() : sr;
    if (runtime && typeof runtime.execute === 'function') {
      const res = await runtime.execute({ query, maxResults });
      searchResults = res?.results || res || [];
    } else if (typeof runtime === 'function') {
      const res = await runtime({ query, maxResults });
      searchResults = res?.results || [];
    } else {
      errors.push('SearchRuntime has no execute function');
    }
  } catch (e) {
    errors.push(`search failed: ${e.message}`);
  }

  if (searchResults.length === 0) {
    return { indexed: 0, skipped: 0, sources: [], errors };
  }

  // Step 2: for each result, dedup → compress → index
  const rs = ragService();
  if (!rs) {
    return { indexed: 0, skipped: 0, sources: [], errors: [...errors, 'RAGService unavailable'] };
  }

  const instance = await rs.getRAGService();
  const fc = fastCompressor();

  for (const result of searchResults.slice(0, maxResults)) {
    const content = extractContent(result);
    if (!content || content.length < 50) {
      skipped += 1;
      continue;
    }

    // Dedup check
    if (opts.dedup !== false) {
      try {
        const dedupResult = await DedupEngine.shouldIndex(content, { collection });
        if (dedupResult.duplicate) {
          skipped += 1;
          sources.push({
            url: result.url,
            status: 'duplicate',
            similarDocId: dedupResult.similarDocId,
          });
          continue;
        }
      } catch {
        // if dedup fails, proceed to index
      }
    }

    // Compress
    let finalContent = content;
    let compressionInfo = null;
    if (opts.compress !== false && fc) {
      try {
        compressionInfo = await fc.compress(content, {
          maxTokens: 2000,
          contentType: 'markdown',
        });
        finalContent = compressionInfo.compressed;
      } catch {
        // keep original
      }
    }

    // Index into RAG
    try {
      const docId = `web:${result.url || Date.now()}:${indexed}`;
      await instance.indexDocument(collection, {
        id: docId,
        content: finalContent,
        metadata: {
          source: 'web',
          url: result.url,
          title: result.title,
          query,
          indexedAt: new Date().toISOString(),
          compressed:
            compressionInfo?.source === 'headroom+fast' || compressionInfo?.source === 'fast',
          originalTokens: compressionInfo?.originalTokens,
          compressedTokens: compressionInfo?.compressedTokens,
        },
      });
      indexed += 1;
      sources.push({ url: result.url, title: result.title, status: 'indexed', docId });
    } catch (e) {
      errors.push(`index failed for ${result.url}: ${e.message}`);
    }
  }

  return { indexed, skipped, sources, errors };
}

/**
 * Auto-ingest: audit knowledge, and if coverage is low, search the web for
 * missing topics and ingest them into RAG.
 * @param {string} task
 * @param {object} opts
 * @returns {Promise<{audit: object, ingested: object}>}
 */
async function autoIngestMissing(task, opts = {}) {
  const auditResult = await KnowledgeAuditEngine.audit(task, opts);
  if (auditResult.coverage >= (opts.minCoverage || 0.7)) {
    return { audit: auditResult, ingested: { indexed: 0, skipped: 0, sources: [], errors: [] } };
  }

  // Search for missing topics
  const missingTopics = auditResult.missing.map((m) => m.topic);
  const ingested = { indexed: 0, skipped: 0, sources: [], errors: [] };

  for (const topic of missingTopics.slice(0, opts.maxTopics || 3)) {
    try {
      const result = await ingestFromWeb(topic, opts);
      ingested.indexed += result.indexed;
      ingested.skipped += result.skipped;
      ingested.sources.push(...result.sources);
      ingested.errors.push(...result.errors);
    } catch (e) {
      ingested.errors.push(`auto-ingest failed for ${topic}: ${e.message}`);
    }
  }

  return { audit: auditResult, ingested };
}

module.exports = {
  ingestFromWeb,
  autoIngestMissing,
  extractContent,
};
