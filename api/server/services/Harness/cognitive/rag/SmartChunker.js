'use strict';

/**
 * SmartChunker - Intelligent text chunking that respects:
 * - Sentence boundaries
 * - Paragraph boundaries
 * - Semantic meaning
 * - Key fact extraction
 *
 * Instead of naively splitting by word count, this chunks by
 * natural language boundaries and extracts key information.
 */
class SmartChunker {
  constructor(config = {}) {
    this.maxChunkSize = config.maxChunkSize || 300; // words
    this.minChunkSize = config.minChunkSize || 50;
    this.overlap = config.overlap || 30; // words
    this.extractKeyFacts = config.extractKeyFacts !== false;
  }

  /**
   * Split text into intelligent chunks.
   */
  chunk(text) {
    if (!text || text.trim().length === 0) return [];

    // Step 1: Split into paragraphs
    const paragraphs = this._splitParagraphs(text);

    // Step 2: Split paragraphs into sentences
    const sentences = [];
    for (const para of paragraphs) {
      sentences.push(...this._splitSentences(para));
    }

    // Step 3: Group sentences into chunks respecting boundaries
    const chunks = this._groupIntoChunks(sentences);

    // Step 4: Extract key facts from each chunk
    if (this.extractKeyFacts) {
      return chunks.map(chunk => ({
        text: chunk.text,
        keyFacts: this._extractKeyFacts(chunk.text),
        sentences: chunk.sentenceCount,
        wordCount: chunk.wordCount,
        type: chunk.type,
      }));
    }

    return chunks;
  }

  /**
   * Compress a document into a summary + key facts.
   */
  compressDocument(text) {
    const chunks = this.chunk(text);
    const keyFacts = this._extractAllKeyFacts(text);
    const summary = this._generateSummary(text);
    const entities = this._extractEntities(text);

    return {
      summary,
      keyFacts,
      entities,
      chunks: chunks.length,
      originalLength: text.split(/\s+/).length,
      compressedLength: summary.split(/\s+/).length + keyFacts.length,
      compressionRatio: 1 - ((summary.split(/\s+/).length + keyFacts.length) / Math.max(text.split(/\s+/).length, 1)),
    };
  }

  // ===================== SPLITTING =====================

  _splitParagraphs(text) {
    return text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  _splitSentences(text) {
    // Split by sentence-ending punctuation
    const raw = text.split(/(?<=[.!?])\s+/);
    return raw
      .map(s => s.trim())
      .filter(s => s.length > 5)
      .map(s => ({
        text: s,
        wordCount: s.split(/\s+/).length,
        isQuestion: s.endsWith('?'),
        isList: /^[\d•\-\*]/.test(s),
      }));
  }

  _groupIntoChunks(sentences) {
    const chunks = [];
    let current = [];
    let currentWords = 0;

    for (const sent of sentences) {
      if (currentWords + sent.wordCount > this.maxChunkSize && current.length > 0) {
        // Flush current chunk
        chunks.push(this._makeChunk(current));
        // Keep overlap
        const overlapSents = current.slice(-Math.ceil(this.overlap / 20));
        current = [...overlapSents];
        currentWords = overlapSents.reduce((s, x) => s + x.wordCount, 0);
      }
      current.push(sent);
      currentWords += sent.wordCount;
    }

    if (current.length > 0) {
      chunks.push(this._makeChunk(current));
    }

    return chunks;
  }

  _makeChunk(sentences) {
    const text = sentences.map(s => s.text).join(' ');
    const hasQuestion = sentences.some(s => s.isQuestion);
    const hasList = sentences.some(s => s.isList);

    return {
      text,
      sentenceCount: sentences.length,
      wordCount: text.split(/\s+/).length,
      type: hasQuestion ? 'qa' : hasList ? 'list' : 'prose',
    };
  }

  // ===================== KEY FACT EXTRACTION =====================

  _extractKeyFacts(text) {
    const facts = [];

    // Extract numbers (prices, quantities, percentages)
    const numbers = text.match(/\$[\d,]+\.?\d*|\d+(?:\.\d+)?%|\d+(?:,\d{3})*(?:\.\d+)?\s*(?:GB|MB|TB|kHz|MHz|GHz|W|V|A)/gi) || [];
    facts.push(...numbers.map(n => n.trim()));

    // Extract named entities (capitalized phrases)
    const entities = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
    facts.push(...entities.filter(e => e.length > 3).slice(0, 5));

    // Extract technical terms
    const techTerms = text.match(/\b(?:API|GPU|CPU|RAM|SSD|HDD|USB|HDMI|PCIe|DDR[45]|GDDR\d+|TDP|CUDA|Tensor)\b/gi) || [];
    facts.push(...techTerms.slice(0, 5));

    // Extract dates
    const dates = text.match(/\b(?:19|20)\d{2}\b/g) || [];
    facts.push(...dates);

    return [...new Set(facts)].slice(0, 15);
  }

  _extractAllKeyFacts(text) {
    const allFacts = [];

    // Split into sections and extract from each
    const sections = text.split(/\n/).filter(s => s.trim().length > 10);
    for (const section of sections.slice(0, 50)) {
      allFacts.push(...this._extractKeyFacts(section));
    }

    return [...new Set(allFacts)].slice(0, 30);
  }

  _extractEntities(text) {
    const entities = [];

    // Product names
    const products = text.match(/\b(?:RTX|GTX|Radeon|GeForce|Intel|AMD|NVIDIA|Apple|Samsung|Sony)\s+\w+/gi) || [];
    entities.push(...products.map(p => ({ type: 'product', name: p })));

    // Organizations
    const orgs = text.match(/\b(?:Google|Microsoft|Meta|OpenAI|xAI|Tesla|SpaceX)\b/gi) || [];
    entities.push(...orgs.map(o => ({ type: 'organization', name: o })));

    // Locations
    const locations = text.match(/\b(?:China|USA|Japan|Germany|California|Shenzhen|Huaqiangbei)\b/gi) || [];
    entities.push(...locations.map(l => ({ type: 'location', name: l })));

    return entities.slice(0, 20);
  }

  _generateSummary(text) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    // Take first sentence + sentences with key terms
    const important = [];
    const seen = new Set();

    for (const sent of sentences) {
      const key = sent.substring(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);

      // Prioritize: first sentence, sentences with numbers, sentences with key terms
      if (important.length === 0 ||
          /\d/.test(sent) ||
          /\b(es|are|is|was|tiene|cuesta|weighs|costs)\b/i.test(sent)) {
        important.push(sent.trim());
      }

      if (important.length >= 3) break;
    }

    return important.join(' ');
  }
}

module.exports = { SmartChunker };
