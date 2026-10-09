'use strict';

/**
 * SemanticCompressor - Real document compression.
 *
 * Unlike naive dedup, this:
 * 1. Extracts key facts from text
 * 2. Generates compressed summaries
 * 3. Deduplicates by meaning (not just text)
 * 4. Compresses incrementally (only new content)
 * 5. Tracks compression stats
 *
 * Target: 60-70% compression while preserving key information.
 */
class SemanticCompressor {
  constructor(config = {}) {
    this.config = config;
    this.compressedCache = new Map(); // id → compressed result
    this.stats = { compressed: 0, saved: 0, totalOriginal: 0, totalCompressed: 0 };

    // Stop words for compression
    this.stopWords = new Set([
      'el','la','los','las','un','una','que','como','para','por','con','sin',
      'sobre','entre','desde','hasta','este','esta','esto','más','muy','mucho',
      'poco','todo','nada','algo','cada','otro','otra','puede','tiene','hace',
      'ser','estar','haber','tener','hacer','poder','decir','saber','ir','dar',
      'the','a','an','is','are','was','were','be','been','being','have','has',
      'had','do','does','did','will','would','could','should','may','might',
      'shall','can','need','dare','ought','used','to','of','in','for','on',
      'with','at','by','from','as','into','through','during','before','after',
      'and','but','or','nor','not','so','yet','both','either','neither','each',
    ]);
  }

  /**
   * Compress a document. Returns compressed version with stats.
   */
  async compress(id, text) {
    if (!text || text.trim().length === 0) return { compressed: '', ratio: 0 };

    // Check cache
    if (this.compressedCache.has(id)) {
      return this.compressedCache.get(id);
    }

    const originalWords = text.split(/\s+/).length;

    // Step 1: Extract key facts
    const keyFacts = this._extractKeyFacts(text);

    // Step 2: Generate compressed summary
    const summary = this._compressSentences(text);

    // Step 3: Extract entities
    const entities = this._extractEntities(text);

    // Step 4: Build compressed representation
    const compressed = this._buildCompressed(text, keyFacts, summary, entities);

    const compressedWords = compressed.split(/\s+/).length;
    const ratio = 1 - (compressedWords / Math.max(originalWords, 1));

    const result = {
      id,
      original: text,
      compressed,
      keyFacts,
      summary,
      entities,
      originalWords,
      compressedWords,
      ratio,
      timestamp: Date.now(),
    };

    this.compressedCache.set(id, result);
    this.stats.compressed++;
    this.stats.totalOriginal += originalWords;
    this.stats.totalCompressed += compressedWords;
    this.stats.saved += originalWords - compressedWords;

    return result;
  }

  /**
   * Deduplicate a set of documents by semantic similarity.
   */
  deduplicate(documents) {
    const clusters = [];
    const used = new Set();

    for (let i = 0; i < documents.length; i++) {
      if (used.has(i)) continue;
      const cluster = [documents[i]];
      used.add(i);

      for (let j = i + 1; j < documents.length; j++) {
        if (used.has(j)) continue;
        const similarity = this._semanticSimilarity(
          documents[i].compressed || documents[i].text || documents[i].content || '',
          documents[j].compressed || documents[j].text || documents[j].content || ''
        );
        if (similarity > 0.6) {
          cluster.push(documents[j]);
          used.add(j);
        }
      }

      clusters.push(cluster);
    }

    // Merge each cluster
    return clusters.map(cluster => {
      if (cluster.length === 1) return cluster[0];
      return this._mergeCluster(cluster);
    });
  }

  /**
   * Incremental compression - only compress new/changed content.
   */
  async compressIncremental(id, newText, existingCompressed = null) {
    if (!existingCompressed) {
      return this.compress(id, newText);
    }

    // Only compress the delta
    const newWords = newText.split(/\s+/).length;
    const existingWords = (existingCompressed.compressed || '').split(/\s+/).length;

    // If new text is small relative to existing, just append key facts
    if (newWords < existingWords * 0.3) {
      const newFacts = this._extractKeyFacts(newText);
      return {
        ...existingCompressed,
        keyFacts: [...new Set([...existingCompressed.keyFacts, ...newFacts])].slice(0, 30),
        compressed: existingCompressed.compressed + ' | ' + this._summarize(newText),
        timestamp: Date.now(),
      };
    }

    // Otherwise recompress
    return this.compress(id, newText);
  }

