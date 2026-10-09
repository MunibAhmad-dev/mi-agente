'use strict';

const natural = require('natural');

/**
 * NLPTokenizer - Advanced NLP using the 'natural' package.
 * Provides: tokenization, stemming, TF-IDF, Levenshtein distance,
 * classification, sentiment analysis.
 * Replaces hash-based embeddings with real NLP.
 */
class NLPTokenizer {
  constructor(config = {}) {
    this.config = config;

    // Tokenizers
    this.wordTokenizer = new natural.WordTokenizer();
    this.sentenceTokenizer = new natural.SentenceTokenizer();

    // Stemmers
    this.stemmer = natural.PorterStemmer;
    this.stemmerEs = natural.PorterStemmerEs;

    // TF-IDF
    this.tfidf = new natural.TfIdf();

    // Distance
    this.jaroWinkler = natural.JaroWinklerDistance;
    this.levenshtein = natural.LevenshteinDistance;

    // Classifier
    this.classifier = new natural.BayesClassifier();

    // Sentiment
    this.sentiment = new natural.SentimentAnalyzer('English', this.stemmer, 'afinn');

    this.stats = { tokenized: 0, classified: 0 };
  }

  /**
   * Tokenize text into words.
   */
  tokenize(text) {
    this.stats.tokenized++;
    return this.wordTokenizer.tokenize(String(text || ''));
  }

  /**
   * Tokenize text into sentences.
   */
  tokenizeSentences(text) {
    return this.sentenceTokenizer.tokenize(String(text || ''));
  }

  /**
   * Stem a word.
   */
  stem(word) {
    return this.stemmer.stem(String(word || ''));
  }

  /**
   * Get TF-IDF vector for text.
   */
  tfidfVector(text) {
    const doc = new natural.TfIdf();
    doc.addDocument(String(text || ''));
    const tfidf = {};
    doc.listTerms(0).forEach(item => {
      tfidf[item.term] = item.tfidf;
    });
    return tfidf;
  }

  /**
   * Compute cosine similarity between two texts using TF-IDF.
   */
  similarity(textA, textB) {
    const a = this.tfidfVector(textA);
    const b = this.tfidfVector(textB);

    const allTerms = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dot = 0, normA = 0, normB = 0;

    for (const term of allTerms) {
      const va = a[term] || 0;
      const vb = b[term] || 0;
      dot += va * vb;
      normA += va * va;
      normB += vb * vb;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Classify text into categories.
   */
  classify(text) {
    this.stats.classified++;
    try {
      return this.classifier.classify(String(text || ''));
    } catch {
      return 'unknown';
    }
  }

  /**
   * Train classifier with labeled examples.
   */
  trainClassifier(examples) {
    for (const { text, label } of examples) {
      this.classifier.addDocument(String(text), label);
    }
    this.classifier.train();
  }

  /**
   * Analyze sentiment.
   */
  sentiment(text) {
    const tokens = this.tokenize(text);
    return this.sentiment.getSentiment(tokens);
  }

  /**
   * Extract keywords from text (top N by TF-IDF).
   */
  extractKeywords(text, n = 10) {
    const doc = new natural.TfIdf();
    doc.addDocument(String(text || ''));
    return doc.listTerms(0)
      .slice(0, n)
      .map(item => ({ term: item.term, score: item.tfidf }));
  }

  /**
   * Fuzzy match - find best match in a list.
   */
  fuzzyMatch(query, candidates) {
    const scored = candidates.map(c => ({
      text: c,
      score: this.jaroWinkler(String(query), String(c)),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0] || null;
  }

  /**
   * Levenshtein distance between two strings.
   */
  distance(a, b) {
    return this.levenshtein(String(a || ''), String(b || ''));
  }

  /**
   * Batch tokenize multiple texts.
   */
  tokenizeBatch(texts) {
    return texts.map(t => this.tokenize(t));
  }

  /**
   * N-gram extraction.
   */
  ngrams(text, n = 2) {
    const tokens = this.tokenize(text);
    const result = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      result.push(tokens.slice(i, i + n).join(' '));
    }
    return result;
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { NLPTokenizer };
