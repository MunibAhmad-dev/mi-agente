/**
 * KnowledgeAuditEngine — audits what knowledge the system has vs. what's
 * missing for a given task/topic. Returns two lists: "has" and "missing",
 * so the agent knows whether to retrieve from RAG or search the web first.
 *
 * Inspired by:
 *   - Ragas (Apache-2.0): context precision/recall metrics
 *   - Cognee (MIT): knowledge graph from unstructured data
 *   - Corrective RAG (CRAG): evaluate retrieval quality, self-correct
 *
 * Zero dependencies: uses the existing RAGService cosine similarity + Memory
 * recall. If RAGService is unavailable, falls back to keyword matching.
 */

let _ragService = null;
let _memoryService = null;

function ragService() {
  if (!_ragService) {
    try {
      _ragService = require('../RAG/RAGService');
    } catch {
      _ragService = null;
    }
  }
  return _ragService;
}

function memoryService() {
  if (!_memoryService) {
    try {
      const { MemoryService } = require('../Memory/memoryService');
      _memoryService = new MemoryService();
    } catch {
      _memoryService = null;
    }
  }
  return _memoryService;
}

/**
 * Tokenize text into lowercase keywords (stopword-filtered).
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'should',
    'could',
    'may',
    'might',
    'must',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'as',
    'by',
    'at',
    'from',
    'up',
    'about',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'and',
    'or',
    'but',
    'not',
    'no',
    'this',
    'that',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'what',
    'which',
    'who',
    'when',
    'where',
    'why',
    'how',
    'el',
    'la',
    'los',
    'las',
    'un',
    'una',
    'de',
    'en',
    'que',
    'es',
    'son',
    'por',
    'para',
    'con',
    'sin',
    'como',
    'mas',
    'pero',
    'si',
    'no',
    'yo',
  ]);
  return text
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñ]+/i)
    .filter((w) => w.length > 2 && !stopwords.has(w));
}

/**
 * Extract topic keywords from a task description.
 * @param {string} task
 * @returns {string[]}
 */
function extractTopics(task) {
  const tokens = tokenize(task);
  const freq = new Map();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

/**
 * Check if a document is relevant to a topic keyword.
 * Uses embedding similarity if RAGService is available, else keyword match.
 * @param {object} doc { id, content, metadata }
 * @param {string} topic
 * @returns {Promise<{relevant: boolean, score: number}>}
 */
async function isRelevant(doc, topic) {
  if (!doc || !doc.content) {
    return { relevant: false, score: 0 };
  }
  const rs = ragService();
  if (rs && rs.cosineSimilarity) {
    try {
      const { getRAGService } = rs;
      const instance = await getRAGService();
      const docEmb = await instance.generateEmbedding(doc.content.slice(0, 2000));
      const topicEmb = await instance.generateEmbedding(topic);
      const score = rs.cosineSimilarity(docEmb, topicEmb);
      return { relevant: score >= 0.6, score };
    } catch {
      // fall through to keyword
    }
  }
  const docTokens = new Set(tokenize(doc.content));
  const topicTokens = new Set(tokenize(topic));
  let overlap = 0;
  for (const t of topicTokens) {
    if (docTokens.has(t)) {
      overlap += 1;
    }
  }
  const score = topicTokens.size > 0 ? overlap / topicTokens.size : 0;
  return { relevant: score >= 0.2, score };
}

/**
 * Audit knowledge: scan RAG + Memory, classify each topic as has/missing.
 * @param {string} taskOrTopic
 * @param {object} opts { collections, memoryLayers, threshold }
 * @returns {Promise<{has: object[], missing: object[], coverage: number, total: number}>}
 */
async function audit(taskOrTopic, opts = {}) {
  const topics = extractTopics(taskOrTopic);
  if (topics.length === 0) {
    return { has: [], missing: [], coverage: 0, total: 0, topics: [] };
  }

  const has = [];
  const missing = [];
  const threshold = opts.threshold || 0.6;

  // Scan RAG collections
  const rs = ragService();
  if (rs && rs.getRAGService) {
    try {
      const instance = await rs.getRAGService();
      const collections = opts.collections || instance.listCollections();
      for (const col of collections) {
        const allDocs = [];
        try {
          const results = await instance.search(taskOrTopic, { collection: col, topK: 20 });
          for (const r of results || []) {
            allDocs.push({ id: r.id, content: r.content, source: `rag:${col}`, score: r.score });
          }
        } catch {
          // collection may be empty
        }
        for (const topic of topics) {
          let bestScore = 0;
          let bestDoc = null;
          for (const doc of allDocs) {
            const { score } = await isRelevant(doc, topic);
            if (score > bestScore) {
              bestScore = score;
              bestDoc = doc;
            }
          }
          if (bestScore >= threshold && bestDoc) {
            has.push({ topic, score: bestScore, source: bestDoc.source, docId: bestDoc.id });
          }
        }
      }
    } catch {
      // RAG unavailable
    }
  }

  // Scan Memory layers
  const ms = memoryService();
  if (ms && opts.memoryLayers !== false) {
    try {
      const memories = ms.recall({ query: taskOrTopic, topK: 20 }) || [];
      for (const topic of topics) {
        let bestScore = 0;
        for (const mem of memories) {
          const { score } = await isRelevant(
            { content: mem.content || JSON.stringify(mem) },
            topic,
          );
          if (score > bestScore) {
            bestScore = score;
          }
        }
        if (bestScore >= threshold) {
          has.push({ topic, score: bestScore, source: 'memory' });
        }
      }
    } catch {
      // memory unavailable
    }
  }

  // Classify missing
  const hasTopics = new Set(has.map((h) => h.topic));
  for (const topic of topics) {
    if (!hasTopics.has(topic)) {
      missing.push({ topic, reason: 'no matching document found' });
    }
  }

  const coverage = topics.length > 0 ? hasTopics.size / topics.length : 0;
  return {
    has: dedupeHas(has),
    missing,
    coverage,
    total: topics.length,
    topics,
  };
}

/**
 * Deduplicate "has" entries by topic (keep highest score).
 * @param {object[]} has
 * @returns {object[]}
 */
function dedupeHas(has) {
  const byTopic = new Map();
  for (const h of has) {
    const existing = byTopic.get(h.topic);
    if (!existing || h.score > existing.score) {
      byTopic.set(h.topic, h);
    }
  }
  return Array.from(byTopic.values());
}

/**
 * Get a human-readable audit report.
 * @param {object} result
 * @returns {string}
 */
function formatReport(result) {
  const lines = [];
  lines.push(`=== Knowledge Audit Report ===`);
  lines.push(
    `Coverage: ${(result.coverage * 100).toFixed(0)}% (${result.has.length}/${result.total} topics)`,
  );
  lines.push('');
  lines.push(`✓ Knowledge the system HAS (${result.has.length}):`);
  for (const h of result.has) {
    lines.push(`  • ${h.topic} (score: ${h.score.toFixed(2)}, source: ${h.source})`);
  }
  lines.push('');
  lines.push(`✗ Knowledge MISSING (${result.missing.length}):`);
  for (const m of result.missing) {
    lines.push(`  • ${m.topic} — ${m.reason}`);
  }
  return lines.join('\n');
}

module.exports = {
  audit,
  extractTopics,
  isRelevant,
  formatReport,
  tokenize,
};