  /**
   * Get compression stats.
   */
  getStats() {
    return {
      ...this.stats,
      avgRatio: this.stats.compressed > 0
        ? (this.stats.totalCompressed / this.stats.totalOriginal)
        : 0,
      cacheSize: this.compressedCache.size,
      totalSaved: this.stats.saved,
      savedPercent: this.stats.totalOriginal > 0
        ? Math.round((this.stats.saved / this.stats.totalOriginal) * 100)
        : 0,
    };
  }

  // ===================== INTERNAL =====================

  _extractKeyFacts(text) {
    const facts = new Set();

    // Numbers with context
    const numMatches = text.match(/\$[\d,]+\.?\d*|\d+(?:\.\d+)?%|\d+\s*(?:GB|MB|TB|W|V|MHz|GHz)/gi) || [];
    numMatches.forEach(m => facts.add(m.trim()));

    // Important sentences (contain numbers, key verbs, or definitions)
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sent of sentences) {
      if (/\d/.test(sent) && /\b(es|are|is|was|tiene|cuesta|weighs|costs|has|contains)\b/i.test(sent)) {
        facts.add(sent.trim().substring(0, 120));
      }
    }

    return [...facts].slice(0, 20);
  }

  _compressSentences(text) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    const scored = sentences.map(s => ({
      text: s,
      score: this._sentenceImportance(s),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.ceil(sentences.length * 0.3)).map(s => s.text.trim()).join(' ');
  }

  _sentenceImportance(sentence) {
    let score = 0;
    const lower = sentence.toLowerCase();

    // Contains numbers → more factual
    if (/\d/.test(sentence)) score += 2;

    // Contains key verbs → more informative
    if (/\b(es|are|is|was|tiene|cuesta|has|costs|weighs|contains|supports|requires)\b/i.test(lower)) score += 1;

    // Contains technical terms
    if (/\b(API|GPU|CPU|RAM|SSD|DDR|PCIe|CUDA|TDP)\b/i.test(sentence)) score += 1;

    // Contains proper nouns
    if (/[A-Z][a-z]+/.test(sentence)) score += 0.5;

    // Penalty: very short or very long
    const words = sentence.split(/\s+/).length;
    if (words < 5) score -= 2;
    if (words > 50) score -= 1;

    // Penalty: mostly stop words
    const stopWordCount = lower.split(/\s+/).filter(w => this.stopWords.has(w)).length;
    if (stopWordCount / words > 0.5) score -= 1;

    return score;
  }

  _extractEntities(text) {
    const entities = [];

    // Products: RTX 3090, AMD Ryzen, etc.
    const products = text.match(/\b(?:RTX|GTX|Radeon|GeForce|Intel|AMD|NVIDIA)\s+\w+/gi) || [];
    products.forEach(p => entities.push({ type: 'product', name: p.trim() }));

    // Organizations
    const orgs = text.match(/\b(?:Google|Microsoft|Meta|OpenAI|xAI|Tesla|SpaceX|NVIDIA|AMD|Intel|Apple|Samsung)\b/g) || [];
    orgs.forEach(o => entities.push({ type: 'org', name: o }));

    // Locations
    const locs = text.match(/\b(?:China|USA|Japan|Germany|Shenzhen|Huaqiangbei|California|Taiwan)\b/g) || [];
    locs.forEach(l => entities.push({ type: 'location', name: l }));

    return [...new Map(entities.map(e => [e.name, e])).values()].slice(0, 15);
  }

  _buildCompressed(text, keyFacts, summary, entities) {
    // Strategy: summary is the compressed text, keyFacts are metadata
    // Don't concatenate everything - that expands rather than compresses
    // The summary IS the compressed version. Key facts are for indexing.
    return summary || text.substring(0, Math.min(text.length, 200));
  }

  _summarize(text) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    return sentences.slice(0, 2).map(s => s.trim()).join(' ');
  }

  _semanticSimilarity(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !this.stopWords.has(w)));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !this.stopWords.has(w)));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0;
  }

  _mergeCluster(cluster) {
    // Merge: take the longest text + combine all key facts
    const longest = cluster.reduce((a, b) =>
      ((a.compressed || a.text || '').length > (b.compressed || b.text || '').length) ? a : b
    );

    const allFacts = cluster.flatMap(d => d.keyFacts || []);

    return {
      ...longest,
      keyFacts: [...new Set(allFacts)].slice(0, 30),
      compressedFrom: cluster.length,
    };
  }
}

module.exports = { SemanticCompressor };
