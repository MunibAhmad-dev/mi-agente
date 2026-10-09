'use strict';

/**
 * PromptCompressor - LLMLingua-2 inspired prompt compression.
 * Reduces tokens by 50-70% while preserving meaning.
 * Works without external models using statistical methods.
 *
 * Techniques:
 * 1. Remove redundancy across sentences
 * 2. Extract key information tokens
 * 3. Compress filler words and phrases
 * 4. Merge similar information
 * 5. Keep only high-information-density tokens
 */
class PromptCompressor {
  constructor(config = {}) {
    this.config = {
      targetRatio: config.targetRatio || 0.4, // 40% of original tokens
      preserveInstructions: config.preserveInstructions !== false,
      preserveEntities: config.preserveEntities !== false,
      preserveNumbers: config.preserveNumbers !== false,
      ...config,
    };

    // Filler words in English and Spanish
    this.fillerWords = new Set([
      // English
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
      'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'up', 'about', 'into', 'through', 'during', 'before', 'after',
      'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them',
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'how',
      'what', 'which', 'who', 'whom', 'whose', 'why', 'so', 'very',
      'just', 'also', 'too', 'only', 'even', 'still', 'already', 'yet',
      'here', 'there', 'now', 'then', 'always', 'never', 'often',
      'really', 'quite', 'rather', 'somewhat', 'somehow', 'anyway',
      // Spanish
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
      'es', 'son', 'está', 'están', 'era', 'fue', 'ser', 'estar',
      'tiene', 'tienen', 'había', 'hay', 'haber', 'tener',
      'para', 'por', 'con', 'sin', 'sobre', 'entre', 'desde', 'hasta',
      'como', 'pero', 'sino', 'que', 'si', 'cuando', 'donde', 'porque',
      'este', 'esta', 'estos', 'estas', 'eso', 'ese', 'esa',
      'muy', 'más', 'menos', 'mucho', 'poco', 'bastante', 'demasiado',
      'también', 'aunque', 'embargo', 'sin embargo', 'además',
      'puede', 'pueden', 'debería', 'podría', 'sería',
    ]);

    // Instruction markers (must preserve)
    this.instructionPatterns = [
      /\b(debe|must|should|never|always|no\s+debes|siempre|nunca|important|critical|required|mandatory|obligatory)\b/gi,
      /\b(protector|security|safety|safe|danger|risk|warning|caution|attention)\b/gi,
    ];

    // Entity patterns (must preserve)
    this.entityPatterns = [
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, // Proper names
      /\b(?:function|class|const|let|var|import|export|module|require)\s+\w+/gi, // Code entities
      /\bhttps?:\/\/\S+/g, // URLs
      /(?:[A-Z]:\\|\.\.?\/)\S+/g, // File paths
      /\b\d+[\.,]?\d*\s*(?:USD|\$|€|GB|MB|TB|W|MHz|GHz|%|ms|s)\b/gi, // Numbers with units
    ];
  }

