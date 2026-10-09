/**
 * DedupEngine — prevents duplicate knowledge from being indexed in RAG.
 * Before indexing a new document, checks similarity against existing docs.
 * Near-duplicate detection (not just exact match), configurable threshold.
 *
 * Inspired by:
 *   - Maximem (2026) finding: one memory library had 10,134 entries, only
 *     38 usable = 99.6% junk rate. Dedup is critical.
 *   - Open-source dedup patterns (Opendedup, MinHash).
 *
 * Zero dependencies: uses existing RAGService cosineSimilarity.
 */

let _ragService = null;

function ragService() {
  if (!_ragService) {
    try {
      _ragService = require('./RAGService');
    } catch {
      _ragService = null;
    }
  }
  return _ragService;
}

const DEFAULT_THRESHOLD = 0.92;

/**
 * Check if a document should be indexed (not a duplicate).
 * @param {string} content
 * @param {object} opts { collection, threshold, topK }
 * @returns {Promise<{duplicate: boolean, similarDocId: string|null, similarity: number, action: string}>}
 */
async function shouldIndex(content, opts = {}) {
  if (!content || typeof content !== 'string' || content.length < 10) {
    return { duplicate: false, similarDocId: null, similarity: 0, action: 'index' };
  }

  const threshold = opts.threshold || DEFAULT_THRESHOLD;
  const rs = ragService();

  if (!rs || !rs.getRAGService) {
    // Fallback: exact content hash dedup
    return hashDedup(content, opts);
  }

  try {
    const { getRAGService } = rs;
    const instance = await getRAGService();

    // Search for similar existing docs using the content as the query
    const searchOpts = { topK: opts.topK || 5 };
    if (opts.collection) {
      searchOpts.collection = opts.collection;
    }
    const results = await instance.search(content.slice(0, 500), searchOpts);

    for (const r of results || []) {
      if (r.score >= threshold) {
        return {
          duplicate: true,
          similarDocId: r.id,
          similarity: r.score,
          action: 'skip',
          reason: `similarity ${r.score.toFixed(3)} >= ${threshold}`,
        };
      }
    }

    // Check for near-duplicate (high but below threshold) — merge instead
    const nearDup = (results || []).find((r) => r.score >= threshold - 0.1);
    if (nearDup) {
      return {
        duplicate: false,
        similarDocId: nearDup.id,
        similarity: nearDup.score,
        action: 'merge',
        reason: `near-duplicate (score ${nearDup.score.toFixed(3)}), consider merging`,
      };
    }

    return {
      duplicate: false,
      similarDocId: null,
      similarity: results?.[0]?.score || 0,
      action: 'index',
    };
  } catch {
    return hashDedup(content, opts);
  }
}

/**
 * Fallback: exact hash dedup when RAG/embeddings unavailable.
 * Uses a content fingerprint (normalized hash).
 * @param {string} content
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function hashDedup(content, opts = {}) {
  const crypto = require('crypto');
  const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
  const hash = crypto.createHash('sha1').update(normalized).digest('hex');

  const rs = ragService();
  if (rs && rs.getRAGService) {
    try {
      const { getRAGService } = rs;
      const instance = await getRAGService();
      const collections = opts.collection ? [opts.collection] : instance.listCollections();
      for (const col of collections) {
        const stats = instance.getCollectionStats(col);
        if (stats && stats.documents) {
          const results = await instance.search(normalized.slice(0, 500), {
            collection: col,
            topK: 3,
          });
          for (const r of results || []) {
            const rHash = crypto
              .createHash('sha1')
              .update((r.content || '').toLowerCase().replace(/\s+/g, ' ').trim())
              .digest('hex');
            if (rHash === hash) {
              return {
                duplicate: true,
                similarDocId: r.id,
                similarity: 1,
                action: 'skip',
                reason: 'exact hash match',
              };
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return { duplicate: false, similarDocId: null, similarity: 0, action: 'index' };
}

/**
 * Batch check: filter out duplicates from a list of documents.
 * @param {object[]} documents [{ id, content, metadata }]
 * @param {object} opts
 * @returns {Promise<{unique: object[], duplicates: object[]}>}
 */
async function filterBatch(documents, opts = {}) {
  const unique = [];
  const duplicates = [];
  const seenHashes = new Set();
  const crypto = require('crypto');

  for (const doc of documents || []) {
    const check = await shouldIndex(doc.content, opts);
    const hash = crypto
      .createHash('sha1')
      .update((doc.content || '').toLowerCase().replace(/\s+/g, ' ').trim())
      .digest('hex');

    if (check.duplicate || seenHashes.has(hash)) {
      duplicates.push({ ...doc, reason: check.reason || 'batch duplicate' });
    } else {
      seenHashes.add(hash);
      unique.push(doc);
    }
  }
  return { unique, duplicates };
}

/**
 * Find all near-duplicates in a collection (for cleanup).
 * @param {string} collection
 * @param {object} opts { threshold }
 * @returns {Promise<object[]>} pairs of near-duplicate doc IDs
 */
async function findDuplicates(collection, opts = {}) {
  const threshold = opts.threshold || DEFAULT_THRESHOLD - 0.1;
  const rs = ragService();
  if (!rs || !rs.getRAGService) {
    return [];
  }
  try {
    const { getRAGService } = rs;
    const instance = await getRAGService();
    const stats = instance.getCollectionStats(collection);
    if (!stats || !stats.documents) {
      return [];
    }
    const pairs = [];
    const checked = new Set();
    const docs = [];
    for (const col of instance.listCollections()) {
      if (collection && col !== collection) continue;
      const results = await instance.search(' ', { collection: col, topK: 100 });
      docs.push(...(results || []));
    }
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const key = `${docs[i].id}-${docs[j].id}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const score = rs.cosineSimilarity(
          await instance.generateEmbedding(docs[i].content.slice(0, 500)),
          await instance.generateEmbedding(docs[j].content.slice(0, 500)),
        );
        if (score >= threshold) {
          pairs.push({ doc1: docs[i].id, doc2: docs[j].id, similarity: score });
        }
      }
    }
    return pairs;
  } catch {
    return [];
  }
}

module.exports = {
  DEFAULT_THRESHOLD,
  shouldIndex,
  filterBatch,
  findDuplicates,
};