  /**
   * Compress a prompt/text.
   */
  compress(text, options = {}) {
    if (!text || text.length === 0) return { compressed: text, ratio: 0 };

    const targetRatio = options.targetRatio || this.config.targetRatio;

    // Step 1: Split into sentences
    const sentences = this._splitSentences(text);

    // Step 2: Extract protected content
    const protectedContent = this._extractProtected(text);

    // Step 3: Score each sentence by information density
    const scored = sentences.map(s => ({
      text: s,
      score: this._sentenceScore(s),
      tokens: this._estimateTokens(s),
    }));

    // Step 4: Remove redundancy (merge similar sentences)
    const deduplicated = this._removeRedundancy(scored);

    // Step 5: Compress filler words in each sentence
    const compressedSentences = deduplicated.map(s => ({
      ...s,
      compressed: this._compressFillerWords(s.text),
    }));

    // Step 6: Select sentences within token budget
    const totalTokens = compressedSentences.reduce((s, c) => s + c.tokens, 0);
    const targetTokens = Math.floor(totalTokens * targetRatio);

    const selected = [];
    let usedTokens = 0;

    // Always keep high-score sentences
    for (const s of compressedSentences.sort((a, b) => b.score - a.score)) {
      const compTokens = this._estimateTokens(s.compressed);
      if (usedTokens + compTokens <= targetTokens) {
        selected.push(s);
        usedTokens += compTokens;
      }
    }

    // Reconstruct
    const compressedText = [
      protectedContent,
      ...selected.sort((a, b) => {
        // Maintain original order
        const origA = text.indexOf(a.text);
        const origB = text.indexOf(b.text);
        return origA - origB;
      }).map(s => s.compressed),
    ].filter(Boolean).join(' ');

    const compressedTokens = this._estimateTokens(compressedText);
    const originalTokens = this._estimateTokens(text);

    return {
      compressed: compressedText,
      originalTokens,
      compressedTokens,
      ratio: originalTokens > 0 ? compressedTokens / originalTokens : 1,
      saved: originalTokens - compressedTokens,
      savedPercent: originalTokens > 0
        ? ((1 - compressedTokens / originalTokens) * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  _splitSentences(text) {
    // Split by sentence boundaries
    return text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  }

  _sentenceScore(sentence) {
    let score = 0;
    const s = sentence.toLowerCase();

    // High information markers
    if (/\d+/.test(s)) score += 2; // Numbers
    if (/error|bug|exception|fail|crash/i.test(s)) score += 3; // Errors
    if (this.config.preserveInstructions && /must|should|never|always|debe|nunca|siempre/i.test(s)) score += 3;
    if (/https?:\/\//.test(s)) score += 2; // URLs
    if (/[A-Z]:\\|\.\/|\.\.\//.test(s)) score += 2; // Paths
    if (/function|class|const|import|export/i.test(s)) score += 2; // Code

    // Low information markers (penalize)
    if (this.fillerWords.has(s.split(/\s+/)[0])) score -= 1;
    if (s.length < 30) score -= 1; // Very short = likely filler
    if (/^(hi|hello|hey|hola|ok|vale|entendido)/i.test(s)) score -= 2;

    // Information density (unique words / total words)
    const words = s.split(/\s+/);
    const unique = new Set(words.map(w => w.toLowerCase()));
    const density = words.length > 0 ? unique.size / words.length : 0;
    score += density * 2;

    return Math.max(0, score);
  }

  _extractProtected(text) {
    const protectedParts = [];

    // Extract instructions
    if (this.config.preserveInstructions) {
      for (const pattern of this.instructionPatterns) {
        const matches = text.match(pattern);
        if (matches) protectedParts.push(...matches.map(m => m.trim()));
      }
    }

    // Extract entities
    if (this.config.preserveEntities) {
      for (const pattern of this.entityPatterns) {
        const matches = text.match(pattern);
        if (matches) protectedParts.push(...matches.slice(0, 10));
      }
    }

    // Extract numbers
    if (this.config.preserveNumbers) {
      const nums = text.match(/\b\d+[\.,]?\d*\s*(?:USD|\$|€|GB|MB|TB|W|MHz|GHz|%|ms|s)\b/gi);
      if (nums) protectedParts.push(...nums);
    }

    return [...new Set(protectedParts)].join(' ');
  }

  _removeRedundancy(scoredSentences) {
    const result = [];
    const seen = new Set();

    for (const s of scoredSentences) {
      // Create a fingerprint of key words
      const words = s.text.toLowerCase().split(/\s+/)
        .filter(w => w.length > 3 && !this.fillerWords.has(w))
        .sort()
        .slice(0, 5)
        .join(' ');

      if (!seen.has(words)) {
        seen.add(words);
        result.push(s);
      }
    }

    return result;
  }

  _compressFillerWords(sentence) {
    const words = sentence.split(/\s+/);
    const compressed = words.filter(w => !this.fillerWords.has(w.toLowerCase()));
    // Always keep at least some words
    return compressed.length >= 3 ? compressed.join(' ') : sentence;
  }

  _estimateTokens(text) {
    if (!text) return 0;
    // ~1.3 tokens per word (English), ~2 tokens per word (Chinese/complex)
    const words = text.split(/\s+/).length;
    return Math.ceil(words * 1.3);
  }

  /**
   * Batch compress multiple prompts.
   */
  compressBatch(prompts, options = {}) {
    return prompts.map(p => this.compress(p, options));
  }

  /**
   * Compress system prompt specifically.
   */
  compressSystemPrompt(prompt) {
    return this.compress(prompt, {
      targetRatio: 0.5, // Keep 50% of system prompt
      preserveInstructions: true, // Always preserve instructions
      preserveEntities: true,
      preserveNumbers: true,
    });
  }

  /**
   * Compress conversation history.
   */
  compressConversation(messages, keepRecent = 4) {
    if (messages.length <= keepRecent) return messages;

    const old = messages.slice(0, -keepRecent);
    const recent = messages.slice(-keepRecent);

    // Compress old messages into a summary
    const oldText = old.map(m => m.content || '').join(' ');
    const compressed = this.compress(oldText, { targetRatio: 0.3 });

    const summary = `[Historial resumido: ${old.length} mensajes previos. ${compressed.compressed}]`;

    return [
      { role: 'system', content: summary },
      ...recent,
    ];
  }

  getStats() {
    return {
      fillerWords: this.fillerWords.size,
      instructionPatterns: this.instructionPatterns.length,
      entityPatterns: this.entityPatterns.length,
    };
  }
}

module.exports = { PromptCompressor };
